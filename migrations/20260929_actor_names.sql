-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(e) audit trails identify the operator),
--             ALCOA+ (Attributable)
-- Purpose: An audit entry names the person who acted, after they leave the
--          organization, without reopening anyone's account to other tenants.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (who did what, behind every module)
--   - Integrity Risk Addressed: attribution — since public.users took
--     row-level security (20260928_users_membership_rls.sql), a tenant scope
--     could no longer resolve the name of someone who acted in it and left
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; one read-only function and one index. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-29. Evidence: docs/evidence/D3/2026-09-29-actor-names/.
-- =============================================================================
--
-- audit_logs carries the actor's id and no name (audit_events snapshots
-- user_name at write time; audit_logs does not, and it is hash-chained, so no
-- column is added to it here). The audit-trail ledger resolved the name by
-- joining users. After the users policy, that join finds only current members:
-- measured through the production audit writer and ledger reader, as
-- app_service with RLS enforcing, a member who acted in A and then left read
-- `user <id>` in A's audit trail.
--
-- public.actor_name(p_user_id) returns (name, email) — never another column —
-- for a user who is, relative to the calling scope's organization:
--   - a member of it (organization_users, whose reads are open), or
--   - an actor in its own audit trail (audit_logs.tenant_id = that organization
--     and actor_id = the user),
-- and, as for users itself, anyone in the tenant-less scopes (pre-auth, system)
-- or where enforcement is off (owner connections). Anyone else: no row. So a
-- tenant learns the name of people who worked in it, and nothing about anyone
-- else; password hashes, MFA secrets and tokens stay behind the users policy.
--
-- SECURITY DEFINER with the platform role set for its own body, so it answers on
-- any owner (users and audit_logs are FORCEd); the scope tests read
-- app.current_tenant_id and app.rls_enforce, which that SET does not touch.
-- EXECUTE is revoked from PUBLIC and granted to app_service.
--
-- audit_logs_tenant_actor_idx serves the actor test. It is created only when
-- absent, so a replay takes no lock on audit_logs; its one build, on the first
-- deploy that carries this file, holds audit_logs' SHARE lock for the build
-- (writes wait; the set's lock_timeout applies).
--
-- Converges on every run; nothing is dropped (Rule 1). Absent tables: skipped
-- with a NOTICE, like its siblings.

DO $do$
BEGIN
  IF to_regclass('public.users') IS NULL
     OR to_regclass('public.organization_users') IS NULL
     OR to_regclass('public.audit_logs') IS NULL
     OR (SELECT count(*) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'audit_logs'
            AND column_name IN ('tenant_id', 'actor_id')) < 2 THEN
    RAISE NOTICE '[actor-names] skipped — public.users, public.organization_users or public.audit_logs (tenant_id, actor_id) not provisioned';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
     WHERE schemaname = 'public' AND tablename = 'audit_logs' AND indexname = 'audit_logs_tenant_actor_idx'
  ) THEN
    CREATE INDEX audit_logs_tenant_actor_idx
      ON public.audit_logs (tenant_id, actor_id)
      WHERE actor_id IS NOT NULL;
  END IF;

  EXECUTE $fn$
    CREATE OR REPLACE FUNCTION public.actor_name(p_user_id integer)
    RETURNS TABLE (name text, email text)
    LANGUAGE sql
    STABLE
    SECURITY DEFINER
    SET search_path = pg_catalog, public
    SET app.current_user_role = 'app_super_admin'
    AS $body$
      SELECT u.name, u.email
        FROM public.users u
       WHERE u.id = p_user_id
         AND (
           NULLIF(current_setting('app.rls_enforce', true), '') IS DISTINCT FROM 'on'
           OR NULLIF(current_setting('app.current_tenant_id', true), '') = '0'
           OR EXISTS (
             SELECT 1 FROM public.organization_users ou
              WHERE ou.user_id = p_user_id
                AND ou.organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer
           )
           OR EXISTS (
             SELECT 1 FROM public.audit_logs a
              WHERE a.actor_id = p_user_id
                AND a.tenant_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer
           )
         )
    $body$
  $fn$;

  REVOKE ALL ON FUNCTION public.actor_name(integer) FROM PUBLIC;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.actor_name(integer) TO app_service;
  END IF;

  RAISE NOTICE '[actor-names] audit entries name members and past actors of the calling organization, nobody else';
END
$do$;
