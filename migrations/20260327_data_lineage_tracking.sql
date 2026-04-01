-- Data Lineage Tracking — Regulatory-Grade
-- Migration: 20260327_data_lineage_tracking.sql
--
-- Creates central data lineage and evidence chain persistence tables.
-- Complies with: 21 CFR Part 11 §11.10(e), ICH E6(R3) §5.5.3, EU MDR Annex II §4.1
--
-- Tables:
--   data_lineage_records — tracks every data flow between objects
--   evidence_chain_records — persists AI evidence justifications

-- ═══════════════════════════════════════════════════════════════════════════════
-- DATA LINEAGE RECORDS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS data_lineage_records (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id),

  -- SOURCE
  source_object_type TEXT NOT NULL,
  source_object_id TEXT NOT NULL,
  source_field TEXT,
  source_title TEXT,
  source_content_hash TEXT,

  -- TARGET
  target_object_type TEXT NOT NULL,
  target_object_id TEXT NOT NULL,
  target_field TEXT,
  target_title TEXT,

  -- LINEAGE METADATA
  linkage_type TEXT NOT NULL,
  transformation_type TEXT,
  confidence_score REAL,
  confidence_basis TEXT,

  -- PROVENANCE
  created_by_id INTEGER REFERENCES users(id),
  ai_model_used TEXT,
  retrieval_run_id INTEGER,
  generation_run_id INTEGER,
  workflow_run_id INTEGER,

  -- INTEGRITY
  verified BOOLEAN DEFAULT FALSE,
  verified_by_id INTEGER REFERENCES users(id),
  verified_at TIMESTAMPTZ,

  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for multi-perspective queries
CREATE INDEX IF NOT EXISTS dlr_org_idx ON data_lineage_records(organization_id);
CREATE INDEX IF NOT EXISTS dlr_project_idx ON data_lineage_records(project_id);
CREATE INDEX IF NOT EXISTS dlr_source_idx ON data_lineage_records(source_object_type, source_object_id);
CREATE INDEX IF NOT EXISTS dlr_target_idx ON data_lineage_records(target_object_type, target_object_id);
CREATE INDEX IF NOT EXISTS dlr_linkage_idx ON data_lineage_records(linkage_type);
CREATE INDEX IF NOT EXISTS dlr_created_at_idx ON data_lineage_records(created_at);

-- Append-only: prevent modifications or deletions (regulatory compliance)
CREATE OR REPLACE FUNCTION prevent_lineage_modification()
RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'Data lineage records are append-only (21 CFR Part 11 §11.10(e)). Modifications are prohibited.';
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_lineage_update ON data_lineage_records;
CREATE TRIGGER trg_prevent_lineage_update
  BEFORE UPDATE OR DELETE ON data_lineage_records
  FOR EACH ROW EXECUTE FUNCTION prevent_lineage_modification();

-- ═══════════════════════════════════════════════════════════════════════════════
-- EVIDENCE CHAIN RECORDS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS evidence_chain_records (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER REFERENCES projects(id),

  -- WHAT THIS JUSTIFIES
  target_object_type TEXT NOT NULL,
  target_object_id TEXT NOT NULL,

  -- PRIMARY EVIDENCE SOURCE
  primary_source_type TEXT NOT NULL,
  primary_source_id TEXT NOT NULL,
  primary_source_title TEXT NOT NULL,
  primary_relevance REAL,

  -- SUPPORTING SOURCES (JSON array)
  supporting_sources JSONB DEFAULT '[]'::JSONB,

  -- CONFIDENCE
  confidence_basis TEXT NOT NULL,
  confidence_score REAL,
  chain_strength TEXT NOT NULL,

  -- VERSION CONTEXT
  rim_version TEXT,
  judgment_framework_version TEXT,
  pattern_registry_version TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS ecr_org_idx ON evidence_chain_records(organization_id);
CREATE INDEX IF NOT EXISTS ecr_project_idx ON evidence_chain_records(project_id);
CREATE INDEX IF NOT EXISTS ecr_target_idx ON evidence_chain_records(target_object_type, target_object_id);
CREATE INDEX IF NOT EXISTS ecr_basis_idx ON evidence_chain_records(confidence_basis);
CREATE INDEX IF NOT EXISTS ecr_strength_idx ON evidence_chain_records(chain_strength);

-- Append-only for evidence chains too
DROP TRIGGER IF EXISTS trg_prevent_evidence_chain_update ON evidence_chain_records;
CREATE TRIGGER trg_prevent_evidence_chain_update
  BEFORE UPDATE OR DELETE ON evidence_chain_records
  FOR EACH ROW EXECUTE FUNCTION prevent_lineage_modification();

-- ═══════════════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE data_lineage_records IS 'Append-only data lineage tracking for regulatory compliance. Records every data flow between objects (artifact→artifact, source→artifact, atom→section, etc.)';
COMMENT ON TABLE evidence_chain_records IS 'Append-only evidence chain persistence. Records AI reasoning justification (previously in-memory only in evidence-confidence-model.ts)';
COMMENT ON COLUMN data_lineage_records.linkage_type IS 'Relationship type: derived_from, cited_by, generated_from, extracted_from, references, supersedes, validated_by';
COMMENT ON COLUMN data_lineage_records.transformation_type IS 'How data was transformed: direct_copy, ai_summarization, ai_generation, manual_edit, extraction, aggregation';
COMMENT ON COLUMN evidence_chain_records.confidence_basis IS 'How confidence was determined: rules_based, validation_based, ai_inferred';
COMMENT ON COLUMN evidence_chain_records.chain_strength IS 'Aggregate evidence strength: strong, moderate, weak';
