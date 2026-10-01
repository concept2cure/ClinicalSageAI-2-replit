-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: An organization's row is updated or deleted only by that
--          organization's own scope or the platform (system) scope.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (tenant identity behind every module)
--   - Integrity Risk Addressed: tenant isolation — any tenant scope could
--     rewrite any organization's tier, seats, settings, Stripe ids and API key
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; RLS and policies only. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-26. Evidence:
--     docs/evidence/D3/2026-09-26-organizations-writes/.
-- =============================================================================
--
-- public.organizations carried no RLS and the runtime role may write it. Its
-- tenant key (id, uuid) has been immutable since
-- 20260925_organizations_tenant_key_immutable.sql; this states who may write
-- the rest of the row. Measured as app_service with app.rls_enforce=on: tenant
-- A's scope UPDATEd tenant B's row.
--
--   - UPDATE, DELETE: the canonical tenant_isolation_policy expression the
--     public tables carry, keyed on `id` instead of organization_id — the
--     row's own tenant, or the platform scope (app_super_admin).
--   - SELECT, INSERT: deliberately open. Pre-auth lookups (slug, domain, API
--     key) read this table before any tenant exists, and signup creates an
--     organization before it has a scope. Narrowing reads is a separate change.
--
-- Landed together with its precondition: the five platform-staff override
-- paths that wrote ANOTHER organization's row from the staff member's own
-- request scope (organizations-routes.ts PATCH /:id/profile and /:id/settings;
-- tenant-config.ts's three super_admin branches) now open the system scope for
-- that request (server/middleware/staffCrossOrgScope.ts). Without that, this
-- policy made them write nothing — /:id/settings while answering success.
--
-- Connections the application does not configure carry no app.rls_enforce
-- (the runtime pool sets it per connection, server/db/rlsEnforcement.ts), so
-- migrations, the boot-time bootstrap and tenants-simple.ts's separate client
-- pass the shadow clause as before; FORCE changes nothing for them.
--
-- Converges on every run: ALTER POLICY when a policy exists, CREATE when it
-- does not. Nothing is dropped (Rule 1). Names are distinct from
-- tenant_isolation_policy, which the sweep's heal pass is allowed to drop.

DO $$
DECLARE
  own CONSTANT text := $e$(
    (NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')
    OR (id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer)
    OR (id = (substring(current_setting('app.current_org_id', true) from '^[0-9]+$'))::integer)
    OR (current_setting('app.current_user_role', true) = 'app_super_admin')
  )$e$;
  p RECORD;
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE NOTICE '[organizations-own-writes] skipped — public.organizations not provisioned';
    RETURN;
  END IF;

  ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.organizations FORCE ROW LEVEL SECURITY;

  FOR p IN
    SELECT * FROM (VALUES
      ('organizations_read',       'SELECT', '(true)', NULL),
      ('organizations_create',     'INSERT', NULL,     '(true)'),
      ('organizations_own_update', 'UPDATE', own,      own),
      ('organizations_own_delete', 'DELETE', own,      NULL)
    ) AS v(name, cmd, using_expr, check_expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'organizations' AND policyname = p.name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.organizations%s%s', p.name,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.organizations FOR %s%s%s', p.name, p.cmd,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    END IF;
  END LOOP;

  RAISE NOTICE '[organizations-own-writes] public.organizations: own-org or platform writes';
END
$$;
