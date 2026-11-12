# One alarm path that pages a person (MR-04 Stage 2, OPS-06, SEC-11).
#
# Until this file the stack declared no alarm, no SNS topic and no log metric
# filter: a failure in production was found by whoever read the logs. Every
# alarm here publishes to one encrypted SNS topic, and every address in
# alarm_emails is subscribed to it. CloudWatch can publish to an encrypted
# topic only if the topic's key lets cloudwatch.amazonaws.com use it; without
# that grant alarms change state and nobody is told.
#
# Mocked providers, as boot_contract.tftest.hcl. What a mock cannot show, that
# a page arrives within five minutes, is MR-04 Stage 2's staging drill.
#
#   cd terraform/stack && terraform init -backend=false && terraform test -filter=tests/monitoring.tftest.hcl

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


run "every_alarm_publishes_to_the_one_topic" {
  command = apply

  assert {
    condition     = length(aws_cloudwatch_metric_alarm.this) >= 25
    error_message = "The alarm set is missing (MR-04 Stage 2 step 4 and 5)."
  }
  assert {
    condition = alltrue([for a in aws_cloudwatch_metric_alarm.this :
    a.alarm_actions == toset([aws_sns_topic.alarms.arn]) && a.ok_actions == toset([aws_sns_topic.alarms.arn])])
    error_message = "Every alarm must notify the alarm topic when it fires and when it clears."
  }
  assert {
    condition     = toset([for s in aws_sns_topic_subscription.alarm_email : s.endpoint]) == toset(["oncall@example.com", "founder@example.com"]) && alltrue([for s in aws_sns_topic_subscription.alarm_email : s.protocol == "email" && s.topic_arn == aws_sns_topic.alarms.arn])
    error_message = "Each address in alarm_emails must be subscribed to the alarm topic by email."
  }
}

run "cloudwatch_can_publish_to_the_encrypted_topic" {
  command = apply

  assert {
    condition     = aws_sns_topic.alarms.kms_master_key_id == aws_kms_key.alarms.arn
    error_message = "The alarm topic must be encrypted under its own key."
  }
  assert {
    condition = length([for s in jsondecode(aws_kms_key.alarms.policy).Statement : s
      if try(s.Principal.Service, "") == "cloudwatch.amazonaws.com" && s.Effect == "Allow" &&
    length(setsubtract(toset(["kms:Decrypt", "kms:GenerateDataKey*"]), toset(flatten([s.Action])))) == 0]) == 1
    error_message = "The topic key must let cloudwatch.amazonaws.com Decrypt and GenerateDataKey*, or alarms fire and never publish."
  }
}

