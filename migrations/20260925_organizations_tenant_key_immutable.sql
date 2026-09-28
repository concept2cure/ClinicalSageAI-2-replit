-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: An organization's tenant key — its id and its uuid — never changes
--          once set, so no tenant can take another tenant's key.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (tenant identity behind every module)
--   - Integrity Risk Addressed: tenant isolation — any tenant could move any
--     organization's uuid, the key every uuid-keyed tenant check compares
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - No table shape change; one trigger. Idempotent.
--
-- Notes:
--   - Row D3, 2026-09-25. Evidence:
--     docs/evidence/D3/2026-09-25-organizations-tenant-key/.
-- =============================================================================
--
-- public.organizations carries no RLS and the runtime role may write it. The
-- integer sweep never reached it: it polices tables that HAVE an
-- organization_id / org_id / tenant_id column, and this is the table those
-- columns point at. Measured as app_service with app.rls_enforce=on, in tenant
-- A's scope:
--
--   UPDATE organizations SET uuid = gen_random_uuid() WHERE id = <A>;
--   UPDATE organizations SET uuid = <A's old uuid>     WHERE id = <B>;
--
-- after which core.get_program_org_id — regulatory_programs.organization_id →
-- organizations.uuid, which vault RLS compares with the session's
-- app.current_org_id — resolved B's programs to A's uuid, and A read B's vault.
-- organizations.uuid is also the tenant key of every non-public schema.
--
-- What this states: id and uuid are immutable once set, for every role and
-- scope. No code path changes either (searched 2026-09-25). A trigger rather
-- than a policy, because a tenant moving ITS OWN uuid is the first half of the
-- attack, and a policy that lets an org write its own row cannot stop that.
--
-- What this deliberately does NOT do: narrow who may write the other columns
-- (tier, seats, settings, Stripe ids, API key). Any tenant scope can still
-- UPDATE any organization's row at the database. An own-org-or-platform write
-- policy was built and measured, and it would break five platform-staff
-- override paths that write ANOTHER org's row from the staff member's own
-- request scope (role super_admin, not app_super_admin):
-- organizations-routes.ts PATCH /:id/profile and /:id/settings (the latter
-- reports success on zero rows), and tenant-config.ts's three super_admin
-- branches. Those move to the system scope first; recorded in the evidence and
-- handed on in docs/work-orders/README.md.
--
-- Converges on every run: CREATE OR REPLACE for the function, the trigger
-- created only when absent. Nothing is dropped (Rule 1).

CREATE OR REPLACE FUNCTION public.organizations_tenant_key_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.id IS DISTINCT FROM OLD.id
     OR (OLD.uuid IS NOT NULL AND NEW.uuid IS DISTINCT FROM OLD.uuid) THEN
    RAISE EXCEPTION 'organizations.id and organizations.uuid are immutable once set (organization %)', OLD.id
      USING ERRCODE = 'insufficient_privilege',
            HINT = 'They are the tenant key of every tenant-keyed table. See docs/evidence/D3/2026-09-25-organizations-tenant-key/.';
  END IF;
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.organizations') IS NULL THEN
    RAISE NOTICE '[organizations-tenant-key] skipped — public.organizations not provisioned';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgrelid = 'public.organizations'::regclass
       AND tgname = 'organizations_tenant_key_immutable'
  ) THEN
    CREATE TRIGGER organizations_tenant_key_immutable
      BEFORE UPDATE OF id, uuid ON public.organizations
      FOR EACH ROW EXECUTE FUNCTION public.organizations_tenant_key_immutable();
  END IF;
  RAISE NOTICE '[organizations-tenant-key] public.organizations: id and uuid immutable';
END
$$;
