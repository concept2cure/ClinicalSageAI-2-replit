# ── Names ────────────────────────────────────────────────────────────────────
# Production's names are the ones .github/workflows/deploy-aws.yml hard-codes
# (ECS_CLUSTER c2c-production, ECS_API_TASK_FAMILY c2c-production-api, …), so
# they are kept exactly; tests/names.tftest.hcl reads the workflow and checks.

locals {
  short           = var.environment == "production" ? "c2c-prod" : "c2c-stg"
  long            = "c2c-${var.environment}"
  evidence_bucket = "${local.short}-part11-evidence"
  frontend_bucket = "${local.short}-frontend"
}

# ── Networking ───────────────────────────────────────────────────────────────

module "vpc" {
  source           = "../modules/vpc-secure"
  vpc_cidr         = var.vpc_cidr
  public_subnets   = var.public_subnets
  private_subnets  = var.private_subnets
  azs              = var.azs
  region           = var.region
  eks_workloads_sg = module.ecs.ecs_tasks_security_group_id
  tags             = var.tags
}

# ── Container Registry ──────────────────────────────────────────────────────

module "ecr" {
  source           = "../modules/ecr"
  prefix           = local.short
  repository_names = ["api", "worker"]
  tags             = var.tags
}

# ── Database credentials (D1 brief B1) ──────────────────────────────────────
#
# Terraform owns both database passwords so it can compose real connection
# URLs. Production used to pass the RDS-managed master secret's ARN as
# DATABASE_URL. That secret is JSON ({"username","password"}), ECS injected it
# verbatim, and the app reads DATABASE_URL as a connection string, so no task
# could connect.
#
#   DATABASE_URL      the owner role (c2c_admin). Migrations run as it, and so
#                     does the API at boot: ensureCoreTables / ensureAuthTables
#                     run DDL on it, and server/routes/tenants-simple.ts serves
#                     routes through a client on it, outside RLS. A known
#                     exposure (docs/evidence/W2/2026-09-23b/README.md).
#   APP_DATABASE_URL  app_service, LOGIN NOSUPERUSER NOBYPASSRLS. The runtime
#                     connects as it; under RLS_ENFORCE=on the boot posture probe
#                     refuses a superuser or BYPASSRLS role.
#
# deploy-migrate mints app_service from APP_SERVICE_DB_PASSWORD
# (scripts/db/provision-app-role.mjs), and the migrate task is derived from the
# API task definition, so that password rides in the API task's secrets too.
# The mint works as the RDS master (not a superuser) and sends the server only
# the password's SCRAM verifier: RDS logs DDL to CloudWatch.
#
# Alphanumeric, so the passwords need no URL-encoding (40 characters, about 238
# bits). sslmode=verify-full makes every consumer of the URL require TLS and
# verify the server, including code paths that decide TLS from the URL alone.
# The image supplies the RDS CA (assets/rds-ca, NODE_EXTRA_CA_CERTS).

locals {
  db_name = "concept2cure_ri"
}

# The two database passwords rotate by changing var.db_credentials_rotation
# (P1-11, INF-18): a new value replaces both on the next apply, and the deploy
# that follows re-aligns app_service (deploy-migrate) and rolls every task onto
# the new secrets.
resource "random_password" "db_master" {
  length  = 40
  special = false
  keepers = { rotation = var.db_credentials_rotation }
}

# First-run setup's secret (server/routes/setup.ts): in production
# POST /api/setup/initialize creates the first administrator only for a request
# carrying it in X-Setup-Token. Read it from Secrets Manager once, for that one
# call (outputs.tf, first_run_setup); the route closes itself once any account
# exists.
resource "random_password" "setup_token" {
  length  = 48
  special = false
}

resource "random_password" "db_app_service" {
  length  = 40
  special = false
  keepers = { rotation = var.db_credentials_rotation }
}

locals {
  db_host          = "${module.rds.address}:${module.rds.port}"
  database_url     = "postgresql://${module.rds.master_username}:${random_password.db_master.result}@${local.db_host}/${local.db_name}?sslmode=verify-full"
  app_database_url = "postgresql://app_service:${random_password.db_app_service.result}@${local.db_host}/${local.db_name}?sslmode=verify-full"
}

# ── Secrets Manager ─────────────────────────────────────────────────────────

