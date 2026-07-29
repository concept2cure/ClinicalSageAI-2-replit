// Compliance Evidence module: CloudTrail + S3 WORM bucket for infrastructure evidence

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
# access at the bucket level (CKV2_AWS_6).
resource "aws_s3_bucket_public_access_block" "evidence" {
  bucket = aws_s3_bucket.evidence.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
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
      sse_algorithm     = "aws:kms"
      kms_master_key_id = var.kms_key_id
    }
  }
}

resource "aws_kms_key" "cloudtrail_encryption" {
  description = "KMS key for CloudTrail and evidence bucket"
  policy      = var.kms_policy
  deletion_window_in_days = 30
  tags = var.tags
}

# CloudTrail must stream to CloudWatch Logs so management/data events are
# monitorable and alertable in near-real-time (CKV2_AWS_10).
resource "aws_cloudwatch_log_group" "cloudtrail" {
  name              = "/aws/cloudtrail/ros-staging-part11-evidence"
  retention_in_days = 365
  # Encrypt at rest with the same CMK used by the trail (CKV_AWS_158).
  # TODO(infra): ensure var.kms_policy grants logs.<region>.amazonaws.com
  # kms:Encrypt*/Decrypt*/GenerateDataKey* on this key for this log group ARN.
  kms_key_id = aws_kms_key.cloudtrail_encryption.arn
  tags       = var.tags
}

resource "aws_iam_role" "cloudtrail_cloudwatch" {
  name = "ros-staging-part11-cloudtrail-cw"
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
  name                          = "ros-staging-part11-evidence"
  s3_bucket_name                = aws_s3_bucket.evidence.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_logging                = true
  kms_key_id                    = aws_kms_key.cloudtrail_encryption.arn
  cloud_watch_logs_group_arn    = "${aws_cloudwatch_log_group.cloudtrail.arn}:*"
  cloud_watch_logs_role_arn     = aws_iam_role.cloudtrail_cloudwatch.arn

  event_selector {
    read_write_type                 = "All"
    include_management_events       = true
    exclude_management_event_sources = []

    data_resource {
      type   = "AWS::S3::Object"
      values = ["${aws_s3_bucket.evidence.arn}/*"]
    }
  }

  tags = merge(var.tags, { ComplianceFramework = "21CFR11", RetentionRequirement = "7Years" })
}

output "evidence_bucket" {
  value = aws_s3_bucket.evidence.id
}

output "evidence_bucket_arn" {
  value = aws_s3_bucket.evidence.arn
}

output "cloudtrail_id" {
  value = aws_cloudtrail.part11_audit.id
}
