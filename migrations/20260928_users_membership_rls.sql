-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(d) limiting access, 11.300 controls for
--             identification codes/passwords), ALCOA+ principles
-- Purpose: A tenant scope reaches only its own organization's user accounts.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (the accounts behind every signature and edit)
--   - Integrity Risk Addressed: tenant isolation — any tenant scope read every
--     account's password hash, MFA secret, backup codes, reset token and OTP
--     hash, and could rewrite them
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; RLS, policies and one read-only function. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-28. Evidence: docs/evidence/D3/2026-09-28-users-rls/.
-- =============================================================================
--
-- AMENDED IN PLACE 2026-10-04 (Rule 1; D3, the pre-auth narrowing; evidence
-- docs/evidence/D3/2026-10-04-pre-auth-narrowing/). REMOVED: the "tenant-less
-- scopes" arm (app.current_tenant_id = '0'), which admitted the pre-auth scope
-- to every row of the table. The system scope never needed it — it carries the
-- platform role, and the platform-role arm admits it. In its place: the
-- ACCOUNT arm, users.id = app.current_account_id, which the server sets only for
-- the one account a pre-auth request has established (a verified token, a
-- signed challenge, or the account found for this sign-in;
-- server/db/tenantStore.ts bindPreAuthAccount / runAsAccount). ADDED:
-- public.user_id_for_reset_token(text), so a password reset finds its account
-- by the token's hash without reading the table. A pre-auth request reaches at
-- most one account's row, and a handler steered to another id reads nothing.
-- The variable is app.current_account_id, not app.current_user_id: the latter
-- is already a uuid in the gcc identity layer (db/migrations/051-081, function
-- current_user_id()), and an integer in it raised 22P02 there.
-- The description below is updated to match.
--
-- public.users carried no row-level security. Measured as app_service with RLS
-- enforcing, in tenant A's request scope: tenant B's user row was read by id, by
-- email and by scanning on mfa_secret — password_hash, mfa_secret,
-- mfa_backup_codes, reset_token, email_otp_hash — and B's password hash and MFA
-- secret were overwritten.
--
-- The policy reads membership, the row that already decides tenancy
-- (public.organization_users; authMiddleware admits a token for an organization
-- on exactly one row of it). organization_users' SELECT is open (its own policy,
-- 20260926_organization_users_own_writes.sql), so the sub-select neither recurses
-- nor is narrowed.
--
--   - SELECT, UPDATE, DELETE: enforcement off (owner connections: migrations, the
--     boot seed), OR the platform role (the system scope — SCIM, SAML just-in-time
--     provisioning, platform user administration, server/db/tenantStore.ts), OR a
--     membership of the row's user in the scope's organization, OR the row is the
--     account the scope is bound to (app.current_account_id: the pre-auth scope once
--     the server has established which account the request is — sign-in, signup,
--     password reset, email OTP, token refresh, and every request holding a
--     verified access token on the pre-auth mounts).
--   - INSERT: from any scope. A new row reaches no existing account, and
--     tenant-users creates a member in the tenant scope before its membership
--     exists (server/services/atomicQuotaService.js, which takes the id from the
--     sequence first because RETURNING is held to the SELECT policy).
--   - public.user_id_for_reset_token(text): the pre-auth scope's question for a
--     password reset — which account holds this (hashed) reset token. The id only.
--   - public.user_id_for_email(text): the one question a tenant scope must ask
--     about an account outside it — "does this address already have an account"
--     — when an administrator adds a member (an existing account in another
--     organization gets a consent invitation, not a membership). It answers with
--     the id only; no other column crosses. SECURITY DEFINER with the platform
--     role set for its own body, so it answers on any owner.
--
-- users is not org-keyed, so neither the tenant sweep nor its heal pass touches
-- it, and the policy names are its own. RLS is enabled and FORCEd.
--
-- Converges on every run: ALTER POLICY when a policy exists, CREATE when it does
-- not; CREATE OR REPLACE for the function. Nothing is dropped (Rule 1).

