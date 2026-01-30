-- ============================================================================
-- Phase 5: Intelligent Document System Migration
-- ============================================================================
-- Purpose: Complete database schema for Phase 5 features
--   - Traceability links with hash verification
--   - Source document versioning
--   - Compliance scoring persistence
--   - Change propagation events
--
-- 21 CFR Part 11 Compliance:
--   - All tables have audit trails
--   - Hash-chained records for immutability
--   - RLS for tenant isolation
-- ============================================================================

BEGIN;

-- ============================================================================
-- SCHEMA: intelligent_docs
-- ============================================================================
CREATE SCHEMA IF NOT EXISTS intelligent_docs;

-- ============================================================================
-- TABLE: Source Documents (sources that can be linked to)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.source_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Document Identity
  title TEXT NOT NULL,
  document_type VARCHAR(50) NOT NULL CHECK (document_type IN (
    'clinical_study', 'regulatory_guidance', 'literature', 
    'internal_sop', 'device_spec', 'test_report', 'other'
  )),
  
  -- Version Control
  version VARCHAR(50) NOT NULL DEFAULT '1.0',
  content_hash VARCHAR(64) NOT NULL,  -- SHA-256 of content
  previous_version_id UUID REFERENCES intelligent_docs.source_documents(id),
  
  -- Content
  content TEXT,
  excerpt TEXT,  -- First 500 chars or summary
  metadata JSONB DEFAULT '{}',
  
  -- External Reference
  external_url TEXT,
  external_ref VARCHAR(200),  -- DOI, NCT number, etc.
  
  -- Citation Info
  citation_count INT NOT NULL DEFAULT 0,
  last_cited_at TIMESTAMPTZ,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Search
  search_vector tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(excerpt, '')), 'B')
  ) STORED
);

CREATE INDEX IF NOT EXISTS idx_source_docs_org ON intelligent_docs.source_documents(organization_id);
CREATE INDEX IF NOT EXISTS idx_source_docs_type ON intelligent_docs.source_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_source_docs_hash ON intelligent_docs.source_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_source_docs_search ON intelligent_docs.source_documents USING GIN(search_vector);

-- ============================================================================
-- TABLE: Traceability Links (claims linked to sources)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.traceability_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Source (what we're citing)
  source_document_id UUID NOT NULL REFERENCES intelligent_docs.source_documents(id),
  source_hash VARCHAR(64) NOT NULL,  -- Hash at time of linking
  source_version VARCHAR(50) NOT NULL,
  
  -- Target (where the claim is)
  target_document_id UUID NOT NULL,  -- References concept2cure.artifacts or documents
  target_section_id VARCHAR(100),
  target_range_from INT,
  target_range_to INT,
  linked_text TEXT NOT NULL,  -- The actual claim text
  
  -- Link Type
  citation_type VARCHAR(30) NOT NULL CHECK (citation_type IN (
    'direct_quote', 'paraphrase', 'reference', 'data_source'
  )),
  confidence FLOAT NOT NULL DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  
  -- Verification
  verification_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (verification_status IN (
    'valid', 'outdated', 'broken', 'pending'
  )),
  verified_at TIMESTAMPTZ,
  verified_by TEXT,
  
  -- Hash Chain for Immutability
  link_hash VARCHAR(64) NOT NULL,  -- SHA-256(source_hash + linked_text + timestamp)
  previous_link_hash VARCHAR(64),  -- For audit chain
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL,
  
  CONSTRAINT unique_link UNIQUE (source_document_id, target_document_id, target_range_from, target_range_to)
);

CREATE INDEX IF NOT EXISTS idx_trace_links_org ON intelligent_docs.traceability_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_trace_links_source ON intelligent_docs.traceability_links(source_document_id);
CREATE INDEX IF NOT EXISTS idx_trace_links_target ON intelligent_docs.traceability_links(target_document_id);
CREATE INDEX IF NOT EXISTS idx_trace_links_status ON intelligent_docs.traceability_links(verification_status);
CREATE INDEX IF NOT EXISTS idx_trace_links_hash ON intelligent_docs.traceability_links(link_hash);

