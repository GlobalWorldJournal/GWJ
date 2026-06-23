# GWJ Infrastructure Provisioning

> GWJ runs on **its own** AWS + Cloudflare — completely separate from any Oxy account/infra. Provision these manually with Nate; never hardcode values into the repo.

## Overview
- **Frontend:** Cloudflare Pages project `gwj` → `globalworldjournal.com` + `www`.
- **Backend + MCP:** Docker (linux/arm64) → ECR → ECS Fargate, behind an ALB.
- **DB:** MongoDB Atlas M0 (free, dedicated cluster).
- **Media:** S3 bucket `gwj-media` + CloudFront `cdn.globalworldjournal.com`.
- **DNS:** Cloudflare (domain already added).

## 1. MongoDB Atlas
1. Create a new **free M0** project/cluster (region near AWS region).
2. DB user + password; network access allowlist (ECS egress IPs or 0.0.0.0/0 for M0 dev).
3. Copy the SRV connection string → GitHub secret `MONGO_URI`.

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
Create IAM role `gwj-github-deploy` trusting GitHub OIDC for `NateIsern/GWJ`, with ECR push + `ecs:UpdateService` + `ssm:PutParameter` perms. ARN → secret `AWS_DEPLOY_ROLE_ARN`.

## 6. Cloudflare Pages
1. Create Pages project `gwj` (direct upload via wrangler in CI).
2. Custom domains `globalworldjournal.com` + `www`.
3. Account ID → secret `CLOUDFLARE_ACCOUNT_ID`; scoped API token (Pages:Edit) → secret `CLOUDFLARE_API_TOKEN`.

## GitHub configuration
**Secrets** (Settings → Secrets → Actions): `MONGO_URI`, `JWT_SECRET`, `MCP_TOKEN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_DEPLOY_ROLE_ARN`, `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.

**Variables** (Settings → Variables → Actions): `AWS_REGION`, `ECS_CLUSTER`, `ECR_BACKEND`, `ECR_MCP`, `ECS_SERVICE_BACKEND`, `ECS_SERVICE_MCP`, `VITE_API_BASE_URL` (= `https://api.globalworldjournal.com`).

> **Placeholder guard:** never set a secret to `-` / empty. A sync that writes a placeholder into SSM crashes the service. If you don't have a value yet, omit the secret.

## Post-deploy
- Run `bun run seed` as a one-shot ECS task to create the 7 categories + admin user.
- Verify: `curl https://api.globalworldjournal.com/healthz`, MCP `curl -H "Authorization: Bearer <MCP_TOKEN>" https://mcp.globalworldjournal.com/healthz`.

## Secrets generation
```bash
openssl rand -hex 32   # JWT_SECRET
openssl rand -hex 32   # MCP_TOKEN
```
