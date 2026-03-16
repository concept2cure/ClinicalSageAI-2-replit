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
    key            = "staging/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "c2c-terraform-lock"
    encrypt        = true
  }
}

provider "aws" {
  region = var.region
}

module "vpc_secure" {
  source          = "../../modules/vpc-secure"
  vpc_cidr        = var.vpc_cidr
  public_subnets  = var.public_subnets
  private_subnets = var.private_subnets
  azs             = var.azs
  region          = var.region
  eks_workloads_sg = var.eks_workloads_sg
  tags            = var.tags
}

module "evidence" {
  source = "../../modules/compliance-evidence"
  bucket_name = var.evidence_bucket_name
  kms_key_id = var.evidence_kms_key_id
  kms_policy = var.kms_policy
  object_lock_mode = var.object_lock_mode
  retention_days = var.retention_days
  tags = var.tags
}

output "vpc_id" {
  value = module.vpc_secure.vpc_id
}

output "evidence_bucket" {
  value = module.evidence.evidence_bucket
}
