# staging — a thin root over terraform/stack, the one deployment composition.
# This file owns the backend, the provider and what differs about staging;
# everything else is the stack's. See terraform/stack/versions.tf for why.

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.5"
    }
  }

  backend "s3" {
    bucket         = "c2c-terraform-state"
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "c2c-terraform-lock"
    # No `encrypt = true`: without a kms_key_id it requests SSE-S3 on every write,
    # overriding the bucket's customer-managed key, and the bucket refuses it
    # (terraform/bootstrap, TRIVY-01).
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      Project     = "concept2cure"
      Environment = "staging"
      ManagedBy   = "terraform"
    }
  }
}

module "stack" {
  source      = "../../stack"
  environment = "staging"
  region      = var.region
  tags        = var.tags

  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
  azs             = var.azs

  # Staging: the production composition at smaller sizes, and disposable.
  # Single-AZ, 7-day backups, deletion allowed, evidence under GOVERNANCE lock
  # for 30 days so the environment can be torn down. Same engine as production,
  # so staging proves what production will run.
  rds_engine_version        = "15.4"
  rds_allocated_storage     = 20
  rds_max_allocated_storage = 100
  rds_multi_az              = false
  rds_backup_retention_days = 7
  rds_deletion_protection   = false
  alb_deletion_protection   = false
  evidence_object_lock_mode = "GOVERNANCE"
  evidence_retention_days   = 30

  rds_instance_class   = var.rds_instance_class
  api_cpu              = var.api_cpu
  api_memory           = var.api_memory
  api_desired_count    = var.api_desired_count
  worker_desired_count = var.worker_desired_count

  image_tag                  = var.image_tag
  acm_certificate_arn        = var.acm_certificate_arn
  cloudfront_certificate_arn = var.cloudfront_certificate_arn
  domain_aliases             = var.domain_aliases
  cloudfront_origin_secret   = var.cloudfront_origin_secret

  # true while staging has its own AWS account (the recommended account topology);
  # set false if it shares production's account, which already created the provider.
  create_github_oidc_provider = true

  jwt_secret                      = var.jwt_secret
  refresh_token_secret            = var.refresh_token_secret
  mfa_encryption_key              = var.mfa_encryption_key
  audit_hmac_key                  = var.audit_hmac_key
  audit_hmac_secret               = var.audit_hmac_secret
  connector_encryption_key        = var.connector_encryption_key
  openai_api_key                  = var.openai_api_key
  ai_provider_placement_approvals = var.ai_provider_placement_approvals
}

output "vpc_id" {
  value = module.stack.vpc_id
}

output "alb_dns_name" {
  value = module.stack.alb_dns_name
}

output "cloudfront_domain" {
  value = module.stack.cloudfront_domain
}

output "ecr_api_url" {
  value = module.stack.ecr_api_url
}

output "ecr_worker_url" {
  value = module.stack.ecr_worker_url
}

output "rds_endpoint" {
  value     = module.stack.rds_endpoint
  sensitive = true
}

output "ecs_cluster" {
  value = module.stack.ecs_cluster
}

output "evidence_bucket" {
  value = module.stack.evidence_bucket
}

# Filed as evidence for SOP_KEY_MANAGEMENT.md §10 step 1.
output "release_signing_key_arn" {
  value = module.stack.release_signing_key_arn
}

# Review before apply: what the API task definition will carry.
output "api_task_boot_contract" {
  value = module.stack.api_task_boot_contract
}
