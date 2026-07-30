-- ============================================================================
-- 20260730_project_milestones_reconciliation.sql
--
-- Blank-DB provisioning audit 2026-07-30 (ledger C-29 context): the deploy
-- path halted at db/migrations/20260220_ind_section_tracking.sql with
-- `column "target_date" does not exist`.
--
-- project_milestones has TWO rival definitions:
--   - the 0000 baseline / shared/schema.ts shape (id serial, name, due_date
--     NOT NULL, completed_at/by, priority, notify_days) — the shape every
--     push- or baseline-provisioned database actually has; zero live SQL
--     consumers of its distinctive columns;
--   - the 20260220_ind_section_tracking shape (title, milestone_type,
--     target_date NOT NULL, actual_date, linked_sections, owner_id,
--     metadata) — whose CREATE TABLE IF NOT EXISTS no-ops against the
--     baseline table, so its CREATE INDEX ON (target_date) halts the run.
--
-- The one live SQL consumer (server/routes/project-sections.ts) STRADDLES
-- both: it INSERTs (organization_id, project_id, name, description,
-- target_date, linked_sections, created_by) — name from the baseline shape,
-- target_date/linked_sections from 20260220, created_by from NEITHER. The
-- feature is therefore broken on every real database today.
--
-- This file lands the additive UNION on whatever shape exists, and MUST be
-- ordered immediately BEFORE 20260220 in the apply set so that file's
-- indexes find their columns. All guarded and idempotent; due_date's NOT
-- NULL is dropped (guarded) because the live INSERT does not provide it.
-- ============================================================================

ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS target_date     TIMESTAMP;
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS actual_date     TIMESTAMP;
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS milestone_type  TEXT DEFAULT 'deadline';
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS linked_sections TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS owner_id        INTEGER REFERENCES users(id);
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS metadata        JSONB DEFAULT '{}';
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS created_by      INTEGER REFERENCES users(id);
-- The 20260220-created shape lacks the baseline's name column (it has title);
-- the live INSERT provides name, so land it on that shape too.
ALTER TABLE IF EXISTS project_milestones ADD COLUMN IF NOT EXISTS name            TEXT;

DO $$
BEGIN
  -- The baseline shape's due_date is NOT NULL, but the live INSERT does not
  -- provide it — every milestone create 23502-failed on baseline databases.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_milestones'
      AND column_name = 'due_date' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE project_milestones ALTER COLUMN due_date DROP NOT NULL;
  END IF;

  -- Same for 20260220's target_date NOT NULL on databases that got that
  -- shape: baseline-era rows (and any writer that omits it) must not be
  -- blocked; the union treats both date columns as optional.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_milestones'
      AND column_name = 'target_date' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE project_milestones ALTER COLUMN target_date DROP NOT NULL;
  END IF;

  -- And 20260220's title NOT NULL, which the live INSERT (name-based) omits.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'project_milestones'
      AND column_name = 'title' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE project_milestones ALTER COLUMN title DROP NOT NULL;
  END IF;
END $$;
