# ---------------------------------------------------------------------------
# GWJ media: private S3 bucket + CloudFront CDN (cdn.globalworldjournal.com).
# The bucket stays fully private; CloudFront reads articles/* via OAC. No
# versioning. Bucket name is global → suffixed with the account id.
# ---------------------------------------------------------------------------

resource "aws_s3_bucket" "media" {
  bucket = "${var.prefix}-media-usw2-${var.account_id}"
}

resource "aws_s3_bucket_public_access_block" "media" {
  bucket                  = aws_s3_bucket.media.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_cloudfront_origin_access_control" "media" {
  name                              = "${var.prefix}-media-oac"
  description                       = "OAC for ${aws_s3_bucket.media.bucket} articles/*"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "media" {
  enabled             = true
  comment             = "gwj ${var.cdn_domain} CDN over ${aws_s3_bucket.media.bucket}"
  default_root_object = ""
  price_class         = "PriceClass_100"

  origin {
    domain_name              = aws_s3_bucket.media.bucket_regional_domain_name
    origin_id                = "gwj-media-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.media.id
  }

  aliases = [var.cdn_domain]

  # Default behavior: cache GET/HEAD from S3 using the AWS-managed
  # CachingOptimized policy (id 658327ea-f89d-4fab-a63d-7e88639e58f6).
  default_cache_behavior {
    target_origin_id       = "gwj-media-s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    cache_policy_id        = "658327ea-f89d-4fab-a63d-7e88639e58f6"
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = aws_acm_certificate.cdn.arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }

  tags = { Name = "${var.prefix}-cdn" }
}

# Bucket policy: ONLY this CloudFront distribution (via OAC) may read articles/*.
data "aws_iam_policy_document" "cdn_bucket" {
  statement {
    sid       = "AllowGwjCloudFrontOACReadArticles"
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.media.arn}/articles/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.media.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "media" {
  bucket = aws_s3_bucket.media.id
  policy = data.aws_iam_policy_document.cdn_bucket.json
}
