# GWJ owns its OWN Terraform state — a SEPARATE state file from Oxy's stack, so a
# GWJ apply has a fully independent lifecycle and can never plan/modify Oxy's
# resources (those are read-only data sources in data.tf).
#
# GWJ has its OWN dedicated state bucket (gwj-tf-state-237343248947, us-west-2,
# versioned + encrypted + public-access-blocked) — not Oxy's state bucket — so
# the two stacks are fully decoupled at the storage layer too.
terraform {
  backend "s3" {
    bucket  = "gwj-tf-state-237343248947"
    key     = "gwj/terraform.tfstate"
    region  = "us-west-2"
    profile = "oxy"
    encrypt = true
  }
}