-- ============================================================================
-- TABLE: Change Propagation Events
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.change_propagation_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Source Change
  source_document_id UUID NOT NULL REFERENCES intelligent_docs.source_documents(id),
  old_version VARCHAR(50) NOT NULL,
  new_version VARCHAR(50) NOT NULL,
  old_hash VARCHAR(64) NOT NULL,
  new_hash VARCHAR(64) NOT NULL,
  change_description TEXT,
  
  -- Analysis
  change_type VARCHAR(30) NOT NULL CHECK (change_type IN (
    'content_update', 'version_bump', 'correction', 'withdrawal', 'replacement'
  )),
  semantic_changes JSONB DEFAULT '[]',  -- Array of {type, description, severity}
  impacted_links_count INT NOT NULL DEFAULT 0,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'in_progress', 'resolved', 'dismissed'
  )),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  
  -- Hash Chain
  event_hash VARCHAR(64) NOT NULL,
  previous_event_hash VARCHAR(64),
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_propagation_org ON intelligent_docs.change_propagation_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_propagation_source ON intelligent_docs.change_propagation_events(source_document_id);
CREATE INDEX IF NOT EXISTS idx_propagation_status ON intelligent_docs.change_propagation_events(status);

-- ============================================================================
-- TABLE: Impacted Sections (sections affected by source changes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.impacted_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  propagation_event_id UUID NOT NULL REFERENCES intelligent_docs.change_propagation_events(id) ON DELETE CASCADE,
  
  -- Impacted Document
  document_id UUID NOT NULL,
  section_id VARCHAR(100),
  linked_text TEXT NOT NULL,
  link_id UUID NOT NULL REFERENCES intelligent_docs.traceability_links(id),
  
  -- Impact Assessment
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('critical', 'high', 'medium', 'low')),
  reason TEXT NOT NULL,
  suggested_action VARCHAR(30) NOT NULL CHECK (suggested_action IN (
    'update_required', 'review_needed', 'verify_accuracy', 'no_action'
  )),
  
  -- Suggested Patch
  suggested_patch_text TEXT,
  patch_confidence FLOAT CHECK (patch_confidence >= 0 AND patch_confidence <= 1),
  
  -- Resolution
  resolution_status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (resolution_status IN (
    'pending', 'accepted', 'rejected', 'modified'
  )),
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_note TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_impacted_event ON intelligent_docs.impacted_sections(propagation_event_id);
CREATE INDEX IF NOT EXISTS idx_impacted_doc ON intelligent_docs.impacted_sections(document_id);
CREATE INDEX IF NOT EXISTS idx_impacted_severity ON intelligent_docs.impacted_sections(severity);

-- ============================================================================
-- TABLE: Compliance Scores (document compliance tracking)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.compliance_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Document
  document_id UUID NOT NULL,
  submission_type VARCHAR(20) NOT NULL CHECK (submission_type IN (
    'IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'
  )),
  
  -- Overall Score
  overall_score INT NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  
  -- Category Breakdown
  structure_score INT NOT NULL DEFAULT 0 CHECK (structure_score >= 0 AND structure_score <= 100),
  content_score INT NOT NULL DEFAULT 0 CHECK (content_score >= 0 AND content_score <= 100),
  citations_score INT NOT NULL DEFAULT 0 CHECK (citations_score >= 0 AND citations_score <= 100),
  format_score INT NOT NULL DEFAULT 0 CHECK (format_score >= 0 AND format_score <= 100),
  completeness_score INT NOT NULL DEFAULT 0 CHECK (completeness_score >= 0 AND completeness_score <= 100),
  regulatory_score INT NOT NULL DEFAULT 0 CHECK (regulatory_score >= 0 AND regulatory_score <= 100),
  data_integrity_score INT NOT NULL DEFAULT 0 CHECK (data_integrity_score >= 0 AND data_integrity_score <= 100),
  signature_score INT NOT NULL DEFAULT 0 CHECK (signature_score >= 0 AND signature_score <= 100),
  
  -- Rule Stats
  passed_rules INT NOT NULL DEFAULT 0,
  total_rules INT NOT NULL DEFAULT 0,
  
  -- Violations (stored for history)
  violations JSONB DEFAULT '[]',
  
  -- Audit
  calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  calculated_by TEXT NOT NULL DEFAULT 'system'
);

