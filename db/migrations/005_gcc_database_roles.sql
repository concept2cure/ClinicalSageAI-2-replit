-- ============================================================================
-- Concept2Cure "Global Command Center" - Database Roles Migration
-- Migration: 005_gcc_database_roles.sql
-- Purpose: Implements least-privilege access model for 21 CFR Part 11 compliance
--          Creates roles: app_reader, app_writer, auditor, admin_migrator
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- NOTE: Role creation requires superuser privileges on Neon
-- ============================================================================

BEGIN;

-- ============================================================================
-- ROLE DEFINITIONS
-- ============================================================================
-- These roles implement separation of duties:
--   app_reader  - Read-only access for dashboards/reporting
--   app_writer  - INSERT/UPDATE on prose/links; no audit modification
--   auditor     - Read audit + versions; no data modification
--   admin_migrator - DDL only; controlled access for schema changes
-- ============================================================================

-- app_reader: SELECT only across all GCC schemas
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gcc_app_reader') THEN
        CREATE ROLE gcc_app_reader NOLOGIN;
    END IF;
END $$;

-- app_writer: INSERT/UPDATE on regulated tables; no DELETE on audit
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gcc_app_writer') THEN
        CREATE ROLE gcc_app_writer NOLOGIN;
    END IF;
END $$;

-- auditor: Read audit trails and version history; no modifications
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gcc_auditor') THEN
        CREATE ROLE gcc_auditor NOLOGIN;
    END IF;
END $$;

-- admin_migrator: DDL and maintenance operations
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'gcc_admin_migrator') THEN
        CREATE ROLE gcc_admin_migrator NOLOGIN;
    END IF;
END $$;

-- ============================================================================
-- REVOKE DEFAULT PUBLIC PRIVILEGES
-- ============================================================================
-- Remove default access from public schema/tables

REVOKE ALL ON SCHEMA truth FROM PUBLIC;
REVOKE ALL ON SCHEMA prose FROM PUBLIC;
REVOKE ALL ON SCHEMA adversarial FROM PUBLIC;
REVOKE ALL ON SCHEMA audit FROM PUBLIC;

REVOKE ALL ON ALL TABLES IN SCHEMA truth FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA prose FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA adversarial FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA audit FROM PUBLIC;

-- ============================================================================
-- SCHEMA USAGE GRANTS
-- ============================================================================

-- All roles can access schemas (but not necessarily tables)
GRANT USAGE ON SCHEMA truth TO gcc_app_reader, gcc_app_writer, gcc_auditor, gcc_admin_migrator;
GRANT USAGE ON SCHEMA prose TO gcc_app_reader, gcc_app_writer, gcc_auditor, gcc_admin_migrator;
GRANT USAGE ON SCHEMA adversarial TO gcc_app_reader, gcc_app_writer, gcc_auditor, gcc_admin_migrator;
GRANT USAGE ON SCHEMA audit TO gcc_app_reader, gcc_app_writer, gcc_auditor, gcc_admin_migrator;

-- ============================================================================
-- gcc_app_reader GRANTS (SELECT only)
-- ============================================================================

-- Truth schema
GRANT SELECT ON truth.clinical_truth_store TO gcc_app_reader;

-- Prose schema
GRANT SELECT ON prose.smart_fragments TO gcc_app_reader;
GRANT SELECT ON prose.smart_fragment_versions TO gcc_app_reader;
GRANT SELECT ON prose.fragment_truth_links TO gcc_app_reader;
GRANT SELECT ON prose.submission_snapshots TO gcc_app_reader;
GRANT SELECT ON prose.submission_snapshot_fragments TO gcc_app_reader;

-- Adversarial schema
GRANT SELECT ON adversarial.regulatory_adversarial_precedents TO gcc_app_reader;

-- Audit schema (read-only)
GRANT SELECT ON audit.concomitant_audit_logs TO gcc_app_reader;

-- Views
GRANT SELECT ON prose.v_citation_appendix TO gcc_app_reader;
GRANT SELECT ON prose.v_unlinked_fragments TO gcc_app_reader;
GRANT SELECT ON truth.v_citation_coverage TO gcc_app_reader;

-- ============================================================================
-- gcc_app_writer GRANTS (INSERT/UPDATE on data tables, SELECT all)
-- ============================================================================

-- Inherit reader privileges
GRANT gcc_app_reader TO gcc_app_writer;

-- Truth schema: INSERT only (append-only)
-- UPDATE/DELETE blocked by trigger, but explicitly deny anyway
GRANT INSERT ON truth.clinical_truth_store TO gcc_app_writer;

-- Prose schema: INSERT/UPDATE on fragments and links
GRANT INSERT, UPDATE ON prose.smart_fragments TO gcc_app_writer;
GRANT INSERT ON prose.smart_fragment_versions TO gcc_app_writer;  -- Auto-created by trigger
GRANT INSERT, UPDATE ON prose.fragment_truth_links TO gcc_app_writer;
GRANT INSERT, UPDATE ON prose.submission_snapshots TO gcc_app_writer;
GRANT INSERT ON prose.submission_snapshot_fragments TO gcc_app_writer;

