# Customer-managed keys for the database tier (2026-10-01; security audit INF-14
# and INF-18, remediation plan P1-11; W2 / D1).
#
# Until this file, the RDS instance, its snapshots and automated backups, its
# Performance Insights data (which includes query text) and every secret the
# tasks read were encrypted under AWS-managed keys (aws/rds,
# aws/secretsmanager). An AWS-managed key cannot be scoped by a key policy,
# cannot be disabled to revoke access, and a snapshot under one cannot be
# shared or copied to another account, which is how a backup leaves the blast
# radius of this one.
#
# Two keys, because their users differ:
#   database  RDS uses it, through grants it creates when the instance is made.
#             Changing an existing instance's storage key REPLACES the instance,
#             so it is set before the first apply, not after. Multi-Region
#             (2026-11-12, MR-04 Stage 1), which also can only be chosen at
#             creation: its replica is below, so a snapshot copied to the DR
#             region is readable there under the same key material.
#   secrets   Secrets Manager uses it; the ECS execution role decrypts through
#             Secrets Manager only (modules/ecs-fargate), to start a task.
#
# Both policies delegate to IAM in this account, as AWS's own default key policy
# does: use is granted by the IAM policies that name the key, and every use is
# a CloudTrail event under the key. Annual rotation is on for both.

locals {
  account_admin_key_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AccountAdministersAndGrantsThroughIam"
      Effect    = "Allow"
      Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
      Action    = "kms:*"
      Resource  = "*"
    }]
  })
}

resource "aws_kms_key" "database" {
  description             = "${local.long}: RDS storage, snapshots, backups and Performance Insights"
  enable_key_rotation     = true
  multi_region            = true
  deletion_window_in_days = 30
  policy                  = local.account_admin_key_policy
  tags                    = var.tags
}

# ── The DR region (MR-04 Stage 1, OPS-14) ───────────────────────────────────
#
# The founder names the region (NEW-2; the work order recommends us-west-2,
# which keeps data in the US). Each root passes it as the provider aws.dr. The
# replicas of the database, vault and release-signing keys are made there, each
# beside its primary, under the same key policy. A replica shares its primary's
# key material and rotation; it is a separate key resource with its own policy.
data "aws_region" "dr" {
  provider = aws.dr
}

resource "aws_kms_replica_key" "database" {
  provider                = aws.dr
  description             = "${local.long}: RDS snapshots and backups copied to the DR region (replica)"
  primary_key_arn         = aws_kms_key.database.arn
  deletion_window_in_days = 30
  policy                  = local.account_admin_key_policy
  tags                    = var.tags

  lifecycle {
    # A replica in the primary's own region protects nothing; refuse it at plan.
    precondition {
      condition     = data.aws_region.dr.name != var.region
      error_message = "The DR region (provider aws.dr, the root's dr_region) must differ from the primary region ${var.region}."
    }
  }
}

resource "aws_kms_alias" "database" {
  name          = "alias/${local.short}-database"
  target_key_id = aws_kms_key.database.key_id
}

resource "aws_kms_key" "secrets" {
  description             = "${local.long}: Secrets Manager entries the tasks read (database URLs, signing keys)"
  enable_key_rotation     = true
  deletion_window_in_days = 30
  policy                  = local.account_admin_key_policy
  tags                    = var.tags
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${local.short}-secrets"
  target_key_id = aws_kms_key.secrets.key_id
}
