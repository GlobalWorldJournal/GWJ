# ---------------------------------------------------------------------------
# Newsletter email (Amazon SES v2). The backend sends the confirmation and the
# daily briefing as newsletter@<site_domain>. DNS lives in Cloudflare, so this
# stack only creates the identity and prints the records to add (outputs
# `ses_dkim_records` and `ses_mail_from_records`, plus the DMARC note).
#
# A new SES account starts in the SANDBOX (only verified recipients). Ask AWS
# for production access (SES console > Account dashboard) before launch.
# ---------------------------------------------------------------------------

resource "aws_sesv2_email_identity" "site" {
  email_identity = var.site_domain

  dkim_signing_attributes {
    next_signing_key_length = "RSA_2048_BIT"
  }
}

# A custom MAIL FROM keeps SPF aligned with the site domain (needed for DMARC).
resource "aws_sesv2_email_identity_mail_from_attributes" "site" {
  email_identity         = aws_sesv2_email_identity.site.email_identity
  mail_from_domain       = "bounce.${var.site_domain}"
  behavior_on_mx_failure = "USE_DEFAULT_VALUE"
}