# OpenAI's key is stored only when a tenant elected OpenAI (var.openai_enabled;
# P0-11, ADR-0014 §1); otherwise the secret does not exist and no task is given
# OPENAI_API_KEY. The secret and the container entry read the same map, so they
# cannot disagree.
locals {
  openai_secret = {
    for k, v in {
      openai_api_key = {
        description = "OpenAI API key (a tenant's Order Form elects OpenAI)"
        value       = var.openai_api_key
      }
    } : k => v if var.openai_enabled
  }
}

module "secrets" {
  source     = "../modules/secrets"
  prefix     = "c2c/${var.environment}"
  kms_key_id = aws_kms_key.secrets.arn
  secrets = merge(local.openai_secret, {
    jwt_secret = {
      description = "JWT signing secret"
      value       = var.jwt_secret
    }
    anthropic_api_key = {
      description = "Anthropic API key (regulatory drafting: the approved high-risk models)"
      value       = var.anthropic_api_key
    }
    database_url = {
      description = "Owner-role connection URL (migrations)"
      value       = local.database_url
    }
    app_database_url = {
      description = "app_service connection URL (runtime, RLS enforced)"
      value       = local.app_database_url
    }
    setup_token = {
      description = "First-run setup token: POST /api/setup/initialize requires it in X-Setup-Token in production"
      value       = random_password.setup_token.result
    }
    app_service_db_password = {
      description = "app_service password, for deploy-migrate to mint the role"
      value       = random_password.db_app_service.result
    }
    refresh_token_secret = {
      description = "Refresh-token signing secret (distinct from JWT_SECRET)"
      value       = var.refresh_token_secret
    }
    mfa_encryption_key = {
      description = "Encrypts stored TOTP secrets"
      value       = var.mfa_encryption_key
    }
    audit_hmac_key = {
      description = "Audit-chain seal key"
      value       = var.audit_hmac_key
    }
    audit_hmac_secret = {
      description = "Tamper-proof audit HMAC secret"
      value       = var.audit_hmac_secret
    }
    audit_export_signing_key = {
      description = "Seals the signed audit export an inspector re-verifies"
      value       = var.audit_export_signing_key
    }
    audit_attestation_key = {
      description = "Signs tenant-export attestation reports"
      value       = var.audit_attestation_key
    }
    connector_encryption_key = {
      description = "Encrypts stored connector credentials"
      value       = var.connector_encryption_key
    }
    smtp_user = {
      description = "SMTP username (login OTP delivery)"
      value       = var.smtp_user
    }
    smtp_pass = {
      description = "SMTP password (login OTP delivery)"
      value       = var.smtp_pass
    }
  })
  tags = var.tags
}

# Rules the boot contract states across variables, checked at plan rather than
# as a crash-loop at boot (server/config/environment.ts).
resource "terraform_data" "boot_contract" {
  lifecycle {
    precondition {
      # The drafting provider must be one the placement approvals name, or a
      # draft that carries PII/PHI is refused per request on a "ready" deployment.
      condition     = contains(try(keys(jsondecode(var.ai_provider_placement_approvals)), []), "anthropic")
      error_message = "ai_provider_placement_approvals must name \"anthropic\", the provider regulatory drafting runs on (anthropic_api_key)."
    }
    # OpenAI is provisioned exactly when a tenant elected it (P0-11): a key with no
    # election would be held for nobody; an election with no key leaves the
    # gateway's OpenAI provider off while the Order Form says it is on.
    precondition {
      condition     = var.openai_enabled == (length(trimspace(var.openai_api_key)) > 0)
      error_message = "openai_enabled and openai_api_key go together: set both when a tenant's Order Form elects OpenAI (DPA Annex III), and neither otherwise."
    }
    precondition {
      condition     = var.refresh_token_secret != var.jwt_secret
      error_message = "refresh_token_secret must differ from jwt_secret: the app refuses to boot when they are equal (server/config/environment.ts)."
    }
    precondition {
      condition     = var.audit_hmac_key != var.audit_hmac_secret
      error_message = "audit_hmac_key and audit_hmac_secret must be different values: one seals the audit chain, the other signs tamper-proof audit rows."
    }
    precondition {
      condition     = var.audit_export_signing_key != var.jwt_secret
      error_message = "audit_export_signing_key must differ from jwt_secret: the app refuses to boot when the audit export would be sealed under the session-token key (server/services/audit/auditExportKeyPosture.ts)."
    }
    precondition {
      condition     = var.audit_export_signing_key != var.audit_hmac_key && var.audit_export_signing_key != var.audit_hmac_secret
      error_message = "audit_export_signing_key must differ from audit_hmac_key and audit_hmac_secret: each seals a different record."
    }
    precondition {
      condition     = !contains([var.jwt_secret, var.audit_hmac_key, var.audit_hmac_secret, var.audit_export_signing_key], var.audit_attestation_key)
      error_message = "audit_attestation_key must differ from jwt_secret, both audit HMAC keys and audit_export_signing_key: each signs a different record."
    }
    # The API task carries the virus scanner (modules/ecs-fargate), whose hard
    # memory limit comes out of the task's. What is left is the application's,
    # which ran in 2048 MiB before the scanner was added.
    precondition {
      condition     = var.api_memory - module.ecs.scanner_memory >= 2048
      error_message = "api_memory must leave the application 2048 MiB beside the virus scanner's ${module.ecs.scanner_memory} MiB: at least ${module.ecs.scanner_memory + 2048}."
    }
    # The self-hosted embedding lane embeds PII and PHI only under an approval
    # naming it for that use (ADR-0014 §1.5, amended 2026-10-01). Without one,
    # every chunk carrying a name or an address is refused per request, on a
    # deployment whose readiness probe (non-sensitive text) reports it ready.
    precondition {
      condition     = local.embedding_provider != "local" || contains(try(jsondecode(var.ai_provider_placement_approvals)["local"].approvedIntendedUses, []), "embedding")
      error_message = "ai_provider_placement_approvals must name \"local\" with intended use \"embedding\" while the embedding lane is the self-hosted one. ADR-0014 §1.5 records the value: \"local\":{\"region\":\"on_prem\",\"zeroRetentionApproved\":true,\"approvedDataClasses\":[\"pii\",\"phi\"],\"approvedIntendedUses\":[\"embedding\"]} (terraform.tfvars.example)."
    }
  }
}

