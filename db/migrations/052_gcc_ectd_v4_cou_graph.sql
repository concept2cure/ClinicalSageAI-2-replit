-- ============================================================================
-- Migration 052: eCTD v4.0 Context of Use (CoU) Graph Model
-- Purpose: Implements HL7 RPS-compliant graph structure for eCTD v4.0
--          Replaces hierarchical folder model with object-oriented graph
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Reference: ICH eCTD v4.0, HL7 Regulated Product Submission (RPS)
-- Compliance: FDA 21 CFR Part 11, ICH M8
-- ============================================================================

BEGIN;

-- Create ectd_v4 schema for v4.0-specific objects
CREATE SCHEMA IF NOT EXISTS ectd_v4;

COMMENT ON SCHEMA ectd_v4 IS 
  'eCTD v4.0 HL7 RPS-compliant graph model - Context of Use architecture';

-- =============================================================================
-- A) TYPES AND ENUMS
-- =============================================================================

DO $$ BEGIN
    CREATE TYPE ectd_v4.lifecycle_status AS ENUM (
        'ACTIVE',                  -- Current and visible
        'REPLACED',                -- Superseded by another CoU
        'SUSPENDED',               -- Removed but preserved (v4.0 "Delete")
        'PENDING',                 -- Draft, not yet submitted
        'UNDER_REVIEW'             -- Submitted, awaiting agency review
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE ectd_v4.submission_unit_type AS ENUM (
        'ORIGINAL_APPLICATION',    -- Initial submission
        'AMENDMENT',               -- IND amendment
        'SUPPLEMENT',              -- NDA/BLA supplement
        'ANNUAL_REPORT',           -- Annual report
        'RESPONSE',                -- Response to IR/CRL
        'SAFETY_REPORT',           -- Safety update
        'RESUBMISSION',            -- After CRL
        'LABELING_SUPPLEMENT'      -- Labeling changes only
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE ectd_v4.lifecycle_operation AS ENUM (
        'NEW',                     -- Create new CoU
        'REPLACE',                 -- Replace existing CoU(s)
        'SUSPEND',                 -- Remove from current view
        'APPEND',                  -- Add to existing (rare in v4.0)
        'REINSTATE'                -- Bring back suspended CoU
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- =============================================================================
-- B) REGULATORY SUBMISSIONS (The "Project")
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_v4.regulatory_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization (tenant ownership via RLS)
    org_id UUID NOT NULL,                    -- FK to identity.organizations
    
    -- Application Identity
    application_number TEXT,                 -- IND 123456, NDA 210001, K201234
    application_type TEXT NOT NULL,          -- 'IND', 'NDA', 'BLA', '510K', 'PMA'
    proprietary_name TEXT,                   -- Drug/Device name
    established_name TEXT,                   -- Generic/scientific name
    
    -- Regulatory Target
    authority_id TEXT NOT NULL,              -- FK to common_standards.global_regulatory_authorities
    
    -- Submission Metadata
    sponsor_name TEXT NOT NULL,
    sponsor_contact_id UUID,                 -- FK to identity.users
    
    -- eCTD Version
    ectd_version TEXT NOT NULL DEFAULT 'v4.0',
    
    -- Program Linkage
    program_id UUID,                         -- FK to core.programs
    
    -- State
    lifecycle_status ectd_v4.lifecycle_status NOT NULL DEFAULT 'PENDING',
    
    -- Dates
    initial_submission_date DATE,
    approval_date DATE,
    
    -- Tracking
    internal_tracking_number TEXT,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE ectd_v4.regulatory_submissions IS 
  'The regulatory application container - IND, NDA, BLA, 510(k), etc.';

CREATE INDEX IF NOT EXISTS rs_org_idx ON ectd_v4.regulatory_submissions(org_id);
CREATE INDEX IF NOT EXISTS rs_app_num_idx ON ectd_v4.regulatory_submissions(application_number);
CREATE INDEX IF NOT EXISTS rs_authority_idx ON ectd_v4.regulatory_submissions(authority_id);
CREATE INDEX IF NOT EXISTS rs_program_idx ON ectd_v4.regulatory_submissions(program_id);
CREATE INDEX IF NOT EXISTS rs_type_idx ON ectd_v4.regulatory_submissions(application_type);

-- =============================================================================
-- C) SUBMISSION UNITS (Sequences)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_v4.submission_units (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- The v4.0 UUID
    
    submission_id UUID NOT NULL REFERENCES ectd_v4.regulatory_submissions(id) ON DELETE CASCADE,
    
    -- Sequence Identification
    sequence_number TEXT NOT NULL,           -- '0000', '0001', '0002'
    sequence_description TEXT,               -- 'Original Application', 'Amendment 1'
    
    -- Unit Type
    submission_unit_type ectd_v4.submission_unit_type NOT NULL,
    
    -- Regulatory Activity
    regulatory_activity_code TEXT,           -- CV code for the activity
    regulatory_activity_description TEXT,
    
    -- Related Unit (for responses/amendments)
    related_unit_id UUID REFERENCES ectd_v4.submission_units(id),
    related_unit_type TEXT,                  -- 'RESPONSE_TO', 'AMENDMENT_TO'
    
    -- State
    lifecycle_status ectd_v4.lifecycle_status NOT NULL DEFAULT 'PENDING',
    is_locked_for_publishing BOOLEAN DEFAULT FALSE,
    
    -- Validation
    validation_status TEXT DEFAULT 'NOT_STARTED', -- 'NOT_STARTED', 'IN_PROGRESS', 'PASSED', 'FAILED'
    last_validation_at TIMESTAMPTZ,
    validation_errors JSONB,
    
    -- Neon Branch Tracking (for validation sandboxing)
    validation_branch_id TEXT,
    
    -- Submission Dates
    planned_submission_date DATE,
    actual_submission_date DATE,
    acknowledgment_date DATE,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system',
    
    CONSTRAINT unique_sequence UNIQUE (submission_id, sequence_number)
);

COMMENT ON TABLE ectd_v4.submission_units IS 
  'eCTD sequences - packages sent to regulatory authorities';

CREATE INDEX IF NOT EXISTS su_submission_idx ON ectd_v4.submission_units(submission_id);
CREATE INDEX IF NOT EXISTS su_status_idx ON ectd_v4.submission_units(lifecycle_status);
CREATE INDEX IF NOT EXISTS su_locked_idx ON ectd_v4.submission_units(is_locked_for_publishing);

-- =============================================================================
-- D) DOCUMENTS (Reusable Content Objects)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_v4.documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Organization ownership
    org_id UUID NOT NULL,
    
    -- Document Identity
    title TEXT NOT NULL,
    document_type_code TEXT,                 -- FK to common_standards.document_types
    version_label TEXT DEFAULT 'v1.0',
    
    -- Storage
    storage_provider TEXT DEFAULT 'S3',      -- 'S3', 'AZURE_BLOB', 'GCS'
    storage_url TEXT NOT NULL,               -- Full URL/path to file
    storage_region TEXT,                     -- For compliance tracking
    
    -- File Properties
    original_filename TEXT NOT NULL,
    mime_type TEXT NOT NULL DEFAULT 'application/pdf',
    file_size_bytes BIGINT,
    page_count INT,
    
    -- Integrity (Part 11 + FDA validation)
    checksum_md5 TEXT NOT NULL,              -- Required by FDA
    checksum_sha256 TEXT,                    -- Additional integrity
    
    -- PDF Compliance
    has_bookmarks BOOLEAN,
    has_hyperlinks BOOLEAN,
    is_pdf_a_compliant BOOLEAN,              -- PDF/A archival format
    pdf_version TEXT,
    
    -- Virus Scan
    virus_scan_status TEXT DEFAULT 'PENDING', -- 'PENDING', 'CLEAN', 'INFECTED', 'ERROR'
    virus_scan_at TIMESTAMPTZ,
    virus_scan_engine TEXT,
    
    -- eCTD Reuse (v4.0 key feature)
    -- A single document can be referenced by multiple CoUs
    is_reusable BOOLEAN DEFAULT TRUE,
    reuse_count INT DEFAULT 0,
    
    -- Metadata
    language_code TEXT DEFAULT 'en',
    keywords TEXT[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system',
    uploaded_by UUID                         -- FK to identity.users
);

