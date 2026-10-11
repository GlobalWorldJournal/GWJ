# ---------------------------------------------------------------------------
# Shared Oxy hosting — consumed READ-ONLY via data sources. NONE of these are
# managed by this stack; a GWJ plan/apply can only CREATE gwj-* resources and
# can never modify the VPC, ALB, listener, or cluster below.
#
# Confirmed live values (aws --profile oxy, us-west-2, 2026-06-23):
#   VPC      vpc-022f0720b54f7e9c6  (cidr 10.20.0.0/16, Name oxy-vpc)
#   ALB      oxy-alb  arn .../app/oxy-alb/ab69b56aa7b5b615
#   Listener :443 HTTPS  .../oxy-alb/ab69b56aa7b5b615/3faa29f7a83406a3
#   Cluster  oxy-cluster (ACTIVE)
#   Public   subnet-08f5cc132b3cab15c (us-west-2a, oxy-public-a),
#            subnet-0bfb367f29d1fd375 (us-west-2b, oxy-public-b)
#   Private  subnet-09be52663c9affaea (us-west-2a, oxy-private-a),
#            subnet-0f338d0c3f0497225 (us-west-2b, oxy-private-b)
#   OIDC     arn:aws:iam::237343248947:oidc-provider/token.actions.githubusercontent.com
# ---------------------------------------------------------------------------

data "aws_caller_identity" "current" {}

# Oxy's VPC — matched by its CIDR (stable; the only 10.20.0.0/16 VPC).
data "aws_vpc" "oxy" {
  filter {
    name   = "cidr"
    values = ["10.20.0.0/16"]
  }
}

# Oxy's private application subnets. They have same-zone NAT egress and an S3
# gateway endpoint; GWJ tasks use them without receiving public IPv4 addresses.
data "aws_subnets" "oxy_private" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.oxy.id]
  }
  filter {
    name   = "tag:Name"
    values = ["oxy-private-*"]
  }
}

# Oxy's shared ALB + its HTTPS listener (GWJ SNI-attaches a cert + host rules).
data "aws_lb" "oxy" {
  name = "oxy-alb"
}

data "aws_lb_listener" "oxy_https" {
  load_balancer_arn = data.aws_lb.oxy.arn
  port              = 443
}

# The shared ALB's security group — GWJ's dedicated tasks SG allows ingress from
# it (so the ALB can reach GWJ containers), exactly like Oxy's tasks SG does.
# Confirmed: the oxy-alb has a single SG sg-06fa7e56701f0db02.
data "aws_security_group" "oxy_alb" {
  id = "sg-06fa7e56701f0db02"
}

# Oxy's shared ECS cluster (GWJ runs its services on it).
data "aws_ecs_cluster" "oxy" {
  cluster_name = "oxy-cluster"
}

# The account-global GitHub OIDC provider (one per account) — referenced so the
# GWJ deploy role trusts it without re-creating it.
data "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"
}

locals {
  vpc_id  = data.aws_vpc.oxy.id
  subnets = data.aws_subnets.oxy_private.ids
}
