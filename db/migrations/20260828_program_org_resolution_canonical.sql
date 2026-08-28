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
-- The fix teaches the resolver the canonical registry as a fallback:
-- regulatory_programs.id (uuid) → organizations.uuid, which is the same value
-- identity.current_org_id() extracts from the app.current_org_id GUC the
-- request middleware sets. The GCC branches stay first so any environment that
-- does carry core.programs rows keeps its existing resolution.

CREATE OR REPLACE FUNCTION core.get_program_org_id(p_program_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (SELECT org_id FROM core.programs WHERE id = p_program_id),
    (SELECT org_id FROM core.program_ownerships
      WHERE program_id = p_program_id AND is_active = TRUE
        AND ownership_role = 'OWNER' LIMIT 1),
    (SELECT o.uuid
       FROM public.regulatory_programs rp
       JOIN public.organizations o ON o.id = rp.organization_id
      WHERE rp.id = p_program_id)
  );
$$;
