-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (11.10(d) limiting system access to authorized
--             individuals), ALCOA+ principles
-- Purpose: The person an invitation to another organization names can find
--          it from their own organization, and nobody else can.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (who belongs to which tenant, behind every module)
--   - Integrity Risk Addressed: a consent step that could never be taken under
--     enforcement — the invitee could not see the invitation to accept it
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; one read-only function. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-28. Evidence:
--     docs/evidence/D3/2026-09-28-invitation-acceptance/.
-- =============================================================================
--
-- An administrator of organization B adding an account that already belongs
-- to organization A creates a PENDING organization_invitations row in B:
-- membership needs the invitee's consent (decision-register item 12, #727).
-- The invitee, signed into A, lists it and accepts or declines it
-- (server/routes/tenant-users.ts, /invitations/*). The table carries the
-- FORCEd tenant isolation policy, so in A's request scope B's invitation is
-- invisible: measured as app_service with RLS enforcing, the list was empty
-- and accept and decline answered 404.
--
-- public.invitations_for_member(p_user_id) is the one cross-organization read
-- the flow needs: the invitations that name p_user_id, whatever organization
-- issued them — and ONLY when p_user_id is a member of the calling scope's own
-- organization (organization_users, whose reads are open). A tenant scope can
-- therefore ask about its own members and nobody else; the route asks about
-- the verified caller. Accept and decline then run inside the inviting
-- organization's scope, where the table's own policy admits the row, after the
-- invitation is confirmed as the caller's (tenant-users.ts).
--
-- SECURITY DEFINER with the platform role set for its own body, so it answers
-- on any owner (the table is FORCEd); the membership test reads
-- app.current_tenant_id, which that SET does not touch. EXECUTE is revoked from
-- PUBLIC and granted to app_service. The table's own policy is unchanged.
--
-- Converges on every run (CREATE OR REPLACE). Nothing is dropped (Rule 1).

CREATE OR REPLACE FUNCTION public.invitations_for_member(p_user_id integer)
RETURNS TABLE (
  id              integer,
  organization_id integer,
  email           text,
  role            text,
  status          text,
  invited_by_id   integer,
  created_at      timestamp,
  responded_at    timestamp
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
SET app.current_user_role = 'app_super_admin'
AS $$
  SELECT i.id, i.organization_id, i.email, i.role, i.status, i.invited_by_id,
         i.created_at, i.responded_at
    FROM public.organization_invitations i
   WHERE i.user_id = p_user_id
     AND EXISTS (
       SELECT 1 FROM public.organization_users ou
        WHERE ou.user_id = p_user_id
          AND ou.organization_id = (NULLIF(current_setting('app.current_tenant_id', true), ''))::integer
     )
   ORDER BY i.created_at DESC, i.id DESC
$$;

REVOKE ALL ON FUNCTION public.invitations_for_member(integer) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT EXECUTE ON FUNCTION public.invitations_for_member(integer) TO app_service;
  END IF;
  RAISE NOTICE '[invitations-for-member] an invitee finds their own invitations from their own organization';
END
$$;
