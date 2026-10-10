# GWJ Infrastructure Provisioning

> Hosted ON the Oxy AWS account (`237343248947`, us-west-2, CLI `--profile oxy`) by user decision, but as fully ISOLATED `gwj-*` resources with its OWN PostgreSQL database `gwj` (own role) on the shared RDS instance `oxy-postgres` — GWJ shares no application data, database, role, SSO, or SDKs with Oxy. **Infra is STANDALONE terraform in `~/GWJ/infra/`** with its own state (S3 key `gwj/terraform.tfstate`), own IAM roles, own SSM `/gwj/*`, and own `gwj-tasks` security group; Oxy's shared VPC/ALB/ECS-cluster are consumed read-only via data sources, so a GWJ apply never touches Oxy. Applied manually. Never hardcode secret values into the repo.

## Overview
- **Frontend:** Cloudflare Pages project `gwj` → `globalworldjournal.com` + `www`.
- **Backend + MCP:** Docker (linux/arm64) → ECR (`gwj-backend`, `gwj-mcp`) → ECS Fargate, behind an ALB.
- **DB:** PostgreSQL 17 — logical database `gwj` owned by role `gwj` on `oxy-postgres` (`postgres.internal.oxy.so:5432`, TLS). Replaced the dedicated `gwj-mongo` EC2 (see `docs/POSTGRES-CUTOVER.md`).
- **Media:** S3 bucket `gwj-media` + CloudFront `cdn.globalworldjournal.com`.
- **DNS:** Cloudflare (domain already added).

## 1. PostgreSQL (own database on the shared instance)
1. `oxy-postgres-sg` must admit `gwj-tasks-sg` on 5432 (an oxy-infra change — `docs/POSTGRES-CUTOVER.md` §1.1).
2. Create role `gwj` and database `gwj OWNER gwj` per oxy-infra runbook 30 (single-role model; no extensions needed) — exact one-shot in `docs/POSTGRES-CUTOVER.md` §1.2.
3. Connection string (`postgresql://gwj:…@postgres.internal.oxy.so:5432/gwj?sslmode=require`) → SSM `/gwj/DATABASE_URL` ONLY (no GitHub secret, no sync), imported into terraform (`aws_ssm_parameter.database_url`).
4. Schema: applied by the deploy's migration one-shot (`src/db/migrate.ts --target-database=gwj`).

## 2. S3 + CloudFront (media)
1. Create S3 bucket `gwj-media` (block public ACLs; serve via CloudFront OAC).
2. CloudFront distribution, origin = `gwj-media`, alternate domain `cdn.globalworldjournal.com`, ACM cert (us-east-1) for that name.
3. Cloudflare DNS: `cdn` CNAME → CloudFront domain (DNS-only / grey cloud).
4. IAM user/role for the backend with `s3:PutObject` on `gwj-media/articles/*`. Keys → GitHub secrets `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` (or use the task role).

## 3. ECR
Create two repos: `gwj-backend`, `gwj-mcp` (set repo vars `ECR_BACKEND`, `ECR_MCP`).

## 4. ECS Fargate + ALB
1. Cluster `gwj-cluster` (var `ECS_CLUSTER`).
2. Task defs (arm64) for backend (port 4000) and mcp (port 4100), env from SSM `/gwj/*`.
3. Services `gwj-backend`, `gwj-mcp` (vars `ECS_SERVICE_BACKEND`, `ECS_SERVICE_MCP`).
4. ALB + ACM cert for `api.globalworldjournal.com` + `mcp.globalworldjournal.com`; host-based listener rules → target groups (backend / mcp).
5. Cloudflare DNS: `api` and `mcp` → ALB (DNS-only).

## 5. OIDC deploy role
Create IAM role `gwj-github-deploy` trusting GitHub OIDC for `GlobalWorldJournal/GWJ` (main only), with ECR push, `ecs:RegisterTaskDefinition` (each deploy registers a revision running the new image by digest), `ecs:UpdateService`, and `ecs:RunTask` + `iam:PassRole` for the migration one-shots (`infra/iam.tf`). It has NO `ssm:PutParameter`. Deploys run from CI (`ci.yml`) only after every check passed, and each ends by verifying `/healthz` reports the new release.

## 6. Cloudflare Pages
1. Create Pages project `gwj` (direct upload via wrangler in CI).
2. Custom domains `globalworldjournal.com` + `www`.
3. Account ID → secret `CLOUDFLARE_ACCOUNT_ID`; scoped API token (Pages:Edit) → secret `CLOUDFLARE_API_TOKEN`.
4. **Pages runtime env vars (required by `_worker.js` for SEO):** in the Pages project → Settings → Environment variables (Production), set `API_BASE_URL` = `https://api.globalworldjournal.com` and `SITE_URL` = `https://globalworldjournal.com`. These are RUNTIME bindings read by the SEO worker (meta/OG/JSON-LD/sitemap) and are distinct from the build-time `VITE_API_BASE_URL`.

## GitHub configuration
**Secrets** (Settings → Secrets → Actions): `JWT_SECRET`, `MCP_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEPLOY_ROLE_ARN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Variables** (Settings → Variables → Actions): `AWS_REGION`, `ECS_CLUSTER`, `ECR_BACKEND`, `ECR_MCP`, `ECS_SERVICE_BACKEND`, `ECS_SERVICE_MCP`, `VITE_API_BASE_URL` (= `https://api.globalworldjournal.com`).

> **Placeholder guard:** never set a secret to `-` / empty. A sync that writes a placeholder into SSM crashes the service. If you don't have a value yet, omit the secret.

## Post-deploy
- Run `bun run seed` as a one-shot ECS task (`scripts/ecs-oneshot.sh gwj-backend seed -- bun run src/seed.ts`) to create the admin user. Categories are the fixed `CATEGORIES` tuple; nothing to seed.
- Verify: `curl https://api.globalworldjournal.com/healthz`, MCP `curl -H "Authorization: Bearer <MCP_TOKEN>" https://mcp.globalworldjournal.com/healthz`.

## Secrets generation
```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # MCP_TOKEN
```
