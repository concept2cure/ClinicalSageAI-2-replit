-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Unify the two org-uuid identity spaces (ledger C-48 Stage 1). Make
--          public.organizations.uuid — the canonical, per-tenant uuid the JWT and
--          app.current_org_id already carry — a valid PARENT in
--          identity.organizations, so a single app.current_org_id can serve BOTH
--          the COALESCE-family tables (no FK) and the identity-FK-bound family
--          (core.programs, ai.*, ectd_v4.*, innovation.*, fhir.*, …) instead of
--          the two disjoint uuid spaces deny-alling each other.
--
-- eCTD/CTD Context:
--   - Module(s): all (cross-cutting tenant-identity unification)
--   - Integrity Risk Addressed: an org uuid that is valid in one schema and
--     rejected by another's FK makes single-session tenant scoping impossible
--
-- Determinism Contract:
--   - Additive only. No structural change to any table; no DROP.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - Idempotent (guarded, ON CONFLICT DO NOTHING, CREATE OR REPLACE).
--   - Backfills existing public orgs and installs a forward-sync trigger.
-- =============================================================================
--
-- Ledger C-48 Stage 1.
--
-- THE CONFLICT THIS RESOLVES. Two disjoint uuid org spaces both feed the single
-- session var app.current_org_id: the COALESCE-family tables (regulatory_intel.*,
-- cortex.*, manufacturing.*, global_dossier, federated_ml.safety_signals) have NO
-- FK and freely hold public.organizations.uuid values; the identity-family tables
-- (core.programs, core.program_ownerships, ai.*, ectd_v4.*, innovation.*, fhir.*)
-- are FK-bound to identity.organizations(id), a hand-seeded set of 9 fixed uuids
-- DISJOINT from public.organizations.uuid. A public uuid therefore works for the
-- first family and is FK-rejected by the second; a seed uuid, the reverse. One GUC
-- cannot straddle two disjoint key spaces. (Verified empirically — see C-48.)
--
-- THE FIX (canonical = public.organizations.uuid). identity.can_access_org() does
-- NOT gate on identity.organizations membership — it self-equality-checks
-- current_org_id() plus an org_relationships grant — so identity.organizations is
-- only an FK ANCHOR, not an identity authority. Making it a SUPERSET that contains
-- every public org uuid lets a single app.current_org_id = <public uuid> satisfy
-- both families with zero policy or FK-DDL change: the COALESCE family already
-- matches it, and the FK family now accepts and self-equality-matches it.
--
-- SAFE BY CONSTRUCTION (no runtime-behaviour change today):
--   - public.organizations is empty on a fresh provision, so the backfill inserts
--     0 rows today; the value is the FORWARD-SYNC trigger that mirrors every future
--     tenant. In an environment that already has public orgs, the backfill adds the
--     mirror rows those orgs always should have had.
--   - This does NOT set the GUC and does NOT flip enforcement (C-48 Stage 2/3). It
--     only widens the FK parent set. The seed uuids are left intact (no DROP), so
--     seed-keyed child rows keep their valid parent — the FK repoint is Stage 4.
--
-- business_model is NOT NULL on identity.organizations with no default and has no
-- source column on public.organizations. The FK-anchor mirror does not depend on
-- its value (can_access_org and the tenant FKs never read it), so it defaults to
-- BIO_PHARMA_SPONSOR (the primary "data owner" tenant type). When the identity
-- model is later reduced to a mirror/VIEW of public (Stage 4), this field either
-- follows an onboarding-supplied value or is dropped from the mirror.

DO $$
DECLARE
  backfilled INT := 0;
  orphaned   INT := 0;
BEGIN
  -- Skip cleanly on a database that never provisioned one side of the bridge:
  -- this file runs on the deploy path where not every subsystem tree is applied.
  IF to_regclass('public.organizations') IS NULL OR to_regclass('identity.organizations') IS NULL THEN
    RAISE NOTICE '[c48-stage1] skipped — public.organizations or identity.organizations not provisioned';
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'uuid'
  ) THEN
    RAISE NOTICE '[c48-stage1] skipped — public.organizations.uuid not present';
    RETURN;
  END IF;

  -- Backfill: every public org uuid becomes an identity.organizations parent.
  -- Idempotent (ON CONFLICT (id) DO NOTHING); legal_name := the org name (NOT NULL
  -- on both sides); business_model defaulted (see header).
  INSERT INTO identity.organizations (id, legal_name, display_name, business_model, is_active, created_by)
  SELECT po.uuid,
         COALESCE(NULLIF(po.name, ''), 'Organization ' || po.id::text),
         po.name,
         'BIO_PHARMA_SPONSOR'::identity.org_business_model,
         COALESCE(po.status <> 'inactive', TRUE),
         'c48-stage1-backfill'
  FROM public.organizations po
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS backfilled = ROW_COUNT;

  -- Fail-closed invariant (RULE 1: a truncated seed fails at apply time). After the
  -- backfill every public org MUST have an identity mirror; a gap means the sync is
  -- broken and unifying the FK parent set silently failed — halt the deploy rather
  -- than ship a half-bridge that deny-alls the FK family.
  SELECT count(*) INTO orphaned
  FROM public.organizations po
  WHERE NOT EXISTS (SELECT 1 FROM identity.organizations io WHERE io.id = po.uuid);
  IF orphaned > 0 THEN
    RAISE EXCEPTION '[c48-stage1] % public org(s) have no identity.organizations mirror after backfill — FK bridge incomplete', orphaned;
  END IF;

  RAISE NOTICE '[c48-stage1] backfilled % public org(s) into identity.organizations; every public org now has a uuid-matched FK parent', backfilled;
END $$;

-- Forward-sync: mirror every future public.organizations row into
-- identity.organizations so the bridge stays complete as tenants are onboarded.
-- The function guards on identity.organizations existing and never clobbers an
-- existing mirror (ON CONFLICT DO NOTHING). Uniquely named; replaces only itself.
CREATE OR REPLACE FUNCTION public.sync_org_to_identity()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  IF to_regclass('identity.organizations') IS NOT NULL THEN
    INSERT INTO identity.organizations (id, legal_name, display_name, business_model, is_active, created_by)
    VALUES (
      NEW.uuid,
      COALESCE(NULLIF(NEW.name, ''), 'Organization ' || NEW.id::text),
      NEW.name,
      'BIO_PHARMA_SPONSOR'::identity.org_business_model,
      COALESCE(NEW.status <> 'inactive', TRUE),
      'c48-stage1-sync'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_sync_org_to_identity ON public.organizations;
CREATE TRIGGER trg_sync_org_to_identity
  AFTER INSERT ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_org_to_identity();
