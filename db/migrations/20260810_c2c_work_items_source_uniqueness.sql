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
-- ── AMENDED IN PLACE 2026-09-29 (row D2; CLAUDE.md Rule 1) ─────────────────────
-- The key below used to be (org_id, source_type, source_id). It left out
-- source_ref, which migrations/20260730_work_item_source_ref.sql had added eleven
-- days earlier precisely because string-keyed sources — agency correspondence
-- issues — carry source_id 0 and are told apart ONLY by source_ref. With the old
-- key every correspondence work item in an organisation sat on one key, so the
-- second one raised 23505: a deficiency letter raising two issues failed at
-- intake (POST /api/regulatory-correspondence/correspondence/intake), after the
-- letter and its first issue had been written, and no later letter could be
-- recorded at all.
--
-- The key is now (org_id, source_type, source_id, source_ref) NULLS NOT DISTINCT,
-- under a new name, c2c_pwi_org_source_key_unique:
--   - integer-keyed sources (review threads/tasks, blockers; source_ref NULL)
--     deduplicate exactly as before — NULLS NOT DISTINCT makes NULL one value;
--   - each correspondence issue has its own key, and the same issue still
--     cannot be written twice.
-- The old constraint, c2c_pwi_org_source_type_source_id_unique, is dropped by
-- THIS file and created by no other file on any applier, so the drop has no
-- create-then-drop ordering hazard. PostgreSQL 15+ (production: 15.4).
-- Proof: tests/db/correspondence-work-items.dbtest.ts;
-- docs/evidence/D2/2026-09-29-correspondence-work-items/.
--
-- History of the original purpose, unchanged:
--
-- upsertProjectWorkItem uses a read-then-write pattern:
--   1. SELECT on (source_type, source_id, org_id)
--   2. UPDATE if found, else INSERT
--
-- Between step 1 and step 2, another request can insert the same row, causing:
--   - Two rows with the same dedup key
--   - Or a constraint violation on the next upsert
--
-- A UNIQUE constraint enforces the dedup at the database level. Later, the code
-- should switch to INSERT ... ON CONFLICT DO UPDATE to make it atomic.
--
-- Idempotent: re-run on every deploy (Rule 1). It replaces the narrow key once,
-- and adds the widened one only if absent.

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.c2c_project_work_items'::regclass
       AND conname = 'c2c_pwi_org_source_type_source_id_unique'
  ) THEN
    ALTER TABLE c2c_project_work_items
      DROP CONSTRAINT c2c_pwi_org_source_type_source_id_unique;
    RAISE NOTICE '[20260810] dropped the narrow key (org_id, source_type, source_id)';
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.c2c_project_work_items'::regclass
       AND conname = 'c2c_pwi_org_source_key_unique'
  ) THEN
    RAISE NOTICE '[20260810] c2c_pwi_org_source_key_unique already present; skipping';
  ELSE
    -- Refuse, rather than silently pick a survivor, if rows already collide.
    IF EXISTS (
      SELECT 1 FROM c2c_project_work_items
      GROUP BY org_id, source_type, source_id, source_ref
      HAVING COUNT(*) > 1
    ) THEN
      RAISE EXCEPTION
        'c2c_project_work_items has rows with duplicate (org_id, source_type, source_id, source_ref) keys. '
        'These must be cleaned up manually before this migration can apply: '
        'review the duplicates and decide which to keep/merge.';
    END IF;

    ALTER TABLE c2c_project_work_items
      ADD CONSTRAINT c2c_pwi_org_source_key_unique
      UNIQUE NULLS NOT DISTINCT (org_id, source_type, source_id, source_ref);

    RAISE NOTICE '[20260810] added c2c_pwi_org_source_key_unique on (org_id, source_type, source_id, source_ref) NULLS NOT DISTINCT';
  END IF;
END $$;

COMMIT;
