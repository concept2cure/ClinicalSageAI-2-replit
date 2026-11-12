# ── Load balancer access logs (MR-04 Stage 3 step 5; OPS-15, SEC-11) ─────────
#
# Every request the ALB takes: client address, path, status, latency, TLS
# version. The ALB module accepted a bucket and the stack passed none, so no
# request that reached the API was recorded outside the application's own log,
# which a request the application never saw does not reach.
#
# ALB log delivery writes with SSE-S3 only; it cannot use a customer-managed
# key. Private, versioned, TLS-only, and expired after access_log_retention_days.
# tests/detective_controls.tftest.hcl asserts it.

locals {
  alb_logs_bucket = "${local.short}-alb-logs-${local.account_suffix}"
}

# The account ELB writes as, in this region (an older region's ELB account).
data "aws_elb_service_account" "this" {}

resource "aws_s3_bucket" "alb_logs" {
  bucket = local.alb_logs_bucket
  tags   = merge(var.tags, { Purpose = "alb-access-logs" })
}

resource "aws_s3_bucket_public_access_block" "alb_logs" {
  bucket                  = aws_s3_bucket.alb_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

# Versioned, as every bucket in the stack is: a log object overwritten or
# deleted keeps its prior version until the lifecycle below expires it.
resource "aws_s3_bucket_versioning" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# ALB access-log delivery supports SSE-S3 only; with SSE-KMS as the bucket
# default, delivery fails. AWS documents this for every region.
#trivy:ignore:AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  rule {
    id     = "expire-access-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.access_log_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "alb_logs" {
  bucket = aws_s3_bucket.alb_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # The region's ELB account (regions before August 2022) and the log
        # delivery service (newer regions): each writes under this account's
        # prefix and nowhere else.
        Sid    = "LoadBalancersDeliverAccessLogs"
        Effect = "Allow"
        Principal = {
          AWS     = data.aws_elb_service_account.this.arn
          Service = "logdelivery.elasticloadbalancing.amazonaws.com"
        }
        Action   = "s3:PutObject"
        Resource = "${aws_s3_bucket.alb_logs.arn}/alb-logs/AWSLogs/${data.aws_caller_identity.current.account_id}/*"
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.alb_logs.arn, "${aws_s3_bucket.alb_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.alb_logs]
}

# ── CloudFront and S3 access logs (MR-04 Stage 3 step 6) ─────────────────────
#
# One bucket, apart from everything it describes:
#   cloudfront/  every request at the edge, by CloudFront's v2 log delivery
#                (no ACL-enabled bucket needed, unlike the legacy logging_config);
#   s3/vault/    S3 server access logs of the vault bucket;
#   s3/frontend/ S3 server access logs of the frontend bucket.
# The evidence bucket is not logged here: its CloudTrail data events already
# record every read and write, and a bucket that logs into itself loops
# (modules/compliance-evidence, header).
# S3 server access logging delivers with SSE-S3 only, so this bucket uses it.

locals {
  access_logs_bucket = "${local.short}-access-logs-${local.account_suffix}"
}

data "aws_partition" "current" {}

resource "aws_s3_bucket" "access_logs" {
  bucket = local.access_logs_bucket
  tags   = merge(var.tags, { Purpose = "access-logs" })
}

resource "aws_s3_bucket_public_access_block" "access_logs" {
  bucket                  = aws_s3_bucket.access_logs.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  versioning_configuration {
    status = "Enabled"
  }
}

# S3 server access logs are delivered only to a target encrypted with SSE-S3.
#trivy:ignore:AWS-0132
resource "aws_s3_bucket_server_side_encryption_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  rule {
    id     = "expire-access-logs"
    status = "Enabled"
    filter {}
    expiration {
      days = var.access_log_retention_days
    }
    noncurrent_version_expiration {
      noncurrent_days = 30
    }
    abort_incomplete_multipart_upload {
      days_after_initiation = 7
    }
  }
}

resource "aws_s3_bucket_policy" "access_logs" {
  bucket = aws_s3_bucket.access_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "S3ServerAccessLogs"
        Effect    = "Allow"
        Principal = { Service = "logging.s3.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.access_logs.arn}/s3/*"
        Condition = {
          ArnLike      = { "aws:SourceArn" = [aws_s3_bucket.vault.arn, module.cdn.frontend_bucket_arn] }
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id }
        }
      },
      {
        Sid       = "CloudFrontAccessLogs"
        Effect    = "Allow"
        Principal = { Service = "delivery.logs.amazonaws.com" }
        Action    = "s3:PutObject"
        Resource  = "${aws_s3_bucket.access_logs.arn}/cloudfront/*"
        Condition = {
          StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id, "s3:x-amz-acl" = "bucket-owner-full-control" }
          ArnLike      = { "aws:SourceArn" = "arn:${data.aws_partition.current.partition}:logs:us-east-1:${data.aws_caller_identity.current.account_id}:delivery-source:*" }
        }
      },
      {
        Sid       = "DenyInsecureTransport"
        Effect    = "Deny"
        Principal = "*"
        Action    = "s3:*"
        Resource  = [aws_s3_bucket.access_logs.arn, "${aws_s3_bucket.access_logs.arn}/*"]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      },
    ]
  })
  depends_on = [aws_s3_bucket_public_access_block.access_logs]
}

resource "aws_s3_bucket_logging" "vault" {
  bucket        = aws_s3_bucket.vault.id
  target_bucket = aws_s3_bucket_policy.access_logs.bucket
  target_prefix = "s3/vault/"
}

resource "aws_s3_bucket_logging" "frontend" {
  bucket        = module.cdn.frontend_bucket_name
  target_bucket = aws_s3_bucket_policy.access_logs.bucket
  target_prefix = "s3/frontend/"
}

# CloudFront's v2 access log. Delivery sources for CloudFront are made in
# us-east-1, the stack's region (F-25; monitoring.tf refuses another).
resource "aws_cloudwatch_log_delivery_source" "cloudfront" {
  name         = "${local.long}-cloudfront"
  log_type     = "ACCESS_LOGS"
  resource_arn = module.cdn.distribution_arn
  tags         = var.tags

  lifecycle {
    precondition {
      condition     = var.region == "us-east-1"
      error_message = "CloudFront's log delivery source is made in us-east-1. In ${var.region}, give it a us-east-1 provider."
    }
  }
}

resource "aws_cloudwatch_log_delivery_destination" "cloudfront" {
  name          = "${local.long}-cloudfront"
  output_format = "json"
  delivery_destination_configuration {
    destination_resource_arn = "${aws_s3_bucket.access_logs.arn}/cloudfront"
  }
  tags = var.tags
  # Delivery is checked against the bucket policy when it is created.
  depends_on = [aws_s3_bucket_policy.access_logs]
}

resource "aws_cloudwatch_log_delivery" "cloudfront" {
  delivery_source_name     = aws_cloudwatch_log_delivery_source.cloudfront.name
  delivery_destination_arn = aws_cloudwatch_log_delivery_destination.cloudfront.arn
  tags                     = var.tags
}
