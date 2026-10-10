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

# PostgreSQL connection string for the backend: logical database `gwj`, owned by
# the `gwj` role, on the shared RDS instance (reached as postgres.internal.oxy.so,
# ?sslmode=require). Externally owned like TELEGRAM_BOT_TOKEN: the role and its
# password are created on RDS out-of-band (docs/POSTGRES-CUTOVER.md §2), the real
# value is put in SSM then, and this resource is IMPORTED — terraform never holds
# or rewrites the password.
resource "aws_ssm_parameter" "database_url" {
  name        = "/gwj/DATABASE_URL"
  type        = "SecureString"
  value       = "set-out-of-band"
  description = "GWJ PostgreSQL connection string (database gwj on oxy-postgres)."

  lifecycle {
    ignore_changes = [value]
  }
}

# REMOVED at the Mongo decommission (docs/POSTGRES-CUTOVER.md §8), together with
# mongo_admin_*, random_password.mongo, mongo.tf and the MONGO_URI task secret.
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

# Telegram bot token (BotFather), used by the backend's Telegram publish channel.
# Externally owned: seeded out-of-band (the real token is set directly in SSM,
# not committed), so the value is ignored by Terraform. Imported into state.
resource "aws_ssm_parameter" "telegram_bot_token" {
  name  = "/gwj/TELEGRAM_BOT_TOKEN"
  type  = "SecureString"
  value = "set-out-of-band"

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
