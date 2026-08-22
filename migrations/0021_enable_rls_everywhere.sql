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
--     -- integer.
--     --
--     -- ── The org-id clause used to make every tenant query throw ──────────
--     -- It was written `NULLIF(current_setting('app.current_org_id', TRUE), '')::INT`,
--     -- casting the org UUID to INT. PostgreSQL does not guarantee OR
--     -- short-circuiting, so for any row the earlier disjuncts do not satisfy,
--     -- that cast IS evaluated and the query dies with
--     --     ERROR: invalid input syntax for type integer: "d0211565-…"
--     -- — every read and every write of every integer tenant-keyed table, on
--     -- any connection carrying a real request scope, in EVERY RLS mode (the
--     -- shadow bypass above is just another disjunct; it does not stop the cast
--     -- being evaluated). It stayed invisible because RLS only filters for a
--     -- connection that is neither a superuser nor the table's owner, so nothing
--     -- evaluates the policy until the split role is in use — and because every
--     -- test that sets these GUCs sets app.current_org_id to '' — the one value
--     -- that avoids it. It surfaces the moment the runtime uses the non-superuser
--     -- app_service role, which production requires.
--     --
--     -- `substring(… from '^[0-9]+$')` EXTRACTS an integer instead of casting
--     -- whatever is there: NULL for a uuid (so the disjunct is simply not
--     -- satisfied), the integer when there genuinely is one. Nothing that
--     -- worked before stops working; the clause is fixed, not removed, because
--     -- narrowing an RLS policy is a security change and this is only meant to
--     -- stop it crashing.
--     OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
--     OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
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
  -- ── ONE tenant column per table, chosen by precedence ───────────────────
  --
  -- This SELECT used to yield a table ONCE PER MATCHING COLUMN, and the loop
  -- below does DROP POLICY IF EXISTS + CREATE POLICY on each pass. So on a
  -- table carrying more than one tenant column the LAST one alphabetically
  -- silently overwrote the earlier policy — `tenant_id` beat `organization_id`
  -- every time.
  --
  -- Six tables have that shape, and on all six `organization_id`/`org_id` is
  -- the NOT NULL column every writer stamps while `tenant_id` is a NULLABLE
  -- adapter column added by db/migrations/20260401_cmc_convergence_os.sql:
  --
  --   stability_studies, cmc_batch_records, cmc_comparability_assessments,
  --   cmc_documents, multi_agency_validation_sessions, c2c_bla_assessments
  --
  -- Policing the adapter column does not leak — it fails the other way, and
  -- worse than it sounds. Under RLS_ENFORCE=on the predicate compares a column
  -- that is NULL on every row, so `NULL = <tenant>` is NULL, no row passes:
  -- every read returns zero rows and every INSERT is refused with "new row
  -- violates row-level security policy". The CMC stability surface is simply
  -- dead in production, and nothing said so, because a policy COUNT and a
  -- coverage check both see a policed table and report it green.
  --
  -- DISTINCT ON with an explicit precedence fixes it: organization_id, then
  -- org_id, then tenant_id — the same order server/db/rlsEnforcement.ts and
  -- scripts/db/rls-coverage-check.sql already read them in. One row per table
  -- also means the drop/recreate below runs once, not once per column.
  FOR rec IN
    SELECT DISTINCT ON (c.table_schema, c.table_name)
      c.table_schema,
      c.table_name,
      c.column_name,
      c.data_type
    FROM information_schema.columns c
    WHERE c.table_schema NOT IN ('pg_catalog', 'information_schema')
      AND c.column_name IN ('organization_id', 'org_id', 'tenant_id')
      -- Only BASE TABLES: information_schema.columns also lists VIEW columns, and
      -- ALTER TABLE ... ENABLE ROW LEVEL SECURITY errors on a view/matview. A
      -- tenant-scoped VIEW inherits isolation from its underlying tables, so
      -- skipping it here is correct, not a gap. (Without this filter a view such
      -- as v_fact_drift_candidates aborts the whole rollout.)
      AND EXISTS (
        SELECT 1 FROM information_schema.tables t
        WHERE t.table_schema = c.table_schema
          AND t.table_name = c.table_name
          AND t.table_type = 'BASE TABLE'
      )
    ORDER BY
      c.table_schema,
      c.table_name,
      CASE c.column_name
        WHEN 'organization_id' THEN 1
        WHEN 'org_id'          THEN 2
        WHEN 'tenant_id'       THEN 3
        ELSE 4
      END
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