run "the_service_alarms_watch_the_right_things" {
  command = apply

  # ALB: 5xx from the targets and from the balancer, healthy hosts, latency.
  assert {
    condition = (aws_cloudwatch_metric_alarm.this["alb-target-5xx"].metric_name == "HTTPCode_Target_5XX_Count" &&
      aws_cloudwatch_metric_alarm.this["alb-target-5xx"].threshold == 10 &&
      aws_cloudwatch_metric_alarm.this["alb-target-5xx"].dimensions.LoadBalancer == module.alb.alb_arn_suffix &&
    aws_cloudwatch_metric_alarm.this["alb-target-5xx"].dimensions.TargetGroup == module.alb.api_target_group_arn_suffix)
    error_message = "alb-target-5xx must watch the API target group's 5xx, above 10 in 5 minutes."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.this["alb-elb-5xx"].metric_name == "HTTPCode_ELB_5XX_Count" && aws_cloudwatch_metric_alarm.this["alb-elb-5xx"].threshold == 5
    error_message = "alb-elb-5xx must watch the balancer's own 5xx, above 5 in 5 minutes."
  }
  assert {
    condition = (aws_cloudwatch_metric_alarm.this["alb-healthy-hosts"].metric_name == "HealthyHostCount" &&
      aws_cloudwatch_metric_alarm.this["alb-healthy-hosts"].threshold == 2 &&
      aws_cloudwatch_metric_alarm.this["alb-healthy-hosts"].comparison_operator == "LessThanThreshold" &&
    aws_cloudwatch_metric_alarm.this["alb-healthy-hosts"].treat_missing_data == "breaching")
    error_message = "alb-healthy-hosts must fire below api_desired_count (2), and when the metric stops."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.this["alb-p95-latency"].extended_statistic == "p95"
    error_message = "alb-p95-latency must watch TargetResponseTime at p95."
  }
  # ECS: the API's and the embedding lane's running tasks, CPU and memory.
  assert {
    condition = (aws_cloudwatch_metric_alarm.this["ecs-api-running-tasks"].namespace == "ECS/ContainerInsights" &&
      aws_cloudwatch_metric_alarm.this["ecs-api-running-tasks"].dimensions.ServiceName == module.ecs.api_service_name &&
      aws_cloudwatch_metric_alarm.this["ecs-api-running-tasks"].threshold == 2 &&
    aws_cloudwatch_metric_alarm.this["ecs-api-running-tasks"].treat_missing_data == "breaching")
    error_message = "ecs-api-running-tasks must fire when fewer API tasks run than api_desired_count."
  }
  assert {
    condition     = aws_cloudwatch_metric_alarm.this["ecs-embeddings-running-tasks"].dimensions.ServiceName == module.embeddings.service_name
    error_message = "The embedding lane's running tasks must be watched too."
  }
  assert {
    condition     = alltrue([for k in ["ecs-api-cpu", "ecs-api-memory", "ecs-embeddings-cpu", "ecs-embeddings-memory"] : contains(keys(aws_cloudwatch_metric_alarm.this), k)])
    error_message = "Each service's CPU and memory must be watched."
  }
  # RDS.
  assert {
    condition = (aws_cloudwatch_metric_alarm.this["rds-cpu"].threshold == 80 &&
      aws_cloudwatch_metric_alarm.this["rds-free-storage"].threshold == 10737418240 &&
      aws_cloudwatch_metric_alarm.this["rds-freeable-memory"].threshold == 268435456 &&
    aws_cloudwatch_metric_alarm.this["rds-cpu"].dimensions.DBInstanceIdentifier == "c2c-production")
    error_message = "RDS: CPU above 80%, free storage under 10 GiB, freeable memory under 256 MiB, on the stack's instance."
  }
  assert {
    # db.m6g.large: 8 GiB / 9531392 = 901 connections at most; 80% is 720.
    condition     = aws_cloudwatch_metric_alarm.this["rds-connections"].threshold == 720
    error_message = "rds-connections must fire at 80% of the instance class's max_connections."
  }
  # CloudFront's metrics exist only in us-east-1.
  assert {
    condition     = aws_cloudwatch_metric_alarm.this["cloudfront-5xx-rate"].dimensions == tomap({ DistributionId = module.cdn.distribution_id, Region = "Global" })
    error_message = "cloudfront-5xx-rate must watch the distribution, Region Global."
  }
}

run "the_logs_that_mean_trouble_page" {
  command = apply

  assert {
    condition = alltrue([for k, f in aws_cloudwatch_log_metric_filter.app :
    f.log_group_name == module.ecs.api_log_group_name])
    error_message = "The application filters must read the API's log group, where every scheduler runs."
  }
  assert {
    condition = toset([for f in aws_cloudwatch_log_metric_filter.app : f.pattern]) == toset([
      "\"Scheduled retention sweep failed\"",
      "\"Audit chain integrity check failed\"",
      "\"AUDIT INTEGRITY FAILURE\"",
      "\"External intelligence sweep crashed\"",
      "\"[SECURITY] [alert:\"",
      "\"security posture transitioned\" \"failing\"",
    ])
    error_message = "The filters must match the exact lines the server writes."
  }
  # The audit-integrity line has its own filter and alarm.
  assert {
    condition = (aws_cloudwatch_log_metric_filter.app["audit-integrity-failure"].pattern == "\"AUDIT INTEGRITY FAILURE\"" &&
    aws_cloudwatch_metric_alarm.this["log-audit-integrity-failure"].metric_name == aws_cloudwatch_log_metric_filter.app["audit-integrity-failure"].metric_transformation[0].name)
    error_message = "AUDIT INTEGRITY FAILURE must have its own filter and its own alarm."
  }
  assert {
    condition = alltrue([for k, f in aws_cloudwatch_log_metric_filter.app :
      aws_cloudwatch_metric_alarm.this["log-${k}"].metric_name == f.metric_transformation[0].name &&
      aws_cloudwatch_metric_alarm.this["log-${k}"].namespace == f.metric_transformation[0].namespace &&
      aws_cloudwatch_metric_alarm.this["log-${k}"].threshold == 1 &&
    aws_cloudwatch_metric_alarm.this["log-${k}"].comparison_operator == "GreaterThanOrEqualToThreshold"])
    error_message = "Each log filter must have an alarm on its metric at one occurrence."
  }
}

