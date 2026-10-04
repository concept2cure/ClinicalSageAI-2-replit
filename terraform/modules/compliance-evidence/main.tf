// Compliance Evidence module: CloudTrail + S3 WORM bucket for infrastructure evidence
//
// 2026-09-24 (W2 / D1, docs/evidence/W2/2026-09-23b/README.md item 4): as written
// this module could not apply, and the defects were invisible to `validate`:
//   • the CMK had no policy (kms_policy = ""), so neither CloudTrail nor
//     CloudWatch Logs could use it: the log group and the trail failed to create;
//   • the bucket had no policy admitting CloudTrail: CreateTrail is refused
//     (InsufficientS3BucketPolicyException);
//   • default encryption named an alias nothing created;
//   • the trail, log group and role were hard-coded "ros-staging-*", so
//     production was named staging and two environments in one account collided;
//   • the trail logged S3 data events on its OWN delivery bucket, so every log
//     file it wrote was itself a logged write: the recursive-logging loop AWS
//     warns against, growing the evidence without bound.
// Each is fixed below, and tests/evidence.tftest.hcl asserts it.
//
// 2026-10-01 (security plan P0-8, finding DP-04): the audit chain's head is
// anchored here. The application's daily integrity sweep
// (server/jobs/auditChainIntegritySweep.ts, server/services/audit/chain-anchor.ts)
// writes every organisation's chain head under anchors/ and verifies the
// database against the latest one. With var.anchor_writer_role_arn set, the
// bucket policy lets that role put and get objects under anchors/ and list that
// prefix, the key policy lets it use this key through S3 only, and an explicit
// Deny keeps it from deleting or unlocking any evidence. The bucket's default
// object-lock retention applies to every anchor.
//
// 2026-10-01 (P0-8 follow-up): an anchor is written once. Object lock keeps
// every VERSION for the retention period, and under COMPLIANCE no one can
// delete a version or shorten its retention. It does not refuse a new version
// on an existing key, and the verifier reads current versions, so a plain put
// could replace what it reads. The writer sends If-None-Match: * (S3 answers
// 412 when the key exists), and the bucket policy denies EVERY principal a put
// under anchors/ that lacks the header (s3:if-none-match, which S3 has
// evaluated in bucket policies since November 2024; the policy is a JSON string
// the AWS provider passes through, so no provider version is involved). What
// this does not stop: a principal allowed s3:DeleteObject (not the anchor
// writer, which is denied it) can put a delete marker over an anchor, after
// which a conditional put to that key succeeds; the locked version survives
// and is readable by version id. An account administrator can also rewrite
// this policy.

terraform {
  required_providers {
    aws = {
      source = "hashicorp/aws"
    }
  }
}

data "aws_caller_identity" "current" {}
data "aws_region" "current" {}
data "aws_partition" "current" {}

