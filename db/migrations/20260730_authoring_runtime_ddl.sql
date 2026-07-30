-- eCTD REGULATORY AUDIT CONTEXT
-- Purpose: Make the seven authoring tables that were created only by runtime DDL
--   inside authoring.router.ts first-class migration objects, so the schema is
--   declared in one governed place rather than lazily at request time.
-- Author: AnA modernization
-- Date: 2026-07-30
-- Reviewed: authoring-schema-contract test (asserts the router no longer runs DDL)
-- Rollback: DROP TABLE for the tables below (all CREATE IF NOT EXISTS; additive).
--
-- These tables already exist in running environments (the router created them on
-- first use via ensure* helpers); this migration is the canonical declaration and
-- is a harmless no-op where they already exist. The runtime ensure* DDL in
-- authoring.router.ts is retired in the same change — the router no longer issues
-- CREATE TABLE — removing the routes+DDL concentration and making the migrations
-- the single source of truth. DDL below is verbatim from the retired helpers so
-- existing rows and shapes are unaffected.

CREATE TABLE IF NOT EXISTS authoring_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id VARCHAR(255) NOT NULL,
  cite_id VARCHAR(255) NOT NULL,
  token_key VARCHAR(255) NOT NULL,
  payload JSONB,
  payload_sha256 VARCHAR(64),
  source_refs JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  tenant_id INTEGER DEFAULT 1,
  UNIQUE(section_id, cite_id)
);

CREATE TABLE IF NOT EXISTS authoring_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_name VARCHAR(255) NOT NULL,
  template_type VARCHAR(100) NOT NULL,
  category VARCHAR(100),
  regions TEXT[],
  template_content JSONB,
  guidance_content JSONB,
  metadata JSONB,
  is_active BOOLEAN DEFAULT true,
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by VARCHAR(255),
  tenant_id INTEGER DEFAULT 1,
  UNIQUE(template_name, template_type, tenant_id)
);

CREATE TABLE IF NOT EXISTS template_guidance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES authoring_templates(id) ON DELETE CASCADE,
  section_name VARCHAR(255) NOT NULL,
  section_code VARCHAR(50),
  guidance_text TEXT,
  examples JSONB,
  regulatory_references JSONB,
  ai_prompts JSONB,
  compliance_checklist JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  tenant_id INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS template_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID REFERENCES authoring_templates(id),
  document_id VARCHAR(255),
  used_by VARCHAR(255),
  used_at TIMESTAMP DEFAULT NOW(),
  tenant_id INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS section_guidance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id VARCHAR(255) NOT NULL,
  document_type VARCHAR(100),
  guidance_type VARCHAR(50),
  content TEXT,
  metadata JSONB,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  tenant_id INTEGER DEFAULT 1,
  UNIQUE(section_id, guidance_type, tenant_id)
);

CREATE TABLE IF NOT EXISTS authoring_export_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id VARCHAR(255) NOT NULL,
  export_type VARCHAR(50) NOT NULL,
  exported_by VARCHAR(255),
  exported_at TIMESTAMP DEFAULT NOW(),
  file_name VARCHAR(500),
  file_size INTEGER,
  doc_sha256 VARCHAR(64),
  metadata JSONB,
  download_url TEXT,
  cached_until TIMESTAMP,
  tenant_id INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_export_history_doc_id
  ON authoring_export_history(document_id, exported_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_history_tenant
  ON authoring_export_history(tenant_id, document_id);

CREATE TABLE IF NOT EXISTS authoring_tracked_change_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  artifact_id VARCHAR(255) NOT NULL,
  change_id VARCHAR(255) NOT NULL,
  decision VARCHAR(20) NOT NULL CHECK (decision IN ('accept', 'reject')),
  user_id VARCHAR(255) NOT NULL,
  user_name VARCHAR(255),
  tenant_id INTEGER NOT NULL,
  decided_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_tracked_change_decisions_artifact
  ON authoring_tracked_change_decisions (artifact_id, tenant_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_tracked_change_decisions_unique
  ON authoring_tracked_change_decisions (artifact_id, change_id, tenant_id);
