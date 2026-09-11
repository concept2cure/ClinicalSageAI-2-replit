-- ─────────────────────────────────────────────────────────────────────────────
-- contradiction_consequence_log / contradiction_findings — column convergence
--
-- 2026-09-11 — WO-15 finding 7.
--
-- WHY THIS FILE IS NEEDED AT ALL.
--
-- db/migrations/20260323_assumption_decision_contradiction.sql was amended in
-- place on the same date to rename its `execution_notes` column to `notes` and
-- to drop a fabricated `detected_by` default. That amendment is necessary and
-- not sufficient: both columns live inside CREATE TABLE IF NOT EXISTS blocks,
-- and CREATE TABLE IF NOT EXISTS CONVERGES NOTHING — it never adds a column to,
-- or alters a column on, a table that already exists. A database that was built
-- with the old shape keeps it forever, replay after replay, green.
--
-- So the amendment fixes what a NEW database gets and this file fixes what an
-- EXISTING one has. Both are required; neither substitutes for the other.
--
-- WHICH DATABASES THIS ACTUALLY CHANGES — stated honestly, because the answer
-- is probably "none", and that is not a reason to omit it.
--
-- deploy-migrate refuses an unprovisioned database ("Missing base tables:
-- organizations, users, …"), so install-fresh provisions every database, and
-- its step-3 overlay applies all of migrations/*.sql — including
-- migrations/20260524_contradiction_engine_schema.sql, which creates
-- contradiction_consequence_log with `notes` and contradiction_findings with a
-- nullable `detected_by`. On every database provisioned that way, every
-- statement below is already satisfied and does nothing.
--
-- The path that leaves a database needing this file is 20260524 failing during
-- install-fresh — each overlay file is one transaction, so a failure skips the
-- whole file — after which 20260323 creates the tables from the set with the
-- old shape. That should not happen. "Should not happen" is not a guarantee,
-- the repair is four idempotent statements, and the alternative is a database
-- on which four of nine consequence writes raise 42703 into a catch block that
-- discards the error, forever, with nothing reading the table to reveal it.
--
-- WHAT IS NOT DONE HERE, and why.
--
--   * `execution_notes` is NOT dropped. RULE 1: it is created by a file in
--     C2C_MIGRATION_FILES, so a DROP would either revert on the next deploy or
--     re-drop after every re-create, destroying anything written between
--     deploys — green both ways. The amendment to 20260323 stops it being
--     created; on a database that already has it, it is backfilled from and
--     then left in place, empty of anything `notes` does not also hold.
--
--   * Existing `detected_by = 'system'` values are NOT nulled. They are wrong —
--     nothing recorded that attribution — but they are existing data, and
--     deleting data to correct a labelling error is not this file's call. The
--     default is removed so no NEW row acquires the claim, and
--     ContradictionFinding.detectedBy is typed `string | null` so a reader
--     cannot assume the column is populated.
--
-- REPLAY SAFETY. Every statement is guarded on the object existing and is
-- idempotent: ADD COLUMN IF NOT EXISTS, a backfill restricted to rows where the
-- target is still NULL, and DROP DEFAULT / DROP NOT NULL which are no-ops once
-- applied. Re-running changes nothing and destroys nothing.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

DO $conv$
BEGIN
  IF to_regclass('public.contradiction_consequence_log') IS NULL THEN
    RAISE NOTICE 'contradiction_consequence_log absent; nothing to converge.';
  ELSE
    -- The canonical free-text column. Absent only on a database built from the
    -- pre-amendment 20260323.
    EXECUTE 'ALTER TABLE contradiction_consequence_log '
         || 'ADD COLUMN IF NOT EXISTS notes TEXT';

    -- Carry across anything the old name holds. Restricted to rows where the
    -- canonical column is still empty, so a re-run cannot overwrite a later
    -- write, and skipped entirely when the old column was never created.
    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'contradiction_consequence_log'
        AND column_name  = 'execution_notes'
    ) THEN
      EXECUTE 'UPDATE contradiction_consequence_log '
           || 'SET notes = execution_notes '
           || 'WHERE notes IS NULL AND execution_notes IS NOT NULL';
    END IF;
  END IF;

  IF to_regclass('public.contradiction_findings') IS NULL THEN
    RAISE NOTICE 'contradiction_findings absent; nothing to converge.';
  ELSE
    -- No code writes detected_by. A DEFAULT 'system' would stamp every future
    -- finding with an attribution nothing recorded; NOT NULL would force it.
    -- Both go, so the column can honestly be empty. Already-stored values stay.
    EXECUTE 'ALTER TABLE contradiction_findings ALTER COLUMN detected_by DROP DEFAULT';
    EXECUTE 'ALTER TABLE contradiction_findings ALTER COLUMN detected_by DROP NOT NULL';
  END IF;
END
$conv$;

COMMIT;
