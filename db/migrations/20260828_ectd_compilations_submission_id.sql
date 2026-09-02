-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Give ectd_compilations a STABLE per-SUBMISSION key so a later
--          sequence can find the correct prior sequence's leaf manifest.
--
-- Why this column exists:
--   The leaf manifest (20260730_ectd_compilations_leaf_manifest.sql) is the
--   prior-state evidence a new sequence diffs against to compute lifecycle
--   operators (new/replace/append/delete) + modified-file pointers. To FIND it,
--   the loader must key on something that is STABLE across every sequence of the
--   same regulatory application. The only stable key previously available on the
--   row was `application_number`, which some compile paths populated with a
--   SEQUENCE-specific fallback ("SEQ-<sequence.id>") — a different value per
--   sequence, so the prior manifest could never be located and every leaf stayed
--   `new`. submissions.id IS stable across an application's sequences; binding it
--   here lets loadLatestPriorManifestBySubmission resolve the true predecessor.
--
-- Notes:
--   - RLS policies enforce organization_id isolation on ectd_compilations.
--   - Migration is idempotent (IF NOT EXISTS). Nullable: pre-existing rows and
--     metadata-only / project-level compilations simply carry no submission id.
--   - Fresh installs get the column from shared/schema.ts via drizzle-kit push;
--     this is the durable, existing-database half. Widening + safe to re-run.
--   - Self-contained: also guarantees sequence_number, the column it indexes
--     (same TEXT type as 20260730_ectd_compilations_sequence_columns.sql and
--     shared/schema.ts). Assuming an earlier file had run is not idempotence.
-- =============================================================================

ALTER TABLE ectd_compilations
  ADD COLUMN IF NOT EXISTS submission_id INTEGER;

-- The index below names sequence_number, which this file previously did NOT
-- guarantee. It is added by 20260730_ectd_compilations_sequence_columns.sql,
-- which precedes this one in C2C_MIGRATION_FILES, so on a full deploy-migrate
-- run the column is already there and this ADD is a no-op. But a widening,
-- re-runnable migration must apply on ANY database this set can present, not
-- only one the whole set has already passed over: the base-schema contract
-- (tests/schema-contract/tenant-isolation-sweep.contract.test.ts) applies the
-- set from 022_stability_v2 onward over the drizzle journal, where
-- ectd_compilations has no sequence_number, and this file failed there with
-- 42703 `column "sequence_number" does not exist`. Declared with the SAME type
-- as 20260730 and shared/schema.ts (text), so whichever file runs first, the
-- other is a no-op and the index always has its column.
ALTER TABLE ectd_compilations
  ADD COLUMN IF NOT EXISTS sequence_number TEXT;

-- The lifecycle lookup filters (organization_id, submission_id, sequence_number)
-- and orders by sequence_number DESC; index the (submission_id, sequence_number)
-- pair so locating the most-recent prior sequence stays cheap as history grows.
CREATE INDEX IF NOT EXISTS ectd_compilations_submission_seq_idx
  ON ectd_compilations (submission_id, sequence_number);