locals {
  account    = data.aws_caller_identity.current.account_id
  region     = data.aws_region.current.name
  partition  = data.aws_partition.current.partition
  trail_name = "${var.name_prefix}-part11-evidence"
  log_group  = "/aws/cloudtrail/${var.name_prefix}-part11-evidence"
  role_name  = "${var.name_prefix}-part11-cloudtrail-cw"
  key_alias  = "alias/${var.name_prefix}-evidence"
  # Known before the trail exists, so the key and bucket policies can pin it.
  trail_arn     = "arn:${local.partition}:cloudtrail:${local.region}:${local.account}:trail/${local.trail_name}"
  log_group_arn = "arn:${local.partition}:logs:${local.region}:${local.account}:log-group:${local.log_group}"
  bucket_arn    = "arn:${local.partition}:s3:::${var.bucket_name}"

  # The audit-chain anchors (P0-8). Empty when no writer role is named.
  anchor_prefix = "anchors/"
  anchor_key_statements = [for st in [
    {
      Sid       = "AnchorWriterUsesTheKeyThroughS3"
      Effect    = "Allow"
      Principal = { AWS = var.anchor_writer_role_arn }
      Action    = ["kms:GenerateDataKey", "kms:Decrypt"]
      Resource  = "*"
      Condition = { StringEquals = { "kms:ViaService" = "s3.${local.region}.amazonaws.com" } }
    },
  ] : st if var.anchor_writer_role_arn != ""]
  anchor_bucket_statements = [for st in [
    {
      # The verifier finds the latest anchor by listing this prefix, and only it.
      Sid       = "AnchorWriterListsTheAnchors"
      Effect    = "Allow"
      Principal = { AWS = var.anchor_writer_role_arn }
      Action    = "s3:ListBucket"
      Resource  = local.bucket_arn
      Condition = { StringLike = { "s3:prefix" = "${local.anchor_prefix}*" } }
    },
    {
      Sid       = "AnchorWriterPutsAndGetsAnchors"
      Effect    = "Allow"
      Principal = { AWS = var.anchor_writer_role_arn }
      Action    = ["s3:PutObject", "s3:GetObject"]
      Resource  = "${local.bucket_arn}/${local.anchor_prefix}*"
    },
    {
      # Object lock already refuses these under COMPLIANCE. This holds under
      # GOVERNANCE too, and against any grant the role is given later.
      Sid       = "AnchorWriterNeverRemovesOrUnlocksEvidence"
      Effect    = "Deny"
      Principal = { AWS = var.anchor_writer_role_arn }
      Action = [
        "s3:DeleteObject", "s3:DeleteObjectVersion", "s3:PutObjectRetention", "s3:PutObjectLegalHold",
        "s3:BypassGovernanceRetention", "s3:PutBucketObjectLockConfiguration", "s3:PutBucketPolicy",
        "s3:DeleteBucketPolicy", "s3:PutLifecycleConfiguration",
      ]
      Resource = [local.bucket_arn, "${local.bucket_arn}/*"]
    },
  ] : st if var.anchor_writer_role_arn != ""]

  # Plain jsonencode() so tests can assert it without AWS.
  key_policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        # Key administration and use are then granted by IAM policies in this
        # account, as for any customer managed key.
        Sid       = "AccountAdministersThroughIam"
        Effect    = "Allow"
        Principal = { AWS = "arn:${local.partition}:iam::${local.account}:root" }
        Action    = "kms:*"
        Resource  = "*"
      },
      {
        Sid       = "CloudTrailEncryptsThisTrailOnly"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:GenerateDataKey*"
        Resource  = "*"
        Condition = {
          StringEquals = { "aws:SourceArn" = local.trail_arn }
          StringLike   = { "kms:EncryptionContext:aws:cloudtrail:arn" = "arn:${local.partition}:cloudtrail:*:${local.account}:trail/*" }
        }
      },
      {
        Sid       = "CloudTrailDescribesTheKey"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "kms:DescribeKey"
        Resource  = "*"
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudWatchLogsEncryptsThisLogGroupOnly"
        Effect    = "Allow"
        Principal = { Service = "logs.${local.region}.amazonaws.com" }
        Action    = ["kms:Encrypt*", "kms:Decrypt*", "kms:ReEncrypt*", "kms:GenerateDataKey*", "kms:Describe*"]
        Resource  = "*"
        Condition = { ArnEquals = { "kms:EncryptionContext:aws:logs:arn" = local.log_group_arn } }
      },
    ], local.anchor_key_statements)
  })

  bucket_policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat([
      {
        Sid       = "CloudTrailAclCheck"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:GetBucketAcl"
        Resource  = local.bucket_arn
        Condition = { StringEquals = { "aws:SourceArn" = local.trail_arn } }
      },
      {
        Sid       = "CloudTrailWritesItsOwnPrefix"
        Effect    = "Allow"
        Principal = { Service = "cloudtrail.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${local.bucket_arn}/AWSLogs/${local.account}/*"
        Condition = {
          StringEquals = {
            "s3:x-amz-acl"  = "bucket-owner-full-control"
            "aws:SourceArn" = local.trail_arn
          }
        }
      },
      {
        # Evidence is never read or written in the clear.
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [local.bucket_arn, "${local.bucket_arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
      {
        # An anchor is never replaced by a put: every put under anchors/ must
        # carry If-None-Match, which S3 refuses (412) on a key that exists. One
        # condition key only; a second in this statement would be ANDed and
        # narrow the Deny. Multipart uploads cannot carry the header, so none
        # is possible under anchors/; an anchor is one small put.
        Sid       = "AnchorsAreWrittenOnce"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:PutObject"
        Resource  = "${local.bucket_arn}/${local.anchor_prefix}*"
        Condition = { Null = { "s3:if-none-match" = "true" } }
      },
    ], local.anchor_bucket_statements)
  })
}

resource "aws_s3_bucket" "evidence" {
  bucket              = var.bucket_name
  object_lock_enabled = true

  tags = merge(var.tags, { ComplianceFramework = "21CFR11", RetentionRequirement = "7Years" })
}

resource "aws_s3_bucket_versioning" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  versioning_configuration {
    status = "Enabled"
  }
}

