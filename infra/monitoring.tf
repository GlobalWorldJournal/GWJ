# ---------------------------------------------------------------------------
# GWJ alarms → SNS topic gwj-alerts (subscribe with var.alert_emails). Every
# alarm notifies on ALARM and on recovery (OK). Thresholds are chosen so a
# single slow request or one task replacement does not page; a sustained
# problem does.
# ---------------------------------------------------------------------------

resource "aws_sns_topic" "alerts" {
  name = "${var.prefix}-alerts"
}

resource "aws_sns_topic_subscription" "alerts_email" {
  for_each  = toset(var.alert_emails)
  topic_arn = aws_sns_topic.alerts.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  alert_actions = [aws_sns_topic.alerts.arn]
  target_groups = {
    backend = aws_lb_target_group.backend
    mcp     = aws_lb_target_group.mcp
  }
  services = {
    backend = aws_ecs_service.backend
    mcp     = aws_ecs_service.mcp
  }
}

# A target failing its /healthz check for 3 consecutive minutes.
resource "aws_cloudwatch_metric_alarm" "unhealthy_hosts" {
  for_each            = local.target_groups
  alarm_name          = "${var.prefix}-${each.key}-unhealthy-hosts"
  alarm_description   = "A ${each.key} task has failed its ALB health check for 3 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "UnHealthyHostCount"
  dimensions          = { LoadBalancer = data.aws_lb.oxy.arn_suffix, TargetGroup = each.value.arn_suffix }
  statistic           = "Maximum"
  period              = 60
  evaluation_periods  = 3
  threshold           = 0
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alert_actions
  ok_actions          = local.alert_actions
}

# No healthy target at all: the service is down. Missing data means the target
# group reports nothing — also down.
resource "aws_cloudwatch_metric_alarm" "no_healthy_hosts" {
  for_each            = local.target_groups
  alarm_name          = "${var.prefix}-${each.key}-down"
  alarm_description   = "${each.key} has had no healthy task behind the ALB for 2 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HealthyHostCount"
  dimensions          = { LoadBalancer = data.aws_lb.oxy.arn_suffix, TargetGroup = each.value.arn_suffix }
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  treat_missing_data  = "breaching"
  alarm_actions       = local.alert_actions
  ok_actions          = local.alert_actions
}

# The application answering 5xx (not the ALB's own errors).
resource "aws_cloudwatch_metric_alarm" "target_5xx" {
  for_each            = local.target_groups
  alarm_name          = "${var.prefix}-${each.key}-5xx"
  alarm_description   = "${each.key} answered 10 or more 5xx responses within 5 minutes."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  dimensions          = { LoadBalancer = data.aws_lb.oxy.arn_suffix, TargetGroup = each.value.arn_suffix }
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 10
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alert_actions
  ok_actions          = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "cpu_high" {
  for_each            = local.services
  alarm_name          = "${var.prefix}-${each.key}-cpu-high"
  alarm_description   = "${each.key} average CPU above 85% for 15 minutes."
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  dimensions          = { ClusterName = data.aws_ecs_cluster.oxy.cluster_name, ServiceName = each.value.name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alert_actions
  ok_actions          = local.alert_actions
}

resource "aws_cloudwatch_metric_alarm" "memory_high" {
  for_each            = local.services
  alarm_name          = "${var.prefix}-${each.key}-memory-high"
  alarm_description   = "${each.key} average memory above 85% for 15 minutes."
  namespace           = "AWS/ECS"
  metric_name         = "MemoryUtilization"
  dimensions          = { ClusterName = data.aws_ecs_cluster.oxy.cluster_name, ServiceName = each.value.name }
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alert_actions
  ok_actions          = local.alert_actions
}

# Error-level application log lines (both services log JSON with `level`):
# unhandled 500s, failed channel deliveries, failed readiness checks, crashes.
resource "aws_cloudwatch_log_metric_filter" "error_logs" {
  name           = "${var.prefix}-error-logs"
  log_group_name = aws_cloudwatch_log_group.app.name
  pattern        = "{ $.level = \"error\" }"

  metric_transformation {
    name          = "ErrorLogLines"
    namespace     = "GWJ"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_metric_alarm" "error_logs" {
  alarm_name          = "${var.prefix}-error-logs"
  alarm_description   = "20 or more error-level log lines within 5 minutes (search /gwj/ecs for level=error)."
  namespace           = "GWJ"
  metric_name         = aws_cloudwatch_log_metric_filter.error_logs.metric_transformation[0].name
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = 20
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.alert_actions
  ok_actions          = local.alert_actions
}
