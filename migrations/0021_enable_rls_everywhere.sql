-- 0021_enable_rls_everywhere.sql
--
-- Enable Row-Level Security and install the uniform tenant-isolation policy
-- on every table that has an `organization_id`, `org_id`, or `tenant_id`
-- column AND is not in the allowlist.
--
-- ────────────────────────────────────────────────────────────────────────
-- Policy shape (single policy, applies to ALL operations):
--
--   USING (
--     -- Shadow-mode bypass: when app.rls_enforce != 'on', everything passes.
--     -- Lets us land the migration without flipping behavior; flip is a
--     -- one-line env change (RLS_ENFORCE=on) plus a pool restart.
--     NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
--
--     -- Tenant match — accepts either session var name. Required because
--     -- the existing middleware sets BOTH app.current_tenant_id (integer
--     -- org id) and app.current_org_id (uuid). Tenant tables key on the
--     -- integer, so we cast both to int and OR them.
--     OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
--     OR organization_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
--
--     -- Super-admin escape hatch. Set on the connection by tooling that
--     -- legitimately spans tenants (admin dashboards, billing reports,
--     -- the memory-consolidation cron's outer scan).
--     OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
--   )
--
-- Tables keyed on `org_id` or `tenant_id` instead of `organization_id` get
-- the same shape with the column name substituted.
--
-- ────────────────────────────────────────────────────────────────────────
-- Why FORCE ROW LEVEL SECURITY:
--
-- On Neon, the app's login role IS the table owner. Postgres skips RLS for
-- table owners by default — meaning plain `ENABLE ROW LEVEL SECURITY` would
-- compile but be silently ineffective for every query our app makes. FORCE
-- closes that hole.
--
-- ────────────────────────────────────────────────────────────────────────
-- Allowlist (pinned from server/db/rlsAllowlist.ts; see CI gate
-- scripts/ci/check-rls-allowlist-sync.mjs which fails on drift):
--
--   organization_users      — middleware reads it before scope is set
--   __drizzle_migrations    — defensive
--   stripe_events           — nullable org_id, webhook arrival
--   billing_budgets         — cross-org admin tooling
--   billing_alerts          — cross-org admin tooling
--   api_keys                — super-admin revocation tooling
--
-- ────────────────────────────────────────────────────────────────────────
-- Idempotency: re-running this migration is safe. ENABLE/FORCE are no-ops
-- if already on; CREATE POLICY uses a guard query to skip already-existing
-- policies of the same name.
--
-- Reversal: 0021_disable_rls_everywhere_rollback.sql ships alongside.

BEGIN;

DO $$
DECLARE
  rec RECORD;
  policy_name CONSTANT text := 'tenant_isolation_policy';

  allowlist CONSTANT text[] := ARRAY[
    'organization_users',
    '__drizzle_migrations',
    'stripe_events',
    'billing_budgets',
    'billing_alerts',
    'api_keys'
  ];

  policy_sql text;
  applied_count INT := 0;
  skipped_allowlist INT := 0;
  skipped_drift INT := 0;
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
    ORDER BY table_schema, table_name, column_name
  LOOP
    -- Skip allowlist
    IF rec.table_name = ANY (allowlist) THEN
      skipped_allowlist := skipped_allowlist + 1;
      RAISE NOTICE '[rls] skipped %.% (allowlist)', rec.table_schema, rec.table_name;
      CONTINUE;
    END IF;

    -- Refuse to attach a policy to a non-integer column. 0020 should have
    -- coerced these. If we still see a TEXT column, fail loud — silent
    -- type cast failures inside RLS are exactly the failure mode this
    -- whole rollout is designed to avoid.
    IF rec.data_type NOT IN ('integer', 'bigint', 'smallint') THEN
      skipped_drift := skipped_drift + 1;
      RAISE EXCEPTION
        '[rls] %.% column % has type % — run 0020_coerce_text_tenant_columns.sql first',
        rec.table_schema, rec.table_name, rec.column_name, rec.data_type;
    END IF;

    -- Enable + force. Both idempotent.
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                   rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
                   rec.table_schema, rec.table_name);

    -- Drop and recreate policy so column-name changes (a table that moves
    -- from `tenant_id` to `org_id`, etc.) are picked up on re-run.
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   policy_name, rec.table_schema, rec.table_name);

    policy_sql := format(
      $f$
        CREATE POLICY %I ON %I.%I
          FOR ALL
          USING (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR %I = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
          WITH CHECK (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR %I = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR %I = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
      $f$,
      policy_name,
      rec.table_schema, rec.table_name,
      rec.column_name, rec.column_name,  -- USING
      rec.column_name, rec.column_name   -- WITH CHECK
    );

    EXECUTE policy_sql;

    applied_count := applied_count + 1;
    RAISE NOTICE '[rls] applied %.%(%)', rec.table_schema, rec.table_name, rec.column_name;
  END LOOP;

  RAISE NOTICE '[rls] summary: applied=%, allowlist_skipped=%, drift_aborted=%',
    applied_count, skipped_allowlist, skipped_drift;
END
$$;

COMMIT;
