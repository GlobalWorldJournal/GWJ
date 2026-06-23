# ---------------------------------------------------------------------------
# GWJ ACM certs. DNS-validated; they start PENDING_VALIDATION until the
# globalworldjournal.com Cloudflare zone has the validation CNAMEs (output
# below). No aws_acm_certificate_validation resources — that would block apply
# on DNS. The SNI attachment to the SHARED listener only adds a cert; it never
# touches the listener's default cert or any Oxy rule.
# ---------------------------------------------------------------------------

# api.globalworldjournal.com (+ SAN mcp.globalworldjournal.com) — us-west-2 for
# the ALB.
resource "aws_acm_certificate" "apis" {
  domain_name               = var.api_domain
  subject_alternative_names = [var.mcp_domain]
  validation_method         = "DNS"

  tags = { Name = "${var.prefix}-apis-usw2" }

  lifecycle {
    create_before_destroy = true
  }
}

# SNI-attach the GWJ APIs cert to the SHARED HTTPS listener. The listener's
# default cert is left untouched (additive).
resource "aws_lb_listener_certificate" "apis" {
  listener_arn    = data.aws_lb_listener.oxy_https.arn
  certificate_arn = aws_acm_certificate.apis.arn
}

# cdn.globalworldjournal.com — CloudFront cert (us-east-1 only).
resource "aws_acm_certificate" "cdn" {
  provider          = aws.us_east_1
  domain_name       = var.cdn_domain
  validation_method = "DNS"

  tags = { Name = "${var.prefix}-cdn-cloudfront" }

  lifecycle {
    create_before_destroy = true
  }
}