run "account_activity_from_cloudtrail_pages" {
  command = apply

  assert {
    condition = alltrue([for f in aws_cloudwatch_log_metric_filter.cloudtrail :
    f.log_group_name == module.evidence.names.log_group])
    error_message = "The CIS filters must read the trail's log group."
  }
  assert {
    condition     = toset(keys(aws_cloudwatch_log_metric_filter.cloudtrail)) == toset(["root-activity", "iam-policy-change", "kms-key-disabled-or-deleted", "security-group-change", "console-sign-in-failure"])
    error_message = "Root activity, IAM policy changes, KMS key disable or deletion, security-group changes and console sign-in failures must each be filtered."
  }
  assert {
    condition     = alltrue([for k, f in aws_cloudwatch_log_metric_filter.cloudtrail : aws_cloudwatch_metric_alarm.this["trail-${k}"].metric_name == f.metric_transformation[0].name])
    error_message = "Each CloudTrail filter must have an alarm."
  }
}

# A nightly sweep that stops running logs no error. Each finished run writes
# C2C/Jobs JobSucceeded (server/db/scheduledOnce.ts); a day without one fires.
run "a_sweep_that_stops_running_pages" {
  command = apply

  assert {
    condition = alltrue([for job in ["retention-sweep", "audit-chain-integrity-sweep"] :
      aws_cloudwatch_metric_alarm.this["job-stale-${job}"].namespace == "C2C/Jobs" &&
      aws_cloudwatch_metric_alarm.this["job-stale-${job}"].metric_name == "JobSucceeded" &&
      aws_cloudwatch_metric_alarm.this["job-stale-${job}"].dimensions == tomap({ JobName = job }) &&
      aws_cloudwatch_metric_alarm.this["job-stale-${job}"].period == 86400 &&
      aws_cloudwatch_metric_alarm.this["job-stale-${job}"].comparison_operator == "LessThanThreshold" &&
      aws_cloudwatch_metric_alarm.this["job-stale-${job}"].threshold == 1 &&
    aws_cloudwatch_metric_alarm.this["job-stale-${job}"].treat_missing_data == "breaching"])
    error_message = "The retention and audit-chain sweeps must each page after a day without a finished run."
  }
}

# Production refuses to apply with nobody to page.
run "production_needs_someone_to_page" {
  command = plan

  variables {
    alarm_emails = []
  }

  expect_failures = [var.alarm_emails]
}

run "an_address_must_be_an_address" {
  command = plan

  variables {
    alarm_emails = ["oncall"]
  }

  expect_failures = [var.alarm_emails]
}

# Staging may run without subscribers: the alarms still exist and show state.
run "staging_may_have_no_subscribers" {
  command = plan

  variables {
    environment        = "staging"
    alarm_emails       = []
    rds_instance_class = "db.t3.small"
    rds_multi_az       = false
  }

  assert {
    condition     = length(aws_sns_topic_subscription.alarm_email) == 0
    error_message = "With no addresses, nothing is subscribed."
  }
}

# Every alarm's description links to its section of the incident runbook by
# name; an alarm without one pages a person who has nothing to read.
run "every_alarm_has_a_runbook_section" {
  command = plan

  assert {
    condition = alltrue([for k in keys(aws_cloudwatch_metric_alarm.this) :
    strcontains(file("../../docs/runbooks/incident-response.md"), "\n### ${k}\n")])
    error_message = "Each alarm needs a '### <name>' section in docs/runbooks/incident-response.md: ${join(", ", [for k in keys(aws_cloudwatch_metric_alarm.this) : k if !strcontains(file("../../docs/runbooks/incident-response.md"), "\n### ${k}\n")])}"
  }
  assert {
    condition     = alltrue([for k in keys(aws_cloudwatch_metric_alarm.this) : endswith(aws_cloudwatch_metric_alarm.this[k].alarm_description, "Runbook: docs/runbooks/incident-response.md#${k}")])
    error_message = "Each alarm's description must link to its runbook section."
  }
}
