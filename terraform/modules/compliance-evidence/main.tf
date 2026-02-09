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

resource "aws_cloudtrail" "part11_audit" {
  name                          = "ros-staging-part11-evidence"
  s3_bucket_name                = aws_s3_bucket.evidence.id
  include_global_service_events = true
  is_multi_region_trail         = true
  enable_logging                = true
  kms_key_id                    = aws_kms_key.cloudtrail_encryption.arn

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

output "cloudtrail_id" {
  value = aws_cloudtrail.part11_audit.id
}
