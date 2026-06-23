provider "aws" {
  region  = var.region
  profile = "oxy"
  default_tags {
    tags = {
      Project   = "gwj"
      ManagedBy = "terraform"
      Repo      = "GWJ"
      App       = "gwj"
    }
  }
}

# CloudFront requires its ACM certificate in us-east-1 regardless of the origin
# bucket region. This aliased provider exists ONLY to request that cert.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = "oxy"
  default_tags {
    tags = {
      Project   = "gwj"
      ManagedBy = "terraform"
      Repo      = "GWJ"
      App       = "gwj"
    }
  }
}
