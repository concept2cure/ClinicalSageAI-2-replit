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
-- =============================================================================

ALTER TABLE ectd_compilations
  ADD COLUMN IF NOT EXISTS submission_id INTEGER;

-- The lifecycle lookup filters (organization_id, submission_id, sequence_number)
-- and orders by sequence_number DESC; index the (submission_id, sequence_number)
-- pair so locating the most-recent prior sequence stays cheap as history grows.
CREATE INDEX IF NOT EXISTS ectd_compilations_submission_seq_idx
  ON ectd_compilations (submission_id, sequence_number);