COMMENT ON TABLE ectd_v4.documents IS 
  'Reusable document objects - can be referenced across multiple submissions';

COMMENT ON COLUMN ectd_v4.documents.checksum_md5 IS 
  'MD5 hash required by FDA for file integrity validation';

CREATE INDEX IF NOT EXISTS doc_org_idx ON ectd_v4.documents(org_id);
CREATE INDEX IF NOT EXISTS doc_type_idx ON ectd_v4.documents(document_type_code);
CREATE INDEX IF NOT EXISTS doc_checksum_idx ON ectd_v4.documents(checksum_md5);
CREATE INDEX IF NOT EXISTS doc_reusable_idx ON ectd_v4.documents(is_reusable) WHERE is_reusable = TRUE;

-- =============================================================================
-- E) CONTEXT OF USE ELEMENTS (The "Nodes" - Core v4.0 Innovation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_v4.context_of_use_elements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- The CoU UUID (stable identifier)
    
    submission_unit_id UUID NOT NULL REFERENCES ectd_v4.submission_units(id) ON DELETE CASCADE,
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- THE "WHERE" - Context Group and Keywords
    -- ═══════════════════════════════════════════════════════════════════════
    
    -- Context Group (the eCTD section - CV code)
    context_group_code TEXT NOT NULL,        -- e.g., 'm3-2-s-drug-substance', '32s22'
    context_group_cv_term_id UUID,           -- FK to common_standards.cv_terms
    
    -- Keywords (Sender-Defined grouping within context group)
    keyword_code TEXT,                       -- Internal code (e.g., 'manufacturer-a')
    keyword_definition_id UUID,              -- FK to keyword_definitions
    
    -- Priority (Sort Order - since v4.0 has no folder hierarchy)
    priority_number INT NOT NULL DEFAULT 1,  -- Determines display order within section
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- THE "WHAT" - Document Reference
    -- ═══════════════════════════════════════════════════════════════════════
    
    document_reference_id UUID REFERENCES ectd_v4.documents(id),
    
    -- Or external reference (URL to external document)
    external_reference_url TEXT,
    external_reference_type TEXT,            -- 'DMF', 'PUBLISHED_LITERATURE', 'STANDARD'
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- LIFECYCLE
    -- ═══════════════════════════════════════════════════════════════════════
    
    lifecycle_status ectd_v4.lifecycle_status NOT NULL DEFAULT 'ACTIVE',
    lifecycle_operation ectd_v4.lifecycle_operation NOT NULL DEFAULT 'NEW',
    
    -- Replacement Chain (v4.0 allows many-to-many replacements)
    replaces_cou_ids UUID[],                 -- This CoU replaces these CoUs
    replaced_by_cou_id UUID,                 -- This CoU was replaced by this one
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- HIERARCHY (Adjacency List for Tree Traversal)
    -- ═══════════════════════════════════════════════════════════════════════
    
    parent_cou_id UUID REFERENCES ectd_v4.context_of_use_elements(id),
    tree_level INT NOT NULL DEFAULT 1,
    tree_path TEXT,                          -- Materialized path for fast queries (e.g., '1.3.2.1')
    
    -- ═══════════════════════════════════════════════════════════════════════
    -- METADATA
    -- ═══════════════════════════════════════════════════════════════════════
    
    title TEXT,                              -- Display title (optional override)
    description TEXT,
    
    -- Applicability
    is_regional BOOLEAN DEFAULT FALSE,       -- Regional vs global content
    applicable_regions TEXT[],               -- ['US', 'EU', 'JP'] if regional
    
    -- Compliance Flags
    is_required BOOLEAN DEFAULT FALSE,       -- Mandatory per guidance
    is_provided BOOLEAN DEFAULT FALSE,       -- Actually provided
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_by TEXT NOT NULL DEFAULT 'system'
);