locals {
  # Plain (non-secret) values the deploy preflight checks by value, not name.
  boot_environment = [
    { name = "RLS_ENFORCE", value = "on" },
    # The Part 11 audit posture (security plan P0-9). The tamper-proof trail and
    # its integrity monitor run only with AUDIT_TRAIL_ENABLED=true (they need
    # AUDIT_HMAC_SECRET, in boot_secrets, and audit.tamper_proof_log, from the
    # migration set). AUDIT_REQUIRE_ENFORCE=true makes a missing trail, a failed
    # immutability probe or a disabled daily sweep refuse boot instead of warn
    # (server/startup/audit-enforcement.ts). The preflight requires both `true`.
    { name = "AUDIT_TRAIL_ENABLED", value = "true" },
    { name = "AUDIT_REQUIRE_ENFORCE", value = "true" },
    { name = "AI_SENSITIVE_DATA_POLICY_MODE", value = "enforce" },
    # Database-level audit must be recording: deploy-migrate (a task derived
    # from this definition) refuses to roll services otherwise. It records what
    # the application's own trail cannot: statements that never went through
    # the application (scripts/db/database-audit.mjs; the RDS module preloads
    # pgaudit).
    { name = "DB_AUDIT_REQUIRED", value = "pgaudit" },
    { name = "AI_PROVIDER_PLACEMENT_APPROVALS", value = var.ai_provider_placement_approvals },
    # Reset and invitation links are built on APP_URL and never on the Host
    # header. The public origin is the CloudFront custom domain.
    { name = "APP_URL", value = local.app_origin },
    # In production csrfProtection refuses every state-changing browser request
    # (sign-in included) whose Origin is not in ALLOWED_ORIGINS or a short
    # hardcoded list (server/middleware/enterprise-security.ts). Without this, a
    # deployment on any other domain boots, reports ready, and nobody can sign
    # in. domain_aliases are validated to be lowercase hostnames (variables.tf).
    { name = "ALLOWED_ORIGINS", value = local.app_origin },
    # The connector for Claude (D8, decision P-2 in docs/LAUNCH_DEFINITION_OF_DONE.md):
    # on, at the deployment's own origin (the OAuth issuer and the resource the
    # tokens are bound to), registering clients from Claude's origins only. It
    # is mounted only when MCP_ENABLED is `true` (server/index.ts), and with no
    # allowlist production refuses every registration (server/mcp/index.ts).
    # CloudFront already routes its paths here (modules/cloudfront).
    { name = "MCP_ENABLED", value = "true" },
    { name = "MCP_PUBLIC_URL", value = local.app_origin },
    { name = "MCP_CLIENT_REDIRECT_ALLOWLIST", value = "https://claude.ai,https://claude.com" },
    # Vault documents go to this stack's bucket (vault_storage.tf). Without a
    # named store production refuses to boot (storage-posture.ts); the preflight
    # requires both names and accepts only `s3` here. AWS_REGION: the provider
    # otherwise assumes us-east-1, and staging need not run there.
    { name = "STORAGE_PROVIDER", value = "s3" },
    { name = "AWS_S3_BUCKET", value = local.vault_bucket },
    { name = "AWS_REGION", value = var.region },
    # Login OTP delivery. SMTP_USER and SMTP_PASS are in boot_secrets.
    { name = "SMTP_HOST", value = var.smtp_host },
    { name = "SMTP_PORT", value = tostring(var.smtp_port) },
    { name = "SMTP_FROM", value = var.smtp_from },
    # The audit chain's head, anchored outside the database (security plan P0-8,
    # DP-04): the daily integrity sweep verifies every organisation's chain
    # against the latest anchor in the object-locked evidence bucket, then
    # writes the next one under anchors/. Unset, the sweep reports the anchor
    # "not configured" and never verified. The grant is the evidence module's.
    { name = "AUDIT_ANCHOR_BUCKET", value = module.evidence.evidence_bucket },
  ]

  # The platform owner, by the address of their own password sign-in. The
  # documented bootstrap (server/middleware/requirePlatformAdmin.ts,
  # requireBusinessAdmin.ts): Master Administration, and the Business Center,
  # whose holder can designate a super_admin in the audited Access Management
  # console, after which these lists can shrink. A federated (SAML) session
  # gets nothing from either. MASTER_ADMIN_EMAILS is left unset: that grant
  # follows a designation (services/entitlements/master-admin.ts). API only.
  owner_environment = [
    { name = "PLATFORM_ADMIN_EMAILS", value = join(",", var.platform_owner_emails) },
    { name = "BUSINESS_CENTER_EMAILS", value = join(",", var.platform_owner_emails) },
  ]

  # The deployment's public origin: the first CloudFront alias. One input, so
  # APP_URL and ALLOWED_ORIGINS cannot disagree with the domain browsers use.
  app_origin = "https://${var.domain_aliases[0]}"

  # What every container of this image needs to boot. The API and the worker
  # run the same image and the same import-time refusals, so they share it.
  boot_secrets = concat([
    { name = "DATABASE_URL", value_from = module.secrets.secret_arns["database_url"] },
    { name = "APP_DATABASE_URL", value_from = module.secrets.secret_arns["app_database_url"] },
    { name = "JWT_SECRET", value_from = module.secrets.secret_arns["jwt_secret"] },
    { name = "REFRESH_TOKEN_SECRET", value_from = module.secrets.secret_arns["refresh_token_secret"] },
    { name = "MFA_ENCRYPTION_KEY", value_from = module.secrets.secret_arns["mfa_encryption_key"] },
    { name = "AUDIT_HMAC_KEY", value_from = module.secrets.secret_arns["audit_hmac_key"] },
    { name = "AUDIT_HMAC_SECRET", value_from = module.secrets.secret_arns["audit_hmac_secret"] },
    { name = "AUDIT_EXPORT_SIGNING_KEY", value_from = module.secrets.secret_arns["audit_export_signing_key"] },
    { name = "AUDIT_ATTESTATION_KEY", value_from = module.secrets.secret_arns["audit_attestation_key"] },
    { name = "CONNECTOR_ENCRYPTION_KEY", value_from = module.secrets.secret_arns["connector_encryption_key"] },
    { name = "ANTHROPIC_API_KEY", value_from = module.secrets.secret_arns["anthropic_api_key"] },
    { name = "SMTP_USER", value_from = module.secrets.secret_arns["smtp_user"] },
    { name = "SMTP_PASS", value_from = module.secrets.secret_arns["smtp_pass"] },
    ], [
    # Present exactly when the secret is: only when a tenant elected OpenAI.
    for k in keys(local.openai_secret) : { name = "OPENAI_API_KEY", value_from = module.secrets.secret_arns[k] }
  ])
}

