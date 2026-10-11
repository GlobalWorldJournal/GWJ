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

# 32 raw random bytes, base64 — an AES-256-GCM key, not a human-typed secret,
# so random_id (byte_length, not random_password's printable-character length)
# is the right generator.
resource "random_id" "mention_oauth_seal" {
  byte_length = 32
}

resource "random_password" "admin" {
  length = 24
}

# PostgreSQL connection string for the backend: logical database `gwj`, owned by
# the `gwj` role, on the shared RDS instance (reached as postgres.internal.oxy.so,
# ?sslmode=require). Externally owned like TELEGRAM_BOT_TOKEN: the role and its
# password are created on RDS out-of-band (oxy-infra runbook 30), the real
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

# The MCP server's own agent token (gwj_…, scopes articles:write,
# articles:publish, media:upload), minted in the CMS under Agent Tokens and
# stored out of band: terraform never sees the secret. Adopted from the
# parameter created alongside the token.
import {
  to = aws_ssm_parameter.mcp_api_token
  id = "/gwj/MCP_API_TOKEN"
}

resource "aws_ssm_parameter" "mcp_api_token" {
  name        = "/gwj/MCP_API_TOKEN"
  type        = "SecureString"
  value       = "set-out-of-band"
  description = "The GWJ MCP server's scoped API token (Agent Tokens in the CMS)."

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

# Facebook Page + Instagram Business credentials (facebookChannel.ts /
# instagramChannel.ts), one pair of Page id/token per edition — Instagram
# posting reuses the same Page token, only its own account id is separate.
# Same externally-owned pattern as TELEGRAM_BOT_TOKEN above: each starts as
# this placeholder (env.ts's optionalSecret only treats '-'/empty as "not
# configured", so a channel stays effectively disabled — its calls to Meta's
# Graph API just fail and retry via the outbox — until the real value is set
# directly in SSM, out of band, which Terraform then never rewrites).
resource "aws_ssm_parameter" "facebook_page_id" {
  name  = "/gwj/FACEBOOK_PAGE_ID"
  type  = "SecureString"
  value = "set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "facebook_page_token" {
  name  = "/gwj/FACEBOOK_PAGE_TOKEN"
  type  = "SecureString"
  value = "set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "facebook_page_id_es" {
  name  = "/gwj/FACEBOOK_PAGE_ID_ES"
  type  = "SecureString"
  value = "set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "facebook_page_token_es" {
  name  = "/gwj/FACEBOOK_PAGE_TOKEN_ES"
  type  = "SecureString"
  value = "set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "instagram_account_id" {
  name  = "/gwj/INSTAGRAM_ACCOUNT_ID"
  type  = "SecureString"
  value = "set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "instagram_account_id_es" {
  name  = "/gwj/INSTAGRAM_ACCOUNT_ID_ES"
  type  = "SecureString"
  value = "set-out-of-band"

  lifecycle {
    ignore_changes = [value]
  }
}

# The Mention channel's own refresh token lives in Postgres (mention_oauth),
# not here — it's a value this backend itself mints and rotates at runtime,
# unlike every other channel's human-set token above. This key just seals it
# at rest. Generated (not externally owned), same as jwt_secret: Terraform
# creates it, then never rewrites it (a routine apply must not invalidate
# every already-sealed row).
resource "aws_ssm_parameter" "mention_oauth_seal_key" {
  name  = "/gwj/MENTION_OAUTH_SEAL_KEY"
  type  = "SecureString"
  value = random_id.mention_oauth_seal.b64_std

  lifecycle {
    ignore_changes = [value]
  }
}
