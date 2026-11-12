# ── Alarms: one path that pages a person (MR-04 Stage 2; OPS-06, SEC-11) ─────
#
# Until this file the stack declared no alarm, no SNS topic and no log metric
# filter, so a failure in production was found by whoever read the logs. Every
# alarm below notifies one topic when it fires and when it clears, and every
# address in var.alarm_emails is subscribed to that topic.
#
#   - Service health: the ALB, the API and embedding services, RDS, CloudFront.
#   - Lines the server writes when something is wrong (a failed sweep, an audit
#     chain that does not verify, a reported security alert).
#   - Account activity CloudTrail records that CIS asks to be alarmed.
#   - A nightly sweep that stops running: it logs no error, so its absence is
#     alarmed. Each finished run writes C2C/Jobs JobSucceeded
#     (server/db/scheduledOnce.ts).
#
# docs/runbooks/incident-response.md says, for each alarm by name, who owns it
# and the first three things to do. tests/monitoring.tftest.hcl asserts it all.

# The topic's key. CloudWatch publishes to an encrypted topic only if the key
# lets cloudwatch.amazonaws.com use it; without the grant alarms change state
# and the message is dropped. The account administers the key through IAM, as
# the database tier's keys do (database_keys.tf).
resource "aws_kms_key" "alarms" {
  description             = "${local.long}: the alarm topic"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      jsondecode(local.account_admin_key_policy).Statement[0],
      {
        Sid       = "CloudWatchPublishesAlarms"
        Effect    = "Allow"
        Principal = { Service = "cloudwatch.amazonaws.com" }
        Action    = ["kms:Decrypt", "kms:GenerateDataKey*"]
        Resource  = "*"
        Condition = { StringEquals = { "aws:SourceAccount" = data.aws_caller_identity.current.account_id } }
      },
    ]
  })
  tags = var.tags
}

resource "aws_kms_alias" "alarms" {
  name          = "alias/${local.short}-alarms"
  target_key_id = aws_kms_key.alarms.key_id
}

resource "aws_sns_topic" "alarms" {
  name              = "${local.long}-alarms"
  kms_master_key_id = aws_kms_key.alarms.arn
  tags              = var.tags
}

resource "aws_sns_topic_subscription" "alarm_email" {
  for_each  = toset(var.alarm_emails)
  topic_arn = aws_sns_topic.alarms.arn
  protocol  = "email"
  endpoint  = each.value
}

