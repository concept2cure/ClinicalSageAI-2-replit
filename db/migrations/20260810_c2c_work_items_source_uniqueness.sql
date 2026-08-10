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

-- Idempotent constraint addition: check existence before attempting to add.
-- If duplicates exist, fail with a clear message.
DO $$
DECLARE
  constraint_exists BOOLEAN;
BEGIN
  -- Check if constraint already exists in information_schema
  SELECT EXISTS(
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'c2c_project_work_items'
      AND constraint_name = 'c2c_pwi_org_source_type_source_id_unique'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    RAISE NOTICE '[20260810] constraint already exists; skipping';
  ELSE
    -- Check for duplicates before adding the constraint
    IF EXISTS(
      SELECT 1 FROM c2c_project_work_items
      GROUP BY org_id, source_type, source_id
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION
        'c2c_project_work_items has rows with duplicate (org_id, source_type, source_id) keys. '
        'These must be cleaned up manually before this migration can apply: '
        'review the duplicates and decide which to keep/merge.';
    END IF;

    -- Add the constraint
    ALTER TABLE c2c_project_work_items
      ADD CONSTRAINT c2c_pwi_org_source_type_source_id_unique
      UNIQUE (org_id, source_type, source_id);

    RAISE NOTICE '[20260810] added unique constraint on (org_id, source_type, source_id)';
  END IF;
END $$;

COMMIT;
