# ---------------------------------------------------------------------------
# Outputs. Several feed the GitHub Actions config (INFRA.md "GitHub
# configuration"): repo vars ECR_BACKEND/ECR_MCP/ECS_SERVICE_*/ECS_CLUSTER and
# secret AWS_DEPLOY_ROLE_ARN. The ACM validation CNAMEs must be written in the
# globalworldjournal.com Cloudflare zone before the certs go ISSUED.
# ---------------------------------------------------------------------------

output "region" {
  value = var.region
}

# CI: secret AWS_DEPLOY_ROLE_ARN.
output "github_deploy_role_arn" {
  value       = aws_iam_role.github_deploy.arn
  description = "Set as GitHub secret AWS_DEPLOY_ROLE_ARN."
}

# CI: var ECS_CLUSTER (the shared cluster GWJ runs on).
output "ecs_cluster" {
  value       = data.aws_ecs_cluster.oxy.cluster_name
  description = "Set as GitHub var ECS_CLUSTER."
}

# CI: vars ECR_BACKEND / ECR_MCP (repo names) + full URLs for reference.
output "ecr_backend_repo" {
  value       = aws_ecr_repository.app["gwj-backend"].name
  description = "Set as GitHub var ECR_BACKEND."
}

output "ecr_mcp_repo" {
  value       = aws_ecr_repository.app["gwj-mcp"].name
  description = "Set as GitHub var ECR_MCP."
}

output "ecr_repo_urls" {
  value = { for k, r in aws_ecr_repository.app : k => r.repository_url }
}

# CI: vars ECS_SERVICE_BACKEND / ECS_SERVICE_MCP.
output "ecs_service_backend" {
  value       = aws_ecs_service.backend.name
  description = "Set as GitHub var ECS_SERVICE_BACKEND."
}

output "ecs_service_mcp" {
  value       = aws_ecs_service.mcp.name
  description = "Set as GitHub var ECS_SERVICE_MCP."
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "cdn_distribution_domain" {
  value       = aws_cloudfront_distribution.media.domain_name
  description = "Default *.cloudfront.net domain — point cdn.globalworldjournal.com here via CNAME (DNS-only)."
}

output "alb_dns" {
  value       = data.aws_lb.oxy.dns_name
  description = "Shared ALB DNS — point api/mcp.globalworldjournal.com here via CNAME (DNS-only)."
}

output "mongo_private_ip" {
  value = aws_instance.mongo.private_ip
}

output "mongo_instance_id" {
  value = aws_instance.mongo.id
}

# Task/execution role ARNs (handy for one-shot seed tasks).
output "ecs_task_role_arn" {
  value = aws_iam_role.ecs_task.arn
}

output "ecs_execution_role_arn" {
  value = aws_iam_role.ecs_execution.arn
}

# ACM DNS-validation CNAMEs — write these in the globalworldjournal.com zone
# before the certs go ISSUED (and before the listener can serve api/mcp and
# CloudFront can finish).
output "acm_apis_validation" {
  description = "Validation CNAMEs for api/mcp.globalworldjournal.com (us-west-2)."
  value = {
    for o in aws_acm_certificate.apis.domain_validation_options :
    o.domain_name => {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  }
}

output "acm_cdn_validation" {
  description = "Validation CNAME for cdn.globalworldjournal.com (us-east-1, CloudFront)."
  value = {
    for o in aws_acm_certificate.cdn.domain_validation_options :
    o.domain_name => {
      name  = o.resource_record_name
      type  = o.resource_record_type
      value = o.resource_record_value
    }
  }
}
