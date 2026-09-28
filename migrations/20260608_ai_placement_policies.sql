-- Per-organization AI placement policy.
--
-- Stores the vendor / substrate / data-residency / zero-retention requirements
-- the AI gateway applies to every one of an organization's requests. Resolved
-- by server/services/ai-gateway/providers/org-placement-db.ts and applied as a
-- FLOOR: a request may add a constraint, never lower one.
--
-- Amended in place 2026-09-25 (launch row D6, WS1 of
-- ANA_LOCAL_SAFE_AI_AGENTIC_PLAN_2026-09-25; CLAUDE.md Rule 1 — every file in
-- C2C_MIGRATION_FILES re-runs on every deploy, so a change is an amendment,
-- never an appended file):
--   * This file is now in C2C_MIGRATION_FILES. Until then only install-fresh
--     applied it, so a database upgraded by deploy-migrate alone had no table,
--     and the resolver's fail-open then read every tenant as "no policy".
--   * allowed_substrates is ENFORCED at selection and at the last mile for
--     every data class. The comment below called it advisory; it was — that
--     was the defect.
--   * Added allowed_providers (per-tenant vendor allow-list: Claude, OpenAI,
--     Kimi/Moonshot, a private-cloud lane or the self-hosted lane; NULL = no
--     vendor constraint, empty = none). The DPA says OpenAI and Moonshot are
--     disabled for a tenant unless its Order Form lists them; this records it.
--   * Added public_source_frontier (default FALSE) and public_source_egress
--     (default TRUE — the platform's public-source fetchers already reach
--     PubMed, openFDA and similar hosts; FALSE turns that off for the tenant).
--   * Explicit request values no longer win over the org's: the policy is a
--     floor. See docs/evidence/D6/2026-09-25-tenant-boundary/.
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
  -- allow-list of substrate classes (frontier_shared / frontier_private / self_hosted); NULL = no constraint
  allowed_substrates       TEXT[],
  -- allow-list of AI vendors (openai / anthropic / moonshot / bedrock / vertex / azure / local); NULL = no constraint
  allowed_providers        TEXT[],
  -- may a provably public-source payload reach a shared frontier API outside the floor above
  public_source_frontier   BOOLEAN NOT NULL DEFAULT FALSE,
  -- may the platform's public-source fetchers make outbound requests for this org
  public_source_egress     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_placement_policies_org
  ON public.ai_placement_policies(organization_id);

-- Columns added 2026-09-25, for a table created before the CREATE above listed them.
ALTER TABLE public.ai_placement_policies ADD COLUMN IF NOT EXISTS allowed_providers TEXT[];
ALTER TABLE public.ai_placement_policies ADD COLUMN IF NOT EXISTS public_source_frontier BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.ai_placement_policies ADD COLUMN IF NOT EXISTS public_source_egress BOOLEAN NOT NULL DEFAULT TRUE;

-- Tenant isolation — same policy shape as migrations/0021_enable_rls_everywhere.sql.
ALTER TABLE public.ai_placement_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_placement_policies FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_isolation_policy ON public.ai_placement_policies;
CREATE POLICY tenant_isolation_policy ON public.ai_placement_policies
  FOR ALL
  USING (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR organization_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  )
  WITH CHECK (
    NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
    OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
    OR organization_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );
