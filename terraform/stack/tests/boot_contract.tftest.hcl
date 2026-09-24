# The production API task definition must satisfy the deploy preflight's boot
# contract at PLAN time, not only when deploy-aws.yml refuses to register it.
#
# D1 brief (docs/evidence/W2/2026-09-23/README.md) found the production task
# definition carried three of the twelve names the preflight requires, with
# DATABASE_URL pointing at a JSON secret (B1). It also found an RDS database
# name that CreateDBInstance rejects (B2) and a health check calling a binary
# the image lacks (B5). Each run below pins one of those.
#
# The required names are read out of .github/workflows/deploy-aws.yml itself,
# so the workflow stays the only list. If that script is reformatted so the
# pattern no longer matches, regex() errors and this test fails; it does not
# pass on a stale copy.
#
# The stack is the one composition both environments use (terraform/stack), so
# these runs cover production and staging alike: every contract run below is
# repeated with environment = "staging".
#
# Offline: mocked providers. Run from terraform/stack:
#   terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111122223333:loadbalancer/app/c2c-prod/0123456789abcdef" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111122223333:targetgroup/c2c-prod-api/0123456789abcdef" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:111122223333:listener/app/c2c-prod/0123456789abcdef/0123456789abcdef" }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::111122223333:function/c2c-prod-frontend-spa-routes" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111122223333:log-group:c2c-test" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111122223333:role/c2c-test" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      address  = "c2c-production.abcdefghijkl.us-east-1.rds.amazonaws.com"
      port     = 5432
      username = "c2c_admin"
      db_name  = "concept2cure_ri"
    }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:111122223333:secret:c2c/production/mock-AbCdEf" }
  }
}

mock_provider "random" {}

variables {
  environment                     = "production"
  region                          = "us-east-1"
  vpc_cidr                        = "10.10.0.0/16"
  public_subnets                  = ["10.10.101.0/24", "10.10.102.0/24"]
  private_subnets                 = ["10.10.1.0/24", "10.10.2.0/24"]
  azs                             = ["us-east-1a", "us-east-1b"]
  rds_instance_class              = "db.t3.medium"
  rds_engine_version              = "15.4"
  rds_allocated_storage           = 50
  rds_max_allocated_storage       = 500
  rds_multi_az                    = true
  rds_backup_retention_days       = 35
  rds_deletion_protection         = true
  alb_deletion_protection         = true
  evidence_object_lock_mode       = "COMPLIANCE"
  evidence_retention_days         = 2555
  api_cpu                         = 1024
  api_memory                      = 2048
  api_desired_count               = 2
  worker_desired_count            = 1
  image_tag                       = "v1.0.0"
  acm_certificate_arn             = "arn:aws:acm:us-east-1:111122223333:certificate/alb"
  cloudfront_certificate_arn      = "arn:aws:acm:us-east-1:111122223333:certificate/cf"
  domain_aliases                  = ["app.example.com"]
  cloudfront_origin_secret        = "c2cTestOriginSecret_0123456789abcdef"
  openai_api_key                  = "test-openai-key"
  jwt_secret                      = "jwt-0123456789abcdef0123456789abcdef"
  refresh_token_secret            = "refresh-0123456789abcdef0123456789abcdef"
  mfa_encryption_key              = "mfa-0123456789abcdef0123456789abcdef"
  audit_hmac_key                  = "audkey-0123456789abcdef0123456789abcdef"
  audit_hmac_secret               = "audsec-0123456789abcdef0123456789abcdef"
  connector_encryption_key        = "conn-0123456789abcdef0123456789abcdef"
  ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"us\",\"zeroRetention\":true,\"dataClasses\":[],\"uses\":[]}}"
}

run "every_name_the_deploy_preflight_requires_is_in_the_task_definition" {
  command = apply

  assert {
    condition = alltrue([
      for n in regexall("[A-Z][A-Z0-9_]+", one(regex("for VAR in ([A-Z0-9_\\\\\\s]+); do", file("../../.github/workflows/deploy-aws.yml")))) :
      contains(output.api_task_boot_contract.names, n)
    ])
    error_message = "The API task definition lacks a name deploy-aws.yml's preflight requires. Missing: ${join(", ", [for n in regexall("[A-Z][A-Z0-9_]+", one(regex("for VAR in ([A-Z0-9_\\\\\\s]+); do", file("../../.github/workflows/deploy-aws.yml")))) : n if !contains(output.api_task_boot_contract.names, n)])}"
  }

  # The preflight reads these by value, not only by name.
  assert {
    condition     = output.api_task_boot_contract.environment["NODE_ENV"] == "production"
    error_message = "NODE_ENV must be exactly production."
  }
  assert {
    condition     = output.api_task_boot_contract.environment["RLS_ENFORCE"] == "on"
    error_message = "RLS_ENFORCE must be exactly on: production rejects aliases."
  }
  assert {
    condition     = output.api_task_boot_contract.environment["AI_SENSITIVE_DATA_POLICY_MODE"] == "enforce"
    error_message = "AI_SENSITIVE_DATA_POLICY_MODE must be exactly enforce in production."
  }
  assert {
    condition     = output.api_task_boot_contract.environment["APP_URL"] == "https://app.example.com"
    error_message = "APP_URL must be the https origin of the CloudFront custom domain."
  }
  # The migrate task is derived from this task definition and mints app_service.
  assert {
    condition     = contains(output.api_task_boot_contract.names, "APP_SERVICE_DB_PASSWORD")
    error_message = "APP_SERVICE_DB_PASSWORD must be in the API task definition: deploy-migrate mints app_service from it."
  }
}

