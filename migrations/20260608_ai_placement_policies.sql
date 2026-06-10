-- Per-organization AI placement policy.
--
-- Stores the data-residency / zero-retention / allowed-substrate requirements
-- the AI gateway auto-applies to an organization's requests, so callers don't
-- have to pass dataResidency / zeroDataRetention on every request. Resolved by
-- server/services/ai-gateway/providers/org-placement-db.ts and applied as
-- defaults in the gateway (explicit request values always win).
--
-- Tenant-scoped: organization_id is INTEGER REFERENCES organizations(id), per
-- the tenant-column-types contract, and RLS is enabled below (mirrors
-- migrations/0021_enable_rls_everywhere.sql) so a row is only visible to its org.

CREATE TABLE IF NOT EXISTS public.ai_placement_policies (
  id                       SERIAL PRIMARY KEY,
  organization_id          INTEGER NOT NULL UNIQUE REFERENCES organizations(id) ON DELETE CASCADE,
  -- 'us' | 'eu' | 'apac' | 'on_prem' | NULL (NULL = no residency constraint)
  required_data_residency  TEXT,
  zero_data_retention      BOOLEAN NOT NULL DEFAULT FALSE,
  -- optional advisory allow-list of substrate classes (frontier_shared / frontier_private / self_hosted)
  allowed_substrates       TEXT[],
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_placement_policies_org
  ON public.ai_placement_policies(organization_id);

-- Tenant isolation — same policy shape as migrations/0021_enable_rls_everywhere.sql.
ALTER TABLE public.ai_placement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_placement_policies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_placement_policies;
CREATE POLICY tenant_isolation_policy ON public.ai_placement_policies
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR organization_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR organization_id = NULLIF(current_setting('app.current_org_id', TRUE), '')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );
