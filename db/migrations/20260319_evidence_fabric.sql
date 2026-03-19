-- Evidence Fabric Schema
-- Phase 5: Traceability-first document intelligence layer
-- Aligned with shared/schema.ts Drizzle ORM definitions

-- ═══════════════════════════════════════════════════════════════════════════════
-- EVIDENCE SOURCES — ingested documents with content hashing
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_sources (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  title VARCHAR(500) NOT NULL,
  source_type VARCHAR(50) NOT NULL,
  file_name VARCHAR(500),
  file_url TEXT,
  content_hash VARCHAR(64) NOT NULL,
  content_text TEXT,
  page_count INTEGER DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id INTEGER,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  ingested_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_sources_program_idx ON evidence_sources(program_id);
CREATE INDEX IF NOT EXISTS evidence_sources_org_idx ON evidence_sources(organization_id);
CREATE INDEX IF NOT EXISTS evidence_sources_hash_idx ON evidence_sources(content_hash);
CREATE INDEX IF NOT EXISTS evidence_sources_type_idx ON evidence_sources(source_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EVIDENCE CLAIMS — extracted atomic assertions from sources
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_claims (
  id SERIAL PRIMARY KEY,
  source_id INTEGER NOT NULL,
  program_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  claim_text TEXT NOT NULL,
  claim_type VARCHAR(50) NOT NULL,
  page_number INTEGER,
  section_reference VARCHAR(200),
  sentence_index INTEGER,
  confidence NUMERIC(3,2) NOT NULL DEFAULT 0.50,
  extraction_method VARCHAR(50) NOT NULL DEFAULT 'pattern',
  version INTEGER NOT NULL DEFAULT 1,
  previous_version_id INTEGER,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  metadata JSONB DEFAULT '{}',
  extracted_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_claims_source_idx ON evidence_claims(source_id);
CREATE INDEX IF NOT EXISTS evidence_claims_program_idx ON evidence_claims(program_id);
CREATE INDEX IF NOT EXISTS evidence_claims_org_idx ON evidence_claims(organization_id);
CREATE INDEX IF NOT EXISTS evidence_claims_type_idx ON evidence_claims(claim_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- EVIDENCE CLAIM LINKS — typed edges between claims and document sections
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_claim_links (
  id SERIAL PRIMARY KEY,
  claim_id INTEGER NOT NULL,
  document_id INTEGER NOT NULL,
  section_id VARCHAR(200),
  program_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  link_type VARCHAR(50) NOT NULL,
  strength NUMERIC(3,2) NOT NULL DEFAULT 1.00,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by INTEGER
);

CREATE INDEX IF NOT EXISTS evidence_claim_links_claim_idx ON evidence_claim_links(claim_id);
CREATE INDEX IF NOT EXISTS evidence_claim_links_doc_idx ON evidence_claim_links(document_id);
CREATE INDEX IF NOT EXISTS evidence_claim_links_section_idx ON evidence_claim_links(document_id, section_id);
CREATE INDEX IF NOT EXISTS evidence_claim_links_program_idx ON evidence_claim_links(program_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- TRACEABILITY SNAPSHOTS — point-in-time RTM captures
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_traceability_snapshots (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  snapshot_name VARCHAR(200) NOT NULL,
  snapshot_type VARCHAR(50) NOT NULL DEFAULT 'manual',
  description TEXT,
  rtm_data JSONB NOT NULL,
  total_claims INTEGER NOT NULL DEFAULT 0,
  total_links INTEGER NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2) DEFAULT 0,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_snapshots_program_idx ON evidence_traceability_snapshots(program_id);
CREATE INDEX IF NOT EXISTS evidence_snapshots_org_idx ON evidence_traceability_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS evidence_snapshots_type_idx ON evidence_traceability_snapshots(snapshot_type);

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMPLIANCE SCORES — per-section/document scoring
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_compliance_scores (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  document_id INTEGER,
  section_id VARCHAR(200),
  traceability_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  completeness_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  consistency_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  overall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  total_claims INTEGER NOT NULL DEFAULT 0,
  traced_claims INTEGER NOT NULL DEFAULT 0,
  untraced_claims INTEGER NOT NULL DEFAULT 0,
  contradicted_claims INTEGER NOT NULL DEFAULT 0,
  score_details JSONB DEFAULT '{}',
  computed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  stale_after TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_scores_program_idx ON evidence_compliance_scores(program_id);
CREATE INDEX IF NOT EXISTS evidence_scores_org_idx ON evidence_compliance_scores(organization_id);
CREATE INDEX IF NOT EXISTS evidence_scores_doc_idx ON evidence_compliance_scores(document_id);
CREATE INDEX IF NOT EXISTS evidence_scores_section_idx ON evidence_compliance_scores(document_id, section_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- CHANGE EVENTS — audit trail for evidence changes and propagation
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS evidence_change_events (
  id SERIAL PRIMARY KEY,
  program_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  source_id INTEGER,
  claim_id INTEGER,
  link_id INTEGER,
  document_id INTEGER,
  impact_level VARCHAR(20) NOT NULL DEFAULT 'low',
  affected_claims INTEGER DEFAULT 0,
  affected_sections INTEGER DEFAULT 0,
  description TEXT,
  details JSONB DEFAULT '{}',
  resolved_at TIMESTAMP WITH TIME ZONE,
  resolved_by INTEGER,
  resolution_notes TEXT,
  created_by INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS evidence_events_program_idx ON evidence_change_events(program_id);
CREATE INDEX IF NOT EXISTS evidence_events_org_idx ON evidence_change_events(organization_id);
CREATE INDEX IF NOT EXISTS evidence_events_type_idx ON evidence_change_events(event_type);
CREATE INDEX IF NOT EXISTS evidence_events_source_idx ON evidence_change_events(source_id);
