// Bootstrap: create the S3 bucket that holds Terraform remote state.
// Run this ONCE per AWS account, before any other terraform apply:
//   terraform -chdir=terraform/bootstrap init && terraform -chdir=terraform/bootstrap apply
// then give each root the bucket's name (terraform/README.md, step 1):
//   terraform -chdir=terraform/bootstrap output -raw state_bucket
//
// 2026-10-21 (MR-03 Stage 1, OPS-03 and OPS-26; never applied before this):
//   - The bucket had a fixed default name. S3 names are global and that one
//     belongs to another account (it answers 403 from eu-west-1), so the first
//     apply would fail with BucketAlreadyExists. The name is now the account's
//     own: c2c-tfstate-<account id>-<region>.
//   - The DynamoDB lock table is gone. Terraform 1.11 made S3-native locking
//     (`use_lockfile = true`, a lock object beside the state) generally
//     available and deprecated DynamoDB locking; both roots use the lock file.
//   Guarded by scripts/ci/check-terraform-backend.mjs (ci:terraform-backend).

terraform {
  required_version = ">= 1.11"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.93"
    }
  }
}

provider "aws" {
  region = var.region
}

data "aws_caller_identity" "current" {}

locals {
  state_bucket = coalesce(var.state_bucket_name, "c2c-tfstate-${data.aws_caller_identity.current.account_id}-${var.region}")
}

# ── S3 bucket for state files ────────────────────────────────────────────────

resource "aws_s3_bucket" "tfstate" {
  bucket = local.state_bucket

  lifecycle {
    prevent_destroy = true
  }

  tags = merge(var.tags, { Purpose = "terraform-state" })
}

resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  versioning_configuration {
    status = "Enabled"
  }
}

# State holds every value the stacks are given, secrets included, in plain
# JSON. A customer-managed key means reading it needs kms:Decrypt on this key,
# which is granted and logged separately from s3:GetObject (TRIVY-01,
# 2026-09-24; previously the AWS-managed aws/s3 key).
resource "aws_kms_key" "tfstate" {
  description         = "Terraform remote state (${local.state_bucket})"
  enable_key_rotation = true
  tags                = merge(var.tags, { Purpose = "terraform-state" })
}

resource "aws_kms_alias" "tfstate" {
  name          = "alias/${local.state_bucket}"
  target_key_id = aws_kms_key.tfstate.key_id
}

resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.tfstate.arn
    }
    bucket_key_enabled = true
  }
}

# The S3 backend's `encrypt = true` without a kms_key_id asks for SSE-S3
# (AES256) on every write, which overrides the default above. The roots
# therefore leave `encrypt` unset, and this refuses any write that asks for
# AES256, so state cannot quietly fall back to the S3-managed key.
resource "aws_s3_bucket_policy" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "DenySseS3Writes"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.tfstate.arn}/*"
        Condition = { StringEquals = { "s3:x-amz-server-side-encryption" = "AES256" } }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.tfstate.arn, "${aws_s3_bucket.tfstate.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}

resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket                  = aws_s3_bucket.tfstate.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# ── Outputs ──────────────────────────────────────────────────────────────────

output "state_bucket" {
  value = aws_s3_bucket.tfstate.id
}

output "state_kms_key_arn" {
  value = aws_kms_key.tfstate.arn
}
