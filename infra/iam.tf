# ---------------------------------------------------------------------------
# GWJ-OWNED IAM. These roles are created and owned by THIS stack — GWJ does NOT
# consume Oxy's ecs-execution / ecs-task / ec2 roles, so there is zero
# cross-stack IAM coupling. All scoped to gwj-* resources only.
# ---------------------------------------------------------------------------

# === ECS task execution role (pulls image, reads /gwj/* secrets at launch) ===
data "aws_iam_policy_document" "ecs_execution_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ecs-tasks.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "ecs_execution" {
  name               = "${var.prefix}-ecs-execution"
  assume_role_policy = data.aws_iam_policy_document.ecs_execution_assume.json
}

# Pull-from-ECR + write CloudWatch logs (AWS-managed).
resource "aws_iam_role_policy_attachment" "ecs_execution_managed" {
  role       = aws_iam_role.ecs_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

# Read the GWJ SSM params (the ECS agent resolves `secrets` valueFrom at launch)
# and decrypt the SecureStrings with the account default SSM CMK.
data "aws_iam_policy_document" "ecs_execution_ssm" {
  statement {
    sid     = "ReadGwjSsm"
    actions = ["ssm:GetParameters", "ssm:GetParameter"]
    resources = [
      "arn:aws:ssm:${var.region}:${var.account_id}:parameter/gwj/*",
    ]
  }
  statement {
    sid       = "DecryptSsm"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.region}:${var.account_id}:alias/aws/ssm"]
  }
}

resource "aws_iam_role_policy" "ecs_execution_ssm" {
  name   = "${var.prefix}-ecs-execution-ssm"
  role   = aws_iam_role.ecs_execution.id
  policy = data.aws_iam_policy_document.ecs_execution_ssm.json
}

# === ECS task role (the running container: writes article media to S3) ===
resource "aws_iam_role" "ecs_task" {
  name               = "${var.prefix}-ecs-task"
  assume_role_policy = data.aws_iam_policy_document.ecs_execution_assume.json
}

data "aws_iam_policy_document" "ecs_task_s3" {
  statement {
    sid     = "GwjMediaArticlesRW"
    actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.media.arn}/articles/*",
      # Instagram's generated headline-card images (instagramChannel.ts's
      # SOCIAL_CARD_KEY_PREFIX) — never granted here when that channel
      # shipped, so every Instagram publish has been failing outright on
      # s3:PutObject, confirmed live in production logs.
      "${aws_s3_bucket.media.arn}/social-cards/*",
    ]
  }
  statement {
    sid       = "GwjMediaList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
    condition {
      test     = "StringLike"
      variable = "s3:prefix"
      values   = ["articles/*", "social-cards/*"]
    }
  }
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name   = "${var.prefix}-ecs-task-s3"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_s3.json
}

# The newsletter sends through SES from the verified site-domain identity only.
data "aws_iam_policy_document" "ecs_task_ses" {
  statement {
    sid       = "GwjNewsletterSend"
    actions   = ["ses:SendEmail"]
    resources = [aws_sesv2_email_identity.site.arn]
  }
}

resource "aws_iam_role_policy" "ecs_task_ses" {
  name   = "${var.prefix}-ecs-task-ses"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_ses.json
}

# === GitHub OIDC deploy role (CI: ECR push + ecs:UpdateService) ===
# ARN goes to GitHub secret AWS_DEPLOY_ROLE_ARN (see INFRA.md §5).
data "aws_iam_policy_document" "github_deploy_assume" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [data.aws_iam_openid_connect_provider.github.arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    # Pin to the main branch only — a PR, fork, or other ref cannot assume the
    # deploy role. deploy-aws.yml runs on push to main + workflow_dispatch (also
    # from main), both of which present sub = repo:<repo>:ref:refs/heads/main.
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:ref:refs/heads/main"]
    }
  }
}

resource "aws_iam_role" "github_deploy" {
  name               = "${var.prefix}-github-deploy"
  assume_role_policy = data.aws_iam_policy_document.github_deploy_assume.json
}

data "aws_iam_policy_document" "github_deploy" {
  statement {
    sid       = "EcrAuth"
    actions   = ["ecr:GetAuthorizationToken"]
    resources = ["*"]
  }
  statement {
    sid = "EcrPush"
    actions = [
      "ecr:UploadLayerPart",
      "ecr:PutImage",
      "ecr:InitiateLayerUpload",
      "ecr:GetDownloadUrlForLayer",
      "ecr:CompleteLayerUpload",
      "ecr:BatchGetImage",
      "ecr:BatchCheckLayerAvailability",
    ]
    resources = [for r in aws_ecr_repository.app : r.arn]
  }
  # NOTE: CI does NOT write SSM. App secrets under /gwj/* are owned by Terraform
  # (ssm.tf); the deploy role intentionally has NO ssm:PutParameter so a
  # compromised workflow can't overwrite JWT_SECRET / ADMIN_PASSWORD / DATABASE_URL.
  statement {
    sid     = "EcsDeploy"
    actions = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [
      aws_ecs_service.backend.id,
      aws_ecs_service.mcp.id,
    ]
  }

  # Database migrations run as one-shots from the backend's newly registered
  # release (scripts/ecs-oneshot.sh): start the task on the shared cluster,
  # read the task definition's container/log names, wait for it, read its log.
  statement {
    sid       = "EcsMigrationOneShot"
    actions   = ["ecs:RunTask"]
    resources = ["arn:aws:ecs:${var.region}:${var.account_id}:task-definition/${aws_ecs_task_definition.backend.family}:*"]
    condition {
      test     = "ArnEquals"
      variable = "ecs:cluster"
      values   = [data.aws_ecs_cluster.oxy.arn]
    }
  }
  statement {
    sid       = "EcsMigrationOneShotObserve"
    actions   = ["ecs:DescribeTasks"]
    resources = ["arn:aws:ecs:${var.region}:${var.account_id}:task/${data.aws_ecs_cluster.oxy.cluster_name}/*"]
  }
  statement {
    sid       = "EcsDescribeTaskDefinition"
    actions   = ["ecs:DescribeTaskDefinition"]
    resources = ["*"] # this action does not support resource-level permissions
  }
  # Each deploy registers a revision of the gwj-* families that runs the new image
  # by digest (scripts/ecs-register-release.sh). It can only hand ECS the two GWJ
  # task roles (PassGwjTaskRoles below).
  statement {
    sid       = "EcsRegisterRelease"
    actions   = ["ecs:RegisterTaskDefinition"]
    resources = ["*"] # this action does not support resource-level permissions
  }
  statement {
    sid       = "PassGwjTaskRoles"
    actions   = ["iam:PassRole"]
    resources = [aws_iam_role.ecs_execution.arn, aws_iam_role.ecs_task.arn]
    condition {
      test     = "StringEquals"
      variable = "iam:PassedToService"
      values   = ["ecs-tasks.amazonaws.com"]
    }
  }
  statement {
    sid       = "ReadOneShotLogs"
    actions   = ["logs:GetLogEvents"]
    resources = ["${aws_cloudwatch_log_group.app.arn}:log-stream:*"]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${var.prefix}-github-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