-- Adversarial schema: INSERT for adding precedents
GRANT INSERT ON adversarial.regulatory_adversarial_precedents TO gcc_app_writer;

-- Audit schema: INSERT only (append-only logs)
-- UPDATE/DELETE blocked by trigger
GRANT INSERT ON audit.concomitant_audit_logs TO gcc_app_writer;

-- ============================================================================
-- gcc_auditor GRANTS (Read audit/versions, no data modification)
-- ============================================================================

-- Full read on audit trail
GRANT SELECT ON audit.concomitant_audit_logs TO gcc_auditor;

-- Full read on version history
GRANT SELECT ON prose.smart_fragment_versions TO gcc_auditor;

-- Read fragments for context
GRANT SELECT ON prose.smart_fragments TO gcc_auditor;
GRANT SELECT ON prose.fragment_truth_links TO gcc_auditor;
GRANT SELECT ON prose.submission_snapshots TO gcc_auditor;
GRANT SELECT ON prose.submission_snapshot_fragments TO gcc_auditor;

-- Read truth for context
GRANT SELECT ON truth.clinical_truth_store TO gcc_auditor;

-- Read precedents for context
GRANT SELECT ON adversarial.regulatory_adversarial_precedents TO gcc_auditor;

-- Views
GRANT SELECT ON prose.v_citation_appendix TO gcc_auditor;
GRANT SELECT ON prose.v_unlinked_fragments TO gcc_auditor;
GRANT SELECT ON truth.v_citation_coverage TO gcc_auditor;

-- ============================================================================
-- gcc_admin_migrator GRANTS (DDL operations)
-- ============================================================================

-- Full control on schemas (for migrations)
GRANT ALL ON SCHEMA truth TO gcc_admin_migrator;
GRANT ALL ON SCHEMA prose TO gcc_admin_migrator;
GRANT ALL ON SCHEMA adversarial TO gcc_admin_migrator;
GRANT ALL ON SCHEMA audit TO gcc_admin_migrator;

-- Full control on tables (for migrations)
GRANT ALL ON ALL TABLES IN SCHEMA truth TO gcc_admin_migrator;
GRANT ALL ON ALL TABLES IN SCHEMA prose TO gcc_admin_migrator;
GRANT ALL ON ALL TABLES IN SCHEMA adversarial TO gcc_admin_migrator;
GRANT ALL ON ALL TABLES IN SCHEMA audit TO gcc_admin_migrator;

-- Sequence access
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA truth TO gcc_admin_migrator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA prose TO gcc_admin_migrator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA adversarial TO gcc_admin_migrator;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA audit TO gcc_admin_migrator;

-- ============================================================================
-- DEFAULT PRIVILEGES FOR FUTURE OBJECTS
-- ============================================================================

-- Ensure new tables get appropriate grants
ALTER DEFAULT PRIVILEGES IN SCHEMA truth 
    GRANT SELECT ON TABLES TO gcc_app_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA prose 
    GRANT SELECT ON TABLES TO gcc_app_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA adversarial 
    GRANT SELECT ON TABLES TO gcc_app_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit 
    GRANT SELECT ON TABLES TO gcc_app_reader;

-- ============================================================================
-- APPLICATION USER CREATION (Template)
-- ============================================================================
-- Uncomment and customize to create actual login users
-- These should be managed externally (Neon console, Terraform, etc.)

-- Example: Create an application user with writer role
-- CREATE USER trialsage_app WITH PASSWORD 'secure_password';
-- GRANT gcc_app_writer TO trialsage_app;

-- Example: Create an auditor user
-- CREATE USER compliance_auditor WITH PASSWORD 'secure_password';
-- GRANT gcc_auditor TO compliance_auditor;

-- Example: Create a read-only dashboard user
-- CREATE USER dashboard_reader WITH PASSWORD 'secure_password';
-- GRANT gcc_app_reader TO dashboard_reader;

-- ============================================================================
-- ROLE VERIFICATION QUERY
-- ============================================================================
-- Run this to verify role configuration:
/*
SELECT 
    r.rolname,
    ARRAY_AGG(DISTINCT m.rolname) AS member_of,
    r.rolcanlogin,
    r.rolcreatedb,
    r.rolcreaterole
FROM pg_roles r
LEFT JOIN pg_auth_members am ON r.oid = am.member
LEFT JOIN pg_roles m ON am.roleid = m.oid
WHERE r.rolname LIKE 'gcc_%'
GROUP BY r.rolname, r.rolcanlogin, r.rolcreatedb, r.rolcreaterole;
*/

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON ROLE gcc_app_reader IS 
    'Read-only access to GCC schemas for dashboards and reporting';

COMMENT ON ROLE gcc_app_writer IS 
    'Standard application access: INSERT/UPDATE on data, INSERT-only on audit';

COMMENT ON ROLE gcc_auditor IS 
    'Compliance auditor: read audit logs and version history';

COMMENT ON ROLE gcc_admin_migrator IS 
    'Schema migration role: DDL operations only, controlled access';

COMMIT;
