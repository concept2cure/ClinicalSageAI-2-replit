# The roles GitHub Actions assumes to deploy this environment (OIDC, no keys).
# Until 2026-09-24 deploy-aws.yml assumed `secrets.AWS_DEPLOY_ROLE_ARN`, a role
# nothing in Terraform created. modules/github-deploy-roles says why there are
# two and what each may do; outputs github_deploy_role_arn and
# github_build_role_arn are the values for the repository secrets
# AWS_DEPLOY_ROLE_ARN and AWS_BUILD_ROLE_ARN.

module "github_deploy" {
  source = "../modules/github-deploy-roles"

  name_prefix          = local.long
  github_repository    = var.github_repository
  deploy_environment   = var.environment
  build_subjects       = var.github_build_subjects
  create_oidc_provider = var.create_github_oidc_provider

  ecr_repository_arn  = module.ecr.repository_arns["api"]
  ecs_cluster_arn     = module.ecs.cluster_arn
  ecs_api_service_arn = module.ecs.api_service_arn
  # The one-off families the pipeline registers: deploy-aws.yml's migrate job
  # and provision-database.yml (both checked against these names in tests/).
  one_off_task_families       = [local.migrate_family, local.provision_family]
  pass_role_arns              = [module.ecs.execution_role_arn, module.ecs.task_role_arn]
  api_log_group_arn           = module.ecs.api_log_group_arn
  frontend_bucket_arn         = module.cdn.frontend_bucket_arn
  cloudfront_distribution_arn = module.cdn.distribution_arn

  tags = var.tags
}

locals {
  migrate_family   = "${local.long}-migrate"
  provision_family = "${local.long}-provision"
}