-- AMENDED IN PLACE 2026-09-29 (Rule 1): this function was created
-- unconditionally, and a LANGUAGE sql body is validated when it is created, so
-- a database without public.users would halt the set here. Guarded like the
-- block below; the same defect in 20260928_invitations_for_member.sql turned
-- tests/schema-contract/tenant-isolation-sweep.contract.test.ts red.
DO $do$
BEGIN
  IF to_regclass('public.users') IS NULL THEN
    RAISE NOTICE '[users-membership-rls] user_id_for_email skipped — public.users not provisioned';
    RETURN;
  END IF;
  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.user_id_for_email(p_email text)
    RETURNS integer
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    SET app.current_user_role = 'app_super_admin'
    AS $body$
      SELECT id FROM public.users WHERE email = p_email
    $body$
  $fn$;
  REVOKE ALL ON FUNCTION public.user_id_for_email(text) FROM PUBLIC;

  -- Added 2026-10-04 (see the amendment note above). Guarded on the column:
  -- a LANGUAGE sql body is validated at creation.
  IF EXISTS (SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'reset_token') THEN
    EXECUTE $fn$
      CREATE OR REPLACE FUNCTION public.user_id_for_reset_token(p_token_hash text)
      RETURNS integer
      LANGUAGE sql
      STABLE
      SECURITY DEFINER
      SET search_path = pg_catalog, public
      SET app.current_user_role = 'app_super_admin'
      AS $body$
        SELECT id FROM public.users WHERE reset_token = p_token_hash AND p_token_hash IS NOT NULL
      $body$
    $fn$;
    REVOKE ALL ON FUNCTION public.user_id_for_reset_token(text) FROM PUBLIC;
  END IF;
END
$do$;

DO $$
DECLARE
  off        CONSTANT text := $e$(NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')$e$;
  account    CONSTANT text := $e$(users.id = (substring(current_setting('app.current_account_id', true) from '^[0-9]+$'))::integer)$e$;
  super      CONSTANT text := $e$(current_setting('app.current_user_role', true) = 'app_super_admin')$e$;
  member     CONSTANT text := $e$(EXISTS (
    SELECT 1 FROM public.organization_users ou
     WHERE ou.user_id = users.id
       AND (ou.organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer
            OR ou.organization_id = (substring(current_setting('app.current_org_id', true) from '^[0-9]+$'))::integer)
  ))$e$;
  may_reach text;
  p RECORD;
BEGIN
  IF to_regclass('public.users') IS NULL OR to_regclass('public.organization_users') IS NULL THEN
    RAISE NOTICE '[users-membership-rls] skipped — public.users or public.organization_users not provisioned';
    RETURN;
  END IF;

  may_reach := format('(%s OR %s OR %s OR %s)', off, super, member, account);

  ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.users FORCE ROW LEVEL SECURITY;

  FOR p IN
    SELECT * FROM (VALUES
      ('users_member_read',   'SELECT', may_reach, NULL),
      ('users_any_insert',    'INSERT', NULL,      '(true)'),
      ('users_member_update', 'UPDATE', may_reach, may_reach),
      ('users_member_delete', 'DELETE', may_reach, NULL)
    ) AS v(name, cmd, using_expr, check_expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'users' AND policyname = p.name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.users%s%s', p.name,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.users FOR %s%s%s', p.name, p.cmd,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.user_id_for_email(text) TO app_service;
    IF to_regprocedure('public.user_id_for_reset_token(text)') IS NOT NULL THEN
      GRANT EXECUTE ON FUNCTION public.user_id_for_reset_token(text) TO app_service;
    END IF;
  END IF;

  RAISE NOTICE '[users-membership-rls] tenant scopes reach their own members, a pre-auth scope its one bound account, the system scope the whole table';
END
$$;
