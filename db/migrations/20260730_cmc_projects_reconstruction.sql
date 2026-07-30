-- ============================================================================
-- 20260730_cmc_projects_reconstruction.sql
--
-- Code-derived reconstruction of cmc_projects (the C-11 pattern), from the
-- blank-DB provisioning audit 2026-07-30 (ledger C-29 context).
--
-- cmc_projects had NO creator anywhere: not in shared/schema.ts (so
-- drizzle-kit push never lays it down), not in migrations/, not in
-- db/migrations/. Yet it is live product surface:
--   - server/api/cmc/blueprintRoutes.ts INSERTs into it (the CMC blueprint
--     project-create endpoint) — the single SQL writer, whose column list
--     below is transcribed verbatim;
--   - migrations/0006_regulatory_atoms.sql declares UUID FKs to
--     cmc_projects(id), so the regulatory-atoms tables could never apply on
--     a fresh database (one of the nine files the blank-DB provisioning job
--     reported unapplied).
--
-- Shape decisions, grounded in the writer's SQL:
--   * id is UUID (the route mints crypto.randomUUID(); 0006 references it
--     as UUID).
--   * target_submission_date is TEXT: the route binds the client-supplied
--     value as an opaque parameter; TEXT accepts every value the route
--     produces (same convention as the authoring reconstruction).
--   * organization_id INTEGER NOT NULL → organizations(id), with this
--     table's own tenant_isolation_policy (0021 ran long ago and never
--     revisits new tables).
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS; policy dropped + recreated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS cmc_projects (
  id                     UUID PRIMARY KEY,
  organization_id        INTEGER NOT NULL REFERENCES organizations(id),
  name                   TEXT NOT NULL,
  drug_name              TEXT,
  drug_type              TEXT,
  dosage_form            TEXT,
  indication             TEXT,
  development_stage      TEXT,
  regulatory_region      TEXT,
  manufacturing_site     TEXT,
  target_submission_date TEXT,
  project_manager        TEXT,
  status                 TEXT,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS cmc_projects_org_idx    ON cmc_projects (organization_id);
CREATE INDEX IF NOT EXISTS cmc_projects_status_idx ON cmc_projects (organization_id, status);

DO $$
BEGIN
  IF to_regclass('public.cmc_projects') IS NOT NULL THEN
    ALTER TABLE public.cmc_projects ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.cmc_projects;
    CREATE POLICY tenant_isolation_policy ON public.cmc_projects
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = NULLIF(current_setting('app.current_org_id',    TRUE), '')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;
END $$;
