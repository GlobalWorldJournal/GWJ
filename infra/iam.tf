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
    ]
  }
  statement {
    sid       = "GwjMediaList"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.media.arn]
  }
}

resource "aws_iam_role_policy" "ecs_task_s3" {
  name   = "${var.prefix}-ecs-task-s3"
  role   = aws_iam_role.ecs_task.id
  policy = data.aws_iam_policy_document.ecs_task_s3.json
}

# === EC2 role + instance profile for the dedicated Mongo box ===
data "aws_iam_policy_document" "mongo_ec2_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["ec2.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "mongo" {
  name               = "${var.prefix}-mongo"
  assume_role_policy = data.aws_iam_policy_document.mongo_ec2_assume.json
}

# SSM-managed instance access (no SSH; matches Oxy's "access via SSM" posture).
resource "aws_iam_role_policy_attachment" "mongo_ssm_core" {
  role       = aws_iam_role.mongo.name
  policy_arn = "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"
}

# Read the Mongo admin creds from /gwj/mongo_* + write backups to the media
# bucket under mongo-backups/. (Backups are optional/lean; the grant is here so
# a future backup timer can use the role without an IAM change.)
data "aws_iam_policy_document" "mongo_ec2" {
  statement {
    sid       = "ReadMongoCreds"
    actions   = ["ssm:GetParameter", "ssm:GetParameters"]
    resources = ["arn:aws:ssm:${var.region}:${var.account_id}:parameter/gwj/mongo_*"]
  }
  statement {
    sid       = "DecryptSsm"
    actions   = ["kms:Decrypt"]
    resources = ["arn:aws:kms:${var.region}:${var.account_id}:alias/aws/ssm"]
  }
  statement {
    sid     = "MongoBackupsRW"
    actions = ["s3:PutObject", "s3:GetObject", "s3:ListBucket"]
    resources = [
      aws_s3_bucket.media.arn,
      "${aws_s3_bucket.media.arn}/mongo-backups/*",
    ]
  }
}

resource "aws_iam_role_policy" "mongo_ec2" {
  name   = "${var.prefix}-mongo"
  role   = aws_iam_role.mongo.id
  policy = data.aws_iam_policy_document.mongo_ec2.json
}

resource "aws_iam_instance_profile" "mongo" {
  name = "${var.prefix}-mongo"
  role = aws_iam_role.mongo.name
}

# === GitHub OIDC deploy role (CI: ECR push + ecs:UpdateService + SSM sync) ===
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
    condition {
      test     = "StringLike"
      variable = "token.actions.githubusercontent.com:sub"
      values   = ["repo:${var.github_repo}:*"]
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
  statement {
    sid       = "SsmPut"
    actions   = ["ssm:PutParameter"]
    resources = ["arn:aws:ssm:${var.region}:${var.account_id}:parameter/gwj/*"]
  }
  statement {
    sid     = "EcsDeploy"
    actions = ["ecs:UpdateService", "ecs:DescribeServices"]
    resources = [
      aws_ecs_service.backend.id,
      aws_ecs_service.mcp.id,
    ]
  }
}

resource "aws_iam_role_policy" "github_deploy" {
  name   = "${var.prefix}-github-deploy"
  role   = aws_iam_role.github_deploy.id
  policy = data.aws_iam_policy_document.github_deploy.json
}
