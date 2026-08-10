-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Enforce C2C work-item dedup key via database constraint to prevent race conditions
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 (Drug substance / drug product / manufacturing)
--   - Integrity Risk Addressed: Duplicate work items from concurrent upserts causing inconsistent audit trails
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================
--
-- C2C work items: add unique constraint to prevent dedup race.
--
-- upsertProjectWorkItem uses a read-then-write pattern:
--   1. SELECT on (source_type, source_id, org_id)
--   2. UPDATE if found, else INSERT
--
-- Between step 1 and step 2, another request can insert the same row, causing:
--   - Two rows with the same dedup key
--   - Or a constraint violation on the next upsert
--
-- This migration adds a UNIQUE constraint on (org_id, source_type, source_id)
-- to enforce dedup at the database level. Later, the code should switch to
-- INSERT ... ON CONFLICT DO UPDATE to make it atomic.
--
-- Idempotent: the constraint is added via exception handling to safely skip if already present.

BEGIN;

-- Idempotent constraint addition with exception handling.
-- If the constraint already exists, silently continue.
-- If duplicates exist, fail with a clear message.
DO $$
BEGIN
  -- Try to add the constraint. If it already exists or duplicates block it, catch and handle.
  ALTER TABLE c2c_project_work_items
    ADD CONSTRAINT c2c_pwi_org_source_type_source_id_unique
    UNIQUE (org_id, source_type, source_id);

  RAISE NOTICE '[20260810] added unique constraint on (org_id, source_type, source_id)';
EXCEPTION
  WHEN duplicate_object THEN
    RAISE NOTICE '[20260810] constraint already exists; skipping';
  WHEN unique_violation THEN
    RAISE EXCEPTION
      'c2c_project_work_items has rows with duplicate (org_id, source_type, source_id) keys. '
      'These must be cleaned up manually before this migration can apply: '
      'review the duplicates and decide which to keep/merge.';
END $$;

COMMIT;
