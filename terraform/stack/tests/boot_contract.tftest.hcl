# The production boot contract, checked against what this Terraform renders.
#
# Until 2026-09-23 nothing ran this configuration at all: `terraform validate`
# had never been executed, and when it was, production did not validate. With
# that fixed, the task definition it produced still could not have deployed —
# deploy-aws.yml's preflight refused it for nine missing variables, RLS_ENFORCE
# unset and no APP_URL — and could not have booted: DATABASE_URL was the RDS
# credential's JSON, the database name was illegal, and the execution role could
# not read the secret it pointed at.
#
# No AWS account is needed. The AWS provider is MOCKED and the apply is
# simulated, so every resource the stack declares is planned and "created" and
# the task definitions are rendered exactly as ECS would receive them. What a
# mock cannot tell you — whether AWS accepts an engine version, whether a quota
# allows a rule — is not claimed here; see docs/evidence/W2/.
#
#   cd terraform/stack
#   terraform init -backend=false && terraform test
#
# The stack is the one composition production and staging both instantiate
# (e4d5d856d); this suite tests it with production's settings.
#
# The required-names list below mirrors deploy-aws.yml's preflight. It is kept
# honest by scripts/ops/terraform-preflight-proof.mjs, which parses both and
# fails when they differ, and which runs the preflight's own shell against the
# task definition rendered here.

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
  # A mock invents random strings for computed attributes. These resources'
  # ARNs are given ARN-shaped values because the IAM policy documents that
  # consume them are rendered into assertions below; nothing else is implied.
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/mock" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/0" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/0/0" }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:function/mock" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/0" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      arn      = "arn:aws:rds:us-east-1:123456789012:db:mock"
      address  = "c2c-production.mock.us-east-1.rds.amazonaws.com"
      port     = 5432
      username = "c2c_admin"
      db_name  = "concept2cure_ri"
    }
  }
  # No arn default for secrets: the mock then generates a DISTINCT value per
  # instance. A shared fixed ARN made every "this variable reads that secret"
  # assertion below pass even with DATABASE_URL pointed at jwt_secret.
}

# Throwaway values of the right SHAPE, for production's settings. Nothing here
# is a real credential.
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
  create_github_oidc_provider     = true
  openai_api_key                  = "test-openai-key"
  jwt_secret                      = "jwt-0123456789abcdef0123456789abcdef"
  refresh_token_secret            = "refresh-0123456789abcdef0123456789abcdef"
  mfa_encryption_key              = "mfa-0123456789abcdef0123456789abcdef"
  audit_hmac_key                  = "audkey-0123456789abcdef0123456789abcdef"
  audit_hmac_secret               = "audsec-0123456789abcdef0123456789abcdef"
  connector_encryption_key        = "conn-0123456789abcdef0123456789abcdef"
  ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":true,\"approvedDataClasses\":[\"pii\"],\"approvedIntendedUses\":[\"drafting\"]}}"
}

