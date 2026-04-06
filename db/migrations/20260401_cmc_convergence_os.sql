-- CMC convergence and hardening: canonical Module 3 OS persistence

CREATE TABLE IF NOT EXISTS cmc_source_objects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  source_type TEXT NOT NULL,
  source_key TEXT NOT NULL,
  source_payload JSONB NOT NULL,
  source_hash TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cmc_source_objects_project_key_idx
  ON cmc_source_objects(project_id, source_type, source_key, version);

CREATE TABLE IF NOT EXISTS cmc_module3_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  section_key TEXT NOT NULL,
  section_path TEXT NOT NULL,
  deterministic_json JSONB NOT NULL,
  narrative_text TEXT,
  compiled_hash TEXT NOT NULL,
  stale BOOLEAN NOT NULL DEFAULT FALSE,
  stale_reason TEXT,
  approval_state TEXT NOT NULL DEFAULT 'draft',
  approved_version_id UUID,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cmc_module3_sections_project_key_idx
  ON cmc_module3_sections(project_id, section_key);

CREATE TABLE IF NOT EXISTS cmc_section_lineage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  section_id UUID NOT NULL REFERENCES cmc_module3_sections(id) ON DELETE CASCADE,
  source_object_id UUID NOT NULL REFERENCES cmc_source_objects(id) ON DELETE CASCADE,
  source_hash_at_compile TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cmc_contradictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  severity TEXT NOT NULL,
  contradiction_type TEXT NOT NULL,
  details TEXT NOT NULL,
  impacted_sections JSONB NOT NULL,
  required_reviewers JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cmc_ai_command_results (
  id TEXT PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id UUID,
  command TEXT NOT NULL,
  drug_name TEXT NOT NULL,
  category TEXT NOT NULL,
  status TEXT NOT NULL,
  estimated_time TEXT,
  result TEXT NOT NULL,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS cmc_module3_section_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  section_id UUID NOT NULL REFERENCES cmc_module3_sections(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL,
  version_number INTEGER NOT NULL,
  snapshot_json JSONB NOT NULL,
  diff_summary JSONB,
  state TEXT NOT NULL DEFAULT 'draft',
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS cmc_section_versions_unique
  ON cmc_module3_section_versions(section_id, version_number);

CREATE TABLE IF NOT EXISTS cmc_provenance_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  artifact_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  event_payload JSONB NOT NULL,
  created_by TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Adapter/hardening additions for existing CMC atoms
ALTER TABLE cmc_batch_records ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE stability_studies ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE quality_specifications ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE cmc_comparability_assessments ADD COLUMN IF NOT EXISTS tenant_id TEXT;

-- Canonical document persistence moved out of route-local runtime DDL
CREATE TABLE IF NOT EXISTS cmc_documents (
  id SERIAL PRIMARY KEY,
  project_id UUID,
  organization_id INTEGER DEFAULT 1,
  document_type TEXT NOT NULL DEFAULT 'general',
  module_section TEXT,
  title TEXT NOT NULL,
  content TEXT,
  section TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  version TEXT DEFAULT '1.0',
  file_path TEXT,
  metadata JSONB,
  compliance_score INTEGER,
  compliance_metrics JSONB,
  drug_candidate_id TEXT,
  study_id TEXT,
  tenant_id TEXT,
  created_by TEXT,
  last_modified_by TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS cmc_document_versions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES cmc_documents(id) ON DELETE CASCADE,
  version_number TEXT NOT NULL,
  content TEXT,
  changes TEXT,
  author TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS cmc_document_links (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL,
  linked_document_id INTEGER NOT NULL,
  link_type TEXT DEFAULT 'reference',
  context TEXT,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE TABLE IF NOT EXISTS cmc_document_collaborators (
  id SERIAL PRIMARY KEY,
  document_id INTEGER NOT NULL,
  user_id TEXT,
  role TEXT DEFAULT 'viewer',
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);
