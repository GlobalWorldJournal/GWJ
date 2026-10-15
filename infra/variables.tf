variable "region" {
  type    = string
  default = "us-west-2"
}

variable "prefix" {
  type        = string
  default     = "gwj"
  description = "Name prefix for all GWJ-owned resources."
}

# The Oxy AWS account that hosts GWJ (isolated gwj-* resources). Used to build
# bucket names and ARNs. Confirmed: 237343248947.
variable "account_id" {
  type    = string
  default = "237343248947"
}

# Apex + service hostnames (Cloudflare DNS already added; records point at the
# shared ALB / CloudFront at cutover).
variable "site_domain" {
  type        = string
  default     = "globalworldjournal.com"
  description = "The apex site domain; also the SES identity the newsletter sends from."
}

variable "newsletter_enabled" {
  type        = bool
  default     = true
  description = "Turn the email newsletter on in production. Needs the SES identity verified and SES out of the sandbox (docs/INFRA.md); set false to switch sign-ups and sending off."
}

variable "api_domain" {
  type    = string
  default = "api.globalworldjournal.com"
}

variable "mcp_domain" {
  type    = string
  default = "mcp.globalworldjournal.com"
}

variable "cdn_domain" {
  type    = string
  default = "cdn.globalworldjournal.com"
}

variable "site_origins" {
  type        = string
  default     = "https://globalworldjournal.com,https://www.globalworldjournal.com"
  description = "Comma-separated CORS origins for the backend."
}

# GitHub repo that assumes the OIDC deploy role (sub = repo:<this>:*).
variable "github_repo" {
  type    = string
  default = "GlobalWorldJournal/GWJ"
}

# ALB listener-rule priorities. The shared HTTPS listener already carries Oxy's
# rules (10-140 in oxy-infra/terraform-uswest2). 400/401 are well clear of that
# range so GWJ never collides with an Oxy rule.
variable "rule_priority_backend" {
  type    = number
  default = 400
}

variable "rule_priority_mcp" {
  type    = number
  default = 401
}

# Email addresses subscribed to the gwj-alerts SNS topic (monitoring.tf). Each
# receives a confirmation link from AWS that must be clicked once. Empty → the
# alarms still fire and are visible in CloudWatch, but notify nobody.
variable "alert_emails" {
  type    = list(string)
  default = []
}

# Backend task count bounds for target-tracking autoscaling (ecs.tf). Two at the
# floor, so one task failing (or a deploy draining one) never takes the API down.
variable "backend_min_tasks" {
  type    = number
  default = 2
}

variable "backend_max_tasks" {
  type    = number
  default = 4
}
