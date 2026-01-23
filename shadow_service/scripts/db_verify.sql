-- =============================================================================
-- db_verify.sql - Compliance verification for Shadow Service database
-- =============================================================================
-- Usage: psql "$DATABASE_URL" -f scripts/db_verify.sql
-- Returns: Non-zero exit if any check fails
-- =============================================================================

\set ON_ERROR_STOP on
\echo '=============================================='
\echo 'Shadow Service Database Compliance Verification'
\echo '=============================================='

-- =============================================================================
-- 1. Required Extensions
-- =============================================================================
\echo ''
\echo '1. Checking required extensions...'

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
        RAISE EXCEPTION 'FAIL: pgvector extension not installed';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp') THEN
        RAISE EXCEPTION 'FAIL: uuid-ossp extension not installed';
    END IF;
    RAISE NOTICE 'PASS: Required extensions installed';
END $$;

-- =============================================================================
-- 2. Required Schemas
-- =============================================================================
\echo ''
\echo '2. Checking required schemas...'

DO $$
DECLARE
    required_schemas TEXT[] := ARRAY['truth', 'prose', 'adversarial', 'audit', 'core', 'retention', 'monitoring', 'regulatory', 'ectd'];
    schema_name TEXT;
BEGIN
    FOREACH schema_name IN ARRAY required_schemas LOOP
        IF NOT EXISTS (SELECT 1 FROM information_schema.schemata WHERE schema_name = schema_name) THEN
            RAISE EXCEPTION 'FAIL: Schema % does not exist', schema_name;
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: All required schemas exist';
END $$;

-- =============================================================================
-- 3. Core Tables Exist
-- =============================================================================
\echo ''
\echo '3. Checking core tables...'

DO $$
DECLARE
    tables TEXT[][] := ARRAY[
        ARRAY['truth', 'clinical_truth_store'],
        ARRAY['prose', 'smart_fragments'],
        ARRAY['prose', 'smart_fragment_versions'],
        ARRAY['prose', 'fragment_truth_links'],
        ARRAY['prose', 'submission_snapshots'],
        ARRAY['prose', 'submission_snapshot_fragments'],
        ARRAY['prose', 'submission_snapshot_exports'],
        ARRAY['adversarial', 'regulatory_adversarial_precedents'],
        ARRAY['audit', 'concomitant_audit_logs'],
        ARRAY['audit', 'e_signatures'],
        ARRAY['audit', 'config_bundles'],
        ARRAY['core', 'programs'],
        ARRAY['retention', 'policies'],
        ARRAY['retention', 'legal_holds'],
        ARRAY['retention', 'archive_manifests']
    ];
    tbl TEXT[];
BEGIN
    FOREACH tbl SLICE 1 IN ARRAY tables LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = tbl[1] AND table_name = tbl[2]
        ) THEN
            RAISE EXCEPTION 'FAIL: Table %.% does not exist', tbl[1], tbl[2];
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: All core tables exist';
END $$;

-- =============================================================================
-- 4. Immutability Triggers (CRITICAL for Part 11)
-- =============================================================================
\echo ''
\echo '4. Checking immutability triggers (Part 11 critical)...'

DO $$
DECLARE
    required_triggers TEXT[][] := ARRAY[
        ARRAY['audit', 'concomitant_audit_logs', 'trg_no_update_delete_concomitant_audit_logs'],
        ARRAY['truth', 'clinical_truth_store', 'trg_no_update_delete_clinical_truth_store'],
        ARRAY['prose', 'submission_snapshot_exports', 'trg_no_update_delete_snapshot_exports'],
        ARRAY['audit', 'config_bundles', 'trg_no_update_delete_config_bundles']
    ];
    trg TEXT[];
BEGIN
    FOREACH trg SLICE 1 IN ARRAY required_triggers LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.triggers
            WHERE event_object_schema = trg[1] 
            AND event_object_table = trg[2]
            AND trigger_name = trg[3]
        ) THEN
            RAISE EXCEPTION 'FAIL: Immutability trigger % on %.% does not exist', trg[3], trg[1], trg[2];
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: All immutability triggers exist';
END $$;

-- =============================================================================
-- 5. Row Level Security (RLS) Enabled
-- =============================================================================
\echo ''
\echo '5. Checking Row Level Security...'

DO $$
DECLARE
    rls_tables TEXT[][] := ARRAY[
        ARRAY['truth', 'clinical_truth_store'],
        ARRAY['prose', 'smart_fragments'],
        ARRAY['prose', 'submission_snapshots'],
        ARRAY['audit', 'concomitant_audit_logs']
    ];
    tbl TEXT[];
    rls_enabled BOOLEAN;
BEGIN
    FOREACH tbl SLICE 1 IN ARRAY rls_tables LOOP
        SELECT relrowsecurity INTO rls_enabled
        FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = tbl[1] AND c.relname = tbl[2];
        
        IF NOT rls_enabled THEN
            RAISE WARNING 'WARN: RLS not enabled on %.% (may be intentional for service account)', tbl[1], tbl[2];
        END IF;
    END LOOP;
    RAISE NOTICE 'INFO: RLS check complete (warnings above may be acceptable)';
END $$;

-- =============================================================================
-- 6. Required Views Exist
-- =============================================================================
\echo ''
\echo '6. Checking required views...'

DO $$
DECLARE
    views TEXT[][] := ARRAY[
        ARRAY['prose', 'v_fragment_current'],
        ARRAY['audit', 'v_fragment_latest_risk'],
        ARRAY['retention', 'v_archive_eligible']
    ];
    v TEXT[];
BEGIN
    FOREACH v SLICE 1 IN ARRAY views LOOP
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.views 
            WHERE table_schema = v[1] AND table_name = v[2]
        ) THEN
            RAISE EXCEPTION 'FAIL: View %.% does not exist', v[1], v[2];
        END IF;
    END LOOP;
    RAISE NOTICE 'PASS: All required views exist';
END $$;

-- =============================================================================
-- 7. Required Functions Exist
-- =============================================================================
\echo ''
\echo '7. Checking required functions...'

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'retention' AND p.proname = 'is_under_legal_hold'
    ) THEN
        RAISE EXCEPTION 'FAIL: Function retention.is_under_legal_hold() does not exist';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'auth' AND p.proname = 'global_program_id'
    ) THEN
        RAISE EXCEPTION 'FAIL: Function auth.global_program_id() does not exist';
    END IF;
    
    RAISE NOTICE 'PASS: All required functions exist';
END $$;

-- =============================================================================
-- 8. GLOBAL Program Exists
-- =============================================================================
\echo ''
\echo '8. Checking GLOBAL program exists...'

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM core.programs WHERE program_code = 'GLOBAL') THEN
        RAISE EXCEPTION 'FAIL: GLOBAL program does not exist';
    END IF;
    RAISE NOTICE 'PASS: GLOBAL program exists';
END $$;

-- =============================================================================
-- 9. Default Retention Policies Exist
-- =============================================================================
\echo ''
\echo '9. Checking default retention policies...'

DO $$
DECLARE
    policy_count INT;
BEGIN
    SELECT COUNT(*) INTO policy_count FROM retention.policies WHERE is_active = TRUE;
    IF policy_count < 5 THEN
        RAISE EXCEPTION 'FAIL: Expected at least 5 retention policies, found %', policy_count;
    END IF;
    RAISE NOTICE 'PASS: % retention policies configured', policy_count;
END $$;

-- =============================================================================
-- Summary
-- =============================================================================
\echo ''
\echo '=============================================='
\echo 'VERIFICATION COMPLETE - All checks passed'
\echo '=============================================='
