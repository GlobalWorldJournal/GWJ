# GWJ infra (`~/GWJ/infra`)

Standalone Terraform root module for the Global World Journal backend + MCP
server. It is **hosted on the Oxy AWS account** (`237343248947`, `us-west-2`,
CLI `--profile oxy`) but is **fully isolated** from Oxy's stack:

- **Own state** — S3 backend, its own bucket `gwj-tf-state-237343248947`
  (us-west-2, versioned + encrypted), key `gwj/terraform.tfstate`. Fully
  separate from Oxy's state, so a GWJ apply has an independent lifecycle.
- **Own IAM** — `gwj-ecs-execution`, `gwj-ecs-task`, `gwj-github-deploy`
  (OIDC). GWJ never uses Oxy's roles, so there is no cross-stack IAM dependency.
- **Own SSM namespace** — `/gwj/*` (not `/oxy/gwj`).
- **Own security group** — `gwj-tasks` (GWJ does not reuse Oxy's `tasks` SG).
- **Own data plane** — own PostgreSQL database `gwj` (role `gwj`) on the shared
  `oxy-postgres` instance (created per oxy-infra runbook 30, NOT by this stack;
  only `/gwj/DATABASE_URL` is managed here), dedicated `gwj-media` S3 bucket +
  CloudFront, dedicated ACM certs.

**Shared, read-only (never managed here):** Oxy's VPC (`10.20.0.0/16`), its two
public subnets, the `oxy-alb` ALB + its `:443` HTTPS listener, and the
`oxy-cluster` ECS cluster — all consumed via `data` sources in `data.tf`.
Because shared infra is data-sourced and state is separate, a `terraform plan`
here can only **create GWJ resources** and can never modify Oxy's.

## What it creates

| Area | Resource |
|------|----------|
| ECR | `gwj-backend`, `gwj-mcp` (scan-on-push, keep-10). Services run images by DIGEST; `:latest` is only the bootstrap tag the task definitions name |
| Secrets | `/gwj/*` SSM params (random-seeded, `ignore_changes=[value]`) |
| PostgreSQL | `/gwj/DATABASE_URL` (imported; value set out-of-band) — the database itself lives on `oxy-postgres` |
| Media | private, versioned `gwj-media-usw2-<acct>` S3 + CloudFront `cdn.globalworldjournal.com` (OAC, articles/*) |
| ACM | `api`/`mcp.globalworldjournal.com` (us-west-2, SNI-attached to the shared listener) + `cdn` (us-east-1) |
| ECS | backend (4000, 2–4 tasks, CPU autoscaling) + mcp (4100) task-defs/target-groups/listener-rules (priorities 400/401)/services on the shared cluster. The deploy owns the running revision (`ignore_changes = [task_definition]`) |
| Monitoring | SNS `gwj-alerts` (`var.alert_emails`) + CloudWatch alarms (`monitoring.tf`) |
| IAM | own exec/task/deploy roles |

## Usage

```bash
cd ~/GWJ/infra
terraform init        # S3 backend (needs profile oxy bucket access)
terraform fmt
terraform validate
terraform plan        # SAFE — creates GWJ resources only, never touches Oxy
# terraform apply     # manual, deliberate
```

After apply, wire GitHub Actions from the outputs (see `docs/INFRA.md` "GitHub
configuration"): vars `ECS_CLUSTER`, `ECR_BACKEND`, `ECR_MCP`,
`ECS_SERVICE_BACKEND`, `ECS_SERVICE_MCP`, `AWS_REGION`; secret
`AWS_DEPLOY_ROLE_ARN` = `terraform output github_deploy_role_arn`. Write the
ACM validation CNAMEs (`terraform output acm_apis_validation` /
`acm_cdn_validation`) in the `globalworldjournal.com` Cloudflare zone, then
point `api`/`mcp` at the shared ALB and `cdn` at the CloudFront domain
(DNS-only). Run the seed as a one-shot ECS task per `docs/INFRA.md`.
