-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Let core.get_program_org_id resolve the canonical program registry so
--          vault.documents RLS policies can authorize the runtime role on a
--          fresh install.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (vault document store backing all modules)
--   - Integrity Risk Addressed: tenant isolation — vault RLS denied every
--     runtime-role write because ownership resolved only from empty GCC tables
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Function replacement only; no table shape changes, no spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - CREATE OR REPLACE FUNCTION is idempotent by construction.
-- =============================================================================
--
-- Program→org resolution must see the canonical program registry.
--
-- core.get_program_org_id() resolved ownership from core.programs and
-- core.program_ownerships only — GCC-era tables the current application never
-- populates (0 rows on a fresh install; the product's program registry is
-- public.regulatory_programs). Every vault.documents RLS policy authorizes
-- through core.can_write_program → identity.can_write_program →
-- core.get_program_org_id, so for any real program the resolver returned NULL,
-- the org comparison failed, and INSERT/UPDATE/DELETE on vault.documents was
-- structurally impossible for the non-superuser runtime role. Vault ingestion
-- under RLS_ENFORCE=on has therefore never worked on a fresh install; the
-- vault-ingest dbtest is the proof that fails without this migration.
--
-- The fix teaches the resolver the canonical registry:
-- regulatory_programs.id (uuid) → organizations.uuid, which is the same value
-- identity.current_org_id() extracts from the app.current_org_id GUC the
-- request middleware sets.
--
-- AMENDED IN PLACE 2026-09-24 (row D3; evidence
-- docs/evidence/D3/2026-09-24-vault-program-ownership/). The canonical registry
-- is now consulted FIRST; the GCC tables answer only for an id it does not hold.
-- As first written, "the GCC branches stay first so any environment that does
-- carry core.programs rows keeps its existing resolution" — and both GCC tables
-- accept a row from any tenant whose org_id is its own, keyed by ANY program
-- id (core.programs' tenant policy checks org_id, not whose program the id is).
-- Measured as app_service with app.rls_enforce=on: tenant A wrote
-- `core.programs (id = <B's regulatory program>, org_id = A)` and was then B's
-- program's owner — A read B's vault documents and B could no longer read its
-- own. The same through an org-less core.programs row plus a
-- core.program_ownerships row. A regulatory_programs row cannot be planted that
-- way: its id is its primary key and its policy keeps organization_id the
-- writer's own. Nothing that resolved before resolves differently now unless
-- the two registries disagreed about the same id, which is exactly the case
-- this closes. Amended here rather than overridden by a later file, per Rule 1
-- (every file in the set re-runs on every deploy).

-- plpgsql, not LANGUAGE sql: sql bodies validate every referenced relation at
-- CREATE time, and this migration must also apply on paths that build a
-- partial schema (the schema-contract suites replay the durable set against a
-- scratch database without the GCC core tables). plpgsql defers resolution to
-- first execution; behavior on a fully-provisioned database is identical.
CREATE OR REPLACE FUNCTION core.get_program_org_id(p_program_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  -- The canonical registry first: see the 2026-09-24 note above.
  RETURN COALESCE(
    (SELECT o.uuid
       FROM public.regulatory_programs rp
       JOIN public.organizations o ON o.id = rp.organization_id
      WHERE rp.id = p_program_id),
    (SELECT org_id FROM core.programs WHERE id = p_program_id),
    (SELECT org_id FROM core.program_ownerships
      WHERE program_id = p_program_id AND is_active = TRUE
        AND ownership_role = 'OWNER' LIMIT 1)
  );
END;
$$;
