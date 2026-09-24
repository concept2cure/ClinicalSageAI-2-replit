# The two roles GitHub Actions assumes to deploy, over OIDC (no stored keys).
#
# Until 2026-09-24 nothing in Terraform created them: deploy-aws.yml assumed
# `secrets.AWS_DEPLOY_ROLE_ARN`, a role that had to be made by hand, with
# whatever permissions and trust someone chose, and no record of either.
#
# Two roles, because GitHub gives a job a different OIDC subject depending on
# whether it runs in a GitHub environment:
#
#   deploy role  subject repo:<repo>:environment:<deploy_environment>
#                The jobs behind the environment's protection (approval):
#                migrate, deploy-api, deploy-frontend, provision. ECS, PassRole
#                to the two task roles, the API log group, the frontend bucket,
#                the invalidation.
#   build role   subjects repo:<repo>:ref:refs/tags/v* (and the branch)
#                The jobs that run WITHOUT the environment (build-push,
#                smoke-test): push to the API repository, read the distribution.
#                Nothing that changes what production runs.
#
# One role trusted for both kinds of subject would let any workflow on the
# branch deploy without passing the environment's gate.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}

locals {
  oidc_host    = "token.actions.githubusercontent.com"
  account      = data.aws_caller_identity.current.account_id
  region       = data.aws_region.current.name
  cluster_name = element(split("/", var.ecs_cluster_arn), 1)

  provider_arn = var.create_oidc_provider ? aws_iam_openid_connect_provider.github[0].arn : data.aws_iam_openid_connect_provider.github[0].arn
}

# One per account. A second environment in the same account reads it instead.
resource "aws_iam_openid_connect_provider" "github" {
  count          = var.create_oidc_provider ? 1 : 0
  url            = "https://${local.oidc_host}"
  client_id_list = ["sts.amazonaws.com"]
  # AWS validates GitHub's tokens against its own trusted CA store and ignores
  # these; provider 5.70 still requires the argument. GitHub's published values.
  thumbprint_list = ["6938fd4d98bab03faadb97b34396831e3780aea1", "1c58a3a8518e8759bf075b76b750d4f2df264fcd"]
  tags            = var.tags
}

data "aws_iam_openid_connect_provider" "github" {
  count = var.create_oidc_provider ? 0 : 1
  url   = "https://${local.oidc_host}"
}

# Policies are plain jsonencode() values, not aws_iam_policy_document data
# sources, so the module's tests can read and assert them without AWS.
locals {
  trust_deploy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = local.provider_arn }
      Condition = {
        StringEquals = {
          "${local.oidc_host}:aud" = "sts.amazonaws.com"
          "${local.oidc_host}:sub" = "repo:${var.github_repository}:environment:${var.deploy_environment}"
        }
      }
    }]
  })

  trust_build = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Action    = "sts:AssumeRoleWithWebIdentity"
      Principal = { Federated = local.provider_arn }
      Condition = {
        StringEquals = { "${local.oidc_host}:aud" = "sts.amazonaws.com" }
        StringLike   = { "${local.oidc_host}:sub" = [for s in var.build_subjects : "repo:${var.github_repository}:${s}"] }
      }
    }]
  })

  ecr_push_actions = [
    "ecr:BatchCheckLayerAvailability", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart",
    "ecr:CompleteLayerUpload", "ecr:PutImage", "ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer",
  ]

  deploy_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      # Account-level; takes no resource.
      { Sid = "EcrLogin", Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Sid = "EcrApiRepository", Effect = "Allow", Action = concat(local.ecr_push_actions, ["ecr:DescribeImages"]), Resource = var.ecr_repository_arn },
      # Neither action supports resource-level permissions.
      { Sid = "TaskDefinitions", Effect = "Allow", Action = ["ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"], Resource = "*" },
      {
        Sid       = "RunOneOffTasksInThisClusterOnly", Effect = "Allow", Action = ["ecs:RunTask"]
        Resource  = [for f in var.one_off_task_families : "arn:aws:ecs:${local.region}:${local.account}:task-definition/${f}:*"]
        Condition = { ArnEquals = { "ecs:cluster" = var.ecs_cluster_arn } }
      },
      { Sid = "WatchAndStopTasksInThisCluster", Effect = "Allow", Action = ["ecs:DescribeTasks", "ecs:StopTask"], Resource = "arn:aws:ecs:${local.region}:${local.account}:task/${local.cluster_name}/*" },
      { Sid = "RollTheApiService", Effect = "Allow", Action = ["ecs:DescribeServices", "ecs:UpdateService"], Resource = var.ecs_api_service_arn },
      {
        Sid       = "PassTheTaskRolesToEcsOnly", Effect = "Allow", Action = ["iam:PassRole"], Resource = var.pass_role_arns
        Condition = { StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" } }
      },
      { Sid = "ReadOneOffTaskLogs", Effect = "Allow", Action = ["logs:GetLogEvents"], Resource = "${var.api_log_group_arn}:log-stream:*" },
      { Sid = "FrontendBucketList", Effect = "Allow", Action = ["s3:ListBucket"], Resource = var.frontend_bucket_arn },
      { Sid = "FrontendBucketObjects", Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"], Resource = "${var.frontend_bucket_arn}/*" },
      { Sid = "Invalidate", Effect = "Allow", Action = ["cloudfront:CreateInvalidation", "cloudfront:GetDistribution"], Resource = var.cloudfront_distribution_arn },
    ]
  })

  build_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrLogin", Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      { Sid = "PushTheApiImage", Effect = "Allow", Action = local.ecr_push_actions, Resource = var.ecr_repository_arn },
      { Sid = "SmokeTestReadsTheDistribution", Effect = "Allow", Action = ["cloudfront:GetDistribution"], Resource = var.cloudfront_distribution_arn },
    ]
  })
}

# ── Deploy role ─────────────────────────────────────────────────────────────

resource "aws_iam_role" "deploy" {
  name               = "${var.name_prefix}-github-deploy"
  assume_role_policy = local.trust_deploy
  # The first provision builds an image and then runs for up to its 60-minute
  # deadline; one hour of credentials would expire mid-wait.
  max_session_duration = 7200
  tags                 = var.tags
}

resource "aws_iam_role_policy" "deploy" {
  name   = "deploy"
  role   = aws_iam_role.deploy.id
  policy = local.deploy_policy
}

# ── Build role ──────────────────────────────────────────────────────────────

resource "aws_iam_role" "build" {
  name               = "${var.name_prefix}-github-build"
  assume_role_policy = local.trust_build
  tags               = var.tags
}

resource "aws_iam_role_policy" "build" {
  name   = "build"
  role   = aws_iam_role.build.id
  policy = local.build_policy
}