# Optional error reporting (server/utils/sentry.ts): absent rather than empty
# when not configured, so the server's own "recommended" warning still fires.
locals {
  observability_environment = var.sentry_dsn == "" ? [] : [{ name = "SENTRY_DSN", value = var.sentry_dsn }]
}

# ── Database ─────────────────────────────────────────────────────────────────

module "rds" {
  source                = "../modules/rds"
  identifier            = local.long
  engine_version        = var.rds_engine_version
  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_max_allocated_storage
  database_name         = local.db_name
  master_password       = random_password.db_master.result
  subnet_ids            = module.vpc.private_subnet_ids
  security_group_ids    = [module.vpc.rds_sg_id]
  multi_az              = var.rds_multi_az
  backup_retention_days = var.rds_backup_retention_days
  deletion_protection   = var.rds_deletion_protection
  kms_key_id            = aws_kms_key.database.arn
  tags                  = var.tags
}

# ── Load Balancer ────────────────────────────────────────────────────────────

module "alb" {
  source              = "../modules/alb"
  name                = local.short
  vpc_id              = module.vpc.vpc_id
  vpc_cidr            = module.vpc.vpc_cidr
  public_subnet_ids   = module.vpc.public_subnet_ids
  certificate_arn     = var.acm_certificate_arn
  api_port            = 5000
  origin_secret       = var.cloudfront_origin_secret
  deletion_protection = var.alb_deletion_protection
  tags                = var.tags
}

