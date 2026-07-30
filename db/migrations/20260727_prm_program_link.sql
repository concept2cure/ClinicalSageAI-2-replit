-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — Clinical spine (design · conduct · monitoring)
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give protocol/study-design (CDISC PRM) the canonical project key so
--          it connects to the same project as clinical_studies and rbm_*.
--
-- eCTD/CTD Context:
--   - Module(s): Module 2.5 / 2.7 and Module 5 (clinical study design + reports)
--   - Integrity Risk Addressed: a design record with no project key cannot be
--     tied to its study conduct or monitoring, so a project's evidence chain is
--     fragmented across modules that do not reference one another.
--
-- Determinism Contract:
--   - Additive, nullable column + index only; no canonical schema is rewritten,
--     so evidence pointers/fingerprints are unaffected. No spec version bump.
--
-- Notes:
--   - cdisc_prm_studies was keyed only by study_id text + tenant_id; a design's
--     programId was coerced into the protocol_id varchar. This adds program_id
--     (regulatory_programs.id, the canonical project id space clinical_studies
--     and rbm_* already share).
--   - Idempotent (IF NOT EXISTS). Backfill promotes only protocol_id values that
--     are already UUIDs; non-UUID references are left null rather than guessed —
--     a wrong project link is worse than an absent one.
--
-- Rollback:
--   DROP INDEX IF EXISTS prm_program_idx;
--   ALTER TABLE cdisc_prm_studies DROP COLUMN IF EXISTS program_id;
-- =============================================================================

ALTER TABLE cdisc_prm_studies
  ADD COLUMN IF NOT EXISTS program_id uuid;

CREATE INDEX IF NOT EXISTS prm_program_idx
  ON cdisc_prm_studies (program_id);

-- Backfill: where protocol_id already holds a UUID (design.programId was a
-- regulatory_programs id), promote it into program_id. Rows whose protocol_id
-- is a non-UUID string are left null rather than guessed.
UPDATE cdisc_prm_studies
   SET program_id = protocol_id::uuid
 WHERE program_id IS NULL
   AND protocol_id ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$';