COMMENT ON TABLE ectd_v4.context_of_use_elements IS 
  'eCTD v4.0 Context of Use - the graph nodes linking documents to eCTD structure';

COMMENT ON COLUMN ectd_v4.context_of_use_elements.context_group_code IS 
  'The eCTD section (replaces v3.2.2 folder path)';

COMMENT ON COLUMN ectd_v4.context_of_use_elements.priority_number IS 
  'Sort order within section - since v4.0 has no implicit folder ordering';

COMMENT ON COLUMN ectd_v4.context_of_use_elements.replaces_cou_ids IS 
  'v4.0 allows many-to-one and one-to-many replacements';

CREATE INDEX IF NOT EXISTS cou_unit_idx ON ectd_v4.context_of_use_elements(submission_unit_id);
CREATE INDEX IF NOT EXISTS cou_context_idx ON ectd_v4.context_of_use_elements(context_group_code);
CREATE INDEX IF NOT EXISTS cou_doc_idx ON ectd_v4.context_of_use_elements(document_reference_id);
CREATE INDEX IF NOT EXISTS cou_parent_idx ON ectd_v4.context_of_use_elements(parent_cou_id);
CREATE INDEX IF NOT EXISTS cou_status_idx ON ectd_v4.context_of_use_elements(lifecycle_status);
CREATE INDEX IF NOT EXISTS cou_path_idx ON ectd_v4.context_of_use_elements(tree_path);
CREATE INDEX IF NOT EXISTS cou_keyword_idx ON ectd_v4.context_of_use_elements(keyword_code);

