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
