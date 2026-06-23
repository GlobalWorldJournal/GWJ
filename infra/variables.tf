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
