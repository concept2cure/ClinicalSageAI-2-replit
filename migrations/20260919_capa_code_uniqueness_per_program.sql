-- CAPA / complaint / MDR display codes: unique PER PROGRAM, not globally.
--
-- The companion half of an in-place amendment to
-- migrations/20260504_capa_mdr.sql (see its dated header note). That file
-- created complaints_code_uq, mdr_events_code_uq and capa_records_code_uq on
-- the code column alone, while nextCode() in
-- server/services/capa-mdr/capaMdr.service.ts GENERATES those codes per
-- program: it counts `WHERE program_id = $1` and formats CAPA-<year>-0001.
-- So the second program in the deployment to open its first CAPA of a year
-- receives a code that already exists and the insert fails 23505. Proven
-- against the live schema before this file was written: two inserts differing
-- only in program_id, the second rejected by capa_records_code_uq.
--
-- WHY THIS FILE EXISTS AS WELL AS THE AMENDMENT. The creator is applied by the
-- raw migrations/ overlay (install-fresh step 3) and is NOT a member of
-- C2C_MIGRATION_FILES, so amending it alone fixes only databases provisioned
-- from scratch AFTER the amendment. Every already-provisioned database keeps
-- the old single-column index forever. This file is in the set, so it runs on
-- every deploy and converts them.
--
-- WHY THE CONDITIONAL, AND WHY THIS IS NOT THE DROP CLAUDE.md RULE 1 FORBIDS.
-- Rule 1's hazard is a DROP that replays against a creator that re-creates the
-- object, in either order. Here each statement is guarded on the LIVE index
-- definition — it acts only on an index that is still the old single-column
-- shape. On a fresh install the amended creator already produced the two-column
-- shape and every branch below is skipped; on a converted database they are
-- skipped too. So this is idempotent under the set's unconditional re-execution
-- and cannot fight the creator in either ordering. It is a one-way conversion,
-- not a recurring drop.
--
-- mdr_events_fda_report_uq and mdr_events_eu_report_uq are deliberately NOT
-- touched: FDA and EU authorities issue those numbers, and they must stay
-- unique across the whole deployment.

BEGIN;

DO $capa_code_uq$
DECLARE
  t record;
  live text;
BEGIN
  FOR t IN
    SELECT * FROM (VALUES
      ('complaints',   'complaints_code_uq',   'complaint_code'),
      ('mdr_events',   'mdr_events_code_uq',   'mdr_code'),
      ('capa_records', 'capa_records_code_uq', 'capa_code')
    ) AS v(tbl, idx, col)
  LOOP
    -- Absent table (a database that never got the overlay) or absent index:
    -- nothing to convert. The creator owns creation; this file only converts.
    IF to_regclass('public.' || t.tbl) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT indexdef INTO live
      FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = t.tbl AND indexname = t.idx;

    IF live IS NULL THEN
      CONTINUE;
    END IF;

    -- Already the per-program shape? Leave it alone. This is the branch that
    -- makes the file a no-op on every deploy after the first, and on every
    -- fresh install.
    IF live LIKE '%(program_id, ' || t.col || ')%' THEN
      CONTINUE;
    END IF;

    -- A duplicate code across two programs is exactly what the old index made
    -- impossible, so widening the key can never fail on existing data. A
    -- duplicate WITHIN one program would, and is handled in the EXCEPTION
    -- branch below rather than aborting a deploy on a data condition only an
    -- operator can resolve.
    EXECUTE format('DROP INDEX IF EXISTS public.%I', t.idx);
    BEGIN
      EXECUTE format(
        'CREATE UNIQUE INDEX %I ON public.%I (program_id, %I)', t.idx, t.tbl, t.col);
      RAISE NOTICE
        '[20260919] %: converted to UNIQUE (program_id, %) — was globally unique on % alone',
        t.idx, t.col, t.col;
    EXCEPTION WHEN unique_violation THEN
      -- Two rows in ONE program already share a code. The old global index
      -- could not have allowed it, so this means the data predates it or was
      -- loaded around it. Restore the old index so the table is never left
      -- without a uniqueness guarantee, and make the condition loud.
      EXECUTE format(
        'CREATE UNIQUE INDEX IF NOT EXISTS %I ON public.%I (%I)', t.idx, t.tbl, t.col);
      RAISE WARNING
        '[20260919] %: NOT converted — duplicate % within a single program_id. '
        'Old global index restored. Renumber the duplicates, then redeploy.',
        t.idx, t.col;
    END;
  END LOOP;
END
$capa_code_uq$;

COMMIT;
