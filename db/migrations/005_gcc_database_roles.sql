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
-- Note: Use conditional grants for tables that may be created in later migrations

-- Truth schema
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    EXECUTE 'GRANT SELECT ON truth.clinical_truth_store TO gcc_app_reader';
  END IF;
END $$;

-- Prose schema (conditional for future migrations)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
    EXECUTE 'GRANT SELECT ON prose.smart_fragments TO gcc_app_reader';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    EXECUTE 'GRANT SELECT ON prose.smart_fragment_versions TO gcc_app_reader';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='fragment_truth_links') THEN
    EXECUTE 'GRANT SELECT ON prose.fragment_truth_links TO gcc_app_reader';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    EXECUTE 'GRANT SELECT ON prose.submission_snapshots TO gcc_app_reader';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshot_fragments') THEN
    EXECUTE 'GRANT SELECT ON prose.submission_snapshot_fragments TO gcc_app_reader';
  END IF;
END $$;

-- Adversarial schema
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='adversarial' AND table_name='regulatory_adversarial_precedents') THEN
    EXECUTE 'GRANT SELECT ON adversarial.regulatory_adversarial_precedents TO gcc_app_reader';
  END IF;
END $$;

-- Audit schema (read-only)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    EXECUTE 'GRANT SELECT ON audit.concomitant_audit_logs TO gcc_app_reader';
  END IF;
END $$;

-- Views (conditional)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='prose' AND table_name='v_citation_appendix') THEN
    EXECUTE 'GRANT SELECT ON prose.v_citation_appendix TO gcc_app_reader';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='prose' AND table_name='v_unlinked_fragments') THEN
    EXECUTE 'GRANT SELECT ON prose.v_unlinked_fragments TO gcc_app_reader';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='truth' AND table_name='v_citation_coverage') THEN
    EXECUTE 'GRANT SELECT ON truth.v_citation_coverage TO gcc_app_reader';
  END IF;
END $$;

-- ============================================================================
-- gcc_app_writer GRANTS (INSERT/UPDATE on data tables, SELECT all)
-- ============================================================================

-- Inherit reader privileges
GRANT gcc_app_reader TO gcc_app_writer;

-- Conditional grants for writer role
DO $$ BEGIN
  -- Truth schema: INSERT only (append-only)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    EXECUTE 'GRANT INSERT ON truth.clinical_truth_store TO gcc_app_writer';
  END IF;
  -- Prose schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
    EXECUTE 'GRANT INSERT, UPDATE ON prose.smart_fragments TO gcc_app_writer';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    EXECUTE 'GRANT INSERT ON prose.smart_fragment_versions TO gcc_app_writer';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='fragment_truth_links') THEN
    EXECUTE 'GRANT INSERT, UPDATE ON prose.fragment_truth_links TO gcc_app_writer';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    EXECUTE 'GRANT INSERT, UPDATE ON prose.submission_snapshots TO gcc_app_writer';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshot_fragments') THEN
    EXECUTE 'GRANT INSERT ON prose.submission_snapshot_fragments TO gcc_app_writer';
  END IF;
  -- Adversarial schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='adversarial' AND table_name='regulatory_adversarial_precedents') THEN
    EXECUTE 'GRANT INSERT ON adversarial.regulatory_adversarial_precedents TO gcc_app_writer';
  END IF;
  -- Audit schema
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    EXECUTE 'GRANT INSERT ON audit.concomitant_audit_logs TO gcc_app_writer';
  END IF;
END $$;

-- ============================================================================
-- gcc_auditor GRANTS (Read audit/versions, no data modification)
-- ============================================================================

DO $$ BEGIN
  -- Audit trail
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    EXECUTE 'GRANT SELECT ON audit.concomitant_audit_logs TO gcc_auditor';
  END IF;
  -- Version history
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragment_versions') THEN
    EXECUTE 'GRANT SELECT ON prose.smart_fragment_versions TO gcc_auditor';
  END IF;
  -- Fragments for context
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='smart_fragments') THEN
    EXECUTE 'GRANT SELECT ON prose.smart_fragments TO gcc_auditor';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='fragment_truth_links') THEN
    EXECUTE 'GRANT SELECT ON prose.fragment_truth_links TO gcc_auditor';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshots') THEN
    EXECUTE 'GRANT SELECT ON prose.submission_snapshots TO gcc_auditor';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='prose' AND table_name='submission_snapshot_fragments') THEN
    EXECUTE 'GRANT SELECT ON prose.submission_snapshot_fragments TO gcc_auditor';
  END IF;
  -- Truth for context
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='truth' AND table_name='clinical_truth_store') THEN
    EXECUTE 'GRANT SELECT ON truth.clinical_truth_store TO gcc_auditor';
  END IF;
  -- Precedents for context
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='adversarial' AND table_name='regulatory_adversarial_precedents') THEN
    EXECUTE 'GRANT SELECT ON adversarial.regulatory_adversarial_precedents TO gcc_auditor';
  END IF;
  -- Views
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='prose' AND table_name='v_citation_appendix') THEN
    EXECUTE 'GRANT SELECT ON prose.v_citation_appendix TO gcc_auditor';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='prose' AND table_name='v_unlinked_fragments') THEN
    EXECUTE 'GRANT SELECT ON prose.v_unlinked_fragments TO gcc_auditor';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.views WHERE table_schema='truth' AND table_name='v_citation_coverage') THEN
    EXECUTE 'GRANT SELECT ON truth.v_citation_coverage TO gcc_auditor';
  END IF;
END $$;

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
