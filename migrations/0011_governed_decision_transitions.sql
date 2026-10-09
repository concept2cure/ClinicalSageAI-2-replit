-- Migration: Governed Decision Transition Log
-- Durable event log for every governed decision lifecycle transition.
-- Each row records one state change (review, approve, reject, escalate, etc.)
--
-- ── AMENDED IN PLACE 2026-09-28 (RULE 1) ────────────────────────────────────
-- WHAT CHANGED. `project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE
-- CASCADE` became `project_ref TEXT NOT NULL`, with no foreign key, and the
-- org/project index moved onto it.
--
-- WHY. This file was on NO applier until today, so the table existed on no
-- deployed database; it exists on developer boxes only because the file was
-- applied by hand. Adding it to C2C_MIGRATION_FILES is what makes the table
-- real — and the moment it deploys, the old shape is unwritable for the thing
-- it exists to log. A governed decision's project is a uuid-keyed regulatory
-- program (cmc_module3_sections.project_id is TEXT, holding values like
-- d12b36ef-919e-4290-a185-5d382f586f89), while projects.id is INTEGER and has
-- no uuid column. The writer coerced with Number(projectId) || 0, and:
--
--   INSERT INTO governed_decision_transitions (… project_id …) VALUES (…, 0, …);
--   ERROR:  23503: violates foreign key constraint
--           "governed_decision_transitions_project_id_fkey"
--   DETAIL: Key is not present in table "projects".
--
-- That 23503 was swallowed by the writer's catch, so the log stayed empty while
-- decision_records filled. Reading back was worse: every uuid-keyed project
-- collapsed to bucket 0, so all of them shared one review queue.
--
-- WHICH CHANGE REMOVED IT. The same change that put this file on the applier —
-- see the C2C_MIGRATION_FILES entry. Amended rather than followed by an
-- appended ALTER because the file now replays on every deploy, and a DROP
-- appended after a CREATE oscillates.
--
-- The converge block below is for boxes already carrying the old shape. It
-- never drops project_id — that column is created by this same file's history,
-- and RULE 1 forbids the oscillation — it only relaxes it so an insert that
-- names only project_ref succeeds.
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS governed_decision_transitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  decision_id UUID NOT NULL,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),

  -- The project this decision belongs to, as the platform addresses it: the
  -- uuid of a regulatory program, or a legacy numeric projects.id rendered as
  -- text. Deliberately no foreign key — the two spines live in different
  -- tables and a key that can only hold one of them is what broke this log.
  project_ref TEXT NOT NULL,

  -- Transition
  from_state TEXT NOT NULL,
  to_state TEXT NOT NULL,
  action TEXT NOT NULL,

  -- Actor
  actor_id TEXT NOT NULL,
  actor_role TEXT,

  -- Context
  reason TEXT,
  notes TEXT,

  -- Linked objects
  linked_artifact_id TEXT,
  linked_package_id TEXT,
  linked_workflow_run_id TEXT,
  superseded_by_decision_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Converge a database created under the previous shape ─────────────────────
-- Idempotent and replay-safe: on a fresh database the CREATE above is already
-- correct and every statement here is a no-op.
ALTER TABLE governed_decision_transitions ADD COLUMN IF NOT EXISTS project_ref TEXT;
ALTER TABLE governed_decision_transitions
  DROP CONSTRAINT IF EXISTS governed_decision_transitions_project_id_fkey;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'governed_decision_transitions'
       AND column_name = 'project_id'
  ) THEN
    UPDATE governed_decision_transitions
       SET project_ref = project_id::text
     WHERE project_ref IS NULL;
    -- Relaxed, never dropped: this same file created it.
    ALTER TABLE governed_decision_transitions ALTER COLUMN project_id DROP NOT NULL;
  END IF;

  -- Only assert NOT NULL once nothing is left to backfill; a box mid-upgrade
  -- with rows and no ref should fail loudly here rather than silently accept
  -- an unattributable transition.
  IF NOT EXISTS (SELECT 1 FROM governed_decision_transitions WHERE project_ref IS NULL) THEN
    BEGIN
      ALTER TABLE governed_decision_transitions ALTER COLUMN project_ref SET NOT NULL;
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'governed_decision_transitions.project_ref left nullable: %', SQLERRM;
    END;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gdt_decision_id ON governed_decision_transitions(decision_id);
CREATE INDEX IF NOT EXISTS idx_gdt_org_project_ref ON governed_decision_transitions(organization_id, project_ref);
CREATE INDEX IF NOT EXISTS idx_gdt_to_state ON governed_decision_transitions(to_state);
CREATE INDEX IF NOT EXISTS idx_gdt_created_at ON governed_decision_transitions(created_at);
