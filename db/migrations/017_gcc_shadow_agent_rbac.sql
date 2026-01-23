-- ============================================================================
-- Concept2Cure "Global Command Center" - Shadow Agent RBAC Enhancement
-- Migration: 017_gcc_shadow_agent_rbac.sql
-- Purpose: Add dedicated shadow_agent role for interrogation service
--          Update grants for heatmap views and snapshot gate metrics
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- DEPENDS ON: 005_gcc_database_roles.sql, 007_gcc_heatmap_views.sql, 008_gcc_submission_snapshots.sql
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. CREATE SHADOW AGENT ROLE
-- ============================================================================
-- Shadow Agent needs:
--   - Read all schemas (truth, prose, adversarial)
--   - INSERT-only on audit.concomitant_audit_logs (append-only)
--   - NO UPDATE/DELETE on audit (triggers also enforce this)
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gcc_shadow_agent') THEN
        CREATE ROLE gcc_shadow_agent NOLOGIN;
        RAISE NOTICE 'Created role: gcc_shadow_agent';
    ELSE
        RAISE NOTICE 'Role gcc_shadow_agent already exists';
    END IF;
END $$;

-- Shadow agent inherits reader privileges
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_auth_members 
        WHERE roleid = (SELECT oid FROM pg_roles WHERE rolname = 'gcc_app_reader')
        AND member = (SELECT oid FROM pg_roles WHERE rolname = 'gcc_shadow_agent')
    ) THEN
        GRANT gcc_app_reader TO gcc_shadow_agent;
        RAISE NOTICE 'Granted gcc_app_reader to gcc_shadow_agent';
    END IF;
END $$;

-- ============================================================================
-- 2. SHADOW AGENT SPECIFIC GRANTS
-- ============================================================================

-- Audit: INSERT only for append-only audit logging
GRANT INSERT ON audit.concomitant_audit_logs TO gcc_shadow_agent;

-- Read audit for comparisons (last interrogation state, etc.)
GRANT SELECT ON audit.concomitant_audit_logs TO gcc_shadow_agent;

-- Read truth for drift computation
GRANT SELECT ON truth.clinical_truth_store TO gcc_shadow_agent;

-- Read prose for interrogation
GRANT SELECT ON prose.smart_fragments TO gcc_shadow_agent;
GRANT SELECT ON prose.smart_fragment_versions TO gcc_shadow_agent;
GRANT SELECT ON prose.fragment_truth_links TO gcc_shadow_agent;

-- Read adversarial for precedent matching
GRANT SELECT ON adversarial.regulatory_adversarial_precedents TO gcc_shadow_agent;

-- Read snapshots (for snapshot-scoped interrogation)
GRANT SELECT ON prose.submission_snapshots TO gcc_shadow_agent;
GRANT SELECT ON prose.submission_snapshot_fragments TO gcc_shadow_agent;

-- ============================================================================
-- 3. GRANT ACCESS TO HEATMAP VIEWS (Migration 007)
-- ============================================================================

-- These views are critical for Command Center and Shadow Agent risk assessment

-- Check if views exist before granting (idempotent)
DO $$
BEGIN
    -- audit.v_fragment_latest_risk
    IF EXISTS (SELECT 1 FROM information_schema.views 
               WHERE table_schema = 'audit' AND table_name = 'v_fragment_latest_risk') THEN
        GRANT SELECT ON audit.v_fragment_latest_risk TO gcc_app_reader, gcc_shadow_agent, gcc_auditor;
        RAISE NOTICE 'Granted SELECT on audit.v_fragment_latest_risk';
    END IF;

    -- prose.v_fragment_truth_coverage
    IF EXISTS (SELECT 1 FROM information_schema.views 
               WHERE table_schema = 'prose' AND table_name = 'v_fragment_truth_coverage') THEN
        GRANT SELECT ON prose.v_fragment_truth_coverage TO gcc_app_reader, gcc_shadow_agent, gcc_auditor;
        RAISE NOTICE 'Granted SELECT on prose.v_fragment_truth_coverage';
    END IF;

    -- prose.v_fragment_current
    IF EXISTS (SELECT 1 FROM information_schema.views 
               WHERE table_schema = 'prose' AND table_name = 'v_fragment_current') THEN
        GRANT SELECT ON prose.v_fragment_current TO gcc_app_reader, gcc_shadow_agent, gcc_auditor;
        RAISE NOTICE 'Granted SELECT on prose.v_fragment_current';
    END IF;

    -- prose.v_section_risk_rollup
    IF EXISTS (SELECT 1 FROM information_schema.views 
               WHERE table_schema = 'prose' AND table_name = 'v_section_risk_rollup') THEN
        GRANT SELECT ON prose.v_section_risk_rollup TO gcc_app_reader, gcc_shadow_agent, gcc_auditor;
        RAISE NOTICE 'Granted SELECT on prose.v_section_risk_rollup';
    END IF;

    -- prose.v_jurisdiction_risk_rollup
    IF EXISTS (SELECT 1 FROM information_schema.views 
               WHERE table_schema = 'prose' AND table_name = 'v_jurisdiction_risk_rollup') THEN
        GRANT SELECT ON prose.v_jurisdiction_risk_rollup TO gcc_app_reader, gcc_shadow_agent, gcc_auditor;
        RAISE NOTICE 'Granted SELECT on prose.v_jurisdiction_risk_rollup';
    END IF;