run "the_database_urls_are_urls_not_the_rds_json_secret" {
  command = apply

  # B1: DATABASE_URL was module.rds.master_user_secret_arn, a JSON credential.
  assert {
    condition     = module.rds.master_user_secret_arn == null
    error_message = "RDS must not manage the master secret: that secret is JSON, and ECS would inject it verbatim as DATABASE_URL."
  }
  assert {
    condition     = output.api_task_boot_contract.secret_source["DATABASE_URL"] == module.secrets.secret_arns["database_url"]
    error_message = "DATABASE_URL must come from the composed owner-role URL secret."
  }
  assert {
    condition     = output.api_task_boot_contract.secret_source["APP_DATABASE_URL"] == module.secrets.secret_arns["app_database_url"]
    error_message = "APP_DATABASE_URL must come from the composed app_service URL secret."
  }
  assert {
    condition     = startswith(nonsensitive(local.database_url), "postgresql://c2c_admin:") && endswith(nonsensitive(local.database_url), "@c2c-production.abcdefghijkl.us-east-1.rds.amazonaws.com:5432/concept2cure_ri?sslmode=verify-full")
    error_message = "DATABASE_URL must be a postgresql:// URL for the owner role on the RDS endpoint, verifying TLS."
  }
  assert {
    condition     = startswith(nonsensitive(local.app_database_url), "postgresql://app_service:") && endswith(nonsensitive(local.app_database_url), "/concept2cure_ri?sslmode=verify-full")
    error_message = "APP_DATABASE_URL must be a postgresql:// URL for app_service, verifying TLS."
  }
}

run "the_database_name_is_one_rds_accepts" {
  command = plan

  # B2: "concept2cure-ri" fails CreateDBInstance, which validate never sees.
  assert {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]{0,62}$", module.rds.db_name))
    error_message = "The RDS database name must be letters, digits and underscores, starting with a letter."
  }
}

run "the_health_check_is_the_images_own_probe_on_readyz" {
  command = apply

  # B5: `wget` is not in node:22-slim, so every task read unhealthy.
  assert {
    condition     = length([for c in output.api_task_boot_contract.health_check : c if strcontains(c, "wget")]) == 0
    error_message = "The health check must not call wget: the image does not have it."
  }
  assert {
    condition     = length([for c in output.api_task_boot_contract.health_check : c if strcontains(c, "/readyz")]) == 1
    error_message = "The health check must probe /readyz, the endpoint D1's acceptance line reads."
  }
}

# Production's names are hard-coded in deploy-aws.yml's env block. If Terraform
# names anything differently, a deploy registers into infrastructure that does
# not exist. Each expected value is read out of the workflow.

run "production_names_are_the_ones_the_deploy_workflow_targets" {
  command = plan
  assert {
    condition = alltrue([
      for k, v in output.deploy_targets :
      v == one(regex("\n  ${k}: ([^\\s]+)", file("../../.github/workflows/deploy-aws.yml")))
    ])
    error_message = "A production name differs from deploy-aws.yml: ${join("; ", [for k, v in output.deploy_targets : "${k} terraform=${v} workflow=${one(regex("\n  ${k}: ([^\\s]+)", file("../../.github/workflows/deploy-aws.yml")))}" if v != one(regex("\n  ${k}: ([^\\s]+)", file("../../.github/workflows/deploy-aws.yml")))])}"
  }
}

# The same contract for staging. Staging exists to prove what production will
# run (D1 brief B8), so a staging task definition the preflight would refuse
# proves nothing.

run "staging_carries_every_name_the_deploy_preflight_requires" {
  command = apply
  variables {
    environment = "staging"
  }
  assert {
    condition = alltrue([
      for n in regexall("[A-Z][A-Z0-9_]+", one(regex("for VAR in ([A-Z0-9_\\\\\\s]+); do", file("../../.github/workflows/deploy-aws.yml")))) :
      contains(output.api_task_boot_contract.names, n)
    ])
    error_message = "The staging API task definition lacks a name the deploy preflight requires."
  }
  assert {
    condition     = output.api_task_boot_contract.environment["RLS_ENFORCE"] == "on" && output.api_task_boot_contract.environment["NODE_ENV"] == "production"
    error_message = "Staging runs the production posture: NODE_ENV=production and RLS_ENFORCE=on."
  }
  assert {
    condition     = module.rds.master_user_secret_arn == null && output.api_task_boot_contract.secret_source["DATABASE_URL"] == module.secrets.secret_arns["database_url"]
    error_message = "Staging's DATABASE_URL must be the composed URL secret, as production's is."
  }
}

run "staging_is_distinct_from_production" {
  command = plan
  variables {
    environment = "staging"
  }
  # Nothing in staging may collide with, or be mistaken for, production: every
  # name carries "stg" or "staging", and none is a production name.
  assert {
    condition     = alltrue([for k, v in output.resource_names : strcontains(v, "stg") || strcontains(v, "staging")])
    error_message = "Every staging resource name must be its own: ${jsonencode(output.resource_names)}"
  }
  assert {
    condition     = output.resource_names.signing_alias == "alias/fda-signing-key-2026-staging"
    error_message = "Staging must sign with its own KMS key, never under the production alias."
  }
}

# Refusals. Each run must fail on exactly the named check.

run "refuses_a_refresh_secret_equal_to_the_jwt_secret" {
  command = plan
  variables {
    refresh_token_secret = "jwt-0123456789abcdef0123456789abcdef"
  }
  expect_failures = [terraform_data.boot_contract]
}

run "refuses_a_short_key" {
  command = plan
  variables {
    mfa_encryption_key = "too-short"
  }
  expect_failures = [var.mfa_encryption_key]
}

run "refuses_placement_approvals_that_are_not_a_json_object" {
  command = plan
  variables {
    ai_provider_placement_approvals = "[\"anthropic\"]"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}
