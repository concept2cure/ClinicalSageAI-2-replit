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
#   cd terraform/environments/production
#   terraform init -backend=false && terraform test
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
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/0" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      arn     = "arn:aws:rds:us-east-1:123456789012:db:mock"
      address = "c2c-production.mock.us-east-1.rds.amazonaws.com"
      port    = 5432
    }
  }
  # No arn default for secrets: the mock then generates a DISTINCT value per
  # instance. A shared fixed ARN made every "this variable reads that secret"
  # assertion below pass even with DATABASE_URL pointed at jwt_secret.
}

# Throwaway values of the right SHAPE. Nothing here is a real credential.
variables {
  image_tag                       = "sha-00000000"
  acm_certificate_arn             = "arn:aws:acm:us-east-1:123456789012:certificate/mock-alb"
  cloudfront_certificate_arn      = "arn:aws:acm:us-east-1:123456789012:certificate/mock-cf"
  jwt_secret                      = "test-jwt-secret-0000000000000000000000000000"
  openai_api_key                  = "sk-test-not-a-key"
  refresh_token_secret            = "test-refresh-secret-00000000000000000000000000"
  mfa_encryption_key              = "test-mfa-key-000000000000000000000000000000000"
  audit_hmac_key                  = "test-audit-hmac-key-0000000000000000000000000"
  audit_hmac_secret               = "test-audit-hmac-secret-0000000000000000000000"
  connector_encryption_key        = "test-connector-key-00000000000000000000000000"
  app_url                         = "https://app.example.com"
  ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":true,\"approvedDataClasses\":[\"pii\"],\"approvedIntendedUses\":[\"drafting\"]}}"
}

