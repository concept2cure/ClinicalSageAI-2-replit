// Bootstrap: Create the S3 bucket + DynamoDB table used for Terraform remote state.
// Run this ONCE manually before any other terraform apply:
//   cd terraform/bootstrap && terraform init && terraform apply

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 5.0"
    }
  }
}

provider "aws" {
  region = var.region
}

# ── S3 bucket for state files ────────────────────────────────────────────────

resource "aws_s3_bucket" "tfstate" {
  bucket = var.state_bucket_name

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
  description         = "Terraform remote state (${var.state_bucket_name})"
  enable_key_rotation = true
  tags                = merge(var.tags, { Purpose = "terraform-state" })
}

resource "aws_kms_alias" "tfstate" {
  name          = "alias/${var.state_bucket_name}"
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

# ── DynamoDB table for state locking ─────────────────────────────────────────

resource "aws_dynamodb_table" "tflock" {
  name         = var.lock_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }

  tags = merge(var.tags, { Purpose = "terraform-lock" })
}

# ── Outputs ──────────────────────────────────────────────────────────────────

output "state_bucket" {
  value = aws_s3_bucket.tfstate.id
}

output "lock_table" {
  value = aws_dynamodb_table.tflock.name
}

output "state_kms_key_arn" {
  value = aws_kms_key.tfstate.arn
}
