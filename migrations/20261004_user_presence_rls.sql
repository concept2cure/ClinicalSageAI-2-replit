-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(d) limiting access), ALCOA+ principles
-- Purpose: A person's presence — where they are in the product, from which
--          address and browser — reaches only their own organization's members.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (collaboration presence)
--   - Integrity Risk Addressed: tenant isolation — public.user_presence carried
--     no row-level security, so any scope could read every person's IP address,
--     user agent, current page and current document, and write them
--
-- Determinism Contract:
--   - No table shape change; RLS and policies only. Idempotent.
--
-- Notes:
--   - Row D3, 2026-10-04. Evidence: docs/evidence/D3/2026-10-04-user-presence/.
-- =============================================================================
--
-- The table has no reader or writer in server/, client/src/ or scripts/ yet, and
-- holds no rows. It was recorded on 2026-09-28 (rls-coverage-check.sql) with
-- "its first writer brings a policy"; it gets the policy now instead, so that
-- writer cannot ship without one.
--
-- A row names one user (user_id), like public.users, so it follows that policy:
--   - SELECT: enforcement off (owner connections), OR the platform role, OR the
--     row's user is a member of the scope's organization (presence is for
--     colleagues to see each other), OR the row is the account a pre-auth scope
--     is bound to (app.current_account_id; 20260928_users_membership_rls.sql).
--   - INSERT, UPDATE, DELETE: enforcement off, OR the platform role, OR the bound
--     account. Never a colleague: a member may see where another member is, not
--     write it. A tenant-scope writer must bind to the person it writes for, or
--     fail closed.
--
-- RLS is enabled and FORCEd. Converges on every run: ALTER POLICY when a policy
-- exists, CREATE when it does not. Nothing is dropped (Rule 1). Absent tables:
-- skipped with a NOTICE.

DO $$
DECLARE
  off     CONSTANT text := $e$(NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on')$e$;
  super   CONSTANT text := $e$(current_setting('app.current_user_role', true) = 'app_super_admin')$e$;
  member  CONSTANT text := $e$(EXISTS (
    SELECT 1 FROM public.organization_users ou
     WHERE ou.user_id = user_presence.user_id
       AND (ou.organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer
            OR ou.organization_id = (substring(current_setting('app.current_org_id', true) from '^[0-9]+$'))::integer)
  ))$e$;
  account CONSTANT text := $e$(user_presence.user_id = (substring(current_setting('app.current_account_id', true) from '^[0-9]+$'))::integer)$e$;
  may_read  text;
  may_write text;
  p RECORD;
BEGIN
  IF to_regclass('public.user_presence') IS NULL OR to_regclass('public.organization_users') IS NULL THEN
    RAISE NOTICE '[user-presence-rls] skipped — public.user_presence or public.organization_users not provisioned';
    RETURN;
  END IF;

  may_read  := format('(%s OR %s OR %s OR %s)', off, super, member, account);
  may_write := format('(%s OR %s OR %s)', off, super, account);

  ALTER TABLE public.user_presence ENABLE ROW LEVEL SECURITY;
  ALTER TABLE public.user_presence FORCE ROW LEVEL SECURITY;

  FOR p IN
    SELECT * FROM (VALUES
      ('user_presence_member_read', 'SELECT', may_read,  NULL),
      ('user_presence_own_insert',  'INSERT', NULL,      may_write),
      ('user_presence_own_update',  'UPDATE', may_write, may_write),
      ('user_presence_own_delete',  'DELETE', may_write, NULL)
    ) AS v(name, cmd, using_expr, check_expr)
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = 'public' AND tablename = 'user_presence' AND policyname = p.name
    ) THEN
      EXECUTE format('ALTER POLICY %I ON public.user_presence%s%s', p.name,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    ELSE
      EXECUTE format('CREATE POLICY %I ON public.user_presence FOR %s%s%s', p.name, p.cmd,
        CASE WHEN p.using_expr IS NULL THEN '' ELSE ' USING ' || p.using_expr END,
        CASE WHEN p.check_expr IS NULL THEN '' ELSE ' WITH CHECK ' || p.check_expr END);
    END IF;
  END LOOP;

  RAISE NOTICE '[user-presence-rls] members see their colleagues; only the person (bound) or the platform writes';
END
$$;
