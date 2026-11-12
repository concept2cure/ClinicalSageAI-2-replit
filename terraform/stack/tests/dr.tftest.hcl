# Disaster recovery: what must exist before the first apply (MR-04 Stage 1, OPS-14).
#
# A KMS key can be made multi-Region only when it is created, and changing an
# RDS instance's storage key replaces the instance. So the database and vault
# keys are multi-Region from the start, and each of the three keys that guard
# regulated data (database, vault, release signing) has a replica in the DR
# region, under the same key policy. A snapshot or object copied to the DR
# region (Stage 6) is then readable there under the same key material, and a
# release signature made before a failover still verifies after it.
#
# The DR region is the founder's decision (NEW-2; the work order recommends
# us-west-2, which keeps data in the US). Each root takes it as the required
# variable dr_region and passes the stack a second AWS provider, aws.dr.
#
# Mocked providers, as boot_contract.tftest.hcl. The primary region's provider
# reports us-east-1 and the DR provider us-west-2, so an assertion that reads
# the DR region proves which provider a resource went through.
#
#   cd terraform/stack && terraform init -backend=false && terraform test -filter=tests/dr.tftest.hcl
#
# Stage 6 (cross-region copies and immutable backups) extends this file.

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

# A misconfigured root: "DR" pointed at the primary region.
mock_provider "aws" {
  alias = "same_region"
  mock_data "aws_region" {
    defaults = { name = "us-east-1" }
  }
  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
}

# The primaries get distinct ARNs, so "this replica copies that key" can fail.
override_resource {
  target = aws_kms_key.database
  values = { arn = "arn:aws:kms:us-east-1:123456789012:key/mrk-database", key_id = "mrk-database" }
}
override_resource {
  target = aws_kms_key.vault
  values = { arn = "arn:aws:kms:us-east-1:123456789012:key/mrk-vault", key_id = "mrk-vault" }
}
override_resource {
  target = aws_kms_key.release_signing
  values = { arn = "arn:aws:kms:us-east-1:123456789012:key/mrk-release", key_id = "mrk-release" }
}
override_resource {
  target = module.ecs.aws_iam_role.ecs_task
  values = { arn = "arn:aws:iam::123456789012:role/c2c-production-ecs-task" }
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
  # Production refuses to apply with nobody to page (monitoring.tf).
  alarm_emails             = ["oncall@example.com"]
  embedding_model_revision = "0123456789abcdef0123456789abcdef01234567"
}

run "the_three_keys_are_multi_region_from_creation" {
  command = apply

  assert {
    condition     = aws_kms_key.database.multi_region == true
    error_message = "The database key must be multi-Region. It can only be chosen at creation, and changing an RDS instance's storage key replaces the instance."
  }
  assert {
    condition     = aws_kms_key.vault.multi_region == true
    error_message = "The vault key must be multi-Region, chosen at creation."
  }
  assert {
    condition     = aws_kms_key.release_signing.multi_region == true
    error_message = "The release-signing key must stay multi-Region (docs/SOP_KEY_MANAGEMENT.md §8)."
  }
}

run "each_key_has_a_replica_in_the_dr_region" {
  command = apply

  assert {
    condition     = aws_kms_replica_key.database.primary_key_arn == aws_kms_key.database.arn
    error_message = "The database key has no replica in the DR region."
  }
  assert {
    condition     = aws_kms_replica_key.vault.primary_key_arn == aws_kms_key.vault.arn
    error_message = "The vault key has no replica in the DR region."
  }
  assert {
    condition     = aws_kms_replica_key.release_signing.primary_key_arn == aws_kms_key.release_signing.arn
    error_message = "The release-signing key has no replica in the DR region."
  }
  assert {
    condition = alltrue([for r in [aws_kms_replica_key.database, aws_kms_replica_key.vault, aws_kms_replica_key.release_signing] :
    r.deletion_window_in_days == 30])
    error_message = "A replica must keep the primaries' 30-day deletion window."
  }
}

run "each_replica_carries_its_primarys_policy" {
  command = apply

  assert {
    condition     = jsondecode(aws_kms_replica_key.database.policy) == jsondecode(aws_kms_key.database.policy)
    error_message = "The database replica's key policy differs from the primary's."
  }
  assert {
    condition     = jsondecode(aws_kms_replica_key.release_signing.policy) == jsondecode(aws_kms_key.release_signing.policy)
    error_message = "The release-signing replica's key policy differs from the primary's: no human principal may hold kms:Sign in either region."
  }
  # The vault's: the account administers the key and cannot decrypt with it, in
  # both regions, statement for statement.
  assert {
    condition     = jsondecode(aws_kms_replica_key.vault.policy).Statement[0] == jsondecode(aws_kms_key.vault.policy).Statement[0]
    error_message = "The vault replica's administration statement differs from the primary's."
  }
  assert {
    condition = alltrue([for s in jsondecode(aws_kms_replica_key.vault.policy).Statement :
      length(setintersection(toset(flatten([s.Action])), toset(["kms:*", "kms:Decrypt", "kms:Encrypt", "kms:GenerateDataKey", "kms:ReEncrypt*"]))) == 0
    if s.Sid == "KeyAdministrationWithoutUse"])
    error_message = "The vault replica lets the account decrypt: the human-decrypt denial must carry over unchanged."
  }
  # The application uses the replica only through S3, in the DR region: the
  # region is read from the provider the replica went through.
  assert {
    condition = [for s in jsondecode(aws_kms_replica_key.vault.policy).Statement :
    s.Condition.StringEquals["kms:ViaService"] if s.Sid == "ApplicationUsesTheKeyThroughS3"] == ["s3.us-west-2.amazonaws.com"]
    error_message = "The vault replica must be usable by the task role only through S3 in the DR region."
  }
  assert {
    condition = [for s in jsondecode(aws_kms_replica_key.vault.policy).Statement :
    s.Principal.AWS if s.Sid == "ApplicationUsesTheKeyThroughS3"] == ["arn:aws:iam::123456789012:role/c2c-production-ecs-task"]
    error_message = "The vault replica's only user must be the application's task role, as on the primary."
  }
}

# Replicating needs kms:ReplicateKey on the primary. The vault policy grants the
# account administration only, so it must name the action, or the first apply
# fails at the replica. Administration still excludes every use of the key.
run "the_account_may_replicate_the_vault_key" {
  command = plan

  assert {
    condition = contains([for s in jsondecode(aws_kms_key.vault.policy).Statement :
    s.Action if s.Sid == "KeyAdministrationWithoutUse"][0], "kms:ReplicateKey")
    error_message = "The vault key's administration statement must allow kms:ReplicateKey, or the replica cannot be created."
  }
}

# A DR provider pointed at the primary region is refused at plan, before any
# key is created: a "replica" in the same region protects nothing.
run "a_dr_region_equal_to_the_primary_is_refused" {
  command = plan

  providers = {
    aws    = aws
    aws.dr = aws.same_region
  }

  expect_failures = [aws_kms_replica_key.database]
}
