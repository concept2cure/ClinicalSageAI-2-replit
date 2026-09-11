-- ─────────────────────────────────────────────────────────────────────────────
-- charter_audit_events: 21 CFR Part 11 §11.10(e) append-only enforcement
--
-- 2026-09-11 — WO-15 finding 3.
--
-- WHAT THIS FIXES, precisely.
--
-- The work order's headline said the charter tables "may not exist". That is
-- wrong, and the work order now records the correction. All five —
-- project_charters, charter_sections, timeline_phases, project_commitments and
-- charter_audit_events — are declared in shared/schema/project-charter.ts
-- (projectCharters:76, charterSections:183, timelinePhases:248,
-- projectCommitments:323, charterAuditEvents:446), so `drizzle-kit push`
-- creates all five on every install-fresh run. The tables are fine.
--
-- What is NOT fine is the immutability enforcement. Drizzle cannot express a
-- trigger. charter_audit_events_no_update and charter_audit_events_no_delete
-- existed ONLY in migrations/20260629_charter_tables_rebuild.sql, which is on
-- install-fresh's overlay and on NO replaying applier. A database built or
-- maintained by deploy-migrate — the only automated path that touches a
-- populated database — has the audit table and none of its protection. Rows in
-- it are UPDATE-able and DELETE-able, silently.
--
-- WHY THIS FILE EXISTS INSTEAD OF ADDING 20260629 TO THE SET.
--
-- Adding 20260629 was tried first and was wrong, for a reason its own live-
-- database verification could not surface:
--
--   * 20260629 is NOT self-contained. It has five `REFERENCES
--     project_charters(id)` clauses and does not create project_charters —
--     that table comes from drizzle push, and no file in C2C_MIGRATION_FILES
--     creates it. Applying the set in order against a database that has not
--     been pushed fails at the first FK with `relation "project_charters" does
--     not exist`. tests/schema-contract/tenant-isolation-sweep.contract.test.ts
--     C-33 does exactly that and caught it. The live-database proof passed only
--     because c2c_testdb already carried project_charters from install-fresh,
--     so it could not expose a dependency the set does not satisfy.
--
--   * Its 367 lines contribute nothing else. Every table it creates is
--     `CREATE TABLE IF NOT EXISTS` against a table drizzle push has already
--     made, so on any real database all of that DDL no-ops. The function and
--     the two triggers below are the entire delta. Putting the rest on the
--     replaying applier would add a second, independent definition of four
--     tables whose authority is the Drizzle schema — the duplicate-table-DDL
--     divergence this repo already tracks — in exchange for nothing.
--
-- So the trigger definitions are lifted here verbatim and 20260629 stays where
-- it is, on install-fresh only, where it is harmless and already satisfied.
--
-- NEVER add migrations/20260611_drop_charter_staging_tables.sql to the set. It
-- DROPs three of these tables; under RULE 1 replay that destroys their contents
-- on every deploy, green.
--
-- REPLAY SAFETY. `CREATE OR REPLACE FUNCTION` is idempotent. Each trigger is
-- dropped and recreated in the same file, which is this repo's idempotent
-- re-create idiom and what check-migration-drop-safety.mjs recognises at line
-- 245. Re-running this file changes nothing and destroys nothing.
--
-- THE GUARD, and what it does and does not claim. The triggers are installed
-- only when charter_audit_events exists. On a database where it does not, there
-- is no audit table to protect and this file raises a NOTICE and installs
-- nothing. That is a genuine no-op, not a suppressed failure: it makes no claim
-- that the protection is in place. Nothing in the repository reads these
-- triggers or reports charter audit immutability to a user — verified by
-- grepping all of ts/js/mjs/sql for the trigger and function names — so there
-- is no surface that could report protection that is absent. If such a surface
-- is ever built, it must probe pg_trigger and report a third state, not assume
-- this migration ran.
-- ─────────────────────────────────────────────────────────────────────────────

BEGIN;

-- Blocks UPDATE and DELETE on charter_audit_events at the row level.
-- Belt-and-braces with the role-grant REVOKE (which targets the app role); this
-- trigger fires regardless of the role attempting the change, including
-- accidental superuser writes. The audit trail is intentionally not modifiable
-- through normal application surfaces — repair scenarios require an explicit,
-- documented break-glass that disables the trigger inside a logged transaction.

CREATE OR REPLACE FUNCTION charter_audit_events_block_mutation()
RETURNS TRIGGER AS $fn$
BEGIN
  RAISE EXCEPTION
    'charter_audit_events is append-only (§11.10(e)); % blocked', TG_OP
    USING ERRCODE = 'check_violation';
END;
$fn$ LANGUAGE plpgsql;

DO $guard$
BEGIN
  IF to_regclass('public.charter_audit_events') IS NULL THEN
    RAISE NOTICE
      'charter_audit_events does not exist; Part 11 append-only triggers NOT installed. No claim of immutability is made for this database.';
    RETURN;
  END IF;

  EXECUTE 'DROP TRIGGER IF EXISTS charter_audit_events_no_update ON charter_audit_events';
  EXECUTE 'CREATE TRIGGER charter_audit_events_no_update '
       || 'BEFORE UPDATE ON charter_audit_events '
       || 'FOR EACH ROW EXECUTE FUNCTION charter_audit_events_block_mutation()';

  EXECUTE 'DROP TRIGGER IF EXISTS charter_audit_events_no_delete ON charter_audit_events';
  EXECUTE 'CREATE TRIGGER charter_audit_events_no_delete '
       || 'BEFORE DELETE ON charter_audit_events '
       || 'FOR EACH ROW EXECUTE FUNCTION charter_audit_events_block_mutation()';
END
$guard$;

COMMIT;
