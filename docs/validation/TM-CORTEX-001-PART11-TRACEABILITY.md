# Part 11 Controls Traceability Matrix (TM-CORTEX-001)

**Document type:** Traceability Matrix (the `TM-CORTEX-XXX` artifact required by
`VMP-CORTEX-001-VALIDATION_MASTER_PLAN.md` §4.1, previously a placeholder).
**Scope:** 21 CFR Part 11 / GAMP 5 controls for the Concept2Cure.RI platform.
**Date:** 2026-06-08.

This matrix closes the requirement→design→**code**→**verification** loop for the
platform's electronic-records / electronic-signatures controls. Every row points
at the actual implementing module and the actual automated check (unit/contract
test or CI gate) that verifies it, so an assessor can move from a Part 11 clause
to running evidence without a code tour. Paths are repository-relative.

## How to read this

- **Verification** names an automated test or a CI gate. CI gates live in
  `scripts/ci/` and run on every change; contract/unit tests run in the
  `vitest` suite. Where verification requires a live database (not available in
  CI), the mocked contract test is the CI-enforced evidence and a DB-backed
  integration test is the operator's complementary qualification step (see
  `PRODUCT_QC_REVIEW_2026-06-08.md`).

## Matrix

| ID | Part 11 clause | Requirement | Implementing code | Verification |
|----|----------------|-------------|-------------------|--------------|
| P11-01 | §11.10(a) | System validation | `docs/validation/VMP-CORTEX-001-…`, `docs/beta/validation/{IQ,OQ,PQ}_TEMPLATE.md` | IQ/OQ/PQ execution records (operator) |
| P11-02 | §11.10(b) | Accurate, complete copies of records (human-readable + electronic) | `server/services/ectdExportService.ts` (`generateEctdPackage`, `validateEctdPackage`); `server/services/pdf-converter.ts` | `npm run test:submission` (ectd export/validate); deterministic PDF SHA-256 |
| P11-03 | §11.10(c) | Protection of records for accurate, ready retrieval | `server/services/pdf-converter.ts` (deterministic, metadata-stripped → stable SHA-256); `lib/tamper-proof-audit.ts` | converter determinism asserts; audit chain verify |
| P11-04 | §11.10(d) | Limit system access to authorized individuals | `server/middleware/tenantIsolation.ts`, `server/utils/authedOrgId.ts`, `server/services/roleBasedAccess.ts` | `scripts/ci/check-tenant-isolation.mjs` (gate); `server/__tests__/security/*` tenant-isolation suite |
| P11-05 | §11.10(e) | Secure, computer-generated, time-stamped audit trail of record changes | `server/services/audit/chain.ts` (hash chain), `shared/schema.ts` `audit_events` (trigger-immutable); `server/services/audit/auditLoggerV2.ts` | `audit_events` immutability migration; chain-verify tests |
| P11-06 | §11.10(e) | **Deletes of regulated records are audited and recoverable** | `server/routes/ectd-documents.ts`, `server/routes/coauthor.ts` — soft-delete (`deleted_at`) + `audit_events` insert in one transaction; `server/routes/ind.ts` | `scripts/ci/check-regulated-delete-audit.mjs` (gate); `server/__tests__/security/{ectd-document,coauthor-document,ind-application}-delete-audit.contract.test.ts` |
| P11-07 | §11.10(e) | Audit records cannot be modified or removed over the API (immutability) | `server/startup/middleware.ts` — `applyImmutabilityPolicy` / `isImmutableAuditPath` (audit + e-signature trails) | `server/startup/__tests__/middleware.guards.test.ts` |
| P11-08 | §11.50, §11.70 | Signed records carry signer, meaning, timestamp; signatures are append-only and bound to records | `server/routes/part11-compliance.ts`, `shared/schema.ts` `electronic_signatures`; `/api/esignature` (no destructive handler; covered by P11-07) | part11-compliance route tests; immutability guard (P11-07) |
| P11-09 | §11.10(g)/(h) | Authority + device checks via re-auth on governed actions | `server/routes/c2c/actions.ts` (bcrypt + TOTP re-auth, separation of duties) | governed-action contract tests |
| P11-10 | §11.10(k) | Reproducibility of computer-generated outputs | `server/services/ai-gateway/*` (model+prompt-hash+seed logging); `server/services/stats/computation-provenance.ts` (`buildProvenance`) | stats provenance unit tests; gateway audit-log assertions |
| P11-11 | ALCOA+ | Diagnostic/analytical computations are deterministic and attributable | `server/services/stats/diagnostic-design.ts` (clinical sizing), `server/services/stats/analytical-performance.ts` (CLSI EP05/EP17/EP06) | `server/services/stats/__tests__/analytical-performance.test.ts` (closed-form references) |

## Open items (tracked, not yet closed)

These are recorded here so the matrix is honest about residual risk rather than
implying full coverage:

1. **Audit-store consolidation (§11.10(e) completeness).** A non-persistent,
   in-memory logger still exists at `server/services/audit/auditLogger.ts`
   (~28 call sites). Its event shape does not map cleanly onto the hash-chained
   `audit_events` table, so consolidation is a deliberate architecture decision
   requiring a live database to verify (per `PRODUCT_QC_REVIEW_2026-06-08.md`
   #2/#4). **Recommendation:** migrate those call sites onto a single canonical,
   chained, queryable store; do not force the mapping blind.
2. **eCTD leaf PDF rendering.** `generateEctdPackage` writes leaf paths with a
   `.pdf` extension; routing leaf content through `pdf-converter.ts` so the bytes
   are true PDF (granular-PDF-spec conformant) is a runtime-dependent integration
   (LibreOffice/Puppeteer) to be qualified in OQ against a real eCTD validator
   profile.
3. **DB-backed audit integration test.** The delete→audit contract tests are
   mocked (CI has no Neon DB); a database-backed test (delete ⇒ matching
   `audit_events` row) is the operator's complementary qualification step.

## Revision history

| Version | Date | Change |
|---------|------|--------|
| 1.0 | 2026-06-08 | Initial populated matrix; adds P11-06 (audited soft-delete), P11-07 (broadened immutability), P11-11 (analytical performance). |
