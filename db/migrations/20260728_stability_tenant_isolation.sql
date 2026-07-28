-- ═══════════════════════════════════════════════════════════════════════════════
-- Migration: Stability module tenant isolation (High-severity security fix)
-- Date: 2026-07-28
-- Finding: docs/security/STABILITY_TENANT_ISOLATION_FINDING.md
--
-- WHY THIS EXISTS
-- server/src/routes/stability.router.ts scoped its GMP stability data by opaque
-- surrogate ids (study_id / capa_id / assign_id / result_id) with NO tenant
-- predicate, and its set_config('app.tenant_id', …) calls were inert: the app's
-- real RLS keys on app.current_tenant_id (see migrations/0021_enable_rls_everywhere.sql),
-- NOT app.tenant_id, and no policy referenced the stab_* tables at all. A caller who
-- knew/guessed another tenant's study_id could read and update that tenant's rows.
--
-- WHAT THIS DOES
-- Brings every EXISTING stab_* base table under the SAME uniform tenant-isolation
-- policy the rest of the app already uses (0021). For each such table it:
--   1. adds an INTEGER tenant_id column if missing (0021 refuses non-integer keys),
--   2. sets its DEFAULT to the request's tenant, so the router's INSERTs — which omit
--      tenant_id — auto-populate it from the connection's app.current_tenant_id
--      (the tenant-scoped connection facade in stability.router.ts sets that var),
--   3. ENABLE + FORCE ROW LEVEL SECURITY (FORCE because on Neon the app login role
--      owns the tables and would otherwise skip RLS), and
--   4. installs the identical `tenant_isolation_policy` shape as 0021 (shadow-mode
--      bypass on app.rls_enforce, integer tenant match on app.current_tenant_id /
--      app.current_org_id, app_super_admin escape hatch).
--
-- SCOPE / SEQUENCING
-- Only tables that already exist are touched (dynamic catalog scan). The seven
-- unbacked stab_* tables (stab_assignments/capa/chain/excursions/protocols/samples/
-- signoffs) and cmc_methods 500 today (fail-safe, no leak) and are created WITH this
-- isolation in a follow-up migration; a re-run of this file then covers them too.
-- cmc_methods is deliberately NOT swept here: it is joined as a shared methods catalog
-- (by id, never tenant-filtered), so its tenancy is decided when it is backed.
--
-- PRE-EXISTING UNTAGGED ROWS: any stab_* rows created before this migration have
-- tenant_id NULL and, once RLS enforces (RLS_ENFORCE=on), become invisible to every
-- tenant — the correct fail-closed outcome on a GMP surface (data that was never
-- tenant-tagged must not leak). New rows auto-tag via the DEFAULT.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, ENABLE/FORCE are no-ops if already set, the
-- policy is DROP-then-CREATE. Safe to re-run on the applier path.
--
-- ROLLBACK: scripts/db-rollback style — DROP POLICY tenant_isolation_policy on each
-- stab_* table and ALTER … NO FORCE / DISABLE ROW LEVEL SECURITY. (tenant_id columns
-- are left in place; dropping them is not reversible-safe.)
-- ═══════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $$
DECLARE
  rec RECORD;
  policy_name CONSTANT text := 'tenant_isolation_policy';
  applied INT := 0;
BEGIN
  FOR rec IN
    SELECT t.table_schema, t.table_name
    FROM information_schema.tables t
    WHERE t.table_type = 'BASE TABLE'
      AND t.table_schema NOT IN ('pg_catalog', 'information_schema')
      -- every stability table; cmc_methods intentionally excluded (shared catalog,
      -- tenancy decided when it is backed).
      AND t.table_name LIKE 'stab\_%' ESCAPE '\'
    ORDER BY t.table_schema, t.table_name
  LOOP
    -- 1. integer tenant key + 2. request-derived default
    EXECUTE format('ALTER TABLE %I.%I ADD COLUMN IF NOT EXISTS tenant_id INTEGER',
                   rec.table_schema, rec.table_name);
    EXECUTE format(
      $d$ALTER TABLE %I.%I ALTER COLUMN tenant_id
          SET DEFAULT NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT$d$,
      rec.table_schema, rec.table_name);

    -- 3. enable + force (both idempotent)
    EXECUTE format('ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
                   rec.table_schema, rec.table_name);
    EXECUTE format('ALTER TABLE %I.%I FORCE ROW LEVEL SECURITY',
                   rec.table_schema, rec.table_name);

    -- 4. the uniform policy — identical shape to 0021_enable_rls_everywhere.sql
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I',
                   policy_name, rec.table_schema, rec.table_name);
    EXECUTE format(
      $f$
        CREATE POLICY %I ON %I.%I
          FOR ALL
          USING (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR tenant_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
          WITH CHECK (
            NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
            OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
            OR tenant_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
            OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
          )
      $f$,
      policy_name, rec.table_schema, rec.table_name
    );

    applied := applied + 1;
    RAISE NOTICE '[stab-rls] isolated %.%', rec.table_schema, rec.table_name;
  END LOOP;

  RAISE NOTICE '[stab-rls] tenant isolation applied to % stab_* table(s)', applied;
END
$$;

COMMIT;
