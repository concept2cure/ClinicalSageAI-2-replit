-- ============================================================================
-- AnA Relational Profiles + External Intelligence
-- ============================================================================
--
-- 1. ana_relational_profiles — AnA's self-developed notes about each user
--    and project (tone calibration, emotional reads, owned mistakes). These
--    render into the RELATIONAL CONTEXT prompt block, which is how AnA's
--    personality adapts per user and per project over time.
--
-- 2. external_intelligence_findings / _runs — the nightly external sweep:
--    regulatory-agency updates across all served markets (FDA, EMA, MHRA,
--    TGA, …) plus academic / industry knowledge sources (SCDM, PubMed
--    methodology literature, medRxiv). Findings are global, deduped per
--    (source_key, external_id).
--
-- Schema:  shared/schema/ana-relational.ts, shared/schema/external-intelligence.ts
-- Service: server/services/ana-ri/relational-profile-service.ts,
--          server/services/external-intelligence/
-- Job:     server/jobs/externalIntelligenceSweep.ts
-- Routes:  server/routes/external-intelligence-routes.ts
-- ============================================================================

CREATE TABLE IF NOT EXISTS ana_relational_profiles (
  id                     serial PRIMARY KEY,
  organization_id        integer NOT NULL REFERENCES organizations(id),
  user_id                integer NOT NULL REFERENCES users(id),
  project_id             integer REFERENCES projects(id),
  profile_summary        text,
  tone_calibration       jsonb NOT NULL DEFAULT '{}'::jsonb,
  emotional_signals      jsonb NOT NULL DEFAULT '[]'::jsonb,
  acknowledged_mistakes  jsonb NOT NULL DEFAULT '[]'::jsonb,
  interaction_count      integer NOT NULL DEFAULT 0,
  last_interaction_at    timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
-- NULL project_id = user-level profile. COALESCE keeps it unique (plain
-- unique indexes treat NULLs as distinct, which would allow duplicates).
CREATE UNIQUE INDEX IF NOT EXISTS ana_relational_profiles_scope_idx
  ON ana_relational_profiles(organization_id, user_id, COALESCE(project_id, 0));
CREATE INDEX IF NOT EXISTS ana_relational_org_user_idx
  ON ana_relational_profiles(organization_id, user_id);
CREATE INDEX IF NOT EXISTS ana_relational_project_idx
  ON ana_relational_profiles(project_id);

-- Private per-account context: tenant membership and platform role never admit
-- another owner's profile. Restrictive policy ANDs with every permissive policy,
-- including later generic tenant policies. The canonical deploy replays this
-- creator, so ENABLE/FORCE and expressions converge on existing installations.
ALTER TABLE public.ana_relational_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ana_relational_profiles FORCE ROW LEVEL SECURITY;
DO $private_owner$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.ana_relational_profiles'::regclass AND polname = 'ana_relational_profiles_owner_boundary') THEN
    CREATE POLICY ana_relational_profiles_owner_boundary ON public.ana_relational_profiles
      AS RESTRICTIVE FOR ALL TO PUBLIC
      USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer)
      WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer);
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.ana_relational_profiles'::regclass AND polname = 'ana_relational_profiles_owner_boundary' AND polpermissive) THEN
    RAISE EXCEPTION 'Private profile owner boundary must be restrictive';
  END IF;
  ALTER POLICY ana_relational_profiles_owner_boundary ON public.ana_relational_profiles TO PUBLIC
    USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer);
  -- A matching owner can use the table even before the generic RLS sweep.
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.ana_relational_profiles'::regclass AND polname = 'ana_relational_profiles_owner_access') THEN
    CREATE POLICY ana_relational_profiles_owner_access ON public.ana_relational_profiles FOR ALL TO PUBLIC
      USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer)
      WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer);
  END IF;
  ALTER POLICY ana_relational_profiles_owner_access ON public.ana_relational_profiles TO PUBLIC
    USING (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer)
    WITH CHECK (organization_id = NULLIF(current_setting('app.current_tenant_id', true), '')::integer AND user_id = NULLIF(current_setting('app.current_account_id', true), '')::integer);
END
$private_owner$;

CREATE TABLE IF NOT EXISTS external_intelligence_findings (
  id               serial PRIMARY KEY,
  source_key       text NOT NULL,
  source_name      text NOT NULL,
  source_type      text NOT NULL CHECK (source_type IN ('regulatory_agency','standards_body','academic','industry_group')),
  market           text,
  regulatory_body  text,
  external_id      text NOT NULL,
  title            text NOT NULL,
  summary          text,
  url              text,
  topics           jsonb NOT NULL DEFAULT '[]'::jsonb,
  published_at     timestamptz,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS external_intel_findings_dedupe_idx
  ON external_intelligence_findings(source_key, external_id);
CREATE INDEX IF NOT EXISTS external_intel_findings_body_idx
  ON external_intelligence_findings(regulatory_body);
CREATE INDEX IF NOT EXISTS external_intel_findings_market_idx
  ON external_intelligence_findings(market);
CREATE INDEX IF NOT EXISTS external_intel_findings_published_idx
  ON external_intelligence_findings(published_at);
CREATE INDEX IF NOT EXISTS external_intel_findings_fetched_idx
  ON external_intelligence_findings(fetched_at);

CREATE TABLE IF NOT EXISTS external_intelligence_runs (
  id               serial PRIMARY KEY,
  started_at       timestamptz NOT NULL DEFAULT now(),
  finished_at      timestamptz,
  sources_checked  integer NOT NULL DEFAULT 0,
  sources_failed   integer NOT NULL DEFAULT 0,
  findings_new     integer NOT NULL DEFAULT 0,
  error_summary    jsonb NOT NULL DEFAULT '[]'::jsonb
);
CREATE INDEX IF NOT EXISTS external_intel_runs_started_idx
  ON external_intelligence_runs(started_at);
