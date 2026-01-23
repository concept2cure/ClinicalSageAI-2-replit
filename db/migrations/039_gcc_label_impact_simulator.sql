-- Migration: 039_gcc_label_impact_simulator.sql
-- Purpose: Label Impact Simulator - SPL linkage, version comparison, impact scoring
-- Part of Phase 2 - 038+ Migrations

BEGIN;

-- =============================================================================
-- LABEL MANAGEMENT SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS labeling;

-- =============================================================================
-- SPL (Structured Product Labeling) DOCUMENT MANAGEMENT
-- =============================================================================

CREATE TYPE labeling.spl_document_type AS ENUM (
    'PI',           -- Prescribing Information (Package Insert)
    'PPI',          -- Patient Package Insert
    'MG',           -- Medication Guide
    'IFU',          -- Instructions for Use
    'REMS',         -- Risk Evaluation and Mitigation Strategy
    'SUPPLEMENT'    -- Supplemental labeling
);

CREATE TYPE labeling.spl_status AS ENUM (
    'DRAFT',
    'UNDER_REVIEW',
    'APPROVED',
    'SUPERSEDED',
    'WITHDRAWN'
);

CREATE TABLE labeling.spl_documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
    
    -- SPL Identification
    spl_set_id          UUID NOT NULL,              -- FDA SPL Set ID
    spl_version         INTEGER NOT NULL DEFAULT 1,
    document_type       labeling.spl_document_type NOT NULL,
    
    -- Content
    effective_date      DATE,
    title               TEXT NOT NULL,
    xml_content         TEXT,                       -- Full SPL XML
    content_hash        TEXT,                       -- SHA256 of content
    
    -- Status
    status              labeling.spl_status NOT NULL DEFAULT 'DRAFT',
    
    -- Linkage
    previous_version_id UUID REFERENCES labeling.spl_documents(id),
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at         TIMESTAMPTZ,
    approved_by         UUID,
    
    UNIQUE(spl_set_id, spl_version)
);

CREATE INDEX idx_spl_documents_program ON labeling.spl_documents(program_id);
CREATE INDEX idx_spl_documents_set ON labeling.spl_documents(spl_set_id);
CREATE INDEX idx_spl_documents_status ON labeling.spl_documents(status);

COMMENT ON TABLE labeling.spl_documents IS 
'Structured Product Labeling documents per FDA SPL format. Versioned with full content tracking.';

-- =============================================================================
-- LABEL SECTIONS (Granular section tracking for impact analysis)
-- =============================================================================

