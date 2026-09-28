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
#   - Encrypted at rest under this vault's own KMS key (SSE-KMS, bucket keys
#     on, annual rotation), and reachable only over TLS. A customer-managed key
#     puts every decrypt in CloudTrail, and reading the vault can be revoked
#     at the key. The key policy mirrors release_signing.tf: the account
#     administers the key but cannot decrypt with it, and the task role may
#     use it only through S3.
#   - Access is granted in the bucket's own policy to the application task role,
#     as release_signing.tf grants kms:Sign: list the bucket; get, put and
#     delete its objects. The provider needs exactly these
#     (server/services/storage/s3-provider.ts), and no human principal is named.

locals {
  vault_bucket    = "${local.short}-vault"
  vault_key_alias = "alias/${local.short}-vault"
}

resource "aws_kms_key" "vault" {
  description             = "Concept2Cure vault documents - ${var.environment}"
  enable_key_rotation     = true
  deletion_window_in_days = 30

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Administration only: no Decrypt, Encrypt or GenerateDataKey, so no
        # IAM policy in this account can hand a person the vault's plaintext.
        # Granting that is a key-policy change, which CloudTrail records.
        Sid       = "KeyAdministrationWithoutUse"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action = [
          "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*", "kms:Put*",
          "kms:Update*", "kms:Revoke*", "kms:Disable*", "kms:Get*", "kms:Delete*",
          "kms:TagResource", "kms:UntagResource", "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion",
        ]
        Resource = "*"
      },
      {
        # The application reads and writes vault objects, and only through S3.
        Sid       = "ApplicationUsesTheKeyThroughS3"
        Effect    = "Allow"
        Principal = { AWS = module.ecs.task_role_arn }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey", "kms:DescribeKey"]
        Resource  = "*"
        Condition = { StringEquals = { "kms:ViaService" = "s3.${var.region}.amazonaws.com" } }
      },
    ]
  })

  tags = merge(var.tags, { Purpose = "vault-documents" })
}

resource "aws_kms_alias" "vault" {
  name          = local.vault_key_alias
  target_key_id = aws_kms_key.vault.key_id
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
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.vault.arn
    }
    bucket_key_enabled = true
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
