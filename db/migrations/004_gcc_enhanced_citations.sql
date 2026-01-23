-- ============================================================================
-- Concept2Cure "Global Command Center" - Enhanced Citations Migration
-- Migration: 004_gcc_enhanced_citations.sql
-- Purpose: Upgrades fragment_truth_links into defensible regulatory citations
--          with evidence strength, source locators, and structured claims
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- ============================================================================

BEGIN;

-- ============================================================================
-- ENHANCE FRAGMENT_TRUTH_LINKS WITH CITATION METADATA
-- ============================================================================
-- Regulators expect traceability: "Which exact dataset/table/endpoint 
-- supports this sentence?" These fields enable defensible citations.
-- ============================================================================

-- Evidence strength classification
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'prose' 
        AND table_name = 'fragment_truth_links'
        AND column_name = 'evidence_strength'
    ) THEN
        ALTER TABLE prose.fragment_truth_links 
        ADD COLUMN evidence_strength TEXT;
        
        COMMENT ON COLUMN prose.fragment_truth_links.evidence_strength IS
            'Strength of evidence: primary_endpoint, secondary_endpoint, exploratory, post_hoc, supportive';
    END IF;
END $$;

-- Source locator (where exactly in the source document)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'prose' 
        AND table_name = 'fragment_truth_links'
        AND column_name = 'source_locator'
    ) THEN
        ALTER TABLE prose.fragment_truth_links 
        ADD COLUMN source_locator JSONB;
        
        COMMENT ON COLUMN prose.fragment_truth_links.source_locator IS
            'Precise location: {csr_section, table_id, figure_id, dataset, variable, page_range}';
    END IF;
END $$;

-- Interpretation note (why the prose interprets the metric this way)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'prose' 
        AND table_name = 'fragment_truth_links'
        AND column_name = 'interpretation_note'
    ) THEN
        ALTER TABLE prose.fragment_truth_links 
        ADD COLUMN interpretation_note TEXT;
        
        COMMENT ON COLUMN prose.fragment_truth_links.interpretation_note IS
            'Rationale for how/why the prose interprets this truth datapoint';
    END IF;
END $$;

-- Structured claim triple (subject-predicate-object)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'prose' 
        AND table_name = 'fragment_truth_links'
        AND column_name = 'claim_subject'
    ) THEN
        ALTER TABLE prose.fragment_truth_links 
        ADD COLUMN claim_subject TEXT,
        ADD COLUMN claim_predicate TEXT,
        ADD COLUMN claim_object TEXT;
        
        COMMENT ON COLUMN prose.fragment_truth_links.claim_subject IS
            'Structured claim: subject (e.g., "Drug X 100mg")';
        COMMENT ON COLUMN prose.fragment_truth_links.claim_predicate IS
            'Structured claim: predicate (e.g., "demonstrated superiority in")';
        COMMENT ON COLUMN prose.fragment_truth_links.claim_object IS
            'Structured claim: object (e.g., "primary endpoint ORR")';
    END IF;
END $$;

-- Citation verified by (who validated this link)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'prose' 
        AND table_name = 'fragment_truth_links'
        AND column_name = 'verified_by'
    ) THEN
        ALTER TABLE prose.fragment_truth_links 
        ADD COLUMN verified_by TEXT,
        ADD COLUMN verified_at TIMESTAMPTZ;
        
        COMMENT ON COLUMN prose.fragment_truth_links.verified_by IS
            'User who verified this citation is accurate';
        COMMENT ON COLUMN prose.fragment_truth_links.verified_at IS
            'When the citation was verified';
    END IF;
END $$;

-- Add constraint for evidence_strength values
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'fragment_truth_links_evidence_strength_valid'
    ) THEN
        ALTER TABLE prose.fragment_truth_links
        ADD CONSTRAINT fragment_truth_links_evidence_strength_valid
        CHECK (evidence_strength IS NULL OR evidence_strength IN (
            'primary_endpoint',
            'secondary_endpoint',
            'exploratory',
            'post_hoc',
            'supportive',
            'safety_signal',
            'pk_parameter',
            'pd_marker',
            'biomarker',
            'historical_control'
        ));
    END IF;
END $$;

-- Index for evidence strength queries
CREATE INDEX IF NOT EXISTS fragment_truth_links_evidence_idx 
    ON prose.fragment_truth_links (evidence_strength);

-- ============================================================================
-- CITATION APPENDIX VIEW
-- ============================================================================
-- Generates a citation appendix per eCTD section showing all truth references

CREATE OR REPLACE VIEW prose.v_citation_appendix AS
SELECT 
    sf.ectd_section_path,
    sf.jurisdiction,
    sf.id AS fragment_id,
    sf.version_id AS fragment_version,
    SUBSTRING(sf.content_prose FROM 1 FOR 200) AS prose_excerpt,
    ftl.claim_kind,
    ftl.evidence_strength,
    cts.nct_id,
    cts.metric_name,
    cts.metric_value_float,
    cts.metric_value_text,
    cts.is_primary_endpoint,
    cts.source_document_ref AS truth_source,
    ftl.source_locator,
    ftl.interpretation_note,
    ftl.claim_subject,
    ftl.claim_predicate,
    ftl.claim_object,
    ftl.verified_by,
    ftl.verified_at,
    ftl.created_at AS link_created
