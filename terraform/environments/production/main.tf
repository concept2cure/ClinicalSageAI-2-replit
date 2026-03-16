terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
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
  source          = "../../modules/vpc-secure"
  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
  azs             = var.azs
  region          = var.region
  eks_workloads_sg = module.ecs.ecs_tasks_security_group_id
  tags            = var.tags
}

# ── Container Registry ──────────────────────────────────────────────────────

module "ecr" {
  source           = "../../modules/ecr"
  prefix           = "c2c-prod"
  repository_names = ["api", "worker"]
  tags             = var.tags
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
  }
  tags = var.tags
}

# ── Database ─────────────────────────────────────────────────────────────────

module "rds" {
  source             = "../../modules/rds"
  identifier         = "c2c-production"
  engine_version     = "15.4"
  instance_class     = var.rds_instance_class
  allocated_storage  = 50
  max_allocated_storage = 500
  database_name      = "clinicalsage"
  subnet_ids         = module.vpc.private_subnet_ids
  security_group_ids = [module.vpc.rds_sg_id]
  multi_az           = true
  backup_retention_days = 35
  tags               = var.tags
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
  source                = "../../modules/ecs-fargate"
  cluster_name          = "c2c-production"
  region                = var.region
  vpc_id                = module.vpc.vpc_id
  private_subnet_ids    = module.vpc.private_subnet_ids
  alb_security_group_id = module.alb.alb_security_group_id
  api_target_group_arn  = module.alb.api_target_group_arn

  api_image    = "${module.ecr.repository_urls["api"]}:latest"
  worker_image = "${module.ecr.repository_urls["worker"]}:latest"

  api_cpu    = var.api_cpu
  api_memory = var.api_memory
  api_desired_count    = var.api_desired_count
  worker_desired_count = var.worker_desired_count

  secret_arns = module.secrets.secret_arns_list
  s3_bucket_arns = [
    module.evidence.evidence_bucket_arn,
    module.cdn.frontend_bucket_arn,
    "${module.cdn.frontend_bucket_arn}/*",
  ]

  api_secrets = [
    { name = "DATABASE_URL",    value_from = module.rds.master_user_secret_arn },
    { name = "JWT_SECRET",      value_from = module.secrets.secret_arns["jwt_secret"] },
    { name = "OPENAI_API_KEY",  value_from = module.secrets.secret_arns["openai_api_key"] },
  ]

  worker_secrets = [
    { name = "DATABASE_URL",    value_from = module.rds.master_user_secret_arn },
    { name = "OPENAI_API_KEY",  value_from = module.secrets.secret_arns["openai_api_key"] },
  ]

  tags = var.tags
}

# ── Compliance Evidence (S3 + CloudTrail) ────────────────────────────────────

module "evidence" {
  source      = "../../modules/compliance-evidence"
  bucket_name = "c2c-prod-part11-evidence"
  kms_key_id  = "alias/c2c-prod-evidence"
  kms_policy  = ""
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
