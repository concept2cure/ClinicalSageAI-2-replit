-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A membership is written by its own organization or the platform,
--          and a platform-staff role only by the platform.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (who belongs to which tenant, behind every module)
--   - Integrity Risk Addressed: tenant isolation — any tenant scope could place
--     its user in another tenant, and mint platform staff in its own
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; RLS and policies only. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-26. Evidence: docs/evidence/D3/2026-09-26-memberships/.
-- =============================================================================
--
-- public.organization_users decides tenancy: authMiddleware (server/auth.ts)
-- accepts a token for an organization on exactly one row of it, and "platform
-- staff" is a staff role on that row. It carried no RLS and app_service may
-- write it. Measured as app_service in a MEMBER's tenant scope: its user was
-- written an `admin` membership in another tenant, and the production auth
-- gate then admitted a token for that tenant; the same scope made its own
-- member super_admin.
--
-- It stays on RLS_ALLOWLIST (server/db/rlsAllowlist.ts and its three synced
-- copies), which exempts it from the READ policy the sweeps attach: the
-- membership check runs pre-auth and a user's organization list reads across
-- organizations. The allowlist's heal pass drops only a policy named
-- tenant_isolation_policy, so the names below are safe from it.
--
--   - SELECT: open, as the allowlist requires.
--   - INSERT, UPDATE, DELETE: the row's own tenant, or the platform scope
--     (app_super_admin) — the canonical expression keyed on organization_id.
--   - A staff role (super_admin, superadmin, platform_admin, app_super_admin)
--     is MINTED only from the platform scope — a trigger, not WITH CHECK,
--     because WITH CHECK cannot see the old row and would refuse ANY write to an
--     existing staff member's row (a persona change). The trigger refuses an
--     INSERT of a staff role, or an UPDATE that changes a role TO one, unless
--     the scope is app_super_admin or enforcement is off (owner connections).
--     No application writer produces a staff role (every one is limited to
--     admin/manager/member/viewer); a tenant that could would reach every
--     system-scoped staff path (server/middleware/staffCrossOrgScope.ts).
--
-- Writers moved into the right scope in the same change (they ran in a scope
-- that is not the membership's organization, and this policy refuses that):
-- self-serve signup (pre-auth scope; now switches its transaction to the new
-- organization before inserting the first membership, as the workspace step
-- after it already did), PUT /api/users/me/persona (pre-auth scope; now in the
-- verified token's own organization), and tenant-users' create / role change /
-- removal for an administrator acting on another organization they administer
-- (now in that organization's scope, after the existing admin check).
--
-- Connections the application does not configure carry no app.rls_enforce
-- (server/db/rlsEnforcement.ts sets it per runtime connection), so migrations
-- and the owner-side bootstrap pass the shadow clause, and the trigger, as before.
--
-- Converges on every run: ALTER POLICY when a policy exists, CREATE when it
-- does not. Nothing is dropped (Rule 1).
--
-- AMENDED IN PLACE 2026-10-30 (Rule 1; D6, P-72 slice 1a; evidence
-- docs/evidence/D6-PLATFORM-SCOPE/2026-10-29/slice-1a/). ADDED: the CHECK
-- organization_users_role_known, last in this file. organization_users.role
-- had no CHECK, so any writer the policies admit could store any string. A
-- scope whose role string was 'app_super_admin' wrote that string onto its own
-- membership: the trigger above reads the setting, so it let it through
-- (slice 0, item 5). Every later sign-in then minted the platform role. Now the
-- column admits:
--   - the roles an administrator assigns (shared/constants/org-roles.ts
--     ASSIGNABLE_ORG_ROLES);
--   - the legacy organization roles the server still reads on memberships
--     (owner, editor: server/middleware/auth.ts ORG_ROLE_FUNCTIONAL_GRANTS);
--   - the staff spellings the trigger above guards (super_admin, superadmin,
--     platform_admin);
--   - any other value a database already holds when this runs, so no existing
--     row stops being writable.
-- It never admits 'app_super_admin', from any writer, owner and superuser
-- included. The constraint is added NOT VALID and validated only once every row
-- passes, so a row that already holds a refused value cannot fail the deploy.
-- A warning names such rows. The replacement is conditional on the stored
-- definition (pg_get_constraintdef), so a second run changes nothing (Rule 1's
-- corollary).

CREATE OR REPLACE FUNCTION public.organization_users_staff_role_platform_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.role IN ('super_admin', 'superadmin', 'platform_admin', 'app_super_admin')
     AND (TG_OP = 'INSERT' OR OLD.role IS DISTINCT FROM NEW.role)
     AND NULLIF(current_setting('app.rls_enforce', true), '') = 'on'
     AND current_setting('app.current_user_role', true) IS DISTINCT FROM 'app_super_admin' THEN
    RAISE EXCEPTION 'a platform-staff role is granted by the platform scope only (organization %, role %)',
      NEW.organization_id, NEW.role
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'See docs/evidence/D3/2026-09-26-memberships/.';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
DECLARE
  off   CONSTANT text := $e$(NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')$e$;
  super CONSTANT text := $e$(current_setting('app.current_user_role', true) = 'app_super_admin')$e$;
  own   CONSTANT text := $e$(
    organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer
    OR organization_id = (substring(current_setting('app.current_org_id', true) from '^[0-9]+$'))::integer
  )$e$;
  may_touch text;
  p RECORD;
BEGIN
  IF to_regclass('public.organization_users') IS NULL THEN
    RAISE NOTICE '[organization-users-writes] skipped — public.organization_users not provisioned';
    RETURN;
  END IF;

  may_touch := format('(%s OR %s OR %s)', off, super, own);

  ALTER TABLE public.organization_users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.organization_users FORCE ROW LEVEL SECURITY;

  FOR p IN
    SELECT * FROM (VALUES
      ('organization_users_read',       'SELECT', '(true)',  NULL),
      ('organization_users_own_insert', 'INSERT', NULL,      may_touch),
      ('organization_users_own_update', 'UPDATE', may_touch, may_touch),
      ('organization_users_own_delete', 'DELETE', may_touch, NULL)
    ) AS v(name, cmd, using_expr, check_expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'organization_users' AND policyname = p.name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.organization_users%s%s', p.name,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.organization_users FOR %s%s%s', p.name, p.cmd,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.organization_users'::regclass
       AND tgname = 'organization_users_staff_role_platform_only'
  ) THEN
    CREATE TRIGGER organization_users_staff_role_platform_only
      BEFORE INSERT OR UPDATE OF role ON public.organization_users
      FOR EACH ROW EXECUTE FUNCTION public.organization_users_staff_role_platform_only();
  END IF;

  RAISE NOTICE '[organization-users-writes] own-org or platform writes; staff roles minted by the platform only';
END
$$;

-- Added 2026-10-30 (P-72 slice 1a; see the amendment note in the header).
DO $role_known$
DECLARE
  -- What the column admits whatever a database holds. Never 'app_super_admin'.
  v_known   CONSTANT text[] := ARRAY[
    'admin', 'approver', 'manager', 'reviewer', 'member', 'viewer',   -- ASSIGNABLE_ORG_ROLES
    'owner', 'editor',                                                -- legacy organization roles still read
    'super_admin', 'superadmin', 'platform_admin'                     -- the staff spellings the trigger guards
  ];
  v_held    text[];
  v_admit   text[];
  v_def     text;
  v_have    text[];
  v_valid   boolean;
  v_refused integer;
BEGIN
  IF to_regclass('public.organization_users') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'organization_users' AND column_name = 'role') THEN
    RAISE NOTICE '[organization-users-writes] role check skipped — public.organization_users.role not provisioned';
    RETURN;
  END IF;

  -- Values rows already hold (organization_users' read policy is open, so the
  -- applier sees every row on any owner). Kept writable, except the platform role
  -- in any case or padding (the request scope refuses those spellings too:
  -- server/db/tenantStore.ts isPlatformScopeRole).
  SELECT array_agg(DISTINCT u.role) INTO v_held
    FROM public.organization_users u
   WHERE u.role IS NOT NULL AND lower(btrim(u.role)) <> 'app_super_admin' AND NOT (u.role = ANY (v_known));
  SELECT array_agg(DISTINCT r ORDER BY r) INTO v_admit FROM unnest(v_known || COALESCE(v_held, '{}')) AS r;

  SELECT pg_get_constraintdef(c.oid), c.convalidated INTO v_def, v_valid
    FROM pg_constraint c
   WHERE c.conrelid = 'public.organization_users'::regclass AND c.conname = 'organization_users_role_known';
  IF v_def IS NOT NULL THEN
    SELECT array_agg(DISTINCT m[1] ORDER BY m[1]) INTO v_have FROM regexp_matches(v_def, '''([^'']*)''', 'g') AS m;
  END IF;

  IF v_def IS NULL OR v_have IS DISTINCT FROM v_admit THEN
    EXECUTE format(
      'ALTER TABLE public.organization_users DROP CONSTRAINT IF EXISTS organization_users_role_known, '
      'ADD CONSTRAINT organization_users_role_known CHECK (role IN (%s)) NOT VALID',
      (SELECT string_agg(quote_literal(r), ', ' ORDER BY r) FROM unnest(v_admit) AS r));
    v_valid := false;
    IF v_held IS NOT NULL THEN
      RAISE WARNING '[organization-users-writes] organization_users_role_known also admits % (held by existing rows, kept writable)', v_held;
    END IF;
  END IF;

  IF NOT v_valid THEN
    SELECT count(*) INTO v_refused FROM public.organization_users u WHERE NOT (u.role = ANY (v_admit));
    IF v_refused = 0 THEN
      ALTER TABLE public.organization_users VALIDATE CONSTRAINT organization_users_role_known;
    ELSE
      RAISE WARNING '[organization-users-writes] % membership row(s) hold the platform role (app_super_admin, in any case or padding); the check stays NOT VALID and refuses any write to them that keeps that role, until an administrator corrects it', v_refused;
    END IF;
  END IF;
END
$role_known$;
