
# ── Release signing key (AWS KMS, asymmetric) ────────────────────────────────
#
# DECISION (2026-09-23): production signs releases with CONCEPT2CURE_SIGNER_MODE=kms,
# not hmac. An HMAC seal is symmetric — whoever holds AUDIT_HMAC_KEY can mint
# one — so it shows only that the server sealed a payload. 21 CFR Part 11
# §11.70 asks that a signature be linked to its record so it cannot be excised,
# copied or re-made; an asymmetric key whose private half never leaves the KMS
# HSM, verifiable by anyone holding the published public key, is the posture
# that meets it for the clients this product serves. The HMAC seal is still
# written beside every KMS signature (server/services/ectd/sign-payload-seal.ts).
#
# Exactly as docs/SOP_KEY_MANAGEMENT.md §3–§5 and §8 specify:
#   - RSA_4096, SIGN_VERIFY, generated in KMS, not exportable;
#   - alias alias/fda-signing-key-{YYYY}; rotation = a new year's key, the old
#     one kept enabled for Verify (asymmetric KMS keys do not auto-rotate);
#   - the application task role holds kms:Sign; no human principal does;
#   - multi-Region, which can only be chosen at creation; the replica in the
#     DR region (§8) is below (MR-04 Stage 1).
# Every Sign/Verify/GetPublicKey call is recorded by CloudTrail (module.evidence).

data "aws_caller_identity" "current" {}

locals {
  release_signing_key_year = "2026"
  # Production's alias is the SOP's (alias/fda-signing-key-{YYYY}). Staging gets
  # its own key under a distinct alias, so a staging signature can never be
  # made with, or mistaken for, the production key (D1 brief B8).
  release_signing_key_alias = var.environment == "production" ? "alias/fda-signing-key-${local.release_signing_key_year}" : "alias/fda-signing-key-${local.release_signing_key_year}-${var.environment}"

  # The API carries it: server/services/signature/signer-mode.ts refuses
  # to boot a production process whose signer posture is unset, `dev`, or
  # incomplete.
  signer_environment = [
    { name = "CONCEPT2CURE_SIGNER_MODE", value = "kms" },
    { name = "CONCEPT2CURE_SIGNER_KMS_KEY_ID", value = local.release_signing_key_alias },
    { name = "CONCEPT2CURE_SIGNER_KMS_REGION", value = var.region },
  ]
}

# One policy document for the key and its replica, so they cannot differ.
locals {
  release_signing_key_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        # Administration only. No kms:Sign here, so no IAM policy in this
        # account can hand a person the ability to sign a release.
        Sid       = "KeyAdministrationWithoutSign"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action = [
          "kms:Create*", "kms:Describe*", "kms:Enable*", "kms:List*", "kms:Put*",
          "kms:Update*", "kms:Revoke*", "kms:Disable*", "kms:Get*", "kms:Delete*",
          "kms:TagResource", "kms:UntagResource", "kms:ScheduleKeyDeletion",
          "kms:CancelKeyDeletion", "kms:ReplicateKey",
        ]
        Resource = "*"
      },
      {
        # Verification is open to the account; an inspector can also verify
        # offline with the public key (SOP §7).
        Sid       = "VerifyAndPublicKey"
        Effect    = "Allow"
        Principal = { AWS = "arn:aws:iam::${data.aws_caller_identity.current.account_id}:root" }
        Action    = ["kms:Verify", "kms:GetPublicKey", "kms:DescribeKey"]
        Resource  = "*"
      },
      {
        # The only signer: the application's ECS task role.
        Sid       = "ApplicationSigns"
        Effect    = "Allow"
        Principal = { AWS = module.ecs.task_role_arn }
        Action    = ["kms:Sign", "kms:Verify", "kms:GetPublicKey", "kms:DescribeKey"]
        Resource  = "*"
      },
    ]
  })
}

resource "aws_kms_key" "release_signing" {
  description              = "Concept2Cure release signatures (21 CFR Part 11 11.70) - ${var.environment} ${local.release_signing_key_year}"
  key_usage                = "SIGN_VERIFY"
  customer_master_key_spec = "RSA_4096"
  multi_region             = true
  deletion_window_in_days  = 30

  policy = local.release_signing_key_policy

  tags = var.tags
}

# The replica in the DR region (SOP §8; database_keys.tf, MR-04 Stage 1). A
# release signed before a failover still verifies after it. The same policy:
# no human principal holds kms:Sign in either region.
resource "aws_kms_replica_key" "release_signing" {
  provider                = aws.dr
  description             = "Concept2Cure release signatures (21 CFR Part 11 11.70) - ${var.environment} ${local.release_signing_key_year} (replica)"
  primary_key_arn         = aws_kms_key.release_signing.arn
  deletion_window_in_days = 30
  policy                  = local.release_signing_key_policy
  tags                    = var.tags
}

resource "aws_kms_alias" "release_signing" {
  name          = local.release_signing_key_alias
  target_key_id = aws_kms_key.release_signing.key_id
}