-- =============================================================================
-- F) KEYWORD DEFINITIONS (Sender-Defined Keywords)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_v4.keyword_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    submission_unit_id UUID NOT NULL REFERENCES ectd_v4.submission_units(id) ON DELETE CASCADE,
    
    -- Keyword Identity
    keyword_code TEXT NOT NULL,              -- Internal code (e.g., 'site-101', 'batch-a')
    display_name TEXT NOT NULL,              -- Human readable (e.g., 'Boston Medical Center')
    
    -- v4.0 allows renaming without file changes
    previous_display_name TEXT,
    
    -- Category (for grouping in UI)
    keyword_category TEXT,                   -- 'SITE', 'BATCH', 'MANUFACTURER', 'INDICATION'
    
    -- Description
    description TEXT,
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT unique_keyword_per_unit UNIQUE (submission_unit_id, keyword_code)
);

COMMENT ON TABLE ectd_v4.keyword_definitions IS 
  'Sender-Defined Keywords - custom grouping logic within context groups';

CREATE INDEX IF NOT EXISTS kd_unit_idx ON ectd_v4.keyword_definitions(submission_unit_id);
CREATE INDEX IF NOT EXISTS kd_code_idx ON ectd_v4.keyword_definitions(keyword_code);

-- =============================================================================
-- G) COu RELATIONSHIPS (Graph Edges)
-- =============================================================================

CREATE TABLE IF NOT EXISTS ectd_v4.cou_relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    source_cou_id UUID NOT NULL REFERENCES ectd_v4.context_of_use_elements(id) ON DELETE CASCADE,
    target_cou_id UUID NOT NULL REFERENCES ectd_v4.context_of_use_elements(id) ON DELETE CASCADE,
    
    -- Relationship Type
    relationship_type TEXT NOT NULL,         -- 'REPLACES', 'REFERENCES', 'APPENDIX_TO', 'SUPPLEMENT_TO'
    
    -- Metadata
    description TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT no_self_reference CHECK (source_cou_id != target_cou_id),
    CONSTRAINT unique_relationship UNIQUE (source_cou_id, target_cou_id, relationship_type)
);

COMMENT ON TABLE ectd_v4.cou_relationships IS 
  'Graph edges between CoU elements - replacement chains, references';

CREATE INDEX IF NOT EXISTS cou_rel_source_idx ON ectd_v4.cou_relationships(source_cou_id);
CREATE INDEX IF NOT EXISTS cou_rel_target_idx ON ectd_v4.cou_relationships(target_cou_id);
CREATE INDEX IF NOT EXISTS cou_rel_type_idx ON ectd_v4.cou_relationships(relationship_type);

