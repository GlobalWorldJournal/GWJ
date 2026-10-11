# GWJ Infrastructure

> Hosted ON the Oxy AWS account (`237343248947`, us-west-2, CLI `--profile oxy`) by user decision, but as fully ISOLATED `gwj-*` resources with its OWN PostgreSQL database `gwj` (own role) on the shared RDS instance `oxy-postgres` — GWJ shares no application data, database, role, SSO, or SDKs with Oxy. **Infra is STANDALONE terraform in `infra/`** (state: bucket `gwj-tf-state-237343248947`, key `gwj/terraform.tfstate`, us-west-2); Oxy's shared VPC/ALB/ECS cluster are read-only data sources, so a GWJ apply never touches Oxy. `plan`/`apply` are run by hand. Never commit secret values.

## What runs where
| Piece | Where | Managed by |
|---|---|---|
| Reader SPA + SEO worker (`_worker.js`) | Cloudflare Pages project `gwj` → `globalworldjournal.com` + `www` | CI (`deploy-cloudflare.yml`) |
| Backend `gwj-backend` (port 4000, 2–4 tasks, CPU autoscaling) | ECS Fargate arm64 on the shared `oxy-cluster`, behind `oxy-alb` (`api.globalworldjournal.com`) | terraform (`infra/ecs.tf`) + CI deploys |
| MCP `gwj-mcp` (port 4100, 1 task) | same, `mcp.globalworldjournal.com` | same |
| Database | logical db `gwj`, role `gwj`, on `oxy-postgres` (`postgres.internal.oxy.so:5432`, TLS) | created out-of-band on the instance; schema by the deploy's migration one-shots |
| Media | private S3 `gwj-media-usw2-<acct>` (versioned) + CloudFront `cdn.globalworldjournal.com` | terraform (`infra/cdn.tf`) |
| Secrets | SSM `/gwj/*` | terraform-seeded (`infra/ssm.tf`); `DATABASE_URL`, `TELEGRAM_BOT_TOKEN` set out-of-band and imported |
| Alarms | CloudWatch → SNS `gwj-alerts` | terraform (`infra/monitoring.tf`) |
| DNS | Cloudflare: `api`, `mcp`, `cdn` CNAMEs (DNS-only), ACM validation records | by hand |

## Deploys
Every push to `main` runs CI (`ci.yml`): Biome, banned patterns, typecheck, tests against real PostgreSQL, build, the e2e contract, terraform fmt/validate and both Docker image builds. **Only if all of that passes** does CI call the deploys:

- **AWS** (`deploy-aws.yml`): build + push the arm64 images → register a task-definition revision running the image **by digest** with `GWJ_RELEASE=<sha>` (`scripts/ecs-register-release.sh`) → backend pre-migrations from that revision (`scripts/ecs-oneshot.sh`) → roll out → wait stable → **verify `/healthz` reports the new release** (`scripts/check-release.sh`; a circuit-breaker rollback fails here) → backend post-migrations.
- **Cloudflare** (`deploy-cloudflare.yml`): build → `wrangler pages deploy` → verify the live page references the new content-hashed bundle.

Each revision names one immutable image, so the ECS circuit breaker's rollback really returns to the previous release. Terraform owns each family's configuration (env, secrets, roles); the services ignore `task_definition`, and the next deploy builds on the family's latest revision. `workflow_dispatch` on either deploy workflow stays available to operators.

The OIDC role `gwj-github-deploy` (main only) can push to ECR, `RegisterTaskDefinition`, `UpdateService`, run the backend one-shots and pass only the two GWJ task roles. It has NO `ssm:PutParameter`.

## Monitoring
SNS topic `gwj-alerts` receives every alarm (and its recovery): unhealthy / no healthy ALB targets, target 5xx, ECS CPU and memory > 85 % (backend and MCP), and ≥ 20 error-level log lines in 5 minutes (metric filter on `/gwj/ecs`, 30-day retention). Subscribe with `terraform apply -var 'alert_emails=["you@example.com"]'` and click AWS's confirmation link.

Both services log JSON lines. The backend tags each request with an `x-request-id` (returned in the response) and logs 500s with their stack. `GET /healthz` is liveness (`{ ok, release }`), `GET /readyz` also pings PostgreSQL.

## GitHub configuration
- **Secrets:** `CLOUDFLARE_API_TOKEN` (Pages:Edit), `CLOUDFLARE_ACCOUNT_ID`. Nothing else: AWS access is OIDC, app secrets live in SSM.
- **Variables:** `VITE_API_BASE_URL` (optional; defaults to `https://api.globalworldjournal.com`).

## Cloudflare Pages runtime variables
The SEO worker reads `API_BASE_URL` (`https://api.globalworldjournal.com`) and `SITE_URL` (`https://globalworldjournal.com`) — set in the Pages project → Settings → Environment variables (Production). They are distinct from the build-time `VITE_API_BASE_URL`.

## Agent API tokens
Agents (the MCP server, automations) authenticate with their own token, not the admin password: scoped (`articles:write`, `articles:publish`, `articles:delete`, `media:upload`, `takedowns`), revocable, stored only as a SHA-256 hash, and recorded as `agent:<name>` in article history. An admin mints one with `POST /api/admin/tokens {"name","scopes"}` (the secret is in that response only), lists them with `GET /api/admin/tokens` and revokes with `POST /api/admin/tokens/:id/revoke`. The MCP server uses `GWJ_API_TOKEN` when set (SSM `/gwj/MCP_API_TOKEN`); without it, it falls back to the admin login.

## Operations
- One-shot command in the backend's environment: `AWS_REGION=us-west-2 ECS_CLUSTER=oxy-cluster scripts/ecs-oneshot.sh gwj-backend <label> -- <command…>` (e.g. `bun run src/seed.ts` to create the admin user).
- Health: `curl https://api.globalworldjournal.com/healthz` · `curl https://api.globalworldjournal.com/readyz` · `curl https://mcp.globalworldjournal.com/healthz`.
- New secrets: `openssl rand -hex 32`. Never set an SSM value to `-` or empty — the services refuse to boot on it.