# ── Compute (ECS Fargate) ───────────────────────────────────────────────────

module "ecs" {
  source = "../modules/ecs-fargate"
  # The api service registers with the ALB's target group, and ECS refuses
  # CreateService until a listener attaches that group to a load balancer. The
  # module sees only the target group's ARN, so without this a first apply can
  # create the service while the ALB is still provisioning. The mocked apply
  # cannot observe it; this orders it (docs/evidence/W2/2026-09-23b/terraform-apply-ordering.txt).
  depends_on = [module.alb]

  cluster_name          = local.long
  region                = var.region
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  alb_security_group_id = module.alb.alb_security_group_id
  api_target_group_arn  = module.alb.api_target_group_arn
  # CloudFront, then the ALB. The ALB admits CloudFront alone (modules/alb), so
  # the second-to-last X-Forwarded-For entry is CloudFront's record of the user.
  trust_proxy_hops = 2

  # Immutable, parameterized image references (see var.image_tag). Never
  # deploy a mutable `:latest` tag — that breaks rollback and reproducibility.
  # TODO(GA-blocker): pin to image digest (e.g. "...@sha256:<digest>") rather
  # than a tag once the deploy pipeline resolves the pushed image digest.
  api_image    = "${module.ecr.repository_urls["api"]}:${var.image_tag}"
  worker_image = "${module.ecr.repository_urls["worker"]}:${var.image_tag}"
  # The virus scanner the API task carries (variables.tf says how it is pinned).
  scanner_image = var.scanner_image

  api_cpu              = var.api_cpu
  api_memory           = var.api_memory
  api_desired_count    = var.api_desired_count
  worker_desired_count = var.worker_desired_count

  secret_arns = module.secrets.secret_arns_list
  # database_keys.tf: the execution role decrypts the secrets through this key.
  secrets_kms_key_arn = aws_kms_key.secrets.arn
  # Not the frontend bucket: CloudFront serves the SPA from it and the deploy
  # role publishes it. A task that could write it could rewrite the site every
  # user loads (security plan P0-15, INF-03; tests/boot_contract.tftest.hcl).
  # Vault documents have their own grant (vault_storage.tf). In the evidence
  # bucket the task needs the audit-chain anchors and nothing else (P0-8). This
  # was the bucket's ARN: object actions there matched no object, and
  # s3:ListBucket listed every key, CloudTrail's deliveries included.
  s3_bucket_arns = [
    "${module.evidence.evidence_bucket_arn}/${module.evidence.anchor_prefix}*",
  ]

  # Every name deploy-aws.yml's preflight requires, so the task definition this
  # renders is the one it accepts (tests/boot_contract.tftest.hcl reads the
  # preflight's list and checks it against both containers). The API adds
  # APP_SERVICE_DB_PASSWORD: the migrate task is cloned from its definition and
  # re-aligns app_service from it (provision-app-role.mjs sends only its SCRAM
  # verifier). The API never mints; APP_DATABASE_URL already holds the password.
  api_secrets = concat(local.boot_secrets, [
    { name = "APP_SERVICE_DB_PASSWORD", value_from = module.secrets.secret_arns["app_service_db_password"] },
    # First-run setup (setup_token above). Only the API serves the route.
    { name = "SETUP_TOKEN", value_from = module.secrets.secret_arns["setup_token"] },
  ])

