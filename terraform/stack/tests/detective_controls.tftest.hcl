# Detective controls the stack itself owns (MR-04 Stage 3 steps 4 and 5;
# OPS-15, SEC-11).
#
# - The VPC records every accepted and rejected connection
#   (modules/vpc-secure, tests/flow_logs.tftest.hcl there).
# - The load balancer writes an access log of every request to a bucket of
#   its own. Before this, the ALB module accepted a bucket and the stack
#   passed none, so no request that reached the API was recorded outside the
#   application's own log.
#
# - CloudFront's access log (v2 delivery) and the vault and frontend buckets
#   server access logs go to one access-log bucket. The evidence bucket does
#   not log into anything it holds (modules/compliance-evidence, header).
#
# The account baseline (GuardDuty, Security Hub, Config, budgets) waits on the
# founder's account layout (F-4); it is not here.
#
# Mocked providers, as boot_contract.tftest.hcl.
#
#   cd terraform/stack && terraform init -backend=false && terraform test -filter=tests/detective_controls.tftest.hcl

mock_provider "aws" {
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mock" }
  }
  # The alarm topic (monitoring.tf): alarms and subscriptions validate its ARN.
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:c2c-production-alarms" }
  }
  mock_data "aws_elb_service_account" {
    defaults = { arn = "arn:aws:iam::127311923021:root" }
  }
  mock_resource "aws_kms_key" {
    defaults = { arn = "arn:aws:kms:us-east-1:123456789012:key/mrk-mock" }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mock/0" }
  }
  mock_resource "aws_lb_listener" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:listener/app/mock/0/0" }
  }
  mock_resource "aws_cloudfront_function" {
    defaults = { arn = "arn:aws:cloudfront::123456789012:function/mock" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mock/0" }
  }
  mock_resource "aws_cloudwatch_log_group" {
    defaults = { arn = "arn:aws:logs:us-east-1:123456789012:log-group:mock" }
  }
  mock_resource "aws_service_discovery_service" {
    defaults = { arn = "arn:aws:servicediscovery:us-east-1:123456789012:service/srv-mock" }
  }
  mock_resource "aws_db_instance" {
    defaults = {
      arn      = "arn:aws:rds:us-east-1:123456789012:db:mock"
      address  = "c2c-production.mock.us-east-1.rds.amazonaws.com"
      port     = 5432
      username = "c2c_admin"
      db_name  = "concept2cure_ri"
    }
  }
}

