# ---------------------------------------------------------------------------
# GWJ ECS — backend (4000) + mcp (4100) on the SHARED Oxy cluster, behind the
# SHARED ALB via GWJ-owned target groups + host-header listener rules. arm64,
# 256 cpu / 512 mem, GWJ-owned exec+task roles, secrets from /gwj/*. Both serve
# /healthz. Services use the dedicated gwj-tasks SG (not Oxy's).
# ---------------------------------------------------------------------------

# === backend ===
resource "aws_ecs_task_definition" "backend" {
  family                   = "${var.prefix}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "${var.prefix}-backend"
    image        = "${aws_ecr_repository.app["gwj-backend"].repository_url}:latest"
    essential    = true
    portMappings = [{ containerPort = 4000, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "PORT", value = "4000" },
      { name = "AWS_REGION", value = var.region },
      { name = "S3_BUCKET", value = aws_s3_bucket.media.bucket },
      { name = "CDN_BASE_URL", value = "https://${var.cdn_domain}" },
      { name = "CORS_ORIGINS", value = var.site_origins },
    ]
    secrets = [
      { name = "MONGO_URI", valueFrom = aws_ssm_parameter.mongo_uri.arn },
      { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.jwt_secret.arn },
      { name = "ADMIN_USERNAME", valueFrom = aws_ssm_parameter.admin_username.arn },
      { name = "ADMIN_PASSWORD", valueFrom = aws_ssm_parameter.admin_password.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "gwj-backend"
        "awslogs-create-group"  = "true"
      }
    }
  }])
}

resource "aws_lb_target_group" "backend" {
  name        = "${var.prefix}-backend"
  port        = 4000
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener_rule" "backend" {
  listener_arn = data.aws_lb_listener.oxy_https.arn
  priority     = var.rule_priority_backend

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.backend.arn
  }
  condition {
    host_header {
      values = [var.api_domain]
    }
  }
}

resource "aws_ecs_service" "backend" {
  name            = "${var.prefix}-backend"
  cluster         = data.aws_ecs_cluster.oxy.arn
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.subnets
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "${var.prefix}-backend"
    container_port   = 4000
  }

  depends_on = [aws_lb_listener_rule.backend]
}

# === mcp ===
resource "aws_ecs_task_definition" "mcp" {
  family                   = "${var.prefix}-mcp"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.ecs_task.arn

  runtime_platform {
    cpu_architecture        = "ARM64"
    operating_system_family = "LINUX"
  }

  container_definitions = jsonencode([{
    name         = "${var.prefix}-mcp"
    image        = "${aws_ecr_repository.app["gwj-mcp"].repository_url}:latest"
    essential    = true
    portMappings = [{ containerPort = 4100, protocol = "tcp" }]
    environment = [
      { name = "NODE_ENV", value = "production" },
      { name = "MCP_PORT", value = "4100" },
      { name = "API_BASE_URL", value = "https://${var.api_domain}" },
    ]
    secrets = [
      { name = "MCP_TOKEN", valueFrom = aws_ssm_parameter.mcp_token.arn },
      { name = "ADMIN_USERNAME", valueFrom = aws_ssm_parameter.admin_username.arn },
      { name = "ADMIN_PASSWORD", valueFrom = aws_ssm_parameter.admin_password.arn },
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        "awslogs-group"         = aws_cloudwatch_log_group.app.name
        "awslogs-region"        = var.region
        "awslogs-stream-prefix" = "gwj-mcp"
        "awslogs-create-group"  = "true"
      }
    }
  }])
}

resource "aws_lb_target_group" "mcp" {
  name        = "${var.prefix}-mcp"
  port        = 4100
  protocol    = "HTTP"
  vpc_id      = local.vpc_id
  target_type = "ip"

  health_check {
    path                = "/healthz"
    matcher             = "200-399"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
}

resource "aws_lb_listener_rule" "mcp" {
  listener_arn = data.aws_lb_listener.oxy_https.arn
  priority     = var.rule_priority_mcp

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.mcp.arn
  }
  condition {
    host_header {
      values = [var.mcp_domain]
    }
  }
}

resource "aws_ecs_service" "mcp" {
  name            = "${var.prefix}-mcp"
  cluster         = data.aws_ecs_cluster.oxy.arn
  task_definition = aws_ecs_task_definition.mcp.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.subnets
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = true
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp.arn
    container_name   = "${var.prefix}-mcp"
    container_port   = 4100
  }

  depends_on = [aws_lb_listener_rule.mcp]
}

# GWJ-owned CloudWatch log group (NOT Oxy's /oxy/ecs).
resource "aws_cloudwatch_log_group" "app" {
  name              = "/gwj/ecs"
  retention_in_days = 30
}