  # The worker runs the same image, so the same import-time refusals: with less
  # than the full contract it exits at boot. Whether a worker exists at all is
  # a founder decision (B6+B7); while it does, it can start.
  worker_secrets = local.boot_secrets

  # The release signer (release_signing.tf) and the boot contract's plain values.
  api_environment    = concat(local.signer_environment, local.boot_environment, local.observability_environment, local.owner_environment, local.embedding_environment)
  worker_environment = concat(local.signer_environment, local.boot_environment, local.observability_environment, local.embedding_environment)

  tags = var.tags
}

# ── Embeddings: the self-hosted lane (P1-54, ADR-0014 §1.5) ──────────────────
#
# Vault and knowledge-base search embed every document and every query. Since
# P1-45 the gateway refuses OpenAI embeddings for every organisation that has
# not elected OpenAI, and since P0-11 this stack provisions no OpenAI key unless
# one has; with EMBEDDING_PROVIDER unset (OpenAI) a deployment searched nothing
# for an ordinary tenant. This lane is inside the VPC and serves every tenant
# the placement decision admits. tests/boot_contract.tftest.hcl holds the wiring.
#
# One lane for every tenant (ADR-0014 §1.5, amended 2026-10-01): the lane does
# not follow an OpenAI election, which covers generation and fallback only; a
# corpus searched with one model must be written with that model. bge-m3 emits
# 1024 values and the corpora are 1536 and 3072 wide: the application asks the
# server for 1024 and zero-pads (server/services/ai-gateway/embeddings/
# embedding-provider.ts), and /readyz is not ready until it has embedded one
# text that way (server/startup/ana-readiness-state.ts).

module "embeddings" {
  source = "../modules/embedding-service"

  name                      = local.long
  region                    = var.region
  cluster_id                = module.ecs.cluster_id
  vpc_id                    = module.vpc.vpc_id
  private_subnet_ids        = module.vpc.private_subnet_ids
  client_security_group_ids = [module.ecs.ecs_tasks_security_group_id]

  image          = var.embedding_image
  model_revision = var.embedding_model_revision
  cpu            = var.embedding_cpu
  memory         = var.embedding_memory
  desired_count  = var.embedding_desired_count

  tags = var.tags
}

locals {
  # Unconditional: no variable moves it (INF-36, resolved by the decision above).
  embedding_provider = "local"

  # The API and the worker both run the embedding runtime. With local and no
  # address, resolveEmbeddingProvider refuses rather than falling back to OpenAI.
  # EMBEDDING_LOCAL_MODEL is the model the server loads, so the ledger names
  # what served each call; the readiness probe refuses a server that answers as
  # any model but the corpus policy's (SELF_HOSTED_EMBEDDING_MODEL).
  embedding_environment = [
    { name = "EMBEDDING_PROVIDER", value = local.embedding_provider },
    { name = "EMBEDDING_LOCAL_BASE_URL", value = module.embeddings.base_url },
    { name = "EMBEDDING_LOCAL_MODEL", value = module.embeddings.model_id },
  ]
}

check "embedding_model_is_pinned" {
  assert {
    condition     = var.embedding_model_revision != null
    error_message = "embedding_model_revision is unset, so the embedding server loads BAAI/bge-m3 from the hub's main branch. Pin the commit (variables.tf says how): a model that changes under a corpus mixes two vector spaces."
  }
}

# ── Compliance Evidence (S3 + CloudTrail) ────────────────────────────────────

module "evidence" {
  source           = "../modules/compliance-evidence"
  bucket_name      = local.evidence_bucket
  name_prefix      = local.short
  object_lock_mode = var.evidence_object_lock_mode
  retention_days   = var.evidence_retention_days
  # The task role writes and reads the audit-chain anchors (P0-8).
  anchor_writer_role_arn = module.ecs.task_role_arn
  tags                   = var.tags
}

# ── CDN (CloudFront + S3) ───────────────────────────────────────────────────

module "cdn" {
  source          = "../modules/cloudfront"
  bucket_name     = local.frontend_bucket
  domain_aliases  = var.domain_aliases
  certificate_arn = var.cloudfront_certificate_arn
  api_domain_name = module.alb.alb_dns_name
  tags            = var.tags

  api_origin_secret_header_name = module.alb.origin_secret_header_name
  api_origin_secret             = var.cloudfront_origin_secret
}
