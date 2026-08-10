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
-- Idempotent: the constraint is added IF NOT EXISTS, and only if no rows
-- violate it (checked first). Safe to re-run on an existing database.

BEGIN;

-- Guard: skip if the table is missing or already has the constraint
DO $$
DECLARE
  constraint_exists boolean;
  table_exists boolean;
  violating_rows integer;
BEGIN
  -- Check if the table exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'c2c_project_work_items'
  ) INTO table_exists;

  IF NOT table_exists THEN
    RAISE NOTICE '[20260810] table c2c_project_work_items does not exist; skipping';
    RETURN;
  END IF;

  -- Check if the constraint already exists
  SELECT EXISTS(
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_schema = 'public'
      AND table_name = 'c2c_project_work_items'
      AND constraint_name = 'c2c_pwi_org_source_type_source_id_unique'
  ) INTO constraint_exists;

  IF constraint_exists THEN
    RAISE NOTICE '[20260810] constraint already exists; skipping';
    RETURN;
  END IF;

  -- Check for existing violations: rows with duplicate (org_id, source_type, source_id)
  SELECT COUNT(*) FROM (
    SELECT org_id, source_type, source_id
    FROM c2c_project_work_items
    GROUP BY org_id, source_type, source_id
    HAVING COUNT(*) > 1
  ) INTO violating_rows;

  IF violating_rows > 0 THEN
    RAISE EXCEPTION
      'c2c_project_work_items has % rows with duplicate (org_id, source_type, source_id) keys. '
      'These must be cleaned up manually before this migration can apply: '
      'review the duplicates and decide which to keep/merge.',
      violating_rows;
  END IF;

  -- Add the constraint
  EXECUTE 'ALTER TABLE c2c_project_work_items
             ADD CONSTRAINT c2c_pwi_org_source_type_source_id_unique
             UNIQUE (org_id, source_type, source_id)';

  RAISE NOTICE '[20260810] added unique constraint on (org_id, source_type, source_id)';
END $$;

COMMIT;
