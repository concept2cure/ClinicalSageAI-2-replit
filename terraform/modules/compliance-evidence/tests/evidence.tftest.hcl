# The Part 11 evidence trail can be created, and does not log itself.
#
#   cd terraform/modules/compliance-evidence && terraform init -backend=false && terraform test

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "111122223333" }
  }
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_kms_key" {
    defaults = {
      arn    = "arn:aws:kms:us-east-1:111122223333:key/00000000-0000-0000-0000-000000000000"
      key_id = "00000000-0000-0000-0000-000000000000"
    }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::c2c-prod-part11-evidence", id = "c2c-prod-part11-evidence" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:111122223333:log-group:/aws/cloudtrail/c2c-prod-part11-evidence" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::111122223333:role/c2c-prod-part11-cloudtrail-cw" }
  }
}

variables {
  bucket_name      = "c2c-prod-part11-evidence"
  name_prefix      = "c2c-prod"
  object_lock_mode = "COMPLIANCE"
  retention_days   = 2555
}

run "the_key_admits_cloudtrail_and_logs_for_this_trail_and_log_group_only" {
  command = apply

  assert {
    condition = anytrue([
      for st in jsondecode(output.key_policy).Statement :
      try(st.Principal.Service, "") == "cloudtrail.amazonaws.com" && contains(flatten([st.Action]), "kms:GenerateDataKey*")
      && try(st.Condition.StringEquals["aws:SourceArn"], "") == "arn:aws:cloudtrail:us-east-1:111122223333:trail/c2c-prod-part11-evidence"
    ])
    error_message = "The key must let CloudTrail generate data keys, for this trail only."
  }
  assert {
    condition = anytrue([
      for st in jsondecode(output.key_policy).Statement :
      try(st.Principal.Service, "") == "logs.us-east-1.amazonaws.com"
      && try(st.Condition.ArnEquals["kms:EncryptionContext:aws:logs:arn"], "") == "arn:aws:logs:us-east-1:111122223333:log-group:/aws/cloudtrail/c2c-prod-part11-evidence"
    ])
    error_message = "The key must let CloudWatch Logs use it, for this log group only; otherwise the log group cannot be created."
  }
  assert {
    condition     = aws_kms_key.cloudtrail_encryption.enable_key_rotation
    error_message = "The evidence key must rotate."
  }
}

run "the_bucket_admits_cloudtrail_and_refuses_plaintext" {
  command = apply

  assert {
    condition = alltrue([
      for sid in ["CloudTrailAclCheck", "CloudTrailWritesItsOwnPrefix"] : anytrue([
        for st in jsondecode(output.bucket_policy).Statement :
        st.Sid == sid && st.Effect == "Allow" && try(st.Condition.StringEquals["aws:SourceArn"], "") == "arn:aws:cloudtrail:us-east-1:111122223333:trail/c2c-prod-part11-evidence"
      ])
    ])
    error_message = "The bucket policy must admit this trail (GetBucketAcl, PutObject), or CreateTrail is refused."
  }
  assert {
    condition = anytrue([
      for st in jsondecode(output.bucket_policy).Statement :
      st.Effect == "Deny" && try(st.Condition.Bool["aws:SecureTransport"], "") == "false"
    ])
    error_message = "The evidence bucket must refuse requests without TLS."
  }
  assert {
    condition     = one(one(aws_s3_bucket_server_side_encryption_configuration.evidence.rule).apply_server_side_encryption_by_default).kms_master_key_id == aws_kms_key.cloudtrail_encryption.arn
    error_message = "Default encryption must use this module's key (it named an alias nothing created)."
  }
}

run "the_trail_does_not_log_its_own_deliveries" {
  command = apply

  assert {
    condition = anytrue([
      for sel in aws_cloudtrail.part11_audit.advanced_event_selector : anytrue([
        for fs in sel.field_selector :
        fs.field == "resources.ARN" && try(contains(fs.not_starts_with, "arn:aws:s3:::c2c-prod-part11-evidence/AWSLogs/"), false)
      ])
    ])
    error_message = "S3 data events on the evidence bucket must exclude AWSLogs/, the trail's own delivery prefix."
  }
  assert {
    condition     = length(aws_cloudtrail.part11_audit.event_selector) == 0
    error_message = "A basic event selector on the bucket would log every delivery (the old recursive loop)."
  }
  assert {
    condition     = aws_cloudtrail.part11_audit.enable_log_file_validation
    error_message = "Log file integrity validation must be on: the trail is Part 11 evidence."
  }
}

run "names_come_from_the_prefix_not_ros_staging" {
  command = plan
  variables {
    name_prefix = "c2c-stg"
    bucket_name = "c2c-stg-part11-evidence"
  }
  assert {
    condition     = alltrue([for k, v in output.names : strcontains(v, "c2c-stg") && !strcontains(v, "ros-staging")])
    error_message = "Every name must carry the environment's prefix: ${jsonencode(output.names)}"
  }
}