-- =============================================================================
-- H) RECURSIVE CTE FUNCTION: Build Virtual Tree
-- =============================================================================

-- Reconstructs the hierarchical view from the flat CoU table
CREATE OR REPLACE FUNCTION ectd_v4.get_submission_tree(p_unit_id UUID)
RETURNS TABLE (
    cou_id UUID,
    context_group_code TEXT,
    title TEXT,
    document_title TEXT,
    parent_cou_id UUID,
    depth INT,
    path TEXT,
    priority_number INT,
    lifecycle_status ectd_v4.lifecycle_status,
    has_document BOOLEAN
)
LANGUAGE SQL
STABLE
AS $$
    WITH RECURSIVE node_tree AS (
        -- Base case: Root nodes (no parent)
        SELECT 
            c.id,
            c.context_group_code,
            COALESCE(c.title, c.context_group_code) AS title,
            d.title AS document_title,
            c.parent_cou_id,
            1 AS depth,
            c.priority_number::TEXT AS path,
            c.priority_number,
            c.lifecycle_status,
            (c.document_reference_id IS NOT NULL) AS has_document
        FROM ectd_v4.context_of_use_elements c
        LEFT JOIN ectd_v4.documents d ON c.document_reference_id = d.id
        WHERE c.submission_unit_id = p_unit_id
          AND c.parent_cou_id IS NULL
          AND c.lifecycle_status = 'ACTIVE'
        
        UNION ALL
        
        -- Recursive: Children
        SELECT 
            c.id,
            c.context_group_code,
            COALESCE(c.title, c.context_group_code) AS title,
            d.title AS document_title,
            c.parent_cou_id,
            p.depth + 1,
            p.path || '.' || c.priority_number::TEXT,
            c.priority_number,
            c.lifecycle_status,
            (c.document_reference_id IS NOT NULL)
        FROM ectd_v4.context_of_use_elements c
        JOIN node_tree p ON c.parent_cou_id = p.id
        LEFT JOIN ectd_v4.documents d ON c.document_reference_id = d.id
        WHERE c.lifecycle_status = 'ACTIVE'
    )
    SELECT 
        id,
        context_group_code,
        title,
        document_title,
        parent_cou_id,
        depth,
        path,
        priority_number,
        lifecycle_status,
        has_document
    FROM node_tree
    ORDER BY path;
$$;

COMMENT ON FUNCTION ectd_v4.get_submission_tree IS 
  'Reconstructs hierarchical tree view from flat CoU elements using recursive CTE';

-- =============================================================================
-- I) FUNCTION: Get Document Reuse Count
-- =============================================================================

CREATE OR REPLACE FUNCTION ectd_v4.get_document_reuse(p_document_id UUID)
RETURNS TABLE (
    submission_id UUID,
    application_number TEXT,
    sequence_number TEXT,
    context_group_code TEXT,
    cou_id UUID
)
LANGUAGE SQL
STABLE
AS $$
    SELECT 
        rs.id,
        rs.application_number,
        su.sequence_number,
        cou.context_group_code,
        cou.id
    FROM ectd_v4.context_of_use_elements cou
    JOIN ectd_v4.submission_units su ON cou.submission_unit_id = su.id
    JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
    WHERE cou.document_reference_id = p_document_id
      AND cou.lifecycle_status = 'ACTIVE'
    ORDER BY rs.application_number, su.sequence_number;
$$;

COMMENT ON FUNCTION ectd_v4.get_document_reuse IS 
  'Shows all places where a document is referenced (v4.0 reuse tracking)';

-- =============================================================================
-- J) FUNCTION: Lifecycle Transition
-- =============================================================================

