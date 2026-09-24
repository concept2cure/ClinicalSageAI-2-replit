output "vpc_id" {
  value = module.vpc.vpc_id
}

output "alb_dns_name" {
  value = module.alb.alb_dns_name
}

output "cloudfront_domain" {
  value = module.cdn.distribution_domain_name
}

output "ecr_api_url" {
  value = module.ecr.repository_urls["api"]
}

output "ecr_worker_url" {
  value = module.ecr.repository_urls["worker"]
}

output "rds_endpoint" {
  value     = module.rds.endpoint
  sensitive = true
}

output "rds_db_name" {
  value = module.rds.db_name
}

output "ecs_cluster" {
  value = module.ecs.cluster_name
}

output "evidence_bucket" {
  value = module.evidence.evidence_bucket
}

# What the API task definition will carry, for review before apply and for
# tests/boot_contract.tftest.hcl. Names, plain values and secret ARNs only.
output "api_task_boot_contract" {
  value = {
    family        = "${local.long}-api"
    container     = module.ecs.api_container.name
    names         = sort(concat([for e in module.ecs.api_container.environment : e.name], [for s in module.ecs.api_container.secrets : s.name]))
    environment   = { for e in module.ecs.api_container.environment : e.name => e.value }
    secret_source = { for s in module.ecs.api_container.secrets : s.name => s.valueFrom }
    health_check  = module.ecs.api_container.healthCheck.command
  }
}

output "release_signing_key_arn" {
  value = aws_kms_key.release_signing.arn
}

# The names .github/workflows/deploy-aws.yml deploys to. Production's must equal
# the workflow's env block, or a deploy registers into infrastructure that does
# not exist (tests/names.tftest.hcl reads the workflow and checks).
output "deploy_targets" {
  value = {
    ECR_API_REPO            = "${local.short}-api"
    ECS_CLUSTER             = module.ecs.cluster_name
    ECS_API_SERVICE         = module.ecs.api_service_name
    ECS_API_TASK_FAMILY     = "${local.long}-api"
    ECS_API_CONTAINER_NAME  = module.ecs.api_container.name
    ECS_MIGRATE_TASK_FAMILY = local.migrate_family
    # The configured name, which is what S3 creates; the module's output is
    # the bucket's computed id, unknown until apply.
    FRONTEND_BUCKET = local.frontend_bucket
  }
}

# Every name this stack gives a resource, so staging can be checked for never
# reusing one of production's.
output "resource_names" {
  value = {
    ecr_prefix      = local.short
    secrets_prefix  = "c2c/${var.environment}"
    rds_identifier  = local.long
    alb_name        = local.short
    ecs_cluster     = local.long
    evidence_bucket = local.evidence_bucket
    evidence_kms    = "alias/${local.short}-evidence"
    frontend_bucket = local.frontend_bucket
    vault_bucket    = local.vault_bucket
    vault_kms       = local.vault_key_alias
    signing_alias   = local.release_signing_key_alias
  }
}

# Repository secrets for the pipeline (github_deploy.tf).
output "github_deploy_role_arn" {
  description = "AWS_DEPLOY_ROLE_ARN: jobs in the GitHub environment (migrate, deploy-api, deploy-frontend, provision)."
  value       = module.github_deploy.deploy_role_arn
}

output "github_build_role_arn" {
  description = "AWS_BUILD_ROLE_ARN: build-push and smoke-test, which run outside the environment."
  value       = module.github_deploy.build_role_arn
}

output "cloudfront_distribution_id" {
  description = "CLOUDFRONT_DISTRIBUTION_ID: deploy-frontend invalidates it, smoke-test reads its domain."
  value       = module.cdn.distribution_id
}

output "github_deploy_policies" {
  description = "Both roles' permissions (JSON), read by scripts/ops/terraform-preflight-proof.mjs to check them against every AWS call the workflows make."
  value = {
    deploy = module.github_deploy.deploy_policy
    build  = module.github_deploy.build_policy
  }
}