FROM prose.smart_fragments sf
JOIN prose.fragment_truth_links ftl ON sf.id = ftl.fragment_id
JOIN truth.clinical_truth_store cts ON ftl.truth_id = cts.id
ORDER BY 
    sf.ectd_section_path,
    sf.id,
    CASE ftl.evidence_strength
        WHEN 'primary_endpoint' THEN 1
        WHEN 'secondary_endpoint' THEN 2
        WHEN 'exploratory' THEN 3
        ELSE 4
    END;

COMMENT ON VIEW prose.v_citation_appendix IS
    'Citation appendix showing all truth references for each prose fragment';

-- ============================================================================
-- UNLINKED HIGH-RISK FRAGMENTS VIEW
-- ============================================================================
-- Identifies fragments that make claims but lack supporting truth links
-- Critical for submission gate checking

CREATE OR REPLACE VIEW prose.v_unlinked_fragments AS
SELECT 
    sf.id AS fragment_id,
    sf.ectd_section_path,
    sf.jurisdiction,
    sf.content_prose,
    sf.objectivity_score,
    sf.confidence_rating,
    sf.created_at,
    sf.updated_at,
    COUNT(ftl.id) AS truth_link_count,
    CASE 
        WHEN sf.ectd_section_path LIKE 'm2.7.3%' THEN 'efficacy'
        WHEN sf.ectd_section_path LIKE 'm2.7.4%' THEN 'safety'
        WHEN sf.ectd_section_path LIKE 'm2.5%' THEN 'clinical_overview'
        WHEN sf.ectd_section_path LIKE 'm3%' THEN 'quality'
        ELSE 'other'
    END AS section_type,
    CASE 
        WHEN COUNT(ftl.id) = 0 AND sf.objectivity_score > 0.7 THEN 'HIGH_RISK'
        WHEN COUNT(ftl.id) = 0 AND sf.objectivity_score > 0.4 THEN 'MEDIUM_RISK'
        WHEN COUNT(ftl.id) = 0 THEN 'LOW_RISK'
        ELSE 'LINKED'
    END AS link_status
FROM prose.smart_fragments sf
LEFT JOIN prose.fragment_truth_links ftl ON sf.id = ftl.fragment_id
GROUP BY sf.id
HAVING COUNT(ftl.id) = 0 OR sf.objectivity_score > 0.5
ORDER BY 
    CASE 
        WHEN COUNT(ftl.id) = 0 AND sf.objectivity_score > 0.7 THEN 1
        WHEN COUNT(ftl.id) = 0 AND sf.objectivity_score > 0.4 THEN 2
        ELSE 3
    END,
    sf.ectd_section_path;

COMMENT ON VIEW prose.v_unlinked_fragments IS
    'Fragments lacking truth links, prioritized by risk (high objectivity claims without evidence)';

-- ============================================================================
-- TRUTH COVERAGE SUMMARY VIEW
-- ============================================================================
-- Shows how well each truth datapoint is cited across prose

CREATE OR REPLACE VIEW truth.v_citation_coverage AS
SELECT 
    cts.id AS truth_id,
    cts.nct_id,
    cts.metric_name,
    cts.metric_value_float,
    cts.metric_value_text,
    cts.is_primary_endpoint,
    cts.source_document_ref,
    COUNT(DISTINCT ftl.fragment_id) AS fragment_citation_count,
    COUNT(DISTINCT sf.ectd_section_path) AS section_citation_count,
    ARRAY_AGG(DISTINCT sf.ectd_section_path) AS cited_in_sections,
    ARRAY_AGG(DISTINCT ftl.claim_kind) AS claim_kinds_used,
    CASE 
        WHEN cts.is_primary_endpoint AND COUNT(ftl.id) = 0 THEN 'UNCITED_PRIMARY'
        WHEN COUNT(ftl.id) = 0 THEN 'UNCITED'
        WHEN COUNT(ftl.id) < 3 THEN 'LOW_COVERAGE'
        ELSE 'ADEQUATE'
    END AS coverage_status
FROM truth.clinical_truth_store cts
LEFT JOIN prose.fragment_truth_links ftl ON cts.id = ftl.truth_id
LEFT JOIN prose.smart_fragments sf ON ftl.fragment_id = sf.id
GROUP BY cts.id
ORDER BY 
    CASE WHEN cts.is_primary_endpoint THEN 0 ELSE 1 END,
    COUNT(ftl.id) ASC;

COMMENT ON VIEW truth.v_citation_coverage IS
    'Shows citation coverage for each truth datapoint across prose fragments';

COMMIT;
