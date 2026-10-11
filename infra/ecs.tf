# ---------------------------------------------------------------------------
# GWJ ECS — backend (4000) + mcp (4100) on the SHARED Oxy cluster, behind the
# SHARED ALB via GWJ-owned target groups + host-header listener rules. arm64,
# 256 cpu / 512 mem, GWJ-owned exec+task roles, secrets from /gwj/*. Both serve
# /healthz. Services use the dedicated gwj-tasks SG (not Oxy's).
# ---------------------------------------------------------------------------

locals {
  # Connection draining for a task leaving a target group (see the target groups).
  deregistration_delay_seconds = 30
}

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
      { name = "DATABASE_URL", valueFrom = aws_ssm_parameter.database_url.arn },
      # Read ONLY by the one-time cutover copy (packages/mongo-migration); the
      # PostgreSQL backend ignores it. Removed at the Mongo decommission.
      { name = "MONGO_URI", valueFrom = aws_ssm_parameter.mongo_uri.arn },
      { name = "JWT_SECRET", valueFrom = aws_ssm_parameter.jwt_secret.arn },
      { name = "ADMIN_USERNAME", valueFrom = aws_ssm_parameter.admin_username.arn },
      { name = "ADMIN_PASSWORD", valueFrom = aws_ssm_parameter.admin_password.arn },
      { name = "TELEGRAM_BOT_TOKEN", valueFrom = aws_ssm_parameter.telegram_bot_token.arn },
      { name = "FACEBOOK_PAGE_ID", valueFrom = aws_ssm_parameter.facebook_page_id.arn },
      { name = "FACEBOOK_PAGE_TOKEN", valueFrom = aws_ssm_parameter.facebook_page_token.arn },
      { name = "FACEBOOK_PAGE_ID_ES", valueFrom = aws_ssm_parameter.facebook_page_id_es.arn },
      { name = "FACEBOOK_PAGE_TOKEN_ES", valueFrom = aws_ssm_parameter.facebook_page_token_es.arn },
      { name = "INSTAGRAM_ACCOUNT_ID", valueFrom = aws_ssm_parameter.instagram_account_id.arn },
      { name = "INSTAGRAM_ACCOUNT_ID_ES", valueFrom = aws_ssm_parameter.instagram_account_id_es.arn },
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
  # A replaced task drains for this long before it is stopped. The AWS default
  # (300 s) made every rollout wait five minutes per task; requests here are
  # short-lived, and the app finishes in-flight ones on SIGTERM.
  deregistration_delay = local.deregistration_delay_seconds

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
  # Initial count only: autoscaling (below) owns it from then on.
  desired_count = var.backend_min_tasks
  launch_type   = "FARGATE"

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = local.subnets
    security_groups  = [aws_security_group.tasks.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "${var.prefix}-backend"
    container_port   = 4000
  }

  # The deploy owns which revision runs (scripts/ecs-register-release.sh pins
  # each release's image by digest), and autoscaling owns the task count.
  # Terraform owns the family's configuration: a change here registers a new
  # revision that the NEXT deploy builds on.
  lifecycle {
    ignore_changes = [task_definition, desired_count]
  }

  depends_on = [aws_lb_listener_rule.backend]
}

# Backend autoscaling: hold average CPU near 60% between the configured bounds.
# Every backend replica is stateless (sessions are JWTs, keys and data live in
# PostgreSQL); only the in-memory rate limits are per task.
resource "aws_appautoscaling_target" "backend" {
  service_namespace  = "ecs"
  resource_id        = "service/${data.aws_ecs_cluster.oxy.cluster_name}/${aws_ecs_service.backend.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  min_capacity       = var.backend_min_tasks
  max_capacity       = var.backend_max_tasks
}

resource "aws_appautoscaling_policy" "backend_cpu" {
  name               = "${var.prefix}-backend-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.backend.service_namespace
  resource_id        = aws_appautoscaling_target.backend.resource_id
  scalable_dimension = aws_appautoscaling_target.backend.scalable_dimension

  target_tracking_scaling_policy_configuration {
    target_value       = 60
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
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
    # The MCP server acts as its own agent (scoped token, shown in article
    # history as agent:<name>), never with the admin's password.
    secrets = [
      { name = "MCP_TOKEN", valueFrom = aws_ssm_parameter.mcp_token.arn },
      { name = "GWJ_API_TOKEN", valueFrom = aws_ssm_parameter.mcp_api_token.arn },
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
  # A replaced task drains for this long before it is stopped. The AWS default
  # (300 s) made every rollout wait five minutes per task; requests here are
  # short-lived, and the app finishes in-flight ones on SIGTERM.
  deregistration_delay = local.deregistration_delay_seconds

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
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.mcp.arn
    container_name   = "${var.prefix}-mcp"
    container_port   = 4100
  }

  # The deploy owns which revision runs (scripts/ecs-register-release.sh pins
  # each release's image by digest). Terraform owns the family's configuration:
  # a change here registers a new revision that the NEXT deploy builds on.
  lifecycle {
    ignore_changes = [task_definition]
  }

  depends_on = [aws_lb_listener_rule.mcp]
}

# GWJ-owned CloudWatch log group (NOT Oxy's /oxy/ecs).
resource "aws_cloudwatch_log_group" "app" {
  name              = "/gwj/ecs"
  retention_in_days = 30
}
