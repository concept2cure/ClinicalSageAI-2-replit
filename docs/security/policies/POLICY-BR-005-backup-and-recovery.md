# POLICY-BR-005 — Backup and Recovery Policy (DRAFT)

**Owner:** Founder. **TSC:** A1.2, A1.3, CC7.5.

## 1. Objectives
| Objective | Target | Status |
|---|---|---|
| RPO (database) | ≤ 5 minutes (RDS automated backups + PITR) | **Partial** — `backup_retention_period` and `storage_encrypted = true` are in `terraform/modules/rds/main.tf`; production not applied |
| RTO (database) | ≤ 4 hours | **Partial** — restore drill script exists, not timed on production-size data |
| Retention of backups | 35 days rolling + monthly snapshot retained per POLICY-DR-007 | **Planned** |
| Vault documents (S3) | versioning + Object Lock for compliance evidence bucket | **Partial** — `terraform/modules/compliance-evidence` defines Object Lock; the document-storage bucket policy is not yet defined |

## 2. Controls
| Control | Status | Evidence |
|---|---|---|
| Restore drill refuses to run against a production URL and fingerprints the schema before/after | **Implemented** | `scripts/ops/dr-restore-drill.sh` |
| Restore proof workflow in CI | **Implemented** (workflow) | `.github/workflows/database-dr-restore-proof.yml` |
| Application readiness after restore | **Implemented** | `scripts/ops/dr-application-readiness.mjs` |
| Audit-chain verification after every restore | **Implemented** (tool); **Planned** as a mandatory step in the runbook | `npm run ops:verify-audit-chain` |
| Backups encrypted with a KMS key | **Partial** — RDS `kms_key_id` parameterised in terraform | `terraform/modules/rds/main.tf:27-28` |
| Multi-AZ | **Partial** — parameter present (`multi_az`), value per environment | `terraform/modules/rds/variables.tf:46` |
| Quarterly restore test with recorded timings | **Planned** | — |

## 3. Procedure
1. Identify the recovery point; snapshot the current state first (evidence).
2. Restore to a new instance (`dr-restore-drill.sh` guards apply).
3. Run schema validation (`.github/workflows/db-schema-validation.yml` logic),
   `dr-application-readiness.mjs`, then `ops:verify-audit-chain`. A non-zero
   verifier exit means the recovery point is not trustworthy: choose an earlier one.
4. Cut over; record RTO/RPO achieved in `docs/evidence/dr/<date>/`.

## Revision history
| Version | Date | Author | Change |
|---|---|---|---|
| 0.1 DRAFT | 2026-09-20 | W3b session | First draft |