run "renders_the_boot_contract" {
  command = apply

  # Every name deploy-aws.yml's preflight requires, in the API container. The
  # list is READ from the workflow's `for VAR in … ; do` loop, so the pipeline
  # and this suite cannot drift (if the loop's shape changes, regex() errors
  # and the run fails); APP_URL and NODE_ENV are checked by the step's later
  # value checks. Adopted from the parallel implementation in 752a09ab1.
  assert {
    condition = length(setsubtract(
      toset(concat(["APP_URL", "NODE_ENV"], regexall("[A-Z][A-Z0-9_]+", one(regex("for VAR in ([A-Z0-9_\\\\\\s]+); do", file("../../.github/workflows/deploy-aws.yml")))))),
      toset(concat(
        [for e in module.ecs.api_container.environment : e.name],
        [for s in module.ecs.api_container.secrets : s.name],
      ))
    )) == 0
    error_message = "The API container is missing a variable the deploy preflight requires (and the app refuses to boot without)."
  }

  # The worker runs the same image, so it carries the same contract.
  assert {
    condition = length(setsubtract(
      toset(concat(["APP_URL", "NODE_ENV"], regexall("[A-Z][A-Z0-9_]+", one(regex("for VAR in ([A-Z0-9_\\\\\\s]+); do", file("../../.github/workflows/deploy-aws.yml")))))),
      toset(concat(
        [for e in module.ecs.worker_container.environment : e.name],
        [for s in module.ecs.worker_container.secrets : s.name],
      ))
    )) == 0
    error_message = "The worker container is missing part of the boot contract."
  }

  # The preflight reads these VALUES from `environment` only; a value placed in
  # `secrets` passes the name check and is then refused at boot.
  assert {
    condition = alltrue([
      for pair in [["NODE_ENV", "production"], ["RLS_ENFORCE", "on"], ["AI_SENSITIVE_DATA_POLICY_MODE", "enforce"]] :
      one([for e in module.ecs.api_container.environment : e.value if e.name == pair[0]]) == pair[1]
    ])
    error_message = "NODE_ENV, RLS_ENFORCE and AI_SENSITIVE_DATA_POLICY_MODE must be plain environment values of exactly production / on / enforce."
  }

  assert {
    condition     = one([for e in module.ecs.api_container.environment : e.value if e.name == "APP_URL"]) == "https://${var.domain_aliases[0]}"
    error_message = "APP_URL must be the https origin of the first CloudFront alias, in the API environment."
  }

  # Sign-in is accepted only from ALLOWED_ORIGINS (csrfProtection); the
  # deployment's own origin must be in it, in both containers.
  assert {
    condition = alltrue([
      for defs in [module.ecs.api_container, module.ecs.worker_container] :
      one([for e in defs.environment : e.value if e.name == "ALLOWED_ORIGINS"]) == "https://${var.domain_aliases[0]}"
    ])
    error_message = "ALLOWED_ORIGINS must carry the deployment's own origin (the first CloudFront alias) in the API and worker environments."
  }

  # The execution role must be able to read every secret a task references —
  # the RDS-managed secret used to be outside its grant, so no task could start.
  assert {
    condition = length(setsubtract(
      toset(concat(
        [for s in module.ecs.api_container.secrets : s.valueFrom],
        [for s in module.ecs.worker_container.secrets : s.valueFrom],
      )),
      toset(flatten([jsondecode(module.ecs.execution_secrets_policy).Statement[0].Resource]))
    )) == 0
    error_message = "A task references a secret the ECS execution role cannot read; the task would fail before its container starts."
  }

  # DATABASE_URL and APP_DATABASE_URL come from secrets Terraform composes, not
  # from the RDS-managed credential (whose value is JSON, not a URL).
  assert {
    condition = alltrue([
      for pair in [["DATABASE_URL", "database_url"], ["APP_DATABASE_URL", "app_database_url"]] :
      one([for s in module.ecs.api_container.secrets : s.valueFrom if s.name == pair[0]]) == module.secrets.secret_arns[pair[1]]
    ])
    error_message = "DATABASE_URL / APP_DATABASE_URL must be the composed connection-string secrets."
  }

  # The URLs themselves, as rendered — not the source text, where a comment
  # would satisfy a regex. Each role on its own 48-character alphanumeric
  # password, at the RDS endpoint, on the legal database name, verifying the
  # server certificate. node-postgres applies a URL's sslmode over the app's own
  # TLS settings, so sslmode=disable here would turn TLS off (and rds.force_ssl
  # would then refuse the connection).
  assert {
    condition = nonsensitive(alltrue([
      for pair in [["c2c_admin", local.database_url], ["app_service", local.app_database_url]] :
      can(regex("^postgresql://${pair[0]}:[A-Za-z0-9]{40}@", pair[1]))
      && endswith(pair[1], "@${module.rds.address}:${module.rds.port}/concept2cure_ri?sslmode=verify-full")
    ]))
    error_message = "DATABASE_URL / APP_DATABASE_URL must be postgresql://<role>:<40 alphanumerics>@<rds address>:<port>/concept2cure_ri?sslmode=verify-full."
  }

  assert {
    condition     = nonsensitive(random_password.db_app_service.result != random_password.db_master.result)
    error_message = "The runtime role must not share the owner's password."
  }

  # The migrate task is cloned from the API definition and re-aligns app_service
  # from APP_SERVICE_DB_PASSWORD, so the API carries it — as a secret, from the
  # generated password's own secret. The worker has no such clone, and neither
  # container may carry it as a plain variable.
  assert {
    condition = alltrue([
      one([for s in module.ecs.api_container.secrets : s.valueFrom if s.name == "APP_SERVICE_DB_PASSWORD"]) == module.secrets.secret_arns["app_service_db_password"],
      !contains([for s in module.ecs.worker_container.secrets : s.name], "APP_SERVICE_DB_PASSWORD"),
      alltrue([
        for defs in [module.ecs.api_container, module.ecs.worker_container] :
        !contains([for e in defs.environment : e.name], "APP_SERVICE_DB_PASSWORD")
      ]),
    ])
    error_message = "APP_SERVICE_DB_PASSWORD must be an API secret (for the migrate clone), not on the worker, and never a plain variable."
  }

  # No secret value in a plain environment variable, where any caller of
  # ecs:DescribeTaskDefinition reads it. Substrings too: a URL embeds a password.
  assert {
    condition = nonsensitive(alltrue(flatten([
      for defs in [module.ecs.api_container, module.ecs.worker_container] : [
        for e in defs.environment : [
          for secret in [
            random_password.db_master.result, random_password.db_app_service.result,
            var.jwt_secret, var.refresh_token_secret, var.mfa_encryption_key, var.audit_hmac_key,
            var.audit_hmac_secret, var.connector_encryption_key, var.openai_api_key,
          ] : !strcontains(e.value, secret)
        ]
      ]
    ])))
    error_message = "A secret value appears in a task definition's plain environment."
  }

  assert {
    condition     = can(regex("^[A-Za-z][A-Za-z0-9_]{0,62}$", module.rds.db_name))
    error_message = "The RDS database name is not a legal RDS DBName."
  }

  # The image has no wget; a check that cannot run marks every task unhealthy.
  assert {
    condition     = !strcontains(join(" ", module.ecs.api_container.healthCheck.command), "wget")
    error_message = "The container health check calls wget, which the image does not contain."
  }

  # Liveness, not readiness. /readyz is 503 whenever the database, the schema or
  # AnA is down, and AnA's verdict is latched at boot, so a readiness probe
  # here makes ECS replace every task until the deploy rolls back.
  assert {
    condition = alltrue([
      strcontains(join(" ", module.ecs.api_container.healthCheck.command), "/healthz'"),
      !strcontains(join(" ", module.ecs.api_container.healthCheck.command), "readyz"),
    ])
    error_message = "The container health check must probe /healthz (liveness), not /readyz."
  }
}