CREATE OR REPLACE FUNCTION ectd_v4.transition_cou_lifecycle(
    p_cou_id UUID,
    p_new_status ectd_v4.lifecycle_status,
    p_replaced_by_id UUID DEFAULT NULL,
    p_user_id TEXT DEFAULT 'system'
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
    -- Update the CoU status
    UPDATE ectd_v4.context_of_use_elements
    SET 
        lifecycle_status = p_new_status,
        replaced_by_cou_id = COALESCE(p_replaced_by_id, replaced_by_cou_id),
        updated_at = NOW()
    WHERE id = p_cou_id;
    
    -- If replacing, update the replacer's replaces array
    IF p_replaced_by_id IS NOT NULL AND p_new_status IN ('REPLACED', 'SUSPENDED') THEN
        UPDATE ectd_v4.context_of_use_elements
        SET 
            replaces_cou_ids = array_append(COALESCE(replaces_cou_ids, ARRAY[]::UUID[]), p_cou_id),
            lifecycle_operation = 'REPLACE',
            updated_at = NOW()
        WHERE id = p_replaced_by_id;
        
        -- Create relationship record
        INSERT INTO ectd_v4.cou_relationships (source_cou_id, target_cou_id, relationship_type)
        VALUES (p_replaced_by_id, p_cou_id, 'REPLACES')
        ON CONFLICT DO NOTHING;
    END IF;
    
    -- Log to audit
    -- (Would typically call audit schema function here)
END;
$$;

-- =============================================================================
-- K) VIEW: Submission Overview
-- =============================================================================

CREATE OR REPLACE VIEW ectd_v4.v_submission_overview AS
SELECT 
    rs.id AS submission_id,
    rs.application_number,
    rs.application_type,
    rs.proprietary_name,
    rs.authority_id,
    rs.sponsor_name,
    rs.lifecycle_status,
    rs.ectd_version,
    COUNT(DISTINCT su.id) AS sequence_count,
    MAX(su.sequence_number) AS latest_sequence,
    COUNT(DISTINCT cou.id) AS total_cou_elements,
    COUNT(DISTINCT cou.document_reference_id) AS unique_documents,
    COUNT(DISTINCT cou.id) FILTER (WHERE cou.lifecycle_status = 'ACTIVE') AS active_elements
FROM ectd_v4.regulatory_submissions rs
LEFT JOIN ectd_v4.submission_units su ON su.submission_id = rs.id
LEFT JOIN ectd_v4.context_of_use_elements cou ON cou.submission_unit_id = su.id
GROUP BY rs.id, rs.application_number, rs.application_type, rs.proprietary_name, 
         rs.authority_id, rs.sponsor_name, rs.lifecycle_status, rs.ectd_version;

-- =============================================================================
-- L) VIEW: Document Reuse Analysis
-- =============================================================================

CREATE OR REPLACE VIEW ectd_v4.v_document_reuse_analysis AS
SELECT 
    d.id AS document_id,
    d.title,
    d.document_type_code,
    d.mime_type,
    d.file_size_bytes,
    d.checksum_md5,
    COUNT(DISTINCT cou.id) AS reference_count,
    COUNT(DISTINCT su.submission_id) AS submission_count,
    ARRAY_AGG(DISTINCT cou.context_group_code) AS context_groups,
    d.created_at
FROM ectd_v4.documents d
LEFT JOIN ectd_v4.context_of_use_elements cou ON cou.document_reference_id = d.id AND cou.lifecycle_status = 'ACTIVE'
LEFT JOIN ectd_v4.submission_units su ON cou.submission_unit_id = su.id
GROUP BY d.id, d.title, d.document_type_code, d.mime_type, d.file_size_bytes, d.checksum_md5, d.created_at
ORDER BY reference_count DESC;

-- =============================================================================
-- M) GRANTS
-- =============================================================================

GRANT USAGE ON SCHEMA ectd_v4 TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA ectd_v4 TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA ectd_v4 TO PUBLIC;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 052_gcc_ectd_v4_cou_graph completed successfully';
    RAISE NOTICE 'Created ectd_v4 schema with:';
    RAISE NOTICE '  - regulatory_submissions (application containers)';
    RAISE NOTICE '  - submission_units (sequences)';
    RAISE NOTICE '  - documents (reusable content objects)';
    RAISE NOTICE '  - context_of_use_elements (v4.0 graph nodes)';
    RAISE NOTICE '  - keyword_definitions (sender-defined keywords)';
    RAISE NOTICE '  - cou_relationships (graph edges)';
    RAISE NOTICE '  - get_submission_tree() - recursive CTE for tree view';
END $$;
