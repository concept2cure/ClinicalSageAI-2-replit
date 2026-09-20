-- project_charters — the 21 declared columns no applier ever created.
--
-- 2026-09-17 — WO-15 finding 2.
--
-- ── The gap ─────────────────────────────────────────────────────────────────
-- server/routes/charters.ts issues an UNQUALIFIED Drizzle select:
--
--     const rows = await d.select().from(projectCharters).where(…)
--
-- which expands to every column shared/schema/project-charter.ts names. The
-- declaration names 48 physical columns; migrations/0012_project_charter_
-- timeline.sql — the only creator of this table anywhere in the repository —
-- makes 27. Twenty-one do not exist, so that statement raises 42703 on every
-- database. Executed against a canonically provisioned one:
--
--     ERROR: column "pma_config" does not exist
--
-- server/routes/pma-workflow-routes.ts is worse, because it uses raw SQL and
-- names the column explicitly three times — SELECT (:71), UPDATE (:34) and
-- INSERT (:43). The PMA workflow-progress feature cannot work anywhere.
--
-- ── Why push does not save it ───────────────────────────────────────────────
-- It is natural to assume drizzle-kit push creates this table from the
-- declaration. IT DOES NOT, and an earlier note in this work order said it did;
-- that note is corrected alongside this file. drizzle.config.ts names three
-- entrypoints — shared/schema.ts, shared/schema/ana-intelligence.ts,
-- shared/schema/report-os.ts. shared/schema/project-charter.ts is re-exported
-- only from shared/schema/index.ts, which is NOT an entrypoint and is not
-- reachable from one. The charter tables are outside the push surface entirely.
--
-- So 0012, on install-fresh's step-3 overlay, is what every database actually
-- gets — and nothing in C2C_MIGRATION_FILES has ever created or altered this
-- table, which is why the gap is permanent rather than transient.
--
-- ── What this adds ──────────────────────────────────────────────────────────
-- The 21 missing columns, with the types the declaration asks for, plus the one
-- declared index that targets them (proj_charter_stage_idx on
-- development_stage; the other four already exist). Nothing is invented: every
-- name and type below is read off shared/schema/project-charter.ts.
--
-- NOT converged here, and recorded rather than silently changed: the 27 columns
-- 0012 already makes use jsonb and `timestamp` where the declaration says json
-- and timestamptz. 0012's own comment (line 94) acknowledges that divergence.
-- Retyping live columns is a rewrite with data implications, not an additive
-- fix, and belongs to WO-1's schema-authority work. The new columns below match
-- the declaration; the old ones keep their shapes.
--
-- Replay-safe: every statement is ADD COLUMN IF NOT EXISTS / CREATE INDEX IF
-- NOT EXISTS, guarded on the table existing. Re-running changes nothing.
-- `version` takes NOT NULL with a DEFAULT, which Postgres applies without a
-- table rewrite and which is safe on a populated table.

DO $charter_cols$
BEGIN
  IF to_regclass('public.project_charters') IS NULL THEN
    RAISE NOTICE 'project_charters absent; declared columns not added.';
    RETURN;
  END IF;

  -- Regulatory routing.
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS fda_division            TEXT;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS fda_branch              TEXT;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS therapeutic_area        TEXT;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS development_stage       TEXT;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS secondary_product_codes JSON;

  -- Per-pathway configuration blocks. pma_config is the one raw SQL names.
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS ind_config              JSON;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS nda_config              JSON;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS bla_config              JSON;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS k510_config             JSON;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS pma_config              JSON;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS de_novo_config          JSON;

  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS team_assignments        JSON;

  -- Integrity / versioning.
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS content_hash            TEXT;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS version                 INTEGER NOT NULL DEFAULT 1;

  -- Review and approval trail.
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS review_requested_by     INTEGER;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS review_requested_at     TIMESTAMPTZ;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS approved_by_role        TEXT;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS approval_comment        TEXT;

  -- Lock state.
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS locked_at               TIMESTAMPTZ;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS locked_by               INTEGER;
  ALTER TABLE project_charters ADD COLUMN IF NOT EXISTS locked_reason           TEXT;

  -- The one declared index whose column did not exist until now.
  CREATE INDEX IF NOT EXISTS proj_charter_stage_idx ON project_charters (development_stage);
END
$charter_cols$;
