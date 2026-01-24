-- =============================================================================
-- Migration 065: Global Dossier & Data Fabric Schema
-- =============================================================================
-- Purpose: Living dossier as FHIR data graph, branching for regional variations
-- Supports: Accumulus Synergy patterns, Global Dossier concept, Project Orbis
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE GLOBAL DOSSIER SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS global_dossier;

COMMENT ON SCHEMA global_dossier IS 
'Living regulatory dossier as dynamic FHIR data graph with regional branching';

-- =============================================================================
-- 2. DOSSIER INSTANCE (The Living Document)
-- =============================================================================

CREATE TYPE global_dossier.dossier_type AS ENUM (
    'NDA',                         -- New Drug Application
    'BLA',                         -- Biologics License Application
    'ANDA',                        -- Abbreviated NDA (Generic)
    '505B2',                       -- 505(b)(2) Pathway
    'MAA',                         -- Marketing Authorization Application (EU)
    'NDS',                         -- New Drug Submission (Canada)
    'ANDA_CANADA',                 -- Abbreviated NDS (Canada)
    'JNDA',                        -- Japan NDA
    'DEVICE_510K',                 -- 510(k) Premarket Notification
    'PMA',                         -- Premarket Approval (Devices)
    'IND',                         -- Investigational New Drug
    'CTA',                         -- Clinical Trial Application
    'IMPD'                         -- Investigational Medicinal Product Dossier
);

CREATE TYPE global_dossier.dossier_lifecycle AS ENUM (
    'DRAFT',
    'UNDER_REVIEW',
    'APPROVED',
    'CONDITIONALLY_APPROVED',
    'REJECTED',
    'WITHDRAWN',
    'SUPERSEDED',
    'ARCHIVED'
);

CREATE TABLE global_dossier.dossier_instances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    dossier_number TEXT NOT NULL UNIQUE,       -- Global identifier
    dossier_name TEXT NOT NULL,                -- 'PRODUCT_X Global MAA'
    dossier_type global_dossier.dossier_type NOT NULL,
    
    -- Product Reference (from product_master)
    product_id UUID NOT NULL REFERENCES product_master.products(id),
    
    -- Lifecycle
    lifecycle_status global_dossier.dossier_lifecycle DEFAULT 'DRAFT',
    version_number TEXT NOT NULL DEFAULT '1.0.0',
    
    -- Core Data Sheet (The canonical data)
    core_data_sheet_fhir JSONB NOT NULL DEFAULT '{}',  -- FHIR Bundle
    core_data_hash TEXT,                               -- Integrity hash
    
    -- Master Branch (the "main" timeline)
    master_branch_id UUID,                     -- Self-reference to branches table
    
    -- Ownership
    org_id UUID NOT NULL REFERENCES identity.organizations(id),
    sponsor_name TEXT NOT NULL,
    
    -- Regulatory Intelligence
    initial_target_region TEXT,                -- Primary submission target
    target_approval_date DATE,
    regulatory_strategy_notes TEXT,
    
    -- Accumulus Sync
    accumulus_workspace_id TEXT,               -- Link to Accumulus Synergy
    accumulus_last_sync TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES identity.users(id)
);

CREATE INDEX idx_dossier_instances_product ON global_dossier.dossier_instances(product_id);
CREATE INDEX idx_dossier_instances_type ON global_dossier.dossier_instances(dossier_type);
CREATE INDEX idx_dossier_instances_status ON global_dossier.dossier_instances(lifecycle_status);
CREATE INDEX idx_dossier_instances_org ON global_dossier.dossier_instances(org_id);
CREATE INDEX idx_dossier_instances_accumulus ON global_dossier.dossier_instances(accumulus_workspace_id);

-- GIN index on FHIR bundle for queries
CREATE INDEX idx_dossier_instances_fhir_gin ON global_dossier.dossier_instances 
    USING GIN (core_data_sheet_fhir jsonb_path_ops);

-- =============================================================================
-- 3. DOSSIER BRANCHES (Regional Variations)
-- =============================================================================
-- Like git branches - regional divergences are metadata layers, not copies

CREATE TYPE global_dossier.branch_type AS ENUM (
    'MASTER',                      -- The canonical timeline
    'REGIONAL',                    -- Region-specific variation
    'SIMULATION',                  -- What-if scenario
    'HISTORICAL',                  -- Point-in-time snapshot
    'REMEDIATION'                  -- Fix branch
);