run "renders_the_boot_contract" {
  command = apply

  # Every name deploy-aws.yml's preflight requires, in the API container.
  assert {
    condition = length(setsubtract(
      toset(["RLS_ENFORCE", "DATABASE_URL", "APP_DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET", "MFA_ENCRYPTION_KEY", "AUDIT_HMAC_KEY", "AUDIT_HMAC_SECRET", "CONNECTOR_ENCRYPTION_KEY", "AI_SENSITIVE_DATA_POLICY_MODE", "AI_PROVIDER_PLACEMENT_APPROVALS", "CONCEPT2CURE_SIGNER_MODE", "APP_URL", "NODE_ENV"]),
      toset(concat(
        [for e in jsondecode(module.ecs.api_container_definitions)[0].environment : e.name],
        [for s in jsondecode(module.ecs.api_container_definitions)[0].secrets : s.name],
      ))
    )) == 0
    error_message = "The API container is missing a variable the deploy preflight requires (and the app refuses to boot without)."
  }

  # The worker runs the same image, so it carries the same contract.
  assert {
    condition = length(setsubtract(
      toset(["RLS_ENFORCE", "DATABASE_URL", "APP_DATABASE_URL", "JWT_SECRET", "REFRESH_TOKEN_SECRET", "MFA_ENCRYPTION_KEY", "AUDIT_HMAC_KEY", "AUDIT_HMAC_SECRET", "CONNECTOR_ENCRYPTION_KEY", "AI_SENSITIVE_DATA_POLICY_MODE", "AI_PROVIDER_PLACEMENT_APPROVALS", "CONCEPT2CURE_SIGNER_MODE", "APP_URL", "NODE_ENV"]),
      toset(concat(
        [for e in jsondecode(module.ecs.worker_container_definitions)[0].environment : e.name],
        [for s in jsondecode(module.ecs.worker_container_definitions)[0].secrets : s.name],
      ))
    )) == 0
    error_message = "The worker container is missing part of the boot contract."
  }

  # The preflight reads these VALUES from `environment` only; a value placed in
  # `secrets` passes the name check and is then refused at boot.
  assert {
    condition = alltrue([
      for pair in [["NODE_ENV", "production"], ["RLS_ENFORCE", "on"], ["AI_SENSITIVE_DATA_POLICY_MODE", "enforce"]] :
      one([for e in jsondecode(module.ecs.api_container_definitions)[0].environment : e.value if e.name == pair[0]]) == pair[1]
    ])
    error_message = "NODE_ENV, RLS_ENFORCE and AI_SENSITIVE_DATA_POLICY_MODE must be plain environment values of exactly production / on / enforce."
  }

  assert {
    condition     = can(regex("^https://[^/]+", one([for e in jsondecode(module.ecs.api_container_definitions)[0].environment : e.value if e.name == "APP_URL"])))
    error_message = "APP_URL must be a plain https origin in the API environment."
  }

  # Sign-in is accepted only from ALLOWED_ORIGINS (csrfProtection); the
  # deployment's own origin must be in it, in both containers.
  assert {
    condition = alltrue([
      for defs in [module.ecs.api_container_definitions, module.ecs.worker_container_definitions] :
      one([for e in jsondecode(defs)[0].environment : e.value if e.name == "ALLOWED_ORIGINS"]) == var.app_url
    ])
    error_message = "ALLOWED_ORIGINS must carry the deployment's own origin (app_url) in the API and worker environments."
  }

  # The execution role must be able to read every secret a task references —
  # the RDS-managed secret used to be outside its grant, so no task could start.
  assert {
    condition = length(setsubtract(
      toset(concat(
        [for s in jsondecode(module.ecs.api_container_definitions)[0].secrets : s.valueFrom],
        [for s in jsondecode(module.ecs.worker_container_definitions)[0].secrets : s.valueFrom],
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
      one([for s in jsondecode(module.ecs.api_container_definitions)[0].secrets : s.valueFrom if s.name == pair[0]]) == module.secrets.secret_arns[pair[1]]
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
      can(regex("^postgresql://${pair[0]}:[A-Za-z0-9]{48}@", pair[1]))
      && endswith(pair[1], "@${module.rds.address}:${module.rds.port}/concept2cure_ri?sslmode=verify-full")
    ]))
    error_message = "DATABASE_URL / APP_DATABASE_URL must be postgresql://<role>:<48 alphanumerics>@<rds address>:<port>/concept2cure_ri?sslmode=verify-full."
  }

  assert {
    condition     = nonsensitive(random_password.db_app_service.result != random_password.db_master.result)
    error_message = "The runtime role must not share the owner's password."
  }

  # The runtime never carries the password the provisioning run mints app_service
  # with; the migration task is cloned from this definition, and would re-apply
  # it. In neither container, as a secret or as a plain variable.
  assert {
    condition = alltrue([
      for defs in [module.ecs.api_container_definitions, module.ecs.worker_container_definitions] :
      !contains(concat(
        [for s in jsondecode(defs)[0].secrets : s.name],
        [for e in jsondecode(defs)[0].environment : e.name],
      ), "APP_SERVICE_DB_PASSWORD")
    ])
    error_message = "APP_SERVICE_DB_PASSWORD must not be on the API or worker task definition."
  }

  # No secret value in a plain environment variable, where any caller of
  # ecs:DescribeTaskDefinition reads it. Substrings too: a URL embeds a password.
  assert {
    condition = nonsensitive(alltrue(flatten([
      for defs in [module.ecs.api_container_definitions, module.ecs.worker_container_definitions] : [
        for e in jsondecode(defs)[0].environment : [
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
    condition     = !strcontains(join(" ", jsondecode(module.ecs.api_container_definitions)[0].healthCheck.command), "wget")
    error_message = "The container health check calls wget, which the image does not contain."
  }

  # Liveness, not readiness. /readyz is 503 whenever the database, the schema or
  # AnA is down, and AnA's verdict is latched at boot, so a readiness probe
  # here makes ECS replace every task until the deploy rolls back.
  assert {
    condition = alltrue([
      strcontains(join(" ", jsondecode(module.ecs.api_container_definitions)[0].healthCheck.command), "/healthz'"),
      !strcontains(join(" ", jsondecode(module.ecs.api_container_definitions)[0].healthCheck.command), "readyz"),
    ])
    error_message = "The container health check must probe /healthz (liveness), not /readyz."
  }
}

# ── Each of these must FAIL. A check only ever seen to pass has not been tested.

run "refuses_a_refresh_secret_equal_to_the_jwt_secret" {
  command = plan
  variables {
    refresh_token_secret = "test-jwt-secret-0000000000000000000000000000"
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

run "refuses_an_app_url_that_is_not_an_https_origin" {
  command = plan
  variables {
    app_url = "http://app.example.com"
  }
  expect_failures = [var.app_url]
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
    audit_hmac_secret = "test-audit-hmac-key-0000000000000000000000000"
  }
  expect_failures = [terraform_data.boot_contract]
}

# An Origin header never ends in "/" and never carries uppercase; either would
# boot, pass /readyz, and 403 every sign-in.
run "refuses_an_app_url_with_a_trailing_slash" {
  command = plan
  variables {
    app_url = "https://app.example.com/"
  }
  expect_failures = [var.app_url]
}

run "refuses_an_app_url_with_uppercase" {
  command = plan
  variables {
    app_url = "https://App.example.com"
  }
  expect_failures = [var.app_url]
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
