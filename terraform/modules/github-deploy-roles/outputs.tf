output "deploy_role_arn" {
  description = "Repository secret AWS_DEPLOY_ROLE_ARN: jobs in the GitHub environment."
  value       = aws_iam_role.deploy.arn
}

output "build_role_arn" {
  description = "Repository secret AWS_BUILD_ROLE_ARN: build-push, which runs outside the environment. Null where this environment never builds (production)."
  value       = one(aws_iam_role.build[*].arn)
}

output "deploy_policy" {
  description = "The deploy role's permissions (JSON), for review and for tests."
  value       = local.deploy_policy
}

output "build_policy" {
  description = "The build role's permissions (JSON)."
  value       = local.build_policy
}

output "deploy_trust" {
  value = local.trust_deploy
}

output "build_trust" {
  value = local.trust_build
}
