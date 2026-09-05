-- ═══════════════════════════════════════════════════════════════════════════
-- Remove five policies that key on a session GUC the application never sets.
--
-- db/migrations/20260220_ind_section_tracking.sql created one policy per
-- IND section-tracking table:
--
--     CREATE POLICY <table>_org_policy ON <table>
--       USING (organization_id = current_setting('app.organization_id', true)::integer);
--
-- `app.organization_id` is set NOWHERE in the application. The runtime sets
-- `app.current_tenant_id` (integer org id) and `app.current_org_id` (org uuid);
-- the only other occurrence of the string in the tree is a SQL column alias in
-- server/routes/ind.ts. So this policy has never granted access to anybody.
--
-- ── What it actually costs, measured rather than assumed ────────────────────
-- It is NOT a functional outage. These tables also carry the canonical
-- tenant_isolation_policy from the sweep, and PostgreSQL ORs PERMISSIVE
-- policies together, so a correctly scoped read is already served by that one.
-- Verified on a provisioned database with a seeded row, as the non-superuser
-- app_service role with app.rls_enforce=on:
--
--     app.current_tenant_id=1 (its own org) -> 1 row visible
--     app.current_tenant_id=2 (another org) -> 0 rows visible
--
-- The cost is the CAST. `current_setting(..., true)` returns NULL when the GUC
-- is unset, and NULL::integer is fine — but an EMPTY STRING is not, and both
-- policy expressions are evaluated for every query regardless of which one
-- grants. So the moment anything does `set_config('app.organization_id', '', …)`
-- — exactly the `?? ''` shape that already exists elsewhere for the org uuid,
-- see establishRequestTenantScope.ts — all five tables fail:
--
--     SET app.organization_id = '';
--     SELECT count(*) FROM project_sections;
--     ERROR:  invalid input syntax for type integer: ""   (22P02)
--
-- Reproduced against the live database before writing this. It is the same
-- unguarded-cast landmine that 20260821_uuid_org_guc_cast_heal.sql defused for
-- app.current_org_id, in a GUC that no longer has any reader.
--
-- ── Why DROP rather than repair the expression ─────────────────────────────
-- Repairing it would produce a second policy saying exactly what
-- tenant_isolation_policy already says — a parallel implementation of the same
-- rule, which is what the sweep exists to make unnecessary. Dropping a
-- PERMISSIVE policy can only ever REMOVE access, never add it, so this cannot
-- widen anyone's visibility.
--
-- Idempotent, and refuses to leave a table unpoliced: each drop happens only
-- when the canonical tenant_isolation_policy is present on that table, and only
-- when the policy still references the orphaned GUC (so a future repaired
-- policy of the same name is left alone).
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t            text;
  policy_name  text;
  expr         text;
  dropped      int := 0;
  skipped      int := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'project_milestones',
    'project_notifications',
    'project_sections',
    'section_comments',
    'section_status_log'
  ] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;

    policy_name := t || '_org_policy';

    SELECT pg_get_expr(p.polqual, p.polrelid)
      INTO expr
      FROM pg_policy p
     WHERE p.polrelid = ('public.' || t)::regclass
       AND p.polname  = policy_name;

    -- Already gone, or replaced by something that is not the orphaned form.
    IF expr IS NULL OR position('app.organization_id' in expr) = 0 THEN
      CONTINUE;
    END IF;

    -- Never drop the only thing standing between this table and an open read.
    IF NOT EXISTS (
      SELECT 1 FROM pg_policy p
       WHERE p.polrelid = ('public.' || t)::regclass
         AND p.polname  = 'tenant_isolation_policy'
    ) THEN
      RAISE NOTICE
        '[orphaned-guc] keeping %.% — canonical tenant_isolation_policy is absent, '
        'so dropping this would leave the table with no tenant predicate. '
        'Run the tenant-isolation sweep first.', t, policy_name;
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    EXECUTE format('DROP POLICY %I ON public.%I', policy_name, t);
    dropped := dropped + 1;
  END LOOP;

  RAISE NOTICE '[orphaned-guc] dropped % policy(ies), skipped %.', dropped, skipped;
END $$;