locals {
  # RDS's default max_connections for PostgreSQL is
  # LEAST(DBInstanceClassMemory / 9531392, 5000). DBInstanceClassMemory is a
  # little under the class's nominal memory, so 80% of the nominal figure is
  # about 85% of the real ceiling: early enough to act on.
  rds_class_size_gib = {
    micro     = 1, small = 2, medium = 4, large = 8, xlarge = 16,
    "2xlarge" = 32, "4xlarge" = 64, "8xlarge" = 128, "12xlarge" = 192, "16xlarge" = 256,
  }
  rds_class_parts = split(".", var.rds_instance_class)
  # Memory-optimised classes (db.r*, db.x*) carry twice a general class's memory per size.
  rds_memory_gib        = local.rds_class_size_gib[local.rds_class_parts[2]] * (can(regex("^[rx]", local.rds_class_parts[1])) ? 2 : 1)
  rds_max_connections   = min(floor(local.rds_memory_gib * 1073741824 / 9531392), 5000)
  rds_connections_alarm = floor(local.rds_max_connections * 0.8)

  alb_dimensions = {
    LoadBalancer = module.alb.alb_arn_suffix
    TargetGroup  = module.alb.api_target_group_arn_suffix
  }
  ecs_services = {
    api        = { name = module.ecs.api_service_name, desired = var.api_desired_count }
    embeddings = { name = module.embeddings.service_name, desired = var.embedding_desired_count }
  }

  # Lines the server writes when something has gone wrong, matched exactly as
  # written. Each becomes a metric and an alarm at one occurrence in 5 minutes.
  # Every scheduler runs in the API task, so the API's log group holds them all.
  app_log_alarms = {
    "retention-sweep-failed" = {
      pattern = "\"Scheduled retention sweep failed\"" # server/jobs/retentionCron.ts
      metric  = "RetentionSweepFailed"
    }
    "audit-chain-check-failed" = {
      pattern = "\"Audit chain integrity check failed\"" # server/jobs/auditChainIntegritySweep.ts: the check itself threw
      metric  = "AuditChainCheckFailed"
    }
    "audit-integrity-failure" = {
      pattern = "\"AUDIT INTEGRITY FAILURE\"" # server/jobs/auditChainIntegritySweep.ts: the chain did not verify
      metric  = "AuditIntegrityFailure"
    }
    "external-intelligence-sweep-crashed" = {
      pattern = "\"External intelligence sweep crashed\"" # server/jobs/externalIntelligenceSweep.ts
      metric  = "ExternalIntelligenceSweepCrashed"
    }
    # reportSecurityAlert only (server/services/security-alerts.ts). A bare
    # "[SECURITY]" would also match every blocked CORS request, which a public
    # endpoint sees all day, and a page nobody acts on teaches people to ignore pages.
    "security-alert" = {
      pattern = "\"[SECURITY] [alert:\""
      metric  = "SecurityAlert"
    }
    "security-posture-failing" = {
      pattern = "\"security posture transitioned\" \"failing\"" # server/services/securityHealthScheduler.ts
      metric  = "SecurityPostureFailing"
    }
  }

  # CIS AWS Foundations 4.x, on the Part 11 trail's log group (modules/compliance-evidence).
  cloudtrail_alarms = {
    "root-activity" = {
      pattern = "{ $.userIdentity.type = \"Root\" && $.userIdentity.invokedBy NOT EXISTS && $.eventType != \"AwsServiceEvent\" }"
      metric  = "RootActivity"
    }
    "iam-policy-change" = {
      pattern = "{ ($.eventName = DeleteGroupPolicy) || ($.eventName = DeleteRolePolicy) || ($.eventName = DeleteUserPolicy) || ($.eventName = PutGroupPolicy) || ($.eventName = PutRolePolicy) || ($.eventName = PutUserPolicy) || ($.eventName = CreatePolicy) || ($.eventName = DeletePolicy) || ($.eventName = CreatePolicyVersion) || ($.eventName = DeletePolicyVersion) || ($.eventName = AttachRolePolicy) || ($.eventName = DetachRolePolicy) || ($.eventName = AttachUserPolicy) || ($.eventName = DetachUserPolicy) || ($.eventName = AttachGroupPolicy) || ($.eventName = DetachGroupPolicy) }"
      metric  = "IamPolicyChange"
    }
    "kms-key-disabled-or-deleted" = {
      pattern = "{ ($.eventSource = kms.amazonaws.com) && (($.eventName = DisableKey) || ($.eventName = ScheduleKeyDeletion)) }"
      metric  = "KmsKeyDisabledOrScheduledForDeletion"
    }
    "security-group-change" = {
      pattern = "{ ($.eventName = AuthorizeSecurityGroupIngress) || ($.eventName = AuthorizeSecurityGroupEgress) || ($.eventName = RevokeSecurityGroupIngress) || ($.eventName = RevokeSecurityGroupEgress) || ($.eventName = CreateSecurityGroup) || ($.eventName = DeleteSecurityGroup) }"
      metric  = "SecurityGroupChange"
    }
    "console-sign-in-failure" = {
      pattern = "{ ($.eventName = ConsoleLogin) && ($.errorMessage = \"Failed authentication\") }"
      metric  = "ConsoleSignInFailure"
    }
  }

  # The nightly sweeps whose absence pages: each runs once a day across the
  # tasks (runScheduledOncePerWindow), and both default on in production.
  stale_jobs = ["retention-sweep", "audit-chain-integrity-sweep"]

  # Every alarm, by the name the incident runbook uses.
  alarms = merge(
    {
      "alb-target-5xx" = {
        description = "The API answered more than 10 5xx in 5 minutes, twice running."
        namespace   = "AWS/ApplicationELB", metric = "HTTPCode_Target_5XX_Count", statistic = "Sum"
        dimensions  = local.alb_dimensions, period = 300, evaluation_periods = 2
        comparison  = "GreaterThanThreshold", threshold = 10, missing = "notBreaching"
      }
      "alb-elb-5xx" = {
        description = "The load balancer itself answered more than 5 5xx in 5 minutes: no healthy target, or a target that did not answer."
        namespace   = "AWS/ApplicationELB", metric = "HTTPCode_ELB_5XX_Count", statistic = "Sum"
        dimensions  = { LoadBalancer = module.alb.alb_arn_suffix }, period = 300, evaluation_periods = 1
        comparison  = "GreaterThanThreshold", threshold = 5, missing = "notBreaching"
      }
      "alb-healthy-hosts" = {
        description = "Fewer healthy API targets than api_desired_count for 3 minutes."
        namespace   = "AWS/ApplicationELB", metric = "HealthyHostCount", statistic = "Minimum"
        dimensions  = local.alb_dimensions, period = 60, evaluation_periods = 3
        comparison  = "LessThanThreshold", threshold = var.api_desired_count, missing = "breaching"
      }
      "alb-p95-latency" = {
        description = "The API's p95 response time above ${var.alb_p95_latency_alarm_seconds} s for 15 minutes."
        namespace   = "AWS/ApplicationELB", metric = "TargetResponseTime", extended_statistic = "p95"
        dimensions  = local.alb_dimensions, period = 300, evaluation_periods = 3
        comparison  = "GreaterThanThreshold", threshold = var.alb_p95_latency_alarm_seconds, missing = "notBreaching"
      }
      "rds-cpu" = {
        description = "The database's CPU above 80% for 15 minutes."
        namespace   = "AWS/RDS", metric = "CPUUtilization", statistic = "Average"
        dimensions  = { DBInstanceIdentifier = local.long }, period = 300, evaluation_periods = 3
        comparison  = "GreaterThanThreshold", threshold = 80, missing = "notBreaching"
      }
      "rds-free-storage" = {
        description = "The database has under 10 GiB of storage free."
        namespace   = "AWS/RDS", metric = "FreeStorageSpace", statistic = "Minimum"
        dimensions  = { DBInstanceIdentifier = local.long }, period = 300, evaluation_periods = 1
        comparison  = "LessThanThreshold", threshold = 10 * 1073741824, missing = "notBreaching"
      }
      "rds-freeable-memory" = {
        description = "The database has under 256 MiB of memory free."
        namespace   = "AWS/RDS", metric = "FreeableMemory", statistic = "Minimum"
        dimensions  = { DBInstanceIdentifier = local.long }, period = 300, evaluation_periods = 2
        comparison  = "LessThanThreshold", threshold = 256 * 1048576, missing = "notBreaching"
      }
      "rds-connections" = {
        description = "Database connections above 80% of ${var.rds_instance_class}'s max_connections (${local.rds_max_connections})."
        namespace   = "AWS/RDS", metric = "DatabaseConnections", statistic = "Maximum"
        dimensions  = { DBInstanceIdentifier = local.long }, period = 300, evaluation_periods = 2
        comparison  = "GreaterThanThreshold", threshold = local.rds_connections_alarm, missing = "notBreaching"
      }
      # CloudFront publishes its metrics in us-east-1 only, under Region=Global.
      # The stack's region is us-east-1 (F-25); the precondition below refuses
      # any other until this alarm is given a us-east-1 provider.
      "cloudfront-5xx-rate" = {
        description = "More than 5% of requests at the edge answered 5xx, for 10 minutes."
        namespace   = "AWS/CloudFront", metric = "5xxErrorRate", statistic = "Average"
        dimensions  = { DistributionId = module.cdn.distribution_id, Region = "Global" }, period = 300, evaluation_periods = 2
        comparison  = "GreaterThanThreshold", threshold = 5, missing = "notBreaching"
      }
    },
    merge([for svc, s in local.ecs_services : {
      "ecs-${svc}-running-tasks" = {
        description = "Fewer ${svc} tasks running than desired (${s.desired}) for 5 minutes."
        namespace   = "ECS/ContainerInsights", metric = "RunningTaskCount", statistic = "Minimum"
        dimensions  = { ClusterName = module.ecs.cluster_name, ServiceName = s.name }, period = 60, evaluation_periods = 5
        comparison  = "LessThanThreshold", threshold = s.desired, missing = "breaching"
      }
      "ecs-${svc}-cpu" = {
        description = "The ${svc} service's CPU above 85% for 15 minutes."
        namespace   = "AWS/ECS", metric = "CPUUtilization", statistic = "Average"
        dimensions  = { ClusterName = module.ecs.cluster_name, ServiceName = s.name }, period = 300, evaluation_periods = 3
        comparison  = "GreaterThanThreshold", threshold = 85, missing = "notBreaching"
      }
      "ecs-${svc}-memory" = {
        description = "The ${svc} service's memory above 85% for 15 minutes."
        namespace   = "AWS/ECS", metric = "MemoryUtilization", statistic = "Average"
        dimensions  = { ClusterName = module.ecs.cluster_name, ServiceName = s.name }, period = 300, evaluation_periods = 3
        comparison  = "GreaterThanThreshold", threshold = 85, missing = "notBreaching"
      }
    }]...),
    { for k, f in local.app_log_alarms : "log-${k}" => {
      description = "The server wrote ${f.pattern}."
      namespace   = "C2C/Logs", metric = f.metric, statistic = "Sum"
      dimensions  = {}, period = 300, evaluation_periods = 1
      comparison  = "GreaterThanOrEqualToThreshold", threshold = 1, missing = "notBreaching"
    } },
    { for k, f in local.cloudtrail_alarms : "trail-${k}" => {
      description = "CloudTrail recorded ${k} (CIS AWS Foundations)."
      namespace   = "C2C/CloudTrail", metric = f.metric, statistic = "Sum"
      dimensions  = {}, period = 300, evaluation_periods = 1
      comparison  = "GreaterThanOrEqualToThreshold", threshold = 1, missing = "notBreaching"
    } },
    { for job in local.stale_jobs : "job-stale-${job}" => {
      description = "No finished run of ${job} in the last day: the sweep has stopped, or fails every time."
      namespace   = "C2C/Jobs", metric = "JobSucceeded", statistic = "Sum"
      dimensions  = { JobName = job }, period = 86400, evaluation_periods = 1
      comparison  = "LessThanThreshold", threshold = 1, missing = "breaching"
    } },
  )
}

