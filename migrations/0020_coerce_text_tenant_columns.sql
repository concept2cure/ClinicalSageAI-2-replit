-- 0020_coerce_text_tenant_columns.sql
--
-- Convert TEXT-typed tenant columns to INTEGER so PR B's RLS policy can use
-- a single `current_setting(...)::int` comparison instead of branching on
-- column type per table.
--
-- Surfaced by 0019_tenant_column_audit.sql:
--   gap_analysis_results.organization_id           text → integer
--   cmc_projects.organization_id                   text → integer
--   workflow_templates.organization_id             text → integer
--   multi_agency_validation_sessions.tenant_id     text → integer
--
-- Safety: every column is checked first for non-numeric values. If ANY value
-- in ANY of the four columns cannot cast to integer, the migration RAISEs an
-- exception inside the transaction — the BEGIN/COMMIT wrapper rolls back so
-- the database is not left in a partial state. The error message names the
-- column and the count, so triage starts with concrete data.
--
-- Idempotent: each ALTER is gated on the column still being TEXT. Re-running
-- after a successful run is a no-op.
--
-- Deferred follow-up (NOT in this migration):
--   The Drizzle schema files (`shared/schema.ts`, `shared/cmc-schema.ts`)
--   still declare these columns as `text(...)`. Runtime is unaffected because
--   the pg driver accepts string values for integer parameters. The TS-side
--   cleanup (~100 call sites) ships in a follow-up PR.

BEGIN;

DO $$
DECLARE
  bad_count BIGINT;

  -- (table, column) pairs to coerce. Keep in sync with the audit migration.
  drift_targets CONSTANT text[][] := ARRAY[
    ARRAY['gap_analysis_results',          'organization_id'],
    ARRAY['cmc_projects',                  'organization_id'],
    ARRAY['workflow_templates',            'organization_id'],
    ARRAY['multi_agency_validation_sessions', 'tenant_id']
  ];

  rec text[];
  tbl text;
  col text;
  current_type text;
BEGIN
  -- Phase 1: validate every targeted column. If any fails, abort the whole
  -- migration before mutating schema.
  FOREACH rec SLICE 1 IN ARRAY drift_targets LOOP
    tbl := rec[1];
    col := rec[2];

    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = tbl
      AND column_name = col;

    IF current_type IS NULL THEN
      RAISE NOTICE '[type-coerce] %.%  not present; skipping', tbl, col;
      CONTINUE;
    END IF;

    IF current_type IN ('integer', 'bigint', 'smallint') THEN
      RAISE NOTICE '[type-coerce] %.%  already %; skipping', tbl, col, current_type;
      CONTINUE;
    END IF;

    EXECUTE format(
      $f$
        SELECT COUNT(*) FROM %I
        WHERE %I IS NOT NULL
          AND %I::text !~ '^-?[0-9]+$'
      $f$,
      tbl, col, col
    ) INTO bad_count;

    IF bad_count > 0 THEN
      RAISE EXCEPTION
        '[type-coerce] %.% has % non-numeric value(s); cannot cast to integer. Triage the data, then re-run.',
        tbl, col, bad_count;
    END IF;

    RAISE NOTICE '[type-coerce] %.%  validated (% rows clean), proceeding', tbl, col,
      (SELECT COUNT(*) FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = tbl);
  END LOOP;

  -- Phase 2: apply the ALTERs. Reached only if every column passed phase 1.
  FOREACH rec SLICE 1 IN ARRAY drift_targets LOOP
    tbl := rec[1];
    col := rec[2];

    SELECT data_type INTO current_type
    FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = tbl
      AND column_name = col;

    IF current_type IS NULL OR current_type IN ('integer', 'bigint', 'smallint') THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE %I ALTER COLUMN %I TYPE integer USING %I::integer',
      tbl, col, col
    );

    RAISE NOTICE '[type-coerce] altered %.%  → integer', tbl, col;
  END LOOP;
END
$$;

COMMIT;
