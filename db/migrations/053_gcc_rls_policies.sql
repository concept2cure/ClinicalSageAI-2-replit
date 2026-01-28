-- ============================================================================
-- Migration 053: Row-Level Security (RLS) Policies
-- Purpose: Implements SECURITY DEFINER pattern RLS for multi-tenant isolation
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Reference: Concept2Cure Architecture Specification Section 3
-- Compliance: FDA 21 CFR Part 11, SOC2, HIPAA
-- ============================================================================

BEGIN;

-- =============================================================================
-- A) HELPER FUNCTIONS (SECURITY DEFINER)
-- =============================================================================
-- These run with elevated privileges to avoid RLS recursion

-- Get current user's org_id from session context
CREATE OR REPLACE FUNCTION identity.current_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
AS $$
    SELECT NULLIF(current_setting('app.current_org_id', TRUE), '')::UUID;
$$;

-- Check if current org can access target org (direct + delegated)
CREATE OR REPLACE FUNCTION identity.can_access_org(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity
AS $$
DECLARE
    v_current_org_id UUID := identity.current_org_id();
BEGIN
    -- System/admin bypass
    IF current_setting('app.bypass_rls', TRUE) = 'true' THEN
        RETURN TRUE;
    END IF;
    
    -- No context set = deny
    IF v_current_org_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Same org = allow
    IF v_current_org_id = target_org_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check delegated access via org_relationships
        RETURN EXISTS (
                SELECT 1 FROM identity.org_relationships
                WHERE sponsor_org_id = target_org_id
                    AND delegate_org_id = v_current_org_id
                    AND is_active = TRUE
                    AND NOW() BETWEEN contract_start_date AND COALESCE(contract_end_date, NOW() + INTERVAL '1 day')
        );
END;
$$;

-- Check write access (more restrictive)
CREATE OR REPLACE FUNCTION identity.can_write_org(target_org_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = identity
AS $$
DECLARE
    v_current_org_id UUID := identity.current_org_id();
BEGIN
    -- System/admin bypass
    IF current_setting('app.bypass_rls', TRUE) = 'true' THEN
        RETURN TRUE;
    END IF;
    
    -- No context set = deny
    IF v_current_org_id IS NULL THEN
        RETURN FALSE;
    END IF;
    
    -- Same org = allow
    IF v_current_org_id = target_org_id THEN
        RETURN TRUE;
    END IF;
    
    -- Check delegated write access
        RETURN EXISTS (
                SELECT 1 FROM identity.org_relationships
                WHERE sponsor_org_id = target_org_id
                    AND delegate_org_id = v_current_org_id
                    AND is_active = TRUE
                    AND can_edit_submissions = TRUE
                    AND NOW() BETWEEN contract_start_date AND COALESCE(contract_end_date, NOW() + INTERVAL '1 day')
        );
END;
$$;

-- =============================================================================
-- B) ENABLE RLS ON ALL TENANT TABLES
-- =============================================================================

-- ectd_v4 schema
ALTER TABLE ectd_v4.regulatory_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ectd_v4.submission_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE ectd_v4.documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ectd_v4.context_of_use_elements ENABLE ROW LEVEL SECURITY;
ALTER TABLE ectd_v4.keyword_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ectd_v4.cou_relationships ENABLE ROW LEVEL SECURITY;

-- identity schema (partial - users can see their own org's users)
ALTER TABLE identity.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE identity.user_program_access ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- C) RLS POLICIES: regulatory_submissions
-- =============================================================================

DROP POLICY IF EXISTS rls_regulatory_submissions_select ON ectd_v4.regulatory_submissions;
CREATE POLICY rls_regulatory_submissions_select
    ON ectd_v4.regulatory_submissions
    FOR SELECT
    USING (identity.can_access_org(org_id));

DROP POLICY IF EXISTS rls_regulatory_submissions_insert ON ectd_v4.regulatory_submissions;
CREATE POLICY rls_regulatory_submissions_insert
    ON ectd_v4.regulatory_submissions
    FOR INSERT
    WITH CHECK (identity.can_write_org(org_id));

DROP POLICY IF EXISTS rls_regulatory_submissions_update ON ectd_v4.regulatory_submissions;
CREATE POLICY rls_regulatory_submissions_update
    ON ectd_v4.regulatory_submissions
    FOR UPDATE
    USING (identity.can_write_org(org_id));

DROP POLICY IF EXISTS rls_regulatory_submissions_delete ON ectd_v4.regulatory_submissions;
CREATE POLICY rls_regulatory_submissions_delete
    ON ectd_v4.regulatory_submissions
    FOR DELETE
    USING (identity.can_write_org(org_id));

-- =============================================================================
-- D) RLS POLICIES: submission_units (via submission)
-- =============================================================================

DROP POLICY IF EXISTS rls_submission_units_select ON ectd_v4.submission_units;
CREATE POLICY rls_submission_units_select
    ON ectd_v4.submission_units
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM ectd_v4.regulatory_submissions rs
            WHERE rs.id = submission_id
              AND identity.can_access_org(rs.org_id)
        )
    );

DROP POLICY IF EXISTS rls_submission_units_insert ON ectd_v4.submission_units;
CREATE POLICY rls_submission_units_insert
    ON ectd_v4.submission_units
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM ectd_v4.regulatory_submissions rs
            WHERE rs.id = submission_id
              AND identity.can_write_org(rs.org_id)
        )
    );

