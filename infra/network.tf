# ---------------------------------------------------------------------------
# GWJ-owned security groups (in Oxy's VPC, but created/owned by this stack for
# isolation). GWJ does NOT reuse Oxy's `tasks` SG.
# ---------------------------------------------------------------------------

# Dedicated Fargate tasks SG for GWJ: only the shared ALB SG may reach the
# containers (any port). Mirrors Oxy's tasks-SG ingress pattern.
resource "aws_security_group" "tasks" {
  name        = "${var.prefix}-tasks-sg"
  description = "GWJ Fargate tasks - from the shared ALB only"
  vpc_id      = local.vpc_id

  ingress {
    description     = "from shared alb"
    from_port       = 0
    to_port         = 65535
    protocol        = "tcp"
    security_groups = [data.aws_security_group.oxy_alb.id]
  }
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
  tags = { Name = "${var.prefix}-tasks-sg" }
}
