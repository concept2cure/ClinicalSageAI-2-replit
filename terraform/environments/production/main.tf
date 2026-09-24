terraform {
  required_version = ">= 1.5"

  required_providers {
    # Pinned to the minor this configuration is tested against
    # (tests/boot_contract.tftest.hcl, docs/evidence/W2/). `>= 5.0` let a fresh
    # init resolve any later provider — a new major included — that nothing had
    # ever validated this stack with. .terraform.lock.hcl records the exact build.
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.70"
    }
    # Database credentials Terraform owns (B1): generated here, composed into
    # connection strings below, and handed to ECS as Secrets Manager secrets.
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  backend "s3" {
    bucket         = "c2c-terraform-state"
    key            = "production/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "c2c-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "concept2cure"
      Environment = "production"
      ManagedBy   = "terraform"
    }
  }
}

# ── Networking ───────────────────────────────────────────────────────────────

module "vpc" {
  source           = "../../modules/vpc-secure"
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
  source           = "../../modules/ecr"
  prefix           = "c2c-prod"
  repository_names = ["api", "worker"]
  tags             = var.tags
}

# ── Database credentials (B1) ───────────────────────────────────────────────
#
# DATABASE_URL used to be `module.rds.master_user_secret_arn`: the secret RDS
# creates under manage_master_user_password, whose value is JSON
# ({"username":…,"password":…}). ECS injects a secret's value verbatim, so the
# container received that JSON as DATABASE_URL and the app — which reads a
# connection string — could not connect. Terraform now owns both credentials
# and composes the URLs the app actually reads.
#
# Request-serving queries run as `app_service` (LOGIN NOSUPERUSER NOBYPASSRLS),
# through APP_DATABASE_URL; under RLS_ENFORCE=on the boot refuses a superuser or
# BYPASSRLS runtime role. The role is minted ONCE, by the first provision of the
# empty database (`npm run db:provision` with APP_SERVICE_DB_PASSWORD from the
# app_service_db_password secret below); every deploy's migration step then
# re-grants it, identifying it from APP_DATABASE_URL (provision-app-role.mjs).
#
# The owner URL (DATABASE_URL) is NOT migration-only. The API reads it at every
# boot — ensureCoreTables / ensureAuthTables open owner pools and run DDL — and
# server/routes/tenants-simple.ts serves live routes through a client on it,
# outside RLS. So the API task carries the master credential. That is a known
# exposure, recorded in docs/evidence/W2/2026-09-23b/README.md, not a design.
#
# Alphanumeric only: the password sits inside a URL, and RDS rejects '/', '"',
# '@' and ' '. 48 alphanumerics is ~285 bits.
#
# Both values land in Terraform state, which is the encrypted S3 backend above.

resource "random_password" "db_master" {
  length  = 48
  special = false
}

resource "random_password" "db_app_service" {
  length  = 48
  special = false
}

locals {
  db_name            = "concept2cure_ri"
  db_master_username = "c2c_admin"
  db_app_role        = "app_service"
  db_endpoint        = "${module.rds.address}:${module.rds.port}"

  # sslmode=verify-full: the application verifies the server certificate in
  # production (server/db/ssl.ts), which requires the Amazon RDS CA bundle the
  # image ships (Dockerfile.optimized, NODE_EXTRA_CA_CERTS).
  database_url     = "postgresql://${local.db_master_username}:${random_password.db_master.result}@${local.db_endpoint}/${local.db_name}?sslmode=verify-full"
  app_database_url = "postgresql://${local.db_app_role}:${random_password.db_app_service.result}@${local.db_endpoint}/${local.db_name}?sslmode=verify-full"
}

# ── Secrets Manager ─────────────────────────────────────────────────────────

module "secrets" {
  source = "../../modules/secrets"
  prefix = "c2c/production"
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
      description = "Owner connection string (migrations). postgresql:// URL, not the RDS JSON credential."
      value       = local.database_url
    }
    app_database_url = {
      description = "Runtime connection string as app_service (non-superuser, NOBYPASSRLS)."
      value       = local.app_database_url
    }
    # NOT on any task definition. The migration task is derived from the API
    # task definition wholesale, so a password there would be re-applied by
    # `ALTER ROLE app_service … PASSWORD` on every deploy, and the API would
    # carry a credential it never uses. It is read once, by the provisioning
    # run that mints the role on an empty database (scripts/db/provision.mjs);
    # every later migration identifies the role from APP_DATABASE_URL, which
    # embeds the same generated password.
    app_service_db_password = {
      description = "Mints app_service on the provisioning run only (APP_SERVICE_DB_PASSWORD). Same value APP_DATABASE_URL embeds."
      value       = random_password.db_app_service.result
    }
    refresh_token_secret = {
      description = "Refresh-token signing secret"
      value       = var.refresh_token_secret
    }
    mfa_encryption_key = {
      description = "Encrypts TOTP secrets at rest"
      value       = var.mfa_encryption_key
    }
    audit_hmac_key = {
      description = "Audit ledger HMAC seal key"
      value       = var.audit_hmac_key
    }
    audit_hmac_secret = {
      description = "Tamper-proof audit chain signing secret"
      value       = var.audit_hmac_secret
    }
    connector_encryption_key = {
      description = "Connector credential encryption key"
      value       = var.connector_encryption_key
    }
  }
  tags = var.tags
}

# Cross-variable rules, so preconditions rather than variable validations
# (which cannot reference another variable before Terraform 1.9).
resource "terraform_data" "boot_contract" {
  lifecycle {
    precondition {
      condition     = var.refresh_token_secret != var.jwt_secret
      error_message = "refresh_token_secret must differ from jwt_secret (server/config/environment.ts refuses to boot when they match)."
    }
    # The app does not check this one. AUDIT_HMAC_KEY seals audit records and
    # AUDIT_HMAC_SECRET chains them; one value in both collapses the two-key
    # design into one secret whose disclosure forges both.
    precondition {
      condition     = var.audit_hmac_secret != var.audit_hmac_key
      error_message = "audit_hmac_secret must differ from audit_hmac_key: one seals audit records, the other chains them."
    }
  }
}