resource "aws_cloudwatch_log_metric_filter" "app" {
  for_each       = local.app_log_alarms
  name           = "${local.long}-${each.key}"
  log_group_name = module.ecs.api_log_group_name
  pattern        = each.value.pattern
  metric_transformation {
    name          = each.value.metric
    namespace     = "C2C/Logs"
    value         = "1"
    default_value = "0"
  }
}

resource "aws_cloudwatch_log_metric_filter" "cloudtrail" {
  for_each       = local.cloudtrail_alarms
  name           = "${local.long}-${each.key}"
  log_group_name = module.evidence.names.log_group
  pattern        = each.value.pattern
  metric_transformation {
    name          = each.value.metric
    namespace     = "C2C/CloudTrail"
    value         = "1"
    default_value = "0"
  }
  # The trail's log group is created by the evidence module.
  depends_on = [module.evidence]
}

resource "aws_cloudwatch_metric_alarm" "this" {
  # By name: the alarms differ in shape (dimensions, statistic or percentile),
  # so they are an object, not a map, and are read by key.
  for_each            = toset(keys(local.alarms))
  alarm_name          = "${local.long}-${each.key}"
  alarm_description   = "${local.alarms[each.key].description} Runbook: docs/runbooks/incident-response.md#${each.key}"
  namespace           = local.alarms[each.key].namespace
  metric_name         = local.alarms[each.key].metric
  statistic           = try(local.alarms[each.key].statistic, null)
  extended_statistic  = try(local.alarms[each.key].extended_statistic, null)
  dimensions          = local.alarms[each.key].dimensions
  period              = local.alarms[each.key].period
  evaluation_periods  = local.alarms[each.key].evaluation_periods
  comparison_operator = local.alarms[each.key].comparison
  threshold           = local.alarms[each.key].threshold
  treat_missing_data  = local.alarms[each.key].missing
  alarm_actions       = [aws_sns_topic.alarms.arn]
  ok_actions          = [aws_sns_topic.alarms.arn]
  tags                = var.tags

  lifecycle {
    precondition {
      condition     = local.alarms[each.key].namespace != "AWS/CloudFront" || var.region == "us-east-1"
      error_message = "CloudFront's metrics exist only in us-east-1. In ${var.region}, give the cloudfront-5xx-rate alarm a us-east-1 provider."
    }
  }
}