CREATE TYPE global_dossier.region_code AS ENUM (
    'US_FDA',
    'EU_EMA',
    'EU_DECENTRALIZED',            -- DCP submissions
    'EU_MUTUAL_RECOGNITION',       -- MRP submissions
    'JP_PMDA',
    'CA_HEALTH_CANADA',
    'AU_TGA',
    'CH_SWISSMEDIC',
    'UK_MHRA',
    'BR_ANVISA',
    'CN_NMPA',
    'KR_MFDS',
    'SG_HSA',
    'IN_CDSCO',
    'ZA_SAHPRA',
    'WHO_PREQUALIFICATION',
    'GCC',                         -- Gulf Cooperation Council
    'ASEAN',                       -- ASEAN common submission
    'ICH_GLOBAL'                   -- Hypothetical future global
);

CREATE TABLE global_dossier.dossier_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Parent Dossier
    dossier_id UUID NOT NULL REFERENCES global_dossier.dossier_instances(id) ON DELETE CASCADE,
    
    -- Branch Identity
    branch_name TEXT NOT NULL,                 -- 'EU_EMA_Submission_2026Q1'
    branch_type global_dossier.branch_type NOT NULL,
    branch_code TEXT NOT NULL,                 -- Unique within dossier
    
    -- Regional Context
    target_region global_dossier.region_code,
    target_authority_name TEXT,                -- 'European Medicines Agency'
    
    -- Parent Branch (for hierarchical branching)
    parent_branch_id UUID REFERENCES global_dossier.dossier_branches(id),
    forked_from_version TEXT,                  -- Version when forked
    forked_at TIMESTAMPTZ,
    
    -- Regional Overrides (Delta from core)
    regional_overrides JSONB DEFAULT '{}',     -- Field-level overrides
    regional_additions JSONB DEFAULT '{}',     -- Region-specific content
    regional_exclusions TEXT[] DEFAULT '{}',   -- Fields to exclude
    
    -- Submission Context
    submission_id UUID REFERENCES ectd_v4.regulatory_submissions(id),
    application_number TEXT,                   -- Regional app number
    submission_date DATE,
    target_action_date DATE,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    merged_to_master BOOLEAN DEFAULT FALSE,
    merged_at TIMESTAMPTZ,
    
    -- Accumulus / Platform Integration
    platform_branch_ref TEXT,                  -- External platform reference
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES identity.users(id),
    
    CONSTRAINT unique_branch_per_dossier UNIQUE (dossier_id, branch_code)
);

CREATE INDEX idx_dossier_branches_dossier ON global_dossier.dossier_branches(dossier_id);
CREATE INDEX idx_dossier_branches_region ON global_dossier.dossier_branches(target_region);
CREATE INDEX idx_dossier_branches_type ON global_dossier.dossier_branches(branch_type);
CREATE INDEX idx_dossier_branches_parent ON global_dossier.dossier_branches(parent_branch_id);
CREATE INDEX idx_dossier_branches_submission ON global_dossier.dossier_branches(submission_id);

-- GIN indexes on override/addition JSON
CREATE INDEX idx_dossier_branches_overrides_gin ON global_dossier.dossier_branches 
    USING GIN (regional_overrides jsonb_path_ops);

-- =============================================================================
-- 4. DOSSIER SYNC EVENTS (Real-Time Regulator Sync)
-- =============================================================================

CREATE TYPE global_dossier.sync_direction AS ENUM (
    'SPONSOR_TO_REGULATOR',        -- Pushing updates
    'REGULATOR_TO_SPONSOR',        -- Receiving feedback
    'BIDIRECTIONAL'                -- Two-way sync
);

CREATE TYPE global_dossier.sync_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'FAILED',
    'PARTIAL'
);

CREATE TABLE global_dossier.dossier_sync_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target
    dossier_id UUID NOT NULL REFERENCES global_dossier.dossier_instances(id),
    branch_id UUID REFERENCES global_dossier.dossier_branches(id),
    
    -- Sync Details
    sync_direction global_dossier.sync_direction NOT NULL,
    target_platform TEXT NOT NULL,             -- 'ACCUMULUS', 'FDA_ESG', 'EMA_CESP'
    target_region global_dossier.region_code,
    
    -- Status
    status global_dossier.sync_status DEFAULT 'PENDING',
    
    -- Content
    synced_sections TEXT[],                    -- eCTD sections synced
    synced_resources JSONB,                    -- FHIR resources synced
    bytes_transferred BIGINT,
    
    -- Timestamps
    initiated_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Results
    success_count INT DEFAULT 0,
    error_count INT DEFAULT 0,
    errors JSONB DEFAULT '[]',
    
    -- Acknowledgment
    platform_transaction_id TEXT,
    platform_receipt JSONB,
    
    initiated_by UUID REFERENCES identity.users(id),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_dossier_sync_dossier ON global_dossier.dossier_sync_events(dossier_id);