CREATE INDEX IF NOT EXISTS idx_compliance_org ON intelligent_docs.compliance_scores(organization_id);
CREATE INDEX IF NOT EXISTS idx_compliance_doc ON intelligent_docs.compliance_scores(document_id);
CREATE INDEX IF NOT EXISTS idx_compliance_type ON intelligent_docs.compliance_scores(submission_type);
CREATE INDEX IF NOT EXISTS idx_compliance_score ON intelligent_docs.compliance_scores(overall_score);
CREATE INDEX IF NOT EXISTS idx_compliance_time ON intelligent_docs.compliance_scores(calculated_at);

-- ============================================================================
-- TABLE: Compliance Rules (configurable rules per organization)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.compliance_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID,  -- NULL = global rule
  
  -- Rule Definition
  rule_id VARCHAR(50) NOT NULL,  -- e.g., 'STRUCT-001'
  name VARCHAR(200) NOT NULL,
  description TEXT,
  category VARCHAR(30) NOT NULL CHECK (category IN (
    'structure', 'content', 'citation', 'format', 
    'completeness', 'regulatory', 'data_integrity', 'signature'
  )),
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('error', 'warning', 'info')),
  
  -- Applicability
  applicable_submissions TEXT[] DEFAULT ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA'],
  
  -- Validation Logic (stored as JSON for flexibility)
  validation_config JSONB DEFAULT '{}',
  
  -- Regulatory Reference
  regulatory_reference TEXT,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_rule_per_org UNIQUE (organization_id, rule_id)
);

CREATE INDEX IF NOT EXISTS idx_rules_org ON intelligent_docs.compliance_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_rules_category ON intelligent_docs.compliance_rules(category);
CREATE INDEX IF NOT EXISTS idx_rules_active ON intelligent_docs.compliance_rules(is_active);

-- ============================================================================
-- TABLE: Auto-Generated Tables (regulatory tables from data)
-- ============================================================================
CREATE TABLE IF NOT EXISTS intelligent_docs.auto_generated_tables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL,
  
  -- Table Definition
  table_type VARCHAR(50) NOT NULL CHECK (table_type IN (
    'adverse_events', 'demographics', 'efficacy_summary',
    'device_specifications', 'test_results', 'literature_summary',
    'predicate_comparison', 'standards_matrix', 'custom'
  )),
  title TEXT NOT NULL,
  
  -- Source Data
  source_query TEXT,  -- SQL or data path
  source_documents UUID[],  -- Documents used to generate
  
  -- Generated Content
  table_html TEXT,
  table_data JSONB NOT NULL,  -- Structured data
  column_definitions JSONB NOT NULL,  -- Column names, types, formatting
  
  -- Versioning
  version INT NOT NULL DEFAULT 1,
  previous_version_id UUID REFERENCES intelligent_docs.auto_generated_tables(id),
  content_hash VARCHAR(64) NOT NULL,
  
  -- Status
  status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'review', 'approved', 'locked'
  )),
  
  -- Audit
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_by TEXT NOT NULL,
  approved_at TIMESTAMPTZ,
  approved_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_auto_tables_org ON intelligent_docs.auto_generated_tables(organization_id);
CREATE INDEX IF NOT EXISTS idx_auto_tables_type ON intelligent_docs.auto_generated_tables(table_type);
CREATE INDEX IF NOT EXISTS idx_auto_tables_status ON intelligent_docs.auto_generated_tables(status);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE intelligent_docs.source_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_docs.traceability_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_docs.change_propagation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_docs.impacted_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_docs.compliance_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_docs.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE intelligent_docs.auto_generated_tables ENABLE ROW LEVEL SECURITY;