END $$;

-- ============================================================================
-- 4. GRANT ACCESS TO SNAPSHOT GATE VIEW (Migration 008)
-- ============================================================================

DO $$
BEGIN
    -- prose.v_snapshot_gate_metrics
    IF EXISTS (SELECT 1 FROM information_schema.views 
               WHERE table_schema = 'prose' AND table_name = 'v_snapshot_gate_metrics') THEN
        GRANT SELECT ON prose.v_snapshot_gate_metrics TO gcc_app_reader, gcc_shadow_agent, gcc_auditor;
        RAISE NOTICE 'Granted SELECT on prose.v_snapshot_gate_metrics';
    END IF;
END $$;

-- ============================================================================
-- 5. UPDATE DEFAULT PRIVILEGES FOR SHADOW AGENT
-- ============================================================================

-- Future tables in audit schema: shadow agent gets SELECT + INSERT
ALTER DEFAULT PRIVILEGES IN SCHEMA audit 
    GRANT SELECT ON TABLES TO gcc_shadow_agent;
    
-- Future tables in prose/truth/adversarial: shadow agent gets SELECT
ALTER DEFAULT PRIVILEGES IN SCHEMA truth 
    GRANT SELECT ON TABLES TO gcc_shadow_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA prose 
    GRANT SELECT ON TABLES TO gcc_shadow_agent;
ALTER DEFAULT PRIVILEGES IN SCHEMA adversarial 
    GRANT SELECT ON TABLES TO gcc_shadow_agent;

-- ============================================================================
-- 6. WRITER ROLE: SNAPSHOT MANAGEMENT UPDATES
-- ============================================================================
-- Ensure writer can manage snapshots properly (freeze, delete draft)

-- Writer can DELETE draft snapshots (trigger enforces DRAFT-only deletion)
GRANT DELETE ON prose.submission_snapshots TO gcc_app_writer;

-- Writer can DELETE snapshot fragments (for draft modification)
GRANT DELETE ON prose.submission_snapshot_fragments TO gcc_app_writer;

-- ============================================================================
-- 7. SEQUENCE GRANTS (for INSERT operations)
-- ============================================================================

-- Grant sequence usage for tables with serial/identity columns
DO $$
DECLARE
    seq_name TEXT;
BEGIN
    -- Find and grant sequences in each schema
    FOR seq_name IN 
        SELECT sequence_name FROM information_schema.sequences 
        WHERE sequence_schema IN ('truth', 'prose', 'adversarial', 'audit')
    LOOP
        EXECUTE format('GRANT USAGE ON SEQUENCE %I TO gcc_app_writer, gcc_shadow_agent', seq_name);
    END LOOP;
END $$;

-- ============================================================================
-- 8. ROLE DOCUMENTATION
-- ============================================================================

COMMENT ON ROLE gcc_shadow_agent IS 
    'Shadow Interrogation Agent: reads all schemas, INSERT-only on audit logs (21 CFR Part 11 compliant)';

-- ============================================================================
-- 9. VERIFICATION QUERY
-- ============================================================================
/*
Run this to verify shadow agent role configuration:

SELECT 
    r.rolname,
    ARRAY_AGG(DISTINCT m.rolname) AS member_of
FROM pg_roles r
LEFT JOIN pg_auth_members am ON r.oid = am.member
LEFT JOIN pg_roles m ON am.roleid = m.oid
WHERE r.rolname = 'gcc_shadow_agent'
GROUP BY r.rolname;

-- Check table privileges:
SELECT 
    grantee, 
    table_schema, 
    table_name, 
    privilege_type
FROM information_schema.table_privileges
WHERE grantee = 'gcc_shadow_agent'
ORDER BY table_schema, table_name, privilege_type;
*/

COMMIT;
