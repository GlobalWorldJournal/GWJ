# ECR repos for the two GWJ backends. Names match the CI workflow's repo vars
# (ECR_BACKEND=gwj-backend, ECR_MCP=gwj-mcp). MUTABLE + scan_on_push + AES256,
# keep last 10 images (mirrors the Oxy convention).
locals {
  ecr_repos = ["gwj-backend", "gwj-mcp"]
}

resource "aws_ecr_repository" "app" {
  for_each             = toset(local.ecr_repos)
  name                 = each.key
  image_tag_mutability = "MUTABLE"

  image_scanning_configuration {
    scan_on_push = true
  }
  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "app" {
  for_each   = aws_ecr_repository.app
  repository = each.value.name
  policy = jsonencode({
    rules = [{
      rulePriority = 1
      description  = "keep last 10 images"
      selection = {
        tagStatus   = "any"
        countType   = "imageCountMoreThan"
        countNumber = 10
      }
      action = { type = "expire" }
    }]
  })
}
