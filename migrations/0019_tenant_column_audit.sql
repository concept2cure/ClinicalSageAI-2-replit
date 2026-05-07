-- 0019_tenant_column_audit.sql
--
-- Tenant-column type drift audit (PR A of the RLS rollout).
--
-- This migration does NOT modify any table. It walks information_schema and
-- emits a NOTICE for every column named organization_id / org_id / tenant_id
-- whose data type is not the canonical INTEGER / BIGINT, then for each such
-- column it counts the number of existing rows whose value cannot be cast to
-- integer.
--
-- The output of `migrate` will surface these NOTICEs in the migrator log.
-- We use them to triage which tables need a TEXT->INTEGER conversion before
-- PR B (which writes the uniform RLS policy with `current_setting(...)::int`
-- comparisons).
--
-- This migration is idempotent and side-effect free: it can be re-run at any
-- time and is safe to land before PR B without risk of breaking production.
--
-- Known drifted columns at time of authoring (2026-05-07):
--   - shared/schema.ts: gap_analysis_results.organization_id (text)
--   - shared/schema.ts: multi_agency_validation_sessions.tenant_id (text)
--   - shared/cmc-schema.ts: cmc_projects.organization_id (text)
--   - shared/cmc-schema.ts: workflow_templates.organization_id (text)

DO $$
DECLARE
  rec RECORD;
  bad_count BIGINT;
  total_count BIGINT;
  drift_total INT := 0;
BEGIN
  FOR rec IN
    SELECT
      table_schema,
      table_name,
      column_name,
      data_type
    FROM information_schema.columns
    WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
      AND column_name IN ('organization_id', 'org_id', 'tenant_id')
      AND data_type NOT IN ('integer', 'bigint', 'smallint')
    ORDER BY table_schema, table_name, column_name
  LOOP
    drift_total := drift_total + 1;

    EXECUTE format(
      'SELECT COUNT(*) FROM %I.%I',
      rec.table_schema, rec.table_name
    ) INTO total_count;

    -- Count rows whose value does not match a signed integer literal. We
    -- intentionally do NOT use ::integer here because a bad cast would abort
    -- the whole DO block; the regex check is safe.
    EXECUTE format(
      $f$
        SELECT COUNT(*) FROM %I.%I
        WHERE %I IS NOT NULL
          AND %I::text !~ '^-?[0-9]+$'
      $f$,
      rec.table_schema, rec.table_name, rec.column_name, rec.column_name
    ) INTO bad_count;

    RAISE NOTICE
      '[tenant-column-audit] %.% column % is type % (expected integer); rows=% non_numeric_values=%',
      rec.table_schema, rec.table_name, rec.column_name, rec.data_type, total_count, bad_count;
  END LOOP;

  IF drift_total = 0 THEN
    RAISE NOTICE '[tenant-column-audit] no tenant-column type drift detected';
  ELSE
    RAISE NOTICE
      '[tenant-column-audit] % tenant column(s) need INTEGER conversion before RLS policy ships',
      drift_total;
  END IF;
END
$$;