# The DR region's provider.
mock_provider "aws" {
  alias = "dr"
  mock_data "aws_region" {
    defaults = { name = "us-west-2" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_resource "aws_kms_replica_key" {
    defaults = { arn = "arn:aws:kms:us-west-2:123456789012:key/mrk-mock" }
  }
}

# CloudFront's v2 access log (access_logs.tf) validates the distribution's, the
# access-log bucket's and its destination's ARNs; a mock's random strings are not ARNs.
override_resource {
  target = module.cdn.aws_cloudfront_distribution.this
  values = { arn = "arn:aws:cloudfront::123456789012:distribution/EMOCKDIST" }
}
override_resource {
  target = aws_s3_bucket.access_logs
  values = { arn = "arn:aws:s3:::c2c-prod-access-logs-123456789012", id = "c2c-prod-access-logs-123456789012" }
}
override_resource {
  target = aws_cloudwatch_log_delivery_destination.cloudfront
  values = { arn = "arn:aws:logs:us-east-1:123456789012:delivery-destination:c2c-production-cloudfront" }
}

# Production's settings, as boot_contract.tftest.hcl. Throwaway values of the
# right shape; nothing here is a real credential.
variables {
  environment                     = "production"
  region                          = "us-east-1"
  vpc_cidr                        = "10.10.0.0/16"
  public_subnets                  = ["10.10.101.0/24", "10.10.102.0/24"]
  private_subnets                 = ["10.10.1.0/24", "10.10.2.0/24"]
  azs                             = ["us-east-1a", "us-east-1b"]
  rds_instance_class              = "db.m6g.large"
  rds_engine_version              = "15"
  db_credentials_rotation         = "initial"
  rds_allocated_storage           = 50
  rds_max_allocated_storage       = 500
  rds_multi_az                    = true
  rds_backup_retention_days       = 35
  rds_deletion_protection         = true
  alb_deletion_protection         = true
  evidence_object_lock_mode       = "COMPLIANCE"
  evidence_retention_days         = 2555
  api_cpu                         = 2048
  api_memory                      = 8192
  api_desired_count               = 2
  api_max_count                   = 2
  image_tag                       = "v1.0.0"
  acm_certificate_arn             = "arn:aws:acm:us-east-1:111122223333:certificate/alb"
  cloudfront_certificate_arn      = "arn:aws:acm:us-east-1:111122223333:certificate/cf"
  domain_aliases                  = ["app.example.com"]
  cloudfront_origin_secret        = "c2cTestOriginSecret_0123456789abcdef"
  create_github_oidc_provider     = true
  anthropic_api_key               = "sk-ant-test-0123456789"
  jwt_secret                      = "jwt-0123456789abcdef0123456789abcdef"
  refresh_token_secret            = "refresh-0123456789abcdef0123456789abcdef"
  mfa_encryption_key              = "mfa-0123456789abcdef0123456789abcdef"
  audit_hmac_key                  = "audkey-0123456789abcdef0123456789abcdef"
  audit_hmac_secret               = "audsec-0123456789abcdef0123456789abcdef"
  audit_export_signing_key        = "audexp-0123456789abcdef0123456789abcdef"
  audit_attestation_key           = "attest-0123456789abcdef0123456789abcdef"
  connector_encryption_key        = "conn-0123456789abcdef0123456789abcdef"
  smtp_host                       = "email-smtp.us-east-1.amazonaws.com"
  smtp_user                       = "test-smtp-user"
  smtp_pass                       = "test-smtp-pass-0123456789"
  smtp_from                       = "noreply@example.com"
  platform_owner_emails           = ["owner@example.com"]
  ai_provider_placement_approvals = "{\"anthropic\":{\"region\":\"global\",\"zeroRetentionApproved\":false,\"approvedDataClasses\":[],\"approvedIntendedUses\":[\"drafting\"]},\"local\":{\"region\":\"on_prem\",\"zeroRetentionApproved\":true,\"approvedDataClasses\":[\"pii\",\"phi\"],\"approvedIntendedUses\":[\"embedding\"]}}"
  embedding_model_revision        = "0123456789abcdef0123456789abcdef01234567"
  alarm_emails                    = ["oncall@example.com", "founder@example.com"]
}



run "the_vpc_records_all_traffic_under_the_environments_name" {
  command = apply

  assert {
    condition     = module.vpc.flow_log.traffic_type == "ALL" && module.vpc.flow_log.log_group == "/aws/vpc/c2c-production/flow-logs" && module.vpc.flow_log.retention_in_days >= 365
    error_message = "Production's VPC must log all traffic to its own group, kept a year."
  }
}

run "every_request_the_load_balancer_takes_is_logged" {
  command = apply

  assert {
    condition     = module.alb.access_logs.enabled && module.alb.access_logs.bucket == aws_s3_bucket.alb_logs.id
    error_message = "The ALB must write access logs to the stack's ALB log bucket."
  }
}

run "the_alb_log_bucket_is_private_encrypted_and_bounded" {
  command = apply

  assert {
    condition = (aws_s3_bucket_public_access_block.alb_logs.block_public_acls && aws_s3_bucket_public_access_block.alb_logs.block_public_policy &&
    aws_s3_bucket_public_access_block.alb_logs.ignore_public_acls && aws_s3_bucket_public_access_block.alb_logs.restrict_public_buckets)
    error_message = "The ALB log bucket must block every form of public access."
  }
  assert {
    # ALB log delivery supports SSE-S3 only, not SSE-KMS.
    condition     = one([for r in aws_s3_bucket_server_side_encryption_configuration.alb_logs.rule : one(r.apply_server_side_encryption_by_default).sse_algorithm]) == "AES256"
    error_message = "The ALB log bucket must be encrypted with SSE-S3, the one encryption ALB log delivery supports."
  }
  assert {
    condition     = one([for r in aws_s3_bucket_lifecycle_configuration.alb_logs.rule : one(r.expiration).days if r.status == "Enabled"]) == 365
    error_message = "ALB logs expire after access_log_retention_days (365 by default)."
  }
  assert {
    condition     = one(aws_s3_bucket_versioning.alb_logs.versioning_configuration).status == "Enabled"
    error_message = "The ALB log bucket is versioned, as every bucket in the stack is."
  }
}

run "only_the_regions_load_balancers_may_write_and_only_their_prefix" {
  command = apply

  assert {
    condition = [for s in jsondecode(aws_s3_bucket_policy.alb_logs.policy).Statement : s.Resource if s.Sid == "LoadBalancersDeliverAccessLogs"] == [
    "${aws_s3_bucket.alb_logs.arn}/alb-logs/AWSLogs/123456789012/*"]
    error_message = "ELB may put objects under alb-logs/AWSLogs/<account>/ only."
  }
  assert {
    condition = length([for s in jsondecode(aws_s3_bucket_policy.alb_logs.policy).Statement : s
    if s.Effect == "Deny" && try(s.Condition.Bool["aws:SecureTransport"], "") == "false"]) == 1
    error_message = "The ALB log bucket must refuse requests that are not over TLS."
  }
}

run "a_shorter_access_log_retention_is_refused" {
  command = plan

  variables {
    access_log_retention_days = 30
  }

  expect_failures = [var.access_log_retention_days]
}

run "cloudfront_and_the_buckets_log_to_the_access_log_bucket" {
  command = apply

  assert {
    condition     = aws_cloudwatch_log_delivery_source.cloudfront.resource_arn == module.cdn.distribution_arn && aws_cloudwatch_log_delivery_source.cloudfront.log_type == "ACCESS_LOGS"
    error_message = "CloudFront's access log must be a delivery source for the distribution."
  }
  assert {
    condition = (one(aws_cloudwatch_log_delivery_destination.cloudfront.delivery_destination_configuration).destination_resource_arn == "${aws_s3_bucket.access_logs.arn}/cloudfront" &&
    aws_cloudwatch_log_delivery.cloudfront.delivery_destination_arn == aws_cloudwatch_log_delivery_destination.cloudfront.arn)
    error_message = "CloudFront's access log must be delivered under cloudfront/ in the access-log bucket."
  }
  assert {
    condition = (aws_s3_bucket_logging.vault.bucket == aws_s3_bucket.vault.id && aws_s3_bucket_logging.vault.target_bucket == aws_s3_bucket.access_logs.id &&
    aws_s3_bucket_logging.frontend.bucket == module.cdn.frontend_bucket_name && aws_s3_bucket_logging.frontend.target_bucket == aws_s3_bucket.access_logs.id)
    error_message = "The vault and frontend buckets must write server access logs to the access-log bucket."
  }
  assert {
    condition     = aws_s3_bucket.access_logs.id != module.evidence.evidence_bucket && aws_s3_bucket.access_logs.id != aws_s3_bucket.vault.id
    error_message = "Access logs go to a bucket of their own, never into a bucket they describe."
  }
}

run "the_access_log_bucket_admits_only_its_writers" {
  command = apply

  assert {
    condition = (aws_s3_bucket_public_access_block.access_logs.block_public_acls && aws_s3_bucket_public_access_block.access_logs.block_public_policy &&
      aws_s3_bucket_public_access_block.access_logs.ignore_public_acls && aws_s3_bucket_public_access_block.access_logs.restrict_public_buckets &&
    one(aws_s3_bucket_versioning.access_logs.versioning_configuration).status == "Enabled")
    error_message = "The access-log bucket is private and versioned."
  }
  assert {
    condition = [for s in jsondecode(aws_s3_bucket_policy.access_logs.policy).Statement : s.Condition.ArnLike["aws:SourceArn"] if s.Sid == "S3ServerAccessLogs"][0] == [
    aws_s3_bucket.vault.arn, module.cdn.frontend_bucket_arn]
    error_message = "S3 may deliver server access logs for the vault and frontend buckets only."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_s3_bucket_policy.access_logs.policy).Statement :
    s.Condition.StringEquals["aws:SourceAccount"] == "123456789012" if s.Effect == "Allow"])
    error_message = "Every writer is held to this account."
  }
  assert {
    condition = length([for s in jsondecode(aws_s3_bucket_policy.access_logs.policy).Statement : s
    if s.Effect == "Deny" && try(s.Condition.Bool["aws:SecureTransport"], "") == "false"]) == 1
    error_message = "The access-log bucket must refuse requests that are not over TLS."
  }
}
