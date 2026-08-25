-- ============================================================================
-- RLS coverage for research-administration tables created after 0021
-- ============================================================================
--
-- 0021_enable_rls_everywhere.sql is a ONE-TIME DO-block over the tables that
-- existed when it ran. Every research-compliance / sponsored-programs table was
-- created in later migrations (20260610–20260612), so none of them received the
-- tenant_isolation_policy — they have NO database-level tenant backstop, relying
-- solely on each query's explicit `WHERE organization_id = $1`.
--
-- This re-applies the SAME policy (identical shape: shadow-mode kill switch via
-- app.rls_enforce, numeric match on app.current_tenant_id / app.current_org_id,
-- super-admin bypass) + ENABLE + FORCE ROW LEVEL SECURITY, scoped to org-scoped
-- tables that do NOT already carry the policy. Idempotent and safe: enforcement
-- stays OFF (shadow mode) until app.rls_enforce='on', so behavior is unchanged
-- until the platform flips enforcement on.
--
-- Verified by scripts/db-verify/verify-rls.ts.
-- ============================================================================

BEGIN;

DO $$
DECLARE
  rec RECORD;
  policy_name CONSTANT text := 'tenant_isolation_policy';
  allowlist CONSTANT text[] := ARRAY[
    'organization_users', '__drizzle_migrations', 'stripe_events',
    'billing_budgets', 'billing_alerts', 'api_keys'
  ];
  applied_count INT := 0;
BEGIN
  FOR rec IN
    SELECT c.table_schema, c.table_name, c.column_name, c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
      -- Only BASE TABLES: ALTER TABLE ... ENABLE ROW LEVEL SECURITY errors on a
      -- view/matview (a tenant-scoped view inherits isolation from its base
      -- tables). Without this a view like v_fact_drift_candidates aborts the run.
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = c.table_schema
          AND t.table_name = c.table_name
          AND t.table_type = 'BASE TABLE'
      )
      -- Only tables not already covered by 0021 (i.e. created afterwards).
      AND NOT EXISTS (
        SELECT 1 FROM pg_policies p
        WHERE p.schemaname = c.table_schema AND p.tablename = c.table_name AND p.policyname = policy_name
      )
    ORDER BY c.table_schema, c.table_name, c.column_name
  LOOP
    IF rec.table_name = ANY (allowlist) THEN CONTINUE; END IF;
    -- Match 0021: refuse non-integer tenant columns (silent cast failure is the
    -- exact hazard RLS rollout guards against).
    IF rec.data_type NOT IN ('integer', 'bigint', 'smallint') THEN
      RAISE EXCEPTION '[rls] %.% column % is % — coerce to integer before enabling RLS',
        rec.table_schema, rec.table_name, rec.column_name, rec.data_type;
    END IF;

    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY', rec.table_schema, rec.table_name);
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', policy_name, rec.table_schema, rec.table_name);
    EXECUTE format(
      $f$
        CREATE POLICY %I ON %I.%I
          FOR ALL
          USING (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR %I = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
          WITH CHECK (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR %I = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
      $f$,
      policy_name, rec.table_schema, rec.table_name,
      rec.column_name, rec.column_name, rec.column_name, rec.column_name
    );
    applied_count := applied_count + 1;
    RAISE NOTICE '[rls] covered %.%(%)', rec.table_schema, rec.table_name, rec.column_name;
  END LOOP;
  RAISE NOTICE '[rls] research-admin backfill: % tables newly covered', applied_count;
END $$;

COMMIT;