CREATE TABLE labeling.spl_sections (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    spl_document_id     UUID NOT NULL REFERENCES labeling.spl_documents(id) ON DELETE CASCADE,
    
    -- Section Identification (per FDA SPL LOINC codes)
    loinc_code          TEXT NOT NULL,              -- e.g., "34066-1" for Boxed Warning
    section_name        TEXT NOT NULL,
    section_number      TEXT,                       -- e.g., "1", "5.1"
    
    -- Content
    content_text        TEXT,
    content_html        TEXT,
    content_hash        TEXT,                       -- SHA256 for change detection
    
    -- Hierarchy
    parent_section_id   UUID REFERENCES labeling.spl_sections(id),
    sort_order          INTEGER DEFAULT 0,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_spl_sections_document ON labeling.spl_sections(spl_document_id);
CREATE INDEX idx_spl_sections_loinc ON labeling.spl_sections(loinc_code);
CREATE INDEX idx_spl_sections_parent ON labeling.spl_sections(parent_section_id);

COMMENT ON TABLE labeling.spl_sections IS 
'Individual sections within SPL documents. Tracked by LOINC code for impact analysis.';

-- Insert standard FDA labeling sections (LOINC codes)
INSERT INTO labeling.spl_sections (id, spl_document_id, loinc_code, section_name, sort_order)
SELECT 
    gen_random_uuid(),
    (SELECT id FROM labeling.spl_documents LIMIT 1),  -- Will be updated per document
    loinc_code,
    section_name,
    sort_order
FROM (VALUES
    ('34066-1', 'Boxed Warning', 1),
    ('34067-9', 'Indications and Usage', 2),
    ('34068-7', 'Dosage and Administration', 3),
    ('34070-3', 'Contraindications', 4),
    ('34071-1', 'Warnings and Precautions', 5),
    ('34084-4', 'Adverse Reactions', 6),
    ('34073-7', 'Drug Interactions', 7),
    ('43684-0', 'Use in Specific Populations', 8),
    ('34088-5', 'Overdosage', 9),
    ('34089-3', 'Description', 10),
    ('34090-1', 'Clinical Pharmacology', 11),
    ('34092-7', 'Clinical Studies', 12),
    ('34093-5', 'References', 13),
    ('34069-5', 'How Supplied/Storage', 14),
    ('34091-9', 'Patient Counseling Information', 15)
) AS sections(loinc_code, section_name, sort_order)
WHERE EXISTS (SELECT 1 FROM labeling.spl_documents LIMIT 1)
ON CONFLICT DO NOTHING;

-- =============================================================================
-- LABEL CHANGE TRACKING
-- =============================================================================

CREATE TYPE labeling.change_type AS ENUM (
    'ADDITION',
    'MODIFICATION',
    'DELETION',
    'REFORMATTING'
);

CREATE TYPE labeling.change_impact AS ENUM (
    'CRITICAL',     -- Safety-related, requires immediate notification
    'HIGH',         -- Significant clinical impact
    'MEDIUM',       -- Moderate clinical relevance
    'LOW',          -- Minor clarification
    'MINIMAL'       -- Editorial/formatting only
);

CREATE TABLE labeling.label_changes (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Version comparison
    from_document_id    UUID NOT NULL REFERENCES labeling.spl_documents(id),
    to_document_id      UUID NOT NULL REFERENCES labeling.spl_documents(id),
    from_section_id     UUID REFERENCES labeling.spl_sections(id),
    to_section_id       UUID REFERENCES labeling.spl_sections(id),
    
    -- Change details
    change_type         labeling.change_type NOT NULL,
    change_impact       labeling.change_impact NOT NULL,
    
    -- Content diff
    old_text            TEXT,
    new_text            TEXT,
    diff_html           TEXT,                       -- Visual diff rendering
    
    -- Impact analysis
    impact_score        NUMERIC(5,2),               -- 0-100 scale
    impact_rationale    TEXT,
    affected_populations TEXT[],                    -- e.g., ['pediatric', 'pregnant']
    
    -- Status
    reviewed            BOOLEAN DEFAULT FALSE,
    reviewed_by         UUID,
    reviewed_at         TIMESTAMPTZ,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID
);

CREATE INDEX idx_label_changes_documents ON labeling.label_changes(from_document_id, to_document_id);
CREATE INDEX idx_label_changes_impact ON labeling.label_changes(change_impact);
CREATE INDEX idx_label_changes_score ON labeling.label_changes(impact_score DESC);

COMMENT ON TABLE labeling.label_changes IS 
'Tracked changes between SPL document versions with impact scoring.';

-- =============================================================================
-- IMPACT SIMULATION RUNS
-- =============================================================================

CREATE TYPE labeling.simulation_status AS ENUM (
    'PENDING',
    'RUNNING',
    'COMPLETED',
    'FAILED'
);

CREATE TABLE labeling.impact_simulations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
    
    -- Simulation scope
    base_document_id    UUID NOT NULL REFERENCES labeling.spl_documents(id),
    proposed_changes    JSONB NOT NULL,             -- Array of proposed modifications
    
    -- Results
    status              labeling.simulation_status NOT NULL DEFAULT 'PENDING',
    total_changes       INTEGER DEFAULT 0,
    critical_changes    INTEGER DEFAULT 0,
    high_impact_changes INTEGER DEFAULT 0,
    overall_impact_score NUMERIC(5,2),
    
    -- Analysis output
    simulation_results  JSONB,                      -- Full analysis results
    recommendations     TEXT[],
    
    -- Execution
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    execution_ms        INTEGER,
    error_message       TEXT,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID
);

CREATE INDEX idx_impact_simulations_program ON labeling.impact_simulations(program_id);
CREATE INDEX idx_impact_simulations_status ON labeling.impact_simulations(status);

COMMENT ON TABLE labeling.impact_simulations IS 
'Label impact simulation runs for proposed changes analysis.';

-- =============================================================================
-- REGULATORY CROSS-REFERENCES
-- =============================================================================

CREATE TABLE labeling.regulatory_references (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    section_id          UUID NOT NULL REFERENCES labeling.spl_sections(id) ON DELETE CASCADE,
    
    -- Reference type
    reference_type      TEXT NOT NULL,              -- 'CLINICAL_STUDY', 'ADVERSE_EVENT', 'SAFETY_SIGNAL'
    reference_id        UUID NOT NULL,              -- ID in source table
    reference_table     TEXT NOT NULL,              -- Source table name
    
    -- Citation details
    citation_text       TEXT,
    supporting_data     JSONB,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID
);

CREATE INDEX idx_regulatory_refs_section ON labeling.regulatory_references(section_id);
CREATE INDEX idx_regulatory_refs_type ON labeling.regulatory_references(reference_type, reference_id);

COMMENT ON TABLE labeling.regulatory_references IS 
'Cross-references from label sections to clinical studies, adverse events, and safety signals.';

