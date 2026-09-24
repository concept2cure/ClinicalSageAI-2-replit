# ── Vault document storage (S3) ──────────────────────────────────────────────
#
# The vault holds a filing's source documents. The server writes their bytes
# through server/services/storage/ and records the provider's version id,
# filename and content hash in vault.documents. Before this file the stack
# provided no durable store: the task definition set no STORAGE_PROVIDER, so
# the server used local disk, which on Fargate belongs to one task and is
# deleted with it. Production now refuses to boot that way
# (server/services/storage/storage-posture.ts), and deploy-aws.yml's preflight
# requires STORAGE_PROVIDER=s3 and AWS_S3_BUCKET (tests/boot_contract.tftest.hcl
# reads that list).
#
#   - Private: every public-access block on, object ownership enforced.
#   - Versioned: an overwrite or delete keeps the prior version, so a removed
#     source document stays recoverable. How long noncurrent versions are kept
#     is a records-retention decision and is not set here: nothing expires.
#   - Encrypted at rest (SSE-S3, which the provider also requests on every put),
#     and reachable only over TLS.
#   - Access is granted in the bucket's own policy to the application task role,
#     as release_signing.tf grants kms:Sign: list the bucket; get, put and
#     delete its objects. The provider needs exactly these
#     (server/services/storage/s3-provider.ts), and no human principal is named.

locals {
  vault_bucket = "${local.short}-vault"
}

resource "aws_s3_bucket" "vault" {
  bucket = local.vault_bucket
  tags   = merge(var.tags, { Purpose = "vault-documents" })
}

resource "aws_s3_bucket_public_access_block" "vault" {
  bucket                  = aws_s3_bucket.vault.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "vault" {
  bucket = aws_s3_bucket.vault.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "vault" {
  bucket = aws_s3_bucket.vault.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "vault" {
  bucket = aws_s3_bucket.vault.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_policy" "vault" {
  bucket = aws_s3_bucket.vault.id
  # A bucket policy naming a principal is refused while the public-access block
  # is still being applied; order them.
  depends_on = [aws_s3_bucket_public_access_block.vault]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "TaskRoleListsTheVault"
        Effect    = "Allow"
        Principal = { AWS = module.ecs.task_role_arn }
        Action    = ["s3:ListBucket"]
        Resource  = aws_s3_bucket.vault.arn
      },
      {
        Sid       = "TaskRoleReadsAndWritesVaultObjects"
        Effect    = "Allow"
        Principal = { AWS = module.ecs.task_role_arn }
        Action    = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject"]
        Resource  = "${aws_s3_bucket.vault.arn}/*"
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.vault.arn, "${aws_s3_bucket.vault.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
}
