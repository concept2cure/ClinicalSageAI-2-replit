-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Drop two invalid single-column FKs on CDISC reference tables that
--          could never be created (and halted `drizzle-kit push`).
--
-- eCTD/CTD Context:
--   - Module(s): CDASH (Clinical Data Acquisition) + eCTD Define-XML reference
--   - Integrity Risk Addressed: schema definition could not be applied; a
--     single-column FK targeted a per-tenant/per-study composite-unique
--     column, which Postgres rejects ("no unique constraint matching given
--     keys"). Blocked a clean full-schema apply.
--
-- Determinism Contract:
--   - Constraint-definition correction only; no canonical schema or evidence
--     pointer is affected. No spec version bump required.
--
-- Notes:
--   - Idempotent: DROP CONSTRAINT IF EXISTS — no-op where the constraint was
--     never created (the expected state), drops it where it somehow exists.
--   - No rows read/written/deleted. CDISC reference tables, zero app usages.
--   - shared/schema.ts has had the matching `.references()` clauses removed;
--     parent rows are identified by their composite keys
--     (cdash_tenant_form_idx, ectd_study_define_idx).
-- =============================================================================

BEGIN;

ALTER TABLE IF EXISTS cdisc_cdash_fields
  DROP CONSTRAINT IF EXISTS cdisc_cdash_fields_form_id_cdisc_cdash_forms_form_id_fk;

ALTER TABLE IF EXISTS cdisc_docs_define_artifacts
  DROP CONSTRAINT IF EXISTS cdisc_docs_define_artifacts_define_id_cdisc_ectd_define_xml_define_id_fk;

COMMIT;
