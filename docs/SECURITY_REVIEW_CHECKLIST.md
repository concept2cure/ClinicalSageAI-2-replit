# Security & Compliance Review Checklist (21 CFR Part 11)

**Version:** 1.0  
**Effective Date:** 2026-02-01  
**Applies To:** All changes to `init-sql/`, `tsa-server/`, `scripts/e2e_*.py`, and `.github/workflows/ci-staging-integration.yml`

## Purpose
Verify ALCOA+ compliance (Attributable, Legible, Contemporaneous, Original, Accurate) and 21 CFR §11.10/§11.200 requirements prior to merge.

---

## 🔐 Security & Compliance Review Checklist (Part 11)

**Instructions:** Check off each item, provide evidence/logs, and attach screenshots where indicated. Mark items as `N/A` where appropriate and include justification.

### 1. Roll-Based Access Control (RBAC) — `init-sql/01-part11-rbac.sql`
- [ ] `app_user` role has **only** `INSERT, SELECT` on `state_transitions` (no UPDATE/DELETE)
- [ ] `app_role` and `ros_admin` separation is enforced (principle of least privilege)
- [ ] Immutability trigger `immutable_state_transitions` is active and tested
- [ ] **Evidence:** Run `\z state_transitions` in psql and confirm no UPDATE/DELETE grants for `app_user`

### 2. Blast Radius Protection — `.github/workflows/ci-staging-integration.yml`
- [ ] Workflow fails if `environment: staging-aws` but secrets are missing
- [ ] Bucket name validation rejects names without `-staging-` substring (case-insensitive)
- [ ] KMS key ARN validation rejects `:production:` or `:prod:` patterns
- [ ] **Test:** Attempt to set `S3_BUCKET=ros-production-bucket` and verify job exits with "BLAST RADIUS VIOLATION"

### 3. Cryptographic Controls
- [ ] **Local:** LocalStack KMS uses software HSM (acceptable for dev)
- [ ] **AWS:** KMS key has rotation enabled (if applicable)
- [ ] XAdES signatures include `SigningCertificate` V2 (RFC 5033 compliance for long-term validation)
- [ ] Private keys never exist in plaintext in containers or logs
- [ ] **Evidence:** Check `e2e_staging_smoke.py` — confirm no hardcoded credentials, only env vars

### 4. TSA & Timestamp Authority
- [ ] TSA certificate chain is extractable and stored in `_signatures/tsa_chain.pem`
- [ ] Local TSA uses RSA-4096 (check `tsa-server/tsa.py`)
- [ ] Production TSA endpoint uses HTTPS (verify `TSA_URL` starts with https:// when not in local mode)
- [ ] OCSP/CRL checking logic is present (even if mocked in local mode)

### 5. WORM / Object Lock (§11.10(c))
- [ ] S3 bucket has Object Lock enabled in `GOVERNANCE` mode (not just `COMPLIANCE` — legal hold capability required)
- [ ] Retention period is **2555 days** (7 years) minimum
- [ ] **Test:** Attempt to delete an object before retention period expires — should fail with `AccessDenied`
- [ ] **Test:** Attempt to overwrite an existing object — should fail due to Object Lock

### 6. Audit Trail Completeness (§11.10(e))
- [ ] `state_transitions` table captures: Object ID, From/To state, User ID, Signature ref, Content hash, Timestamp
- [ ] FHIR AuditEvent includes: Who (agent), What (entity), When (recorded), Why (purpose), Outcome (signature)
- [ ] CloudTrail integration is documented (even if mocked in LocalStack)
- [ ] **Evidence:** Query `SELECT * FROM state_transitions` after smoke test and verify immutable

### 7. Evidence Artifact Integrity
- [ ] Evidence packages include: JSON report, TSA chain, signature XML, FHIR audits
- [ ] Artifact retention in GitHub Actions is configured (default 30 days, adjustable)
- [ ] No secrets in artifact logs (check for `npg_`, `AKIA`, private keys)

### LocalStack Pro Licensing Note
- [ ] **Local:** If using LocalStack Pro for S3 Object Lock testing, verify your team has an active API key
- [ ] **Alternative:** MinIO can substitute LocalStack for Object Lock validation (see `docker-compose.staging.yml` comments)
- [ ] **Evidence:** Smoke test passed locally (attach `evidence/evidence_report_*.json`)
  - *Note: Cannot verify from CI runner environment—maintainers must run locally:*
  ```bash
  docker compose -f docker-compose.staging.yml up -d
  python scripts/e2e_staging_smoke.py --environment local --output-dir ./evidence
  ```

### 8. Environment Protection (Pre-Merge Requirement)
- [ ] **Required:** GitHub Environment `staging-aws` is created in repo settings
- [ ] **Required:** Environment protection rule requires 1 approval from `@concept2cure/security-team`
- [ ] **Required:** Environment protection rule restricts deployment branches to `main` or `staging/*`

---

## Sign-off
- [ ] Security: ____________________________
- [ ] Infrastructure: _____________________
- [ ] QA/Compliance: _______________________
- [ ] Date: _______________________________

---

**Blockers for Merge (must be cleared):**
1. Environment protection rules configured in GitHub UI (not just code comments)
2. Reviewer teams added as repository collaborators (to enable CODEOWNERS enforcement)
3. At least one successful local smoke test run evidence attached to PR

**Repo Admin Steps (before merging):**
1. Settings → Manage Access → Add `security-team`, `infra-team`, `qa-lead` with **Triage** or **Write** access
2. Settings → Environments → Create `staging-aws` environment
3. Add protection rule: **Required reviewers:** `@concept2cure/security-team` (1)
4. Restrict deployment branches to `main`, `staging/*`, `epic/*`

*This checklist is part of the validation artifact set and MUST be completed and attached to the PR before merging Part 11-related changes.*
