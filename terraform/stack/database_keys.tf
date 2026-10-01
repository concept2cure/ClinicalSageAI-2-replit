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
#             so it is set before the first apply, not after.
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
  deletion_window_in_days = 30
  policy                  = local.account_admin_key_policy
  tags                    = var.tags
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
