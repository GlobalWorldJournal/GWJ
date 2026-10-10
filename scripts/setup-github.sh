#!/usr/bin/env bash
# Configure GitHub Actions secrets + variables for GlobalWorldJournal/GWJ.
# Run this from your authenticated session:  bash scripts/setup-github.sh
#
# App secrets (DATABASE_URL / JWT_SECRET / MCP_TOKEN / ADMIN_*) are NOT set here —
# they live in AWS SSM /gwj/* (created by terraform) and the ECS task defs read
# them at launch. GitHub only needs the deploy plumbing below.
set -euo pipefail

REPO="GlobalWorldJournal/GWJ"
TOKEN_FILE="$HOME/.config/oxy/tokens/cloudflare-gwj.token"

if ! gh auth status >/dev/null 2>&1; then
  echo "gh is not authenticated. Run: gh auth login" >&2
  exit 1
fi
[ -f "$TOKEN_FILE" ] || { echo "Missing $TOKEN_FILE" >&2; exit 1; }

echo "== Secrets =="
gh secret set AWS_DEPLOY_ROLE_ARN  -R "$REPO" --body "arn:aws:iam::237343248947:role/gwj-github-deploy"
gh secret set CLOUDFLARE_ACCOUNT_ID -R "$REPO" --body "fa4392797e57d4e63ceaaf7b1dc687ed"
gh secret set CLOUDFLARE_API_TOKEN  -R "$REPO" --body "$(cat "$TOKEN_FILE")"

echo "== Variables =="
gh variable set AWS_REGION          -R "$REPO" --body "us-west-2"
gh variable set ECS_CLUSTER         -R "$REPO" --body "oxy-cluster"
gh variable set ECR_BACKEND         -R "$REPO" --body "gwj-backend"
gh variable set ECR_MCP             -R "$REPO" --body "gwj-mcp"
gh variable set ECS_SERVICE_BACKEND -R "$REPO" --body "gwj-backend"
gh variable set ECS_SERVICE_MCP     -R "$REPO" --body "gwj-mcp"
gh variable set VITE_API_BASE_URL   -R "$REPO" --body "https://api.globalworldjournal.com"

echo "Done. Trigger the backend/MCP image build with:"
echo "  gh workflow run deploy-aws.yml -R $REPO"