CREATE INDEX idx_dossier_sync_status ON global_dossier.dossier_sync_events(status);
CREATE INDEX idx_dossier_sync_platform ON global_dossier.dossier_sync_events(target_platform);

-- =============================================================================
-- 5. REGULATORY COMMENTS (Cross-Agency Annotations)
-- =============================================================================
-- Future: Regulators annotate directly, visible to other agencies (Project Orbis++)

CREATE TYPE global_dossier.comment_visibility AS ENUM (
    'SPONSOR_ONLY',                -- Only sponsor sees
    'AGENCY_ONLY',                 -- Only reviewing agencies
    'SHARED',                      -- All parties in collaboration
    'PUBLIC'                       -- Public disclosure
);

CREATE TYPE global_dossier.comment_type AS ENUM (
    'QUESTION',                    -- Information request
    'CLARIFICATION',               -- Request for clarification
    'DEFICIENCY',                  -- Identified deficiency
    'RECOMMENDATION',              -- Suggested change
    'ACKNOWLEDGMENT',              -- Received/understood
    'APPROVAL_NOTE',               -- Approval-related
    'INTERNAL_NOTE'                -- Internal agency note
);

CREATE TABLE global_dossier.regulatory_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target
    dossier_id UUID NOT NULL REFERENCES global_dossier.dossier_instances(id),
    branch_id UUID REFERENCES global_dossier.dossier_branches(id),
    
    -- Location in Dossier
    ectd_section TEXT,                         -- 'm3.2.s.4.1'
    fhir_resource_type TEXT,                   -- 'MedicinalProductDefinition'
    fhir_resource_id TEXT,
    target_field_path TEXT,                    -- JSON path to specific field
    
    -- Comment Details
    comment_type global_dossier.comment_type NOT NULL,
    visibility global_dossier.comment_visibility DEFAULT 'SPONSOR_ONLY',
    
    -- Content
    comment_title TEXT NOT NULL,
    comment_body TEXT NOT NULL,
    supporting_references JSONB,               -- Links to external evidence
    
    -- Author
    author_agency global_dossier.region_code,
    author_name TEXT NOT NULL,
    author_role TEXT,
    author_division TEXT,
    
    -- Response
    response_required BOOLEAN DEFAULT FALSE,
    response_deadline DATE,
    
    -- Resolution
    is_resolved BOOLEAN DEFAULT FALSE,
    resolution_notes TEXT,
    resolved_at TIMESTAMPTZ,
    resolved_by TEXT,
    
    -- Threading
    parent_comment_id UUID REFERENCES global_dossier.regulatory_comments(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_regulatory_comments_dossier ON global_dossier.regulatory_comments(dossier_id);
CREATE INDEX idx_regulatory_comments_branch ON global_dossier.regulatory_comments(branch_id);
CREATE INDEX idx_regulatory_comments_section ON global_dossier.regulatory_comments(ectd_section);
CREATE INDEX idx_regulatory_comments_type ON global_dossier.regulatory_comments(comment_type);
CREATE INDEX idx_regulatory_comments_unresolved ON global_dossier.regulatory_comments(dossier_id) 
    WHERE is_resolved = FALSE AND response_required = TRUE;

-- Full-text search on comments
CREATE INDEX idx_regulatory_comments_fts ON global_dossier.regulatory_comments 
    USING GIN (to_tsvector('english', comment_title || ' ' || comment_body));

-- =============================================================================
-- 6. DOSSIER CONTENT TRACKING (Granular Change Tracking)
-- =============================================================================

CREATE TABLE global_dossier.content_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Target
    dossier_id UUID NOT NULL REFERENCES global_dossier.dossier_instances(id),
    branch_id UUID REFERENCES global_dossier.dossier_branches(id),
    
    -- Content Location
    ectd_section TEXT NOT NULL,                -- 'm3.2.s.2.3'
    content_type TEXT NOT NULL,                -- 'FHIR', 'DOCUMENT', 'DATA'
    
    -- Version
    version_number TEXT NOT NULL,              -- Semantic version
    previous_version_id UUID REFERENCES global_dossier.content_versions(id),
    
    -- Content
    content_hash TEXT NOT NULL,                -- SHA256 of content
    content_fhir JSONB,                        -- FHIR resource if applicable
    document_reference TEXT,                   -- Link to document storage
    
    -- Change Context
    change_type TEXT NOT NULL,                 -- 'INITIAL', 'UPDATE', 'CORRECTION'
    change_reason TEXT,
    change_description TEXT,
    
    -- AI Contribution Tracking
    ai_generated BOOLEAN DEFAULT FALSE,
    ai_agent_id UUID REFERENCES agent_runtime.agent_definitions(id),
    ai_confidence_score NUMERIC(5, 4),
    human_reviewed BOOLEAN DEFAULT FALSE,
    reviewed_by UUID REFERENCES identity.users(id),
    reviewed_at TIMESTAMPTZ,
    
    -- Validation
    validation_status TEXT DEFAULT 'PENDING',  -- 'PENDING', 'VALID', 'INVALID'
    validation_errors JSONB DEFAULT '[]',
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES identity.users(id),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_content_versions_dossier ON global_dossier.content_versions(dossier_id);
CREATE INDEX idx_content_versions_section ON global_dossier.content_versions(ectd_section);
CREATE INDEX idx_content_versions_hash ON global_dossier.content_versions(content_hash);
CREATE INDEX idx_content_versions_ai ON global_dossier.content_versions(ai_generated, human_reviewed);

-- =============================================================================
-- 7. HELPER FUNCTIONS
-- =============================================================================

-- Create regional branch from master
CREATE OR REPLACE FUNCTION global_dossier.create_regional_branch(
    p_dossier_id UUID,
    p_region global_dossier.region_code,
    p_branch_name TEXT,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_branch_id UUID;
    v_master_branch_id UUID;
    v_dossier_version TEXT;
    v_branch_code TEXT;
BEGIN
    -- Get master branch and current version
    SELECT master_branch_id, version_number INTO v_master_branch_id, v_dossier_version
    FROM global_dossier.dossier_instances
    WHERE id = p_dossier_id;
    
    -- Generate branch code
    v_branch_code := p_region::TEXT || '_' || TO_CHAR(NOW(), 'YYYYMMDD_HH24MI');
    
    -- Create the branch
    INSERT INTO global_dossier.dossier_branches (
        dossier_id, branch_name, branch_type, branch_code,
        target_region, parent_branch_id, forked_from_version,
        forked_at, created_by
    ) VALUES (
        p_dossier_id, p_branch_name, 'REGIONAL', v_branch_code,
        p_region, v_master_branch_id, v_dossier_version,
        NOW(), p_created_by
    ) RETURNING id INTO v_branch_id;
    
    RETURN v_branch_id;
END;
$$;

-- Merge regional overrides back to master (simplified)
CREATE OR REPLACE FUNCTION global_dossier.resolve_branch_data(
    p_dossier_id UUID,
    p_branch_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_core_data JSONB;
    v_overrides JSONB;
    v_additions JSONB;
    v_exclusions TEXT[];
    v_result JSONB;
BEGIN
    -- Get core data
    SELECT core_data_sheet_fhir INTO v_core_data
    FROM global_dossier.dossier_instances
    WHERE id = p_dossier_id;
    
    -- Get branch overrides
    SELECT regional_overrides, regional_additions, regional_exclusions
    INTO v_overrides, v_additions, v_exclusions
    FROM global_dossier.dossier_branches
    WHERE id = p_branch_id;
    
    -- Start with core data
    v_result := v_core_data;
    
    -- Apply overrides (merge at top level)
    IF v_overrides IS NOT NULL AND v_overrides != '{}' THEN
        v_result := v_result || v_overrides;
    END IF;
    
    -- Add regional additions
    IF v_additions IS NOT NULL AND v_additions != '{}' THEN
        v_result := jsonb_set(v_result, '{regional_additions}', v_additions, TRUE);
    END IF;
    
    RETURN v_result;
END;
$$;

-- Get dossier completeness status
CREATE OR REPLACE FUNCTION global_dossier.get_dossier_completeness(
    p_dossier_id UUID
)
RETURNS TABLE (
    ectd_section TEXT,
    section_name TEXT,
    has_content BOOLEAN,
    version_count INT,
    last_updated TIMESTAMPTZ,
    validation_status TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH required_sections AS (
        SELECT unnest(ARRAY[
            'm1', 'm2.2', 'm2.3', 'm2.4', 'm2.5', 'm2.6', 'm2.7',
            'm3.2.s', 'm3.2.p', 'm4.2', 'm5.3'
        ]) AS section_code
    ),
    content_summary AS (
        SELECT 
            cv.ectd_section,
            COUNT(*) AS ver_count,
            MAX(cv.created_at) AS last_update,
            MAX(cv.validation_status) AS val_status
        FROM global_dossier.content_versions cv
        WHERE cv.dossier_id = p_dossier_id
        GROUP BY cv.ectd_section
    )
    SELECT 
        rs.section_code AS ectd_section,
        CASE rs.section_code
            WHEN 'm1' THEN 'Administrative'
            WHEN 'm2.2' THEN 'Introduction'
            WHEN 'm2.3' THEN 'Quality Overall Summary'
            WHEN 'm2.4' THEN 'Nonclinical Overview'
            WHEN 'm2.5' THEN 'Clinical Overview'
            WHEN 'm2.6' THEN 'Nonclinical Summary'
            WHEN 'm2.7' THEN 'Clinical Summary'
            WHEN 'm3.2.s' THEN 'Drug Substance'
            WHEN 'm3.2.p' THEN 'Drug Product'
            WHEN 'm4.2' THEN 'Nonclinical Reports'
            WHEN 'm5.3' THEN 'Clinical Reports'
            ELSE rs.section_code
        END AS section_name,
        (cs.ver_count > 0) AS has_content,
        COALESCE(cs.ver_count, 0)::INT AS version_count,
        cs.last_update AS last_updated,
        COALESCE(cs.val_status, 'NOT_STARTED') AS validation_status
    FROM required_sections rs
    LEFT JOIN content_summary cs ON cs.ectd_section LIKE rs.section_code || '%'
    ORDER BY rs.section_code;
END;
$$;

-- =============================================================================
-- 8. VIEWS
-- =============================================================================

-- Active dossiers with branch summary
CREATE OR REPLACE VIEW global_dossier.dossiers_with_branches AS
SELECT 
    di.id AS dossier_id,
    di.dossier_number,
    di.dossier_name,
    di.dossier_type,
    di.lifecycle_status,
    di.sponsor_name,
    p.product_name,
    COUNT(DISTINCT db.id) FILTER (WHERE db.branch_type = 'REGIONAL') AS regional_branch_count,
    ARRAY_AGG(DISTINCT db.target_region) FILTER (WHERE db.target_region IS NOT NULL) AS target_regions,
    di.accumulus_workspace_id IS NOT NULL AS accumulus_linked,
    di.updated_at
FROM global_dossier.dossier_instances di
LEFT JOIN global_dossier.dossier_branches db ON di.id = db.dossier_id AND db.is_active = TRUE
LEFT JOIN product_master.products p ON di.product_id = p.id
GROUP BY di.id, p.product_name;

-- Pending regulatory comments
CREATE OR REPLACE VIEW global_dossier.pending_comments AS
SELECT 
    rc.id,
    di.dossier_number,
    di.dossier_name,
    rc.author_agency,
    rc.comment_type,
    rc.comment_title,
    rc.ectd_section,
    rc.response_deadline,
    rc.created_at,
    CASE 
        WHEN rc.response_deadline < CURRENT_DATE THEN 'OVERDUE'
        WHEN rc.response_deadline <= CURRENT_DATE + INTERVAL '7 days' THEN 'DUE_SOON'
        ELSE 'ON_TRACK'
    END AS urgency
FROM global_dossier.regulatory_comments rc
JOIN global_dossier.dossier_instances di ON rc.dossier_id = di.id
WHERE rc.is_resolved = FALSE 
  AND rc.response_required = TRUE
ORDER BY rc.response_deadline ASC NULLS LAST;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

/*
-- Check schema and tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'global_dossier';

-- Check enum types
SELECT typname FROM pg_type WHERE typnamespace = 'global_dossier'::regnamespace;

-- Test branch creation (requires existing dossier)
-- SELECT global_dossier.create_regional_branch(
--     'dossier-uuid', 
--     'EU_EMA', 
--     'EU Marketing Authorization 2026'
-- );
*/