# The one list of what every container of this image needs to boot. The API and
# the worker share it, and the deploy pipeline derives the migration task from
# the API task definition, so all three carry the same contract. Checked against
# deploy-aws.yml's preflight by terraform/environments/production/tests/ and
# scripts/ops/terraform-preflight-proof.mjs.
locals {
  boot_secrets = [
    { name = "DATABASE_URL", value_from = module.secrets.secret_arns["database_url"] },
    { name = "APP_DATABASE_URL", value_from = module.secrets.secret_arns["app_database_url"] },
    { name = "JWT_SECRET", value_from = module.secrets.secret_arns["jwt_secret"] },
    { name = "REFRESH_TOKEN_SECRET", value_from = module.secrets.secret_arns["refresh_token_secret"] },
    { name = "MFA_ENCRYPTION_KEY", value_from = module.secrets.secret_arns["mfa_encryption_key"] },
    { name = "AUDIT_HMAC_KEY", value_from = module.secrets.secret_arns["audit_hmac_key"] },
    { name = "AUDIT_HMAC_SECRET", value_from = module.secrets.secret_arns["audit_hmac_secret"] },
    { name = "CONNECTOR_ENCRYPTION_KEY", value_from = module.secrets.secret_arns["connector_encryption_key"] },
    { name = "OPENAI_API_KEY", value_from = module.secrets.secret_arns["openai_api_key"] },
  ]

  boot_environment = [
    # Production accepts only the literal `on` (server/db/rlsEnforcement.ts).
    { name = "RLS_ENFORCE", value = "on" },
    # Not a decision: production refuses to boot on any other value
    # (assertSensitivePlacementConfiguration). The decision is the approvals.
    { name = "AI_SENSITIVE_DATA_POLICY_MODE", value = "enforce" },
    { name = "AI_PROVIDER_PLACEMENT_APPROVALS", value = var.ai_provider_placement_approvals },
    { name = "APP_URL", value = var.app_url },
    # In production csrfProtection refuses every state-changing browser request
    # (sign-in included) whose Origin is not in ALLOWED_ORIGINS or a short
    # hardcoded list (server/middleware/enterprise-security.ts). Without this, a
    # deployment on any other domain boots, reports ready, and nobody can sign
    # in. var.app_url is validated to be exactly an Origin header's form.
    { name = "ALLOWED_ORIGINS", value = var.app_url },
  ]
}

# ── Database ─────────────────────────────────────────────────────────────────

module "rds" {
  source                = "../../modules/rds"
  identifier            = "c2c-production"
  engine_version        = "15.4"
  instance_class        = var.rds_instance_class
  allocated_storage     = 50
  max_allocated_storage = 500
  database_name         = local.db_name
  master_username       = local.db_master_username
  master_password       = random_password.db_master.result
  subnet_ids            = module.vpc.private_subnet_ids
  security_group_ids    = [module.vpc.rds_sg_id]
  multi_az              = true
  backup_retention_days = 35
  tags                  = var.tags
}

# ── Load Balancer ────────────────────────────────────────────────────────────

module "alb" {
  source             = "../../modules/alb"
  name               = "c2c-prod"
  vpc_id             = module.vpc.vpc_id
  vpc_cidr           = module.vpc.vpc_cidr
  public_subnet_ids  = module.vpc.public_subnet_ids
  security_group_ids = [module.alb.alb_security_group_id]
  certificate_arn    = var.acm_certificate_arn
  api_port           = 5000
  tags               = var.tags
}

# ── Compute (ECS Fargate) ───────────────────────────────────────────────────

module "ecs" {
  source = "../../modules/ecs-fargate"
  # The api service registers with the ALB's target group, and ECS refuses
  # CreateService until that group is attached to a load balancer through a
  # listener. The module sees only the target group's ARN, so without this the
  # first apply can create the service while the ALB is still provisioning
  # ("target group does not have an associated load balancer"). The mocked
  # apply cannot observe it; this orders it.
  depends_on = [module.alb]

  cluster_name          = "c2c-production"
  region                = var.region
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  alb_security_group_id = module.alb.alb_security_group_id
  api_target_group_arn  = module.alb.api_target_group_arn

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

  api_secrets    = local.boot_secrets
  worker_secrets = local.boot_secrets

  # The boot contract, plus the release signer (release_signing.tf).
  api_environment    = concat(local.boot_environment, local.signer_environment)
  worker_environment = concat(local.boot_environment, local.signer_environment)

  tags = var.tags
}

# ── Compliance Evidence (S3 + CloudTrail) ────────────────────────────────────

module "evidence" {
  source           = "../../modules/compliance-evidence"
  bucket_name      = "c2c-prod-part11-evidence"
  kms_key_id       = "alias/c2c-prod-evidence"
  kms_policy       = ""
  object_lock_mode = "COMPLIANCE"
  retention_days   = 2555 # 7 years
  tags             = var.tags
}

# ── CDN (CloudFront + S3) ───────────────────────────────────────────────────

module "cdn" {
  source          = "../../modules/cloudfront"
  bucket_name     = "c2c-prod-frontend"
  domain_aliases  = var.domain_aliases
  certificate_arn = var.cloudfront_certificate_arn
  api_domain_name = module.alb.alb_dns_name
  tags            = var.tags
}

# ── Outputs ──────────────────────────────────────────────────────────────────

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

output "ecs_cluster" {
  value = module.ecs.cluster_name
}