-- =============================================================================
-- IMPACT SCORING FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION labeling.calculate_impact_score(
    p_change_type labeling.change_type,
    p_section_loinc TEXT,
    p_text_length_change INTEGER,
    p_contains_safety_terms BOOLEAN DEFAULT FALSE
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_base_score NUMERIC := 0;
    v_section_weight NUMERIC := 1.0;
BEGIN
    -- Base score by change type
    v_base_score := CASE p_change_type
        WHEN 'ADDITION' THEN 40
        WHEN 'MODIFICATION' THEN 30
        WHEN 'DELETION' THEN 50
        WHEN 'REFORMATTING' THEN 5
        ELSE 20
    END;
    
    -- Section weight (critical sections score higher)
    v_section_weight := CASE p_section_loinc
        WHEN '34066-1' THEN 2.5  -- Boxed Warning
        WHEN '34070-3' THEN 2.0  -- Contraindications
        WHEN '34071-1' THEN 2.0  -- Warnings and Precautions
        WHEN '34084-4' THEN 1.8  -- Adverse Reactions
        WHEN '34073-7' THEN 1.5  -- Drug Interactions
        WHEN '43684-0' THEN 1.5  -- Use in Specific Populations
        ELSE 1.0
    END;
    
    -- Calculate final score
    v_base_score := v_base_score * v_section_weight;
    
    -- Adjust for safety terms
    IF p_contains_safety_terms THEN
        v_base_score := v_base_score * 1.5;
    END IF;
    
    -- Adjust for text length change magnitude
    IF p_text_length_change > 500 THEN
        v_base_score := v_base_score * 1.3;
    ELSIF p_text_length_change > 200 THEN
        v_base_score := v_base_score * 1.1;
    END IF;
    
    -- Cap at 100
    RETURN LEAST(100, ROUND(v_base_score, 2));
END;
$$;

COMMENT ON FUNCTION labeling.calculate_impact_score IS 
'Calculate impact score for label changes based on change type, section, and content analysis.';

-- =============================================================================
-- LABEL COMPARISON FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION labeling.compare_documents(
    p_from_document_id UUID,
    p_to_document_id UUID,
    p_created_by UUID DEFAULT NULL
)
RETURNS TABLE (
    changes_detected INTEGER,
    critical_count INTEGER,
    high_count INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_changes INTEGER := 0;
    v_critical INTEGER := 0;
    v_high INTEGER := 0;
BEGIN
    -- Insert changes for modified sections
    INSERT INTO labeling.label_changes (
        from_document_id,
        to_document_id,
        from_section_id,
        to_section_id,
        change_type,
        change_impact,
        old_text,
        new_text,
        impact_score,
        created_by
    )
    SELECT 
        p_from_document_id,
        p_to_document_id,
        fs.id,
        ts.id,
        CASE 
            WHEN fs.content_hash IS NULL THEN 'ADDITION'::labeling.change_type
            WHEN ts.content_hash IS NULL THEN 'DELETION'::labeling.change_type
            ELSE 'MODIFICATION'::labeling.change_type
        END,
        CASE 
            WHEN fs.loinc_code IN ('34066-1', '34070-3', '34071-1') THEN 'CRITICAL'::labeling.change_impact
            WHEN fs.loinc_code IN ('34084-4', '34073-7') THEN 'HIGH'::labeling.change_impact
            ELSE 'MEDIUM'::labeling.change_impact
        END,
        fs.content_text,
        ts.content_text,
        labeling.calculate_impact_score(
            CASE 
                WHEN fs.content_hash IS NULL THEN 'ADDITION'::labeling.change_type
                WHEN ts.content_hash IS NULL THEN 'DELETION'::labeling.change_type
                ELSE 'MODIFICATION'::labeling.change_type
            END,
            COALESCE(fs.loinc_code, ts.loinc_code),
            COALESCE(LENGTH(ts.content_text), 0) - COALESCE(LENGTH(fs.content_text), 0),
            FALSE
        ),
        p_created_by
    FROM labeling.spl_sections fs
    FULL OUTER JOIN labeling.spl_sections ts 
        ON fs.loinc_code = ts.loinc_code
    WHERE fs.spl_document_id = p_from_document_id
      AND ts.spl_document_id = p_to_document_id
      AND COALESCE(fs.content_hash, '') != COALESCE(ts.content_hash, '');
    
    GET DIAGNOSTICS v_changes = ROW_COUNT;
    
    -- Count by impact
    SELECT 
        COUNT(*) FILTER (WHERE change_impact = 'CRITICAL'),
        COUNT(*) FILTER (WHERE change_impact = 'HIGH')
    INTO v_critical, v_high
    FROM labeling.label_changes
    WHERE from_document_id = p_from_document_id
      AND to_document_id = p_to_document_id;
    
    RETURN QUERY SELECT v_changes, v_critical, v_high;
END;
$$;

-- =============================================================================
-- VIEW: Label Change Dashboard
-- =============================================================================

CREATE OR REPLACE VIEW labeling.v_label_change_dashboard AS
SELECT 
    lc.id AS change_id,
    fd.program_id,
    p.code AS program_code,
    fd.spl_set_id,
    fd.spl_version AS from_version,
    td.spl_version AS to_version,
    lc.change_type,
    lc.change_impact,
    lc.impact_score,
    fs.section_name,
    fs.loinc_code,
    lc.reviewed,
    lc.created_at
FROM labeling.label_changes lc
JOIN labeling.spl_documents fd ON fd.id = lc.from_document_id
JOIN labeling.spl_documents td ON td.id = lc.to_document_id
JOIN core.programs p ON p.id = fd.program_id
LEFT JOIN labeling.spl_sections fs ON fs.id = lc.from_section_id
ORDER BY lc.impact_score DESC, lc.created_at DESC;

COMMENT ON VIEW labeling.v_label_change_dashboard IS 
'Dashboard view of label changes with impact scores and review status.';

COMMIT;