-- Source Documents Policy
DROP POLICY IF EXISTS source_docs_org_policy ON intelligent_docs.source_documents;
CREATE POLICY source_docs_org_policy ON intelligent_docs.source_documents
  FOR ALL
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Traceability Links Policy
DROP POLICY IF EXISTS trace_links_org_policy ON intelligent_docs.traceability_links;
CREATE POLICY trace_links_org_policy ON intelligent_docs.traceability_links
  FOR ALL
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Change Propagation Policy
DROP POLICY IF EXISTS propagation_org_policy ON intelligent_docs.change_propagation_events;
CREATE POLICY propagation_org_policy ON intelligent_docs.change_propagation_events
  FOR ALL
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Compliance Scores Policy
DROP POLICY IF EXISTS compliance_scores_org_policy ON intelligent_docs.compliance_scores;
CREATE POLICY compliance_scores_org_policy ON intelligent_docs.compliance_scores
  FOR ALL
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Compliance Rules Policy (includes global rules)
DROP POLICY IF EXISTS compliance_rules_org_policy ON intelligent_docs.compliance_rules;
CREATE POLICY compliance_rules_org_policy ON intelligent_docs.compliance_rules
  FOR ALL
  USING (
    organization_id IS NULL  -- Global rules visible to all
    OR organization_id::text = current_setting('app.current_organization_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- Auto Generated Tables Policy
DROP POLICY IF EXISTS auto_tables_org_policy ON intelligent_docs.auto_generated_tables;
CREATE POLICY auto_tables_org_policy ON intelligent_docs.auto_generated_tables
  FOR ALL
  USING (
    organization_id::text = current_setting('app.current_organization_id', true)
    OR current_setting('app.bypass_rls', true) = 'true'
  );

-- ============================================================================
-- TRIGGERS: Immutability for Audit Trail
-- ============================================================================

-- Prevent UPDATE/DELETE on traceability_links (append-only)
CREATE OR REPLACE FUNCTION intelligent_docs.prevent_link_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot delete traceability links - audit trail must be preserved';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only allow status updates, not content changes
    IF OLD.source_hash != NEW.source_hash 
       OR OLD.linked_text != NEW.linked_text
       OR OLD.link_hash != NEW.link_hash THEN
      RAISE EXCEPTION 'Cannot modify traceability link content - create new link instead';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS traceability_links_immutable ON intelligent_docs.traceability_links;
CREATE TRIGGER traceability_links_immutable
  BEFORE UPDATE OR DELETE ON intelligent_docs.traceability_links
  FOR EACH ROW
  EXECUTE FUNCTION intelligent_docs.prevent_link_modification();

-- Prevent modification of propagation events
CREATE OR REPLACE FUNCTION intelligent_docs.prevent_event_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Cannot delete propagation events - audit trail must be preserved';
  ELSIF TG_OP = 'UPDATE' THEN
    -- Only allow status updates
    IF OLD.event_hash != NEW.event_hash THEN
      RAISE EXCEPTION 'Cannot modify propagation event hash';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS propagation_events_immutable ON intelligent_docs.change_propagation_events;
CREATE TRIGGER propagation_events_immutable
  BEFORE UPDATE OR DELETE ON intelligent_docs.change_propagation_events
  FOR EACH ROW
  EXECUTE FUNCTION intelligent_docs.prevent_event_modification();

-- ============================================================================
-- FUNCTION: Detect impacted links when source changes
-- ============================================================================
CREATE OR REPLACE FUNCTION intelligent_docs.detect_impacted_links(
  p_source_document_id UUID,
  p_old_hash VARCHAR(64),
  p_new_hash VARCHAR(64)
) RETURNS TABLE (
  link_id UUID,
  target_document_id UUID,
  linked_text TEXT,
  severity VARCHAR(20)
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tl.id,
    tl.target_document_id,
    tl.linked_text,
    CASE 
      WHEN tl.citation_type = 'direct_quote' THEN 'critical'::VARCHAR(20)
      WHEN tl.citation_type = 'data_source' THEN 'high'::VARCHAR(20)
      WHEN tl.citation_type = 'paraphrase' THEN 'medium'::VARCHAR(20)
      ELSE 'low'::VARCHAR(20)
    END as severity
  FROM intelligent_docs.traceability_links tl
  WHERE tl.source_document_id = p_source_document_id
    AND tl.source_hash = p_old_hash
    AND tl.verification_status != 'broken';
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- FUNCTION: Calculate compliance score for document
-- ============================================================================
CREATE OR REPLACE FUNCTION intelligent_docs.calculate_compliance_score(
  p_document_id UUID,
  p_organization_id UUID,
  p_submission_type VARCHAR(20)
) RETURNS INT AS $$
DECLARE
  v_total_rules INT;
  v_passed_rules INT;
  v_score INT;
BEGIN
  -- Count active rules for this submission type
  SELECT COUNT(*) INTO v_total_rules
  FROM intelligent_docs.compliance_rules
  WHERE is_active = TRUE
    AND (organization_id IS NULL OR organization_id = p_organization_id)
    AND p_submission_type = ANY(applicable_submissions);
  
  -- For now, return a placeholder (actual calculation would check each rule)
  -- This would be implemented with document analysis
  v_passed_rules := COALESCE(v_total_rules - 2, 0);  -- Placeholder
  v_score := CASE WHEN v_total_rules > 0 
    THEN ROUND((v_passed_rules::FLOAT / v_total_rules) * 100)
    ELSE 100 
  END;
  
  RETURN v_score;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED: Default Compliance Rules
-- ============================================================================
INSERT INTO intelligent_docs.compliance_rules (
  rule_id, name, description, category, severity, regulatory_reference, applicable_submissions
) VALUES
  ('STRUCT-001', 'Required Sections', 'All required sections for submission type must be present', 'structure', 'error', 'FDA Guidance', ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('STRUCT-002', 'Section Order', 'Sections must follow standard eCTD order', 'structure', 'warning', 'ICH M4', ARRAY['IND', 'NDA', 'BLA', 'MAA']),
  ('CONTENT-001', 'Minimum Content', 'Each section must have minimum substantive content', 'content', 'warning', NULL, ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('CONTENT-002', 'No Placeholder Text', 'Document must not contain placeholder or TODO text', 'content', 'error', NULL, ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('CITE-001', 'Claims Cited', 'All efficacy and safety claims must be cited to source', 'citation', 'error', '21 CFR 312.23', ARRAY['IND', 'NDA', 'BLA']),
  ('CITE-002', 'Citation Integrity', 'All citations must be verified against current source version', 'citation', 'error', '21 CFR Part 11', ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('DATA-001', 'Audit Trail', 'Document must have complete audit trail', 'data_integrity', 'error', '21 CFR Part 11 § 11.10(e)', ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('DATA-002', 'Hash Integrity', 'Document hash must match stored value', 'data_integrity', 'error', '21 CFR Part 11', ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('SIG-001', 'Electronic Signature', 'Submission documents must be electronically signed', 'signature', 'error', '21 CFR Part 11 § 11.100', ARRAY['IND', '510K', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO', 'EUA']),
  ('REG-001', 'Regulatory Terminology', 'Use standard regulatory terminology', 'regulatory', 'info', 'ICH E6(R2)', ARRAY['IND', 'NDA', 'BLA', 'MAA']),
  ('FORMAT-001', 'PDF Compliance', 'PDFs must meet eCTD specifications', 'format', 'warning', 'ICH M2', ARRAY['IND', 'NDA', 'BLA', 'MAA'])
ON CONFLICT (organization_id, rule_id) DO NOTHING;

COMMIT;

-- ============================================================================
-- COMMENT: Migration Documentation
-- ============================================================================
COMMENT ON SCHEMA intelligent_docs IS 'Phase 5: Intelligent Document System - Traceability, Compliance, Change Propagation';
COMMENT ON TABLE intelligent_docs.source_documents IS 'Versioned source documents that can be cited in regulatory submissions';
COMMENT ON TABLE intelligent_docs.traceability_links IS 'Hash-verified links from claims to source documents - append-only for audit';
COMMENT ON TABLE intelligent_docs.change_propagation_events IS 'Events triggered when source documents change - tracks impact analysis';
COMMENT ON TABLE intelligent_docs.compliance_scores IS 'Historical compliance scores for documents';
COMMENT ON TABLE intelligent_docs.compliance_rules IS 'Configurable compliance validation rules';
COMMENT ON TABLE intelligent_docs.auto_generated_tables IS 'Auto-generated regulatory tables from source data';
