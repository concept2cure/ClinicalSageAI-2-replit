# The GitHub deploy roles grant what the pipeline calls and nothing that lets a
# job outside the GitHub environment change what production runs.
#
#   cd terraform/modules/github-deploy-roles && terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
  mock_data "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_iam_openid_connect_provider" {
    defaults = { arn = "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111122223333:role/mock" }
  }
}

variables {
  name_prefix                 = "c2c-production"
  github_repository           = "concept2cure/ClinicalSageAI-2-replit"
  deploy_environment          = "production"
  build_subjects              = ["ref:refs/tags/v*", "ref:refs/heads/concept2cure-v2"]
  create_oidc_provider        = true
  ecr_repository_arn          = "arn:aws:ecr:us-east-1:111122223333:repository/c2c-prod-api"
  ecs_cluster_arn             = "arn:aws:ecs:us-east-1:111122223333:cluster/c2c-production"
  ecs_api_service_arn         = "arn:aws:ecs:us-east-1:111122223333:service/c2c-production/c2c-production-api"
  one_off_task_families       = ["c2c-production-migrate", "c2c-production-provision"]
  pass_role_arns              = ["arn:aws:iam::111122223333:role/exec", "arn:aws:iam::111122223333:role/task"]
  api_log_group_arn           = "arn:aws:logs:us-east-1:111122223333:log-group:/ecs/c2c-production/api"
  frontend_bucket_arn         = "arn:aws:s3:::c2c-prod-frontend"
  cloudfront_distribution_arn = "arn:aws:cloudfront::111122223333:distribution/E123"
}

run "the_deploy_role_answers_only_to_the_github_environment" {
  command = apply

  # Exactly one subject, exact match: no wildcard can widen it to a branch.
  assert {
    condition = (
      jsondecode(output.deploy_trust).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:sub"] == "repo:concept2cure/ClinicalSageAI-2-replit:environment:production"
      && !can(jsondecode(output.deploy_trust).Statement[0].Condition.StringLike)
      && jsondecode(output.deploy_trust).Statement[0].Condition.StringEquals["token.actions.githubusercontent.com:aud"] == "sts.amazonaws.com"
    )
    error_message = "The deploy role must trust exactly repo:<repo>:environment:<env>, audience sts.amazonaws.com."
  }

  assert {
    condition     = alltrue([for s in jsondecode(output.build_trust).Statement[0].Condition.StringLike["token.actions.githubusercontent.com:sub"] : !strcontains(s, ":environment:")])
    error_message = "The build role must not be assumable from the environment's jobs (they use the deploy role)."
  }
}

run "the_build_role_cannot_change_what_production_runs" {
  command = apply

  assert {
    condition = length([
      for st in jsondecode(output.build_policy).Statement : st
      if anytrue([for a in st.Action : can(regex("^(ecs|iam|s3|logs):", a)) || a == "cloudfront:CreateInvalidation"])
    ]) == 0
    error_message = "The build role holds an ECS, IAM, S3, logs or invalidation permission; those belong behind the environment's gate."
  }
}

run "no_wildcards_beyond_the_actions_that_cannot_be_scoped" {
  command = apply

  # No action wildcards anywhere.
  assert {
    condition = alltrue(flatten([
      for p in [output.deploy_policy, output.build_policy] : [
        for st in jsondecode(p).Statement : [for a in st.Action : !strcontains(a, "*")]
      ]
    ]))
    error_message = "A policy grants a wildcard action."
  }

  # Resource "*" only where AWS offers nothing narrower.
  assert {
    condition = alltrue(flatten([
      for p in [output.deploy_policy, output.build_policy] : [
        for st in jsondecode(p).Statement : [
          for a in st.Action : contains(["ecr:GetAuthorizationToken", "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition"], a)
        ] if st.Resource == "*"
      ]
    ]))
    error_message = "Resource \"*\" is granted to an action that supports resource-level permissions."
  }

  assert {
    condition = anytrue([
      for st in jsondecode(output.deploy_policy).Statement :
      contains(st.Action, "iam:PassRole")
      && try(st.Condition.StringEquals["iam:PassedToService"], "") == "ecs-tasks.amazonaws.com"
      && try(toset(st.Resource) == toset(var.pass_role_arns), false)
    ])
    error_message = "iam:PassRole must be limited to the two task roles, passed to ECS tasks only."
  }

  assert {
    condition = anytrue([
      for st in jsondecode(output.deploy_policy).Statement :
      contains(st.Action, "ecs:RunTask") && try(st.Condition.ArnEquals["ecs:cluster"], "") == var.ecs_cluster_arn
      && try(alltrue([for r in st.Resource : can(regex(":task-definition/c2c-production-(migrate|provision):\\*$", r))]), false)
    ])
    error_message = "ecs:RunTask must be limited to the one-off families, in this cluster."
  }
}

run "a_second_environment_in_the_same_account_reuses_the_provider" {
  command = apply
  variables {
    create_oidc_provider = false
  }
  assert {
    condition     = jsondecode(output.deploy_trust).Statement[0].Principal.Federated == "arn:aws:iam::111122223333:oidc-provider/token.actions.githubusercontent.com"
    error_message = "With create_oidc_provider = false the roles must trust the account's existing provider."
  }
}

# ── Must fail ────────────────────────────────────────────────────────────────

run "refuses_an_environment_subject_on_the_build_role" {
  command = plan
  variables {
    build_subjects = ["environment:production"]
  }
  expect_failures = [var.build_subjects]
}

run "refuses_a_repository_that_is_not_owner_slash_repo" {
  command = plan
  variables {
    github_repository = "concept2cure"
  }
  expect_failures = [var.github_repository]
}