DROP POLICY IF EXISTS rls_submission_units_update ON ectd_v4.submission_units;
CREATE POLICY rls_submission_units_update
    ON ectd_v4.submission_units
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 FROM ectd_v4.regulatory_submissions rs
            WHERE rs.id = submission_id
              AND identity.can_write_org(rs.org_id)
        )
    );

-- =============================================================================
-- E) RLS POLICIES: documents
-- =============================================================================

DROP POLICY IF EXISTS rls_documents_select ON ectd_v4.documents;
CREATE POLICY rls_documents_select
    ON ectd_v4.documents
    FOR SELECT
    USING (identity.can_access_org(org_id));

DROP POLICY IF EXISTS rls_documents_insert ON ectd_v4.documents;
CREATE POLICY rls_documents_insert
    ON ectd_v4.documents
    FOR INSERT
    WITH CHECK (identity.can_write_org(org_id));

DROP POLICY IF EXISTS rls_documents_update ON ectd_v4.documents;
CREATE POLICY rls_documents_update
    ON ectd_v4.documents
    FOR UPDATE
    USING (identity.can_write_org(org_id));

-- =============================================================================
-- F) RLS POLICIES: context_of_use_elements (via submission_unit chain)
-- =============================================================================

DROP POLICY IF EXISTS rls_cou_select ON ectd_v4.context_of_use_elements;
CREATE POLICY rls_cou_select
    ON ectd_v4.context_of_use_elements
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 
            FROM ectd_v4.submission_units su
            JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
            WHERE su.id = submission_unit_id
              AND identity.can_access_org(rs.org_id)
        )
    );

DROP POLICY IF EXISTS rls_cou_insert ON ectd_v4.context_of_use_elements;
CREATE POLICY rls_cou_insert
    ON ectd_v4.context_of_use_elements
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 
            FROM ectd_v4.submission_units su
            JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
            WHERE su.id = submission_unit_id
              AND identity.can_write_org(rs.org_id)
        )
    );

DROP POLICY IF EXISTS rls_cou_update ON ectd_v4.context_of_use_elements;
CREATE POLICY rls_cou_update
    ON ectd_v4.context_of_use_elements
    FOR UPDATE
    USING (
        EXISTS (
            SELECT 1 
            FROM ectd_v4.submission_units su
            JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
            WHERE su.id = submission_unit_id
              AND identity.can_write_org(rs.org_id)
        )
    );

-- =============================================================================
-- G) RLS POLICIES: keyword_definitions
-- =============================================================================

DROP POLICY IF EXISTS rls_keywords_select ON ectd_v4.keyword_definitions;
CREATE POLICY rls_keywords_select
    ON ectd_v4.keyword_definitions
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 
            FROM ectd_v4.submission_units su
            JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
            WHERE su.id = submission_unit_id
              AND identity.can_access_org(rs.org_id)
        )
    );

-- =============================================================================
-- H) RLS POLICIES: cou_relationships
-- =============================================================================

DROP POLICY IF EXISTS rls_cou_rel_select ON ectd_v4.cou_relationships;
CREATE POLICY rls_cou_rel_select
    ON ectd_v4.cou_relationships
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1 
            FROM ectd_v4.context_of_use_elements cou
            JOIN ectd_v4.submission_units su ON cou.submission_unit_id = su.id
            JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
            WHERE cou.id = source_cou_id
              AND identity.can_access_org(rs.org_id)
        )
    );

-- =============================================================================
-- I) RLS POLICIES: identity.users
-- =============================================================================

DROP POLICY IF EXISTS rls_users_select ON identity.users;
CREATE POLICY rls_users_select
    ON identity.users
    FOR SELECT
    USING (
        identity.can_access_org(home_org_id)
        OR id::TEXT = current_setting('app.current_user_id', TRUE)
    );

-- =============================================================================
-- J) GRANTS FOR AUTHENTICATED USERS
-- =============================================================================

-- In production, replace 'authenticated' with your actual role
DO $$
BEGIN
    -- Grant usage on schemas
    EXECUTE 'GRANT USAGE ON SCHEMA ectd_v4 TO authenticated' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
    EXECUTE 'GRANT USAGE ON SCHEMA identity TO authenticated' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
    EXECUTE 'GRANT USAGE ON SCHEMA common_standards TO authenticated' WHERE EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated');
EXCEPTION WHEN undefined_object THEN
    -- Role doesn't exist, skip
    NULL;
END $$;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 053_gcc_rls_policies completed successfully';
    RAISE NOTICE 'Enabled RLS on:';
    RAISE NOTICE '  - ectd_v4.regulatory_submissions';
    RAISE NOTICE '  - ectd_v4.submission_units';
    RAISE NOTICE '  - ectd_v4.documents';
    RAISE NOTICE '  - ectd_v4.context_of_use_elements';
    RAISE NOTICE '  - ectd_v4.keyword_definitions';
    RAISE NOTICE '  - ectd_v4.cou_relationships';
    RAISE NOTICE '  - identity.users';
    RAISE NOTICE 'Created SECURITY DEFINER functions: can_access_org(), can_write_org()';
END $$;
