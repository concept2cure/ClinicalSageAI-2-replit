-- External Evidence Intelligence baseline schema

CREATE TABLE IF NOT EXISTS external_tool_settings (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL UNIQUE,
  firecrawl_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  firecrawl_daily_free_scrapes INTEGER NOT NULL DEFAULT 5,
  firecrawl_role_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  firecrawl_domain_allowlist_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  firecrawl_category_policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS firecrawl_usage_daily (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  usage_date DATE NOT NULL,
  successful_standard_scrapes INTEGER NOT NULL DEFAULT 0,
  credits_estimated NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tenant_id, usage_date)
);

CREATE TABLE IF NOT EXISTS external_evidence_sources (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  source_type TEXT NOT NULL,
  domain TEXT,
  allow_firecrawl BOOLEAN NOT NULL DEFAULT FALSE,
  trust_level TEXT,
  policy_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_evidence_documents (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  project_id TEXT,
  conversation_id TEXT,
  message_id TEXT,
  source_provider TEXT NOT NULL,
  acquisition_method TEXT NOT NULL,
  url TEXT,
  canonical_url TEXT,
  title TEXT,
  fetched_at TIMESTAMPTZ,
  content_hash TEXT,
  raw_markdown TEXT,
  raw_html TEXT,
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  parser_version TEXT,
  status TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_evidence_extractions (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  evidence_document_id BIGINT NOT NULL REFERENCES external_evidence_documents(id) ON DELETE CASCADE,
  extraction_type TEXT NOT NULL,
  schema_version TEXT,
  extraction_prompt_version TEXT,
  extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence NUMERIC(6,4),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_evidence_citations (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  evidence_document_id BIGINT NOT NULL REFERENCES external_evidence_documents(id) ON DELETE CASCADE,
  artifact_id TEXT,
  conversation_id TEXT,
  message_id TEXT,
  citation_label TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS external_tool_audit_log (
  id BIGSERIAL PRIMARY KEY,
  tenant_id BIGINT NOT NULL,
  actor_user_id BIGINT,
  event_type TEXT NOT NULL,
  event_payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- seed defaults for existing tenants (best effort)
INSERT INTO external_tool_settings (tenant_id, firecrawl_enabled, firecrawl_daily_free_scrapes)
SELECT id, FALSE, COALESCE(NULLIF(current_setting('app.default_firecrawl_daily_free_scrapes', true), '')::INTEGER, 5)
FROM organizations
ON CONFLICT (tenant_id) DO NOTHING;