# From the parallel implementation (e4d5d856d): the names the deploy workflow
# targets, and staging as the same composition.
# Production's names are hard-coded in deploy-aws.yml's env block. If Terraform
# names anything differently, a deploy registers into infrastructure that does
# not exist. Each expected value is read out of the workflow.
# Vault documents (vault_storage.tf). The preflight's names are checked above;
# this is the store they point at: the stack's own bucket, private, versioned,
# encrypted, TLS-only, and readable and writable by the application task role
# alone, with the delete the provider needs.
run "vault_documents_go_to_a_private_versioned_bucket_the_task_role_can_use" {
  command = apply

  assert {
    condition = alltrue([
      for c in [module.ecs.api_container, module.ecs.worker_container] :
      contains([for e in c.environment : "${e.name}=${e.value}"], "STORAGE_PROVIDER=s3") &&
      contains([for e in c.environment : "${e.name}=${e.value}"], "AWS_S3_BUCKET=${aws_s3_bucket.vault.bucket}")
    ])
    error_message = "Both containers must name S3 and this stack's vault bucket."
  }
  assert {
    condition     = aws_s3_bucket.vault.bucket == "c2c-prod-vault"
    error_message = "Production's vault bucket is c2c-prod-vault."
  }
  assert {
    condition     = one(aws_s3_bucket_versioning.vault.versioning_configuration).status == "Enabled"
    error_message = "The vault bucket must be versioned: an overwrite or delete keeps the prior version."
  }
  assert {
    condition = alltrue([
      aws_s3_bucket_public_access_block.vault.block_public_acls,
      aws_s3_bucket_public_access_block.vault.block_public_policy,
      aws_s3_bucket_public_access_block.vault.ignore_public_acls,
      aws_s3_bucket_public_access_block.vault.restrict_public_buckets,
    ])
    error_message = "Every public-access block must be on for the vault bucket."
  }
  assert {
    condition = (
      one(one(aws_s3_bucket_server_side_encryption_configuration.vault.rule).apply_server_side_encryption_by_default).sse_algorithm == "aws:kms" &&
      one(one(aws_s3_bucket_server_side_encryption_configuration.vault.rule).apply_server_side_encryption_by_default).kms_master_key_id == aws_kms_key.vault.arn &&
      aws_kms_key.vault.enable_key_rotation
    )
    error_message = "The vault bucket must encrypt under its own rotating KMS key."
  }
  assert {
    condition = anytrue([
      for st in [for s in jsondecode(aws_kms_key.vault.policy).Statement : s if s.Principal.AWS == module.ecs.task_role_arn] :
      length(setsubtract(toset(["kms:Decrypt", "kms:GenerateDataKey"]), toset(st.Action))) == 0 &&
      st.Condition.StringEquals["kms:ViaService"] == "s3.${var.region}.amazonaws.com"
    ])
    error_message = "The task role must decrypt and generate data keys with the vault key, through S3 only."
  }
  assert {
    condition = alltrue([
      for st in jsondecode(aws_kms_key.vault.policy).Statement :
      st.Principal.AWS == module.ecs.task_role_arn || length(setintersection(toset(st.Action), toset(["kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:ReEncrypt*", "kms:*"]))) == 0
    ])
    error_message = "No principal but the task role may decrypt with the vault key."
  }
  assert {
    condition = anytrue([
      for st in [for s in jsondecode(aws_s3_bucket_policy.vault.policy).Statement : s if s.Effect == "Allow"] :
      st.Principal.AWS == module.ecs.task_role_arn && st.Resource == "${aws_s3_bucket.vault.arn}/*" &&
      length(setsubtract(toset(["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]), toset(st.Action))) == 0
    ])
    error_message = "The task role must get, put and delete vault objects (s3-provider.ts deletes on discard)."
  }
  assert {
    condition = anytrue([
      for st in [for s in jsondecode(aws_s3_bucket_policy.vault.policy).Statement : s if s.Effect == "Allow"] :
      st.Principal.AWS == module.ecs.task_role_arn && st.Resource == aws_s3_bucket.vault.arn &&
      contains(st.Action, "s3:ListBucket")
    ])
    error_message = "The task role must list the vault bucket (a version stored before the index object is found by listing)."
  }
  assert {
    condition = alltrue([
      for st in [for s in jsondecode(aws_s3_bucket_policy.vault.policy).Statement : s if s.Effect == "Allow"] :
      st.Principal.AWS == module.ecs.task_role_arn && length(keys(st.Principal)) == 1
    ])
    error_message = "No principal but the application task role may be allowed into the vault bucket."
  }
  assert {
    condition = anytrue([
      for st in [for s in jsondecode(aws_s3_bucket_policy.vault.policy).Statement : s if s.Effect == "Deny"] :
      try(st.Condition.Bool["aws:SecureTransport"], "") == "false"
    ])
    error_message = "The vault bucket must refuse requests that are not over TLS."
  }
}

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

# provision-database.yml names its targets itself; they must be production's,
# or the first provision registers a family the deploy role cannot run
# (github_deploy.tf) against a cluster that does not exist.
run "provision_workflow_names_are_the_ones_terraform_creates" {
  command = plan
  assert {
    condition = alltrue([
      for k, v in merge(output.deploy_targets, { ECS_PROVISION_TASK_FAMILY = "c2c-production-provision" }) :
      v == one(regex("\n  ${k}: ([^\\s]+)", file("../../.github/workflows/provision-database.yml")))
      if k != "FRONTEND_BUCKET" && k != "ECS_MIGRATE_TASK_FAMILY"
    ])
    error_message = "A name in provision-database.yml differs from what Terraform creates."
  }
  assert {
    condition = anytrue([
      for st in jsondecode(output.github_deploy_policies.deploy).Statement :
      contains(st.Action, "ecs:RunTask") && try(contains(st.Resource, "arn:aws:ecs:us-east-1:123456789012:task-definition/c2c-production-provision:*"), false)
    ])
    error_message = "The deploy role cannot run the provision family."
  }
}

# ── Each of these must FAIL. A check only ever seen to pass has not been tested.

run "refuses_a_refresh_secret_equal_to_the_jwt_secret" {
  command = plan
  variables {
    refresh_token_secret = "jwt-0123456789abcdef0123456789abcdef"
  }
  expect_failures = [terraform_data.boot_contract]
}

run "refuses_a_short_audit_chain_secret" {
  command = plan
  variables {
    audit_hmac_secret = "too-short"
  }
  expect_failures = [var.audit_hmac_secret]
}

run "refuses_placement_approvals_that_are_not_a_json_object" {
  command = plan
  variables {
    ai_provider_placement_approvals = "[]"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}

run "refuses_equal_audit_seal_and_chain_keys" {
  command = plan
  variables {
    audit_hmac_secret = "audkey-0123456789abcdef0123456789abcdef"
  }
  expect_failures = [terraform_data.boot_contract]
}

# Each of these parses as a JSON object, and the app still refuses to boot on it.
run "refuses_phi_approval_without_zero_retention" {
  command = plan
  variables {
    ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":false,\"approvedDataClasses\":[\"phi\"],\"approvedIntendedUses\":[\"drafting\"]}}"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}

run "refuses_an_unknown_data_class" {
  command = plan
  variables {
    ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":true,\"approvedDataClasses\":[\"secret\"],\"approvedIntendedUses\":[\"drafting\"]}}"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}

run "refuses_a_non_boolean_zero_retention_flag" {
  command = plan
  variables {
    ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":\"true\",\"approvedDataClasses\":[],\"approvedIntendedUses\":[]}}"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}

run "refuses_a_non_string_intended_use" {
  command = plan
  variables {
    ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":true,\"approvedDataClasses\":[],\"approvedIntendedUses\":[7]}}"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}

run "refuses_a_missing_region" {
  command = plan
  variables {
    ai_provider_placement_approvals = "{\"anthropic\":{\"zeroRetentionApproved\":true,\"approvedDataClasses\":[],\"approvedIntendedUses\":[]}}"
  }
  expect_failures = [var.ai_provider_placement_approvals]
}

# The fail-closed interim value (no pii/phi to any provider) must be ACCEPTED:
# it is the option put to the founder while B4 is open.
run "accepts_the_fail_closed_interim_approvals" {
  command = plan
  variables {
    ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":false,\"approvedDataClasses\":[],\"approvedIntendedUses\":[]}}"
  }
}

# The first alias is APP_URL and ALLOWED_ORIGINS. A browser's Origin header
# carries the host lowercased with no scheme, port or trailing dot; any other
# form boots, passes /readyz, and 403s every sign-in.
run "refuses_an_uppercase_domain_alias" {
  command = plan
  variables {
    domain_aliases = ["App.example.com"]
  }
  expect_failures = [var.domain_aliases]
}

run "refuses_a_domain_alias_with_a_scheme" {
  command = plan
  variables {
    domain_aliases = ["https://app.example.com"]
  }
  expect_failures = [var.domain_aliases]
}

run "refuses_a_domain_alias_with_a_trailing_dot" {
  command = plan
  variables {
    domain_aliases = ["app.example.com."]
  }
  expect_failures = [var.domain_aliases]
}
