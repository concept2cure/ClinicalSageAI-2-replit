-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(d) limiting system access to authorized
--             individuals, 11.10(g) authority checks), ALCOA+ principles
-- Purpose: A platform role is granted, changed and revoked by the platform
--          scope only.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (who may operate every tenant's consoles)
--   - Integrity Risk Addressed: privilege escalation — any tenant scope could
--     write its own member a super_admin platform grant
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; RLS and policies only. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-28. Evidence:
--     docs/evidence/D3/2026-09-28-platform-role-grants/.
-- =============================================================================
--
-- public.platform_role_grants decides "platform operator": requirePlatformAdmin,
-- requireBusinessAdmin and the master-admin entitlement (server/services/
-- entitlements/master-admin.ts) admit a user on one active row of it, to every
-- cross-tenant console. It carried no row-level security and app_service may
-- write it. Measured as app_service in a plain member's tenant scope: a
-- super_admin grant was written for that member, and the Access Management
-- console's own gate then admitted the member's token (200); the same scope
-- reinstated a revoked grant, re-roled another user's and deleted one.
--
--   - SELECT: open. The platform-admin check runs in the caller's own tenant
--     scope (behind authenticateToken), for a caller who may belong to any
--     organization, so it must see the caller's row from any scope.
--   - INSERT, UPDATE, DELETE: the platform scope (app_super_admin) only. The one
--     application writer, the Access Management console
--     (server/routes/admin/access-management.ts, mounted at /api/admin/access,
--     a SYSTEM_SCOPE_PREFIXES entry), runs in it.
--   - Connections the application does not configure carry no app.rls_enforce
--     (server/db/rlsEnforcement.ts), so migrations, seeds and owner-side
--     tooling pass as before.
--
-- The table has no tenant column, so neither the sweep nor its heal pass
-- touches it; the policy names are its own. RLS is enabled and FORCEd.
--
-- Converges on every run: ALTER POLICY when a policy exists, CREATE when it does
-- not. Nothing is dropped (Rule 1).

DO $$
DECLARE
  off   CONSTANT text := $e$(NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')$e$;
  super CONSTANT text := $e$(current_setting('app.current_user_role', true) = 'app_super_admin')$e$;
  platform_only text;
  p RECORD;
BEGIN
  IF to_regclass('public.platform_role_grants') IS NULL THEN
    RAISE NOTICE '[platform-role-grants-writes] skipped — public.platform_role_grants not provisioned';
    RETURN;
  END IF;

  platform_only := format('(%s OR %s)', off, super);

  ALTER TABLE public.platform_role_grants ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.platform_role_grants FORCE ROW LEVEL SECURITY;

  FOR p IN
    SELECT * FROM (VALUES
      ('platform_role_grants_read',            'SELECT', '(true)',      NULL),
      ('platform_role_grants_platform_insert', 'INSERT', NULL,          platform_only),
      ('platform_role_grants_platform_update', 'UPDATE', platform_only, platform_only),
      ('platform_role_grants_platform_delete', 'DELETE', platform_only, NULL)
    ) AS v(name, cmd, using_expr, check_expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'platform_role_grants' AND policyname = p.name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.platform_role_grants%s%s', p.name,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.platform_role_grants FOR %s%s%s', p.name, p.cmd,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    END IF;
  END LOOP;

  RAISE NOTICE '[platform-role-grants-writes] reads open; grants written by the platform scope only';
END
$$;
