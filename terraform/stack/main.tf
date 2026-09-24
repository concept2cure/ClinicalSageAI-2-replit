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
#   DATABASE_URL      the owner role (c2c_admin). Migrations run as it.
#   APP_DATABASE_URL  app_service, LOGIN NOSUPERUSER NOBYPASSRLS. The runtime
#                     connects as it; under RLS_ENFORCE=on the boot posture probe
#                     refuses a superuser or BYPASSRLS role.
#
# deploy-migrate mints app_service from APP_SERVICE_DB_PASSWORD
# (scripts/db/provision-app-role.mjs), and the migrate task is derived from the
# API task definition, so that password rides in the API task's secrets too.
#
# Alphanumeric, so the passwords need no URL-encoding (40 characters, about 238
# bits). sslmode=verify-full makes every consumer of the URL require TLS and
# verify the server, including code paths that decide TLS from the URL alone.
# The image supplies the RDS CA (assets/rds-ca, NODE_EXTRA_CA_CERTS).

locals {
  db_name = "concept2cure_ri"
}

resource "random_password" "db_master" {
  length  = 40
  special = false
}

resource "random_password" "db_app_service" {
  length  = 40
  special = false
}

locals {
  db_host          = "${module.rds.address}:${module.rds.port}"
  database_url     = "postgresql://${module.rds.master_username}:${random_password.db_master.result}@${local.db_host}/${local.db_name}?sslmode=verify-full"
  app_database_url = "postgresql://app_service:${random_password.db_app_service.result}@${local.db_host}/${local.db_name}?sslmode=verify-full"
}

# ── Secrets Manager ─────────────────────────────────────────────────────────

module "secrets" {
  source = "../modules/secrets"
  prefix = "c2c/${var.environment}"
  secrets = {
    jwt_secret = {
      description = "JWT signing secret"
      value       = var.jwt_secret
    }
    openai_api_key = {
      description = "OpenAI API key"
      value       = var.openai_api_key
    }
    database_url = {
      description = "Owner-role connection URL (migrations)"
      value       = local.database_url
    }
    app_database_url = {
      description = "app_service connection URL (runtime, RLS enforced)"
      value       = local.app_database_url
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
    connector_encryption_key = {
      description = "Encrypts stored connector credentials"
      value       = var.connector_encryption_key
    }
  }
  tags = var.tags
}

# Rules the boot contract states across variables, checked at plan rather than
# as a crash-loop at boot (server/config/environment.ts).
resource "terraform_data" "boot_contract" {
  lifecycle {
    precondition {
      condition     = var.refresh_token_secret != var.jwt_secret
      error_message = "refresh_token_secret must differ from jwt_secret: the app refuses to boot when they are equal (server/config/environment.ts)."
    }
    precondition {
      condition     = var.audit_hmac_key != var.audit_hmac_secret
      error_message = "audit_hmac_key and audit_hmac_secret must be different values: one seals the audit chain, the other signs tamper-proof audit rows."
    }
  }
}

locals {
  # Plain (non-secret) values the deploy preflight checks by value, not name.
  boot_environment = [
    { name = "RLS_ENFORCE", value = "on" },
    { name = "AI_SENSITIVE_DATA_POLICY_MODE", value = "enforce" },
    { name = "AI_PROVIDER_PLACEMENT_APPROVALS", value = var.ai_provider_placement_approvals },
    # Reset and invitation links are built on APP_URL and never on the Host
    # header. The public origin is the CloudFront custom domain.
    { name = "APP_URL", value = "https://${var.domain_aliases[0]}" },
  ]
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
  source                = "../modules/ecs-fargate"
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

  api_cpu              = var.api_cpu
  api_memory           = var.api_memory
  api_desired_count    = var.api_desired_count
  worker_desired_count = var.worker_desired_count

  secret_arns = module.secrets.secret_arns_list
  s3_bucket_arns = [
    module.evidence.evidence_bucket_arn,
    module.cdn.frontend_bucket_arn,
    "${module.cdn.frontend_bucket_arn}/*",
  ]

  # Every name deploy-aws.yml's preflight requires, so the task definition this
  # renders is the one it accepts (tests/boot_contract.tftest.hcl reads the
  # preflight's list and checks it against this output).
  api_secrets = [
    { name = "DATABASE_URL", value_from = module.secrets.secret_arns["database_url"] },
    { name = "APP_DATABASE_URL", value_from = module.secrets.secret_arns["app_database_url"] },
    { name = "APP_SERVICE_DB_PASSWORD", value_from = module.secrets.secret_arns["app_service_db_password"] },
    { name = "JWT_SECRET", value_from = module.secrets.secret_arns["jwt_secret"] },
    { name = "REFRESH_TOKEN_SECRET", value_from = module.secrets.secret_arns["refresh_token_secret"] },
    { name = "MFA_ENCRYPTION_KEY", value_from = module.secrets.secret_arns["mfa_encryption_key"] },
    { name = "AUDIT_HMAC_KEY", value_from = module.secrets.secret_arns["audit_hmac_key"] },
    { name = "AUDIT_HMAC_SECRET", value_from = module.secrets.secret_arns["audit_hmac_secret"] },
    { name = "CONNECTOR_ENCRYPTION_KEY", value_from = module.secrets.secret_arns["connector_encryption_key"] },
    { name = "OPENAI_API_KEY", value_from = module.secrets.secret_arns["openai_api_key"] },
  ]

  # The worker's DATABASE_URL was the same JSON secret. Whether a worker exists
  # at all is a founder decision (D1 brief B7); its database wiring is fixed
  # here regardless.
  worker_secrets = [
    { name = "DATABASE_URL", value_from = module.secrets.secret_arns["database_url"] },
    { name = "APP_DATABASE_URL", value_from = module.secrets.secret_arns["app_database_url"] },
    { name = "OPENAI_API_KEY", value_from = module.secrets.secret_arns["openai_api_key"] },
  ]

  # The release signer (release_signing.tf) and the boot contract's plain values.
  api_environment    = concat(local.signer_environment, local.boot_environment)
  worker_environment = concat(local.signer_environment, [{ name = "RLS_ENFORCE", value = "on" }])

  tags = var.tags
}

# ── Compliance Evidence (S3 + CloudTrail) ────────────────────────────────────

module "evidence" {
  source           = "../modules/compliance-evidence"
  bucket_name      = local.evidence_bucket
  kms_key_id       = "alias/${local.short}-evidence"
  kms_policy       = ""
  object_lock_mode = var.evidence_object_lock_mode
  retention_days   = var.evidence_retention_days
  tags             = var.tags
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
