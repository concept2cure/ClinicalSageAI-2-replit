-- 0021_disable_rls_everywhere.sql (rollback)
--
-- Rollback companion to migrations/0021_enable_rls_everywhere.sql.
--
-- Drops the tenant_isolation_policy from every table that has it, then
-- DISABLEs row-level security on those tables. Idempotent.
--
-- Lives in scripts/db-rollback/ rather than migrations/ for two reasons:
--   1. The 4-digit prefix collision CI gate would flag two `0021_*` files.
--   2. Any tool that applies migrations/*.sql in order would otherwise
--      undo this migration immediately after applying it.
--
-- Before running this, switch the app off enforcement first
-- (RLS_ENFORCE=off) and recycle the pool — that way the policy stops
-- filtering BEFORE you start dropping it, eliminating the race where a
-- query runs against a half-dropped policy.
--
-- Run with:
--   psql "$DATABASE_URL" -f scripts/db-rollback/0021_disable_rls_everywhere.sql

BEGIN;

DO $$
DECLARE
  rec RECORD;
  policy_name CONSTANT text := 'tenant_isolation_policy';
  dropped_count INT := 0;
BEGIN
  FOR rec IN
    SELECT schemaname, tablename
    FROM pg_policies
    WHERE policyname = policy_name
    ORDER BY schemaname, tablename
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   policy_name, rec.schemaname, rec.tablename);
    EXECUTE format('ALTER TABLE %I.%I NO FORCE ROW LEVEL SECURITY',
                   rec.schemaname, rec.tablename);
    EXECUTE format('ALTER TABLE %I.%I DISABLE ROW LEVEL SECURITY',
                   rec.schemaname, rec.tablename);
    dropped_count := dropped_count + 1;
    RAISE NOTICE '[rls-rollback] reverted %.%', rec.schemaname, rec.tablename;
  END LOOP;

  RAISE NOTICE '[rls-rollback] summary: reverted=%', dropped_count;
END
$$;

COMMIT;