# 21 CFR Part 11 evidence must never be publicly reachable. Block all public
# access at the bucket level (CKV2_AWS_6). The policy below grants a service
# principal with a source-ARN condition, which is not public.
resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_policy" "evidence" {
  bucket = aws_s3_bucket.evidence.id
  policy = local.bucket_policy
  # The public-access block is evaluated against the policy; set it first.
  depends_on = [aws_s3_bucket_public_access_block.evidence]
}

resource "aws_s3_bucket_object_lock_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    default_retention {
      mode = var.object_lock_mode
      days = var.retention_days
    }
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "aws:kms"
      # This module's own key. It used to name an alias nothing created.
      kms_master_key_id = aws_kms_key.cloudtrail_encryption.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_kms_key" "cloudtrail_encryption" {
  description             = "KMS key for CloudTrail and the Part 11 evidence bucket (${var.name_prefix})"
  policy                  = local.key_policy
  enable_key_rotation     = true
  deletion_window_in_days = 30
  tags                    = var.tags
}

resource "aws_kms_alias" "cloudtrail_encryption" {
  name          = local.key_alias
  target_key_id = aws_kms_key.cloudtrail_encryption.key_id
}

# CloudTrail must stream to CloudWatch Logs so management/data events are
# monitorable and alertable in near-real-time (CKV2_AWS_10).
resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = local.log_group
  retention_in_days = 365
  # Encrypted with the same CMK as the trail (CKV_AWS_158); the key policy
  # admits CloudWatch Logs for this log group only.
  kms_key_id = aws_kms_key.cloudtrail_encryption.arn
  tags       = var.tags
}

resource "aws_iam_role" "cloudtrail_cloudwatch" {
  name = local.role_name
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = "cloudtrail.amazonaws.com" }
      Action    = "sts:AssumeRole"
    }]
  })
  tags = var.tags
}

resource "aws_iam_role_policy" "cloudtrail_cloudwatch" {
  name = "cloudtrail-to-cloudwatch-logs"
  role = aws_iam_role.cloudtrail_cloudwatch.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
    }]
  })
}

resource "aws_cloudtrail" "part11_audit" {
  name                          = local.trail_name
  s3_bucket_name                = aws_s3_bucket.evidence.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_log_file_validation    = true
  enable_logging                = true
  kms_key_id                    = aws_kms_key.cloudtrail_encryption.arn
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail_cloudwatch.arn

  advanced_event_selector {
    name = "All management events"
    field_selector {
      field  = "eventCategory"
      equals = ["Management"]
    }
  }

  # Who read or wrote the Part 11 evidence, EXCEPT the trail's own deliveries
  # under AWSLogs/: logging those would log every log file it writes.
  advanced_event_selector {
    name = "Evidence object access, excluding the trail's own deliveries"
    field_selector {
      field  = "eventCategory"
      equals = ["Data"]
    }
    field_selector {
      field  = "resources.type"
      equals = ["AWS::S3::Object"]
    }
    field_selector {
      field           = "resources.ARN"
      starts_with     = ["${aws_s3_bucket.evidence.arn}/"]
      not_starts_with = ["${aws_s3_bucket.evidence.arn}/AWSLogs/"]
    }
  }

  # The trail refuses to create until the bucket admits it.
  depends_on = [aws_s3_bucket_policy.evidence, aws_iam_role_policy.cloudtrail_cloudwatch]

  tags = merge(var.tags, { ComplianceFramework = "21CFR11", RetentionRequirement = "7Years" })
}

output "evidence_bucket" {
  # The configured name: the same value as .id once created, and known at plan,
  # so the task definition's AUDIT_ANCHOR_BUCKET is checkable without AWS.
  value = aws_s3_bucket.evidence.bucket
}

output "evidence_bucket_arn" {
  value = aws_s3_bucket.evidence.arn
}

output "cloudtrail_id" {
  value = aws_cloudtrail.part11_audit.id
}

output "names" {
  description = "Every name this module creates, for the stack's distinctness test."
  value = {
    trail     = local.trail_name
    log_group = local.log_group
    role      = local.role_name
    key_alias = local.key_alias
  }
}

output "key_policy" {
  value = local.key_policy
}

output "anchor_prefix" {
  description = "Where the audit-chain anchors live in the bucket (security plan P0-8)."
  value       = local.anchor_prefix
}

output "object_lock" {
  description = "The default retention every object, the anchors included, is written under."
  value = {
    mode = one(one(aws_s3_bucket_object_lock_configuration.evidence.rule).default_retention).mode
    days = one(one(aws_s3_bucket_object_lock_configuration.evidence.rule).default_retention).days
  }
}

output "bucket_policy" {
  value = local.bucket_policy
}
