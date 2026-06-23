# ---------------------------------------------------------------------------
# GWJ secrets. OWN namespace /gwj/* (NOT /oxy/gwj). Generated values come from
# random_password (the SEED). SecureString/password params carry
# lifecycle ignore_changes=[value] — they are rotated outside Terraform
# (rotate the live value + the param together), so a routine apply never
# rewrites a rotated secret back to the seed.
# ---------------------------------------------------------------------------

resource "random_password" "jwt" {
  length  = 48
  special = false
}

resource "random_password" "mcp_token" {
  length  = 48
  special = false
}

resource "random_password" "admin" {
  length = 24
}

resource "random_password" "mongo" {
  length  = 32
  special = false
}

resource "aws_ssm_parameter" "mongo_uri" {
  name        = "/gwj/MONGO_URI"
  type        = "SecureString"
  value       = "mongodb://gwjadmin:${random_password.mongo.result}@${aws_instance.mongo.private_ip}:27017/gwj?authSource=admin"
  description = "GWJ Mongo connection string (dedicated gwj-mongo box)."

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "jwt_secret" {
  name  = "/gwj/JWT_SECRET"
  type  = "SecureString"
  value = random_password.jwt.result

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "mcp_token" {
  name  = "/gwj/MCP_TOKEN"
  type  = "SecureString"
  value = random_password.mcp_token.result

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "admin_username" {
  name  = "/gwj/ADMIN_USERNAME"
  type  = "String"
  value = "nate"
}

resource "aws_ssm_parameter" "admin_password" {
  name  = "/gwj/ADMIN_PASSWORD"
  type  = "SecureString"
  value = random_password.admin.result

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "mongo_admin_user" {
  name  = "/gwj/mongo_admin_user"
  type  = "String"
  value = "gwjadmin"
}

resource "aws_ssm_parameter" "mongo_admin_password" {
  name  = "/gwj/mongo_admin_password"
  type  = "SecureString"
  value = random_password.mongo.result

  # Seeded at instance creation; rotated outside TF (rotate the Mongo user +
  # this param + MONGO_URI together). Ignore drift.
  lifecycle {
    ignore_changes = [value]
  }
}
