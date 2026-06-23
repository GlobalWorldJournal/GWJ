# GWJ infra (`~/GWJ/infra`)

Standalone Terraform root module for the Global World Journal backend + MCP
server. It is **hosted on the Oxy AWS account** (`237343248947`, `us-west-2`,
CLI `--profile oxy`) but is **fully isolated** from Oxy's stack:

- **Own state** — S3 backend, bucket `oxy-tf-state-237343248947` (eu-west-1),
  key `gwj/terraform.tfstate`. A separate state file from Oxy's
  `uswest2/terraform.tfstate`, so a GWJ apply has an independent lifecycle.
- **Own IAM** — `gwj-ecs-execution`, `gwj-ecs-task`, `gwj-mongo`
  (role+instance-profile), `gwj-github-deploy` (OIDC). GWJ never uses Oxy's
  roles, so there is no cross-stack IAM dependency.
- **Own SSM namespace** — `/gwj/*` (not `/oxy/gwj`).
- **Own security groups** — `gwj-tasks` + `gwj-mongo` (GWJ does not reuse
  Oxy's `tasks` SG).
- **Own data plane** — dedicated MongoDB box, dedicated `gwj-media` S3 bucket +
  CloudFront, dedicated ACM certs.

**Shared, read-only (never managed here):** Oxy's VPC (`10.20.0.0/16`), its two
public subnets, the `oxy-alb` ALB + its `:443` HTTPS listener, and the
`oxy-cluster` ECS cluster — all consumed via `data` sources in `data.tf`.
Because shared infra is data-sourced and state is separate, a `terraform plan`
here can only **create GWJ resources** and can never modify Oxy's.

## What it creates

| Area | Resource |
|------|----------|
| ECR | `gwj-backend`, `gwj-mcp` (MUTABLE, scan-on-push, keep-10) |
| Secrets | `/gwj/*` SSM params (random-seeded, `ignore_changes=[value]`) |
| Mongo | dedicated `t4g.small` arm64 box + 30 GB gp3 EBS + `gwj-mongo` SG (27017 from `gwj-tasks` only) |
| Media | private `gwj-media-usw2-<acct>` S3 + CloudFront `cdn.globalworldjournal.com` (OAC, articles/*) |
| ACM | `api`/`mcp.globalworldjournal.com` (us-west-2, SNI-attached to the shared listener) + `cdn` (us-east-1) |
| ECS | backend (4000) + mcp (4100) task-defs/target-groups/listener-rules (priorities 400/401)/services on the shared cluster |
| IAM | own exec/task/mongo/deploy roles |

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
