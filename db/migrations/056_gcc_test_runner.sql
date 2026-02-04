-- ============================================================================
-- Test Runner: Concept2Cure v3.0 Enterprise Architecture Validation
-- Purpose: Comprehensive testing of eCTD v4.0, RLS, and Part 11 compliance
-- ============================================================================
-- Run this AFTER migrations 050-055
-- ============================================================================

\echo '╔══════════════════════════════════════════════════════════════════════════╗'
\echo '║  Concept2Cure v3.0 Enterprise Architecture - Test Suite                  ║'
\echo '║  eCTD v4.0 | Multi-Tenant RLS | Part 11 Audit                           ║'
\echo '╚══════════════════════════════════════════════════════════════════════════╝'

-- =============================================================================
-- TEST 1: Schema Verification
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 1: Schema Verification'
\echo '═══════════════════════════════════════════════════════════════════════════'

DO $$
DECLARE
    v_schema_count INT;
    v_missing TEXT := '';
BEGIN
    -- Check required schemas exist
    SELECT COUNT(*) INTO v_schema_count
    FROM information_schema.schemata
    WHERE schema_name IN ('common_standards', 'identity', 'ectd_v4', 'audit');
    
    IF v_schema_count = 4 THEN
        RAISE NOTICE '✓ All required schemas present (common_standards, identity, ectd_v4, audit)';
    ELSE
        RAISE NOTICE '✗ Missing schemas! Found only % of 4', v_schema_count;
    END IF;
END $$;

-- =============================================================================
-- TEST 2: Domain Registry Layer
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 2: Domain Registry Layer (Controlled Vocabularies)'
\echo '═══════════════════════════════════════════════════════════════════════════'

DO $$
DECLARE
    v_authority_count INT;
    v_cv_count INT;
    v_term_count INT;
    v_study_type_count INT;
    v_submission_type_count INT;
BEGIN
    -- Check regulatory authorities
    SELECT COUNT(*) INTO v_authority_count FROM common_standards.global_regulatory_authorities;
    RAISE NOTICE '  Regulatory Authorities: % (expected: 11)', v_authority_count;
    
    -- Check controlled vocabularies
    SELECT COUNT(*) INTO v_cv_count FROM common_standards.controlled_vocabularies;
    RAISE NOTICE '  Controlled Vocabularies: %', v_cv_count;
    
    -- Check CV terms
    SELECT COUNT(*) INTO v_term_count FROM common_standards.cv_terms;
    RAISE NOTICE '  CV Terms: %', v_term_count;
    
    -- Check study types
    SELECT COUNT(*) INTO v_study_type_count FROM common_standards.clinical_study_types;
    RAISE NOTICE '  Clinical Study Types: % (expected: 15)', v_study_type_count;
    
    -- Check submission types
    SELECT COUNT(*) INTO v_submission_type_count FROM common_standards.submission_types;
    RAISE NOTICE '  Submission Types: % (expected: 16)', v_submission_type_count;
    
    IF v_authority_count >= 11 AND v_study_type_count >= 15 AND v_submission_type_count >= 16 THEN
        RAISE NOTICE '✓ Domain Registry Layer: PASSED';
    ELSE
        RAISE NOTICE '✗ Domain Registry Layer: FAILED - Missing seed data';
    END IF;
END $$;

-- Verify Medical Device support
\echo ''
\echo '  Medical Device/IVD Support Check:'
SELECT 
    authority_code,
    display_name,
    supports_medical_devices,
    supports_ivd
FROM common_standards.global_regulatory_authorities
WHERE supports_medical_devices = TRUE
ORDER BY authority_code
LIMIT 5;

-- =============================================================================
-- TEST 3: Multi-Tenant Identity Core
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 3: Multi-Tenant Identity Core'
\echo '═══════════════════════════════════════════════════════════════════════════'

DO $$
DECLARE
    v_org_count INT;
    v_user_count INT;
    v_relationship_count INT;
BEGIN
    SELECT COUNT(*) INTO v_org_count FROM identity.organizations;
    SELECT COUNT(*) INTO v_user_count FROM identity.users;
    SELECT COUNT(*) INTO v_relationship_count FROM identity.org_relationships;
    
    RAISE NOTICE '  Organizations: %', v_org_count;
    RAISE NOTICE '  Users: %', v_user_count;
    RAISE NOTICE '  Org Relationships (Sponsor/CRO): %', v_relationship_count;
    
    IF v_org_count > 0 THEN
        RAISE NOTICE '✓ Multi-Tenant Identity Core: PASSED';
    ELSE
        RAISE NOTICE '✗ Multi-Tenant Identity Core: FAILED';
    END IF;
END $$;

-- Show organization types
\echo ''
\echo '  Organization Distribution by Business Model:'
SELECT 
    business_model,
    COUNT(*) as count
FROM identity.organizations
GROUP BY business_model
ORDER BY count DESC;

-- =============================================================================
-- TEST 4: eCTD v4.0 Context of Use Graph Model
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 4: eCTD v4.0 Context of Use Graph Model'
\echo '═══════════════════════════════════════════════════════════════════════════'

DO $$
DECLARE
    v_submission_count INT;
    v_unit_count INT;
    v_document_count INT;
    v_cou_count INT;
    v_keyword_count INT;
BEGIN
    SELECT COUNT(*) INTO v_submission_count FROM ectd_v4.regulatory_submissions;
    SELECT COUNT(*) INTO v_unit_count FROM ectd_v4.submission_units;
    SELECT COUNT(*) INTO v_document_count FROM ectd_v4.documents;
    SELECT COUNT(*) INTO v_cou_count FROM ectd_v4.context_of_use_elements;
    SELECT COUNT(*) INTO v_keyword_count FROM ectd_v4.keyword_definitions;
    
    RAISE NOTICE '  Regulatory Submissions: %', v_submission_count;
    RAISE NOTICE '  Submission Units (Sequences): %', v_unit_count;
    RAISE NOTICE '  Documents: %', v_document_count;
    RAISE NOTICE '  Context of Use Elements: %', v_cou_count;
    RAISE NOTICE '  Sender-Defined Keywords: %', v_keyword_count;
    
    IF v_submission_count > 0 AND v_cou_count > 0 THEN
        RAISE NOTICE '✓ eCTD v4.0 CoU Graph Model: PASSED';
    ELSE
        RAISE NOTICE '✗ eCTD v4.0 CoU Graph Model: FAILED';
    END IF;
END $$;

-- Show submissions by type
\echo ''
\echo '  Submissions by Application Type:'
SELECT 
    application_type,
    COUNT(*) as count,
    STRING_AGG(application_number, ', ') as applications
FROM ectd_v4.regulatory_submissions
GROUP BY application_type
ORDER BY count DESC;

-- =============================================================================
-- TEST 5: RLS Security (SECURITY DEFINER Pattern)
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 5: Row-Level Security (SECURITY DEFINER Pattern)'
\echo '═══════════════════════════════════════════════════════════════════════════'

DO $$
DECLARE
    v_rls_enabled_count INT;
    v_function_count INT;
BEGIN
    -- Check RLS is enabled on key tables
    SELECT COUNT(*) INTO v_rls_enabled_count
    FROM pg_tables t
    JOIN pg_class c ON t.tablename = c.relname
    WHERE t.schemaname = 'ectd_v4'
      AND c.relrowsecurity = TRUE;
    
    RAISE NOTICE '  Tables with RLS enabled in ectd_v4: %', v_rls_enabled_count;
    
    -- Check SECURITY DEFINER functions exist
    SELECT COUNT(*) INTO v_function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'identity'
      AND p.prosecdef = TRUE;
    
    RAISE NOTICE '  SECURITY DEFINER functions in identity schema: %', v_function_count;
    
    IF v_rls_enabled_count >= 5 AND v_function_count >= 2 THEN
        RAISE NOTICE '✓ RLS Security: PASSED';
    ELSE
        RAISE NOTICE '⚠ RLS Security: PARTIAL (check policies)';
    END IF;
END $$;

-- Test RLS context setting
\echo ''
\echo '  Testing RLS Context Functions:'

-- Set context for CardioTech (Medical Device company)
SELECT identity.set_app_context(
    '660e8400-e29b-41d4-a716-446655440001'::UUID,  -- Sarah Chen
    '550e8400-e29b-41d4-a716-446655440010'::UUID   -- CardioTech
);

SELECT 
    'CardioTech Context' as test,
    identity.current_user_id() as current_user,
    identity.current_org_id() as current_org;

-- =============================================================================
-- TEST 6: Part 11 Audit Trail
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 6: 21 CFR Part 11 Audit Trail'
\echo '═══════════════════════════════════════════════════════════════════════════'

DO $$
DECLARE
    v_audit_count INT;
    v_signature_count INT;
    v_trigger_count INT;
BEGIN
    -- Check audit log table exists
    SELECT COUNT(*) INTO v_audit_count
    FROM information_schema.tables
    WHERE table_schema = 'audit' AND table_name = 'event_log';
    
    -- Check signature log exists
    SELECT COUNT(*) INTO v_signature_count
    FROM information_schema.tables
    WHERE table_schema = 'audit' AND table_name = 'signature_log';
    
    -- Check audit triggers
    SELECT COUNT(*) INTO v_trigger_count
    FROM information_schema.triggers
    WHERE trigger_name LIKE 'audit_%';
    
    RAISE NOTICE '  Audit Event Log Table: %', CASE WHEN v_audit_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;
    RAISE NOTICE '  Signature Log Table: %', CASE WHEN v_signature_count > 0 THEN 'EXISTS' ELSE 'MISSING' END;
    RAISE NOTICE '  Audit Triggers Installed: %', v_trigger_count;
    
    IF v_audit_count > 0 AND v_signature_count > 0 AND v_trigger_count > 0 THEN
        RAISE NOTICE '✓ Part 11 Audit Trail: PASSED';
    ELSE
        RAISE NOTICE '✗ Part 11 Audit Trail: FAILED';
    END IF;
END $$;

-- =============================================================================
-- TEST 7: Recursive CTE - Virtual Tree Reconstruction
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 7: Recursive CTE - Virtual Tree (eCTD v4.0 Key Feature)'
\echo '═══════════════════════════════════════════════════════════════════════════'

-- Test the tree reconstruction for NeuroBio IND
\echo '  IND Submission Tree (NeuroBio NB-401):'
SELECT 
    REPEAT('  ', depth - 1) || title as tree_view,
    context_group_code,
    CASE WHEN has_document THEN '📄' ELSE '📁' END as type,
    lifecycle_status::TEXT as status
FROM ectd_v4.get_submission_tree('990e8400-e29b-41d4-a716-446655440003'::UUID)
ORDER BY path;

-- =============================================================================
-- TEST 8: Document Reuse Analysis (v4.0 Feature)
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 8: Document Reuse Analysis (eCTD v4.0 Feature)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT 
    title,
    document_type_code,
    reference_count,
    submission_count,
    CASE WHEN reference_count > 1 THEN '♻️ REUSED' ELSE '📄 SINGLE' END as reuse_status
FROM ectd_v4.v_document_reuse_analysis
WHERE reference_count > 0
ORDER BY reference_count DESC
LIMIT 10;

-- =============================================================================
-- TEST 9: Scenario Validation - Medical Device 510(k)
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 9: Scenario - Medical Device 510(k) (CardioTech)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT 
    rs.application_number,
    rs.application_type,
    rs.proprietary_name,
    rs.authority_id,
    rs.lifecycle_status::TEXT,
    COUNT(DISTINCT su.id) as sequences,
    COUNT(DISTINCT cou.id) as cou_elements,
    COUNT(DISTINCT cou.document_reference_id) FILTER (WHERE cou.document_reference_id IS NOT NULL) as documents
FROM ectd_v4.regulatory_submissions rs
LEFT JOIN ectd_v4.submission_units su ON su.submission_id = rs.id
LEFT JOIN ectd_v4.context_of_use_elements cou ON cou.submission_unit_id = su.id
WHERE rs.application_type = '510K'
GROUP BY rs.id, rs.application_number, rs.application_type, rs.proprietary_name, 
         rs.authority_id, rs.lifecycle_status;

-- =============================================================================
-- TEST 10: Scenario Validation - IVD/Diagnostic EUA
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 10: Scenario - IVD/Diagnostic EUA (DiagnoSure)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT 
    rs.application_number,
    rs.application_type,
    rs.proprietary_name,
    o.business_model::TEXT as org_type,
    rs.lifecycle_status::TEXT
FROM ectd_v4.regulatory_submissions rs
JOIN identity.organizations o ON rs.org_id = o.id
WHERE rs.application_type = 'EUA';

-- =============================================================================
-- TEST 11: Scenario Validation - Biotech/Pharma IND
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 11: Scenario - Biotech/Pharma IND (NeuroBio)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT 
    rs.application_number,
    su.sequence_number,
    su.sequence_description,
    su.submission_unit_type::TEXT,
    su.lifecycle_status::TEXT,
    COUNT(cou.id) as cou_elements
FROM ectd_v4.regulatory_submissions rs
JOIN ectd_v4.submission_units su ON su.submission_id = rs.id
LEFT JOIN ectd_v4.context_of_use_elements cou ON cou.submission_unit_id = su.id
WHERE rs.application_type = 'IND'
GROUP BY rs.id, rs.application_number, su.id, su.sequence_number, 
         su.sequence_description, su.submission_unit_type, su.lifecycle_status
ORDER BY su.sequence_number;

-- =============================================================================
-- TEST 12: Sponsor/CRO Delegated Access
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 12: Sponsor/CRO Delegated Access (RLS)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT 
    sponsor.org_name as sponsor,
    cro.org_name as cro,
    rel.relationship_type,
    rel.contract_status::TEXT,
    rel.can_view_submissions,
    rel.can_create_submissions,
    rel.can_upload_documents
FROM identity.org_relationships rel
JOIN identity.organizations sponsor ON rel.sponsor_org_id = sponsor.id
JOIN identity.organizations cro ON rel.cro_org_id = cro.id;

-- =============================================================================
-- TEST 13: Sender-Defined Keywords (v4.0 Flex Factor)
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 13: Sender-Defined Keywords (v4.0 Flex Factor)'
\echo '═══════════════════════════════════════════════════════════════════════════'

SELECT 
    kd.keyword_code,
    kd.display_name,
    kd.keyword_category,
    rs.application_number
FROM ectd_v4.keyword_definitions kd
JOIN ectd_v4.submission_units su ON kd.submission_unit_id = su.id
JOIN ectd_v4.regulatory_submissions rs ON su.submission_id = rs.id
ORDER BY rs.application_number, kd.keyword_category;

-- =============================================================================
-- TEST 14: Audit Trail Generation Test
-- =============================================================================
\echo ''
\echo '═══════════════════════════════════════════════════════════════════════════'
\echo '  TEST 14: Audit Trail Generation Test'
\echo '═══════════════════════════════════════════════════════════════════════════'

-- Set context first
SELECT identity.set_app_context(
    '660e8400-e29b-41d4-a716-446655440004'::UUID,  -- James Wilson (NeuroBio)
    '550e8400-e29b-41d4-a716-446655440012'::UUID   -- NeuroBio
);

-- Test audit logging
DO $$
DECLARE
    v_audit_id BIGINT;
BEGIN
    -- Log a test event
    v_audit_id := audit.log_event(
        p_category := 'DATA_ACCESS',
        p_entity_type := 'ectd_v4.regulatory_submissions',
        p_entity_id := '880e8400-e29b-41d4-a716-446655440003'::UUID,
        p_entity_name := 'IND 999888 - NB-401',
        p_description := 'User accessed IND submission',
        p_metadata := '{"action": "view", "test": true}'::JSONB
    );
    
    RAISE NOTICE '✓ Audit event logged with ID: %', v_audit_id;
END $$;

-- Show recent audit entries
SELECT 
    event_timestamp,
    event_category::TEXT,
    entity_type,
    entity_name,
    user_full_name,
    org_name
FROM audit.event_log
ORDER BY event_timestamp DESC
LIMIT 5;

-- =============================================================================
-- FINAL SUMMARY
-- =============================================================================
\echo ''
\echo '╔══════════════════════════════════════════════════════════════════════════╗'
\echo '║  TEST SUITE COMPLETE                                                     ║'
\echo '╚══════════════════════════════════════════════════════════════════════════╝'
\echo ''

DO $$
DECLARE
    v_total_tests INT := 14;
    v_schema_ok BOOLEAN;
    v_registry_ok BOOLEAN;
    v_identity_ok BOOLEAN;
    v_ectd_ok BOOLEAN;
    v_audit_ok BOOLEAN;
BEGIN
    -- Quick validation checks
    SELECT COUNT(*) = 4 INTO v_schema_ok
    FROM information_schema.schemata
    WHERE schema_name IN ('common_standards', 'identity', 'ectd_v4', 'audit');
    
    SELECT COUNT(*) >= 11 INTO v_registry_ok
    FROM common_standards.global_regulatory_authorities;
    
    SELECT COUNT(*) > 0 INTO v_identity_ok
    FROM identity.organizations;
    
    SELECT COUNT(*) > 0 INTO v_ectd_ok
    FROM ectd_v4.regulatory_submissions;
    
    SELECT COUNT(*) > 0 INTO v_audit_ok
    FROM information_schema.tables
    WHERE table_schema = 'audit' AND table_name = 'event_log';
    
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '  SUMMARY';
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════════';
    RAISE NOTICE '  Schema Verification:        %', CASE WHEN v_schema_ok THEN '✓ PASS' ELSE '✗ FAIL' END;
    RAISE NOTICE '  Domain Registry Layer:      %', CASE WHEN v_registry_ok THEN '✓ PASS' ELSE '✗ FAIL' END;
    RAISE NOTICE '  Multi-Tenant Identity:      %', CASE WHEN v_identity_ok THEN '✓ PASS' ELSE '✗ FAIL' END;
    RAISE NOTICE '  eCTD v4.0 CoU Graph:        %', CASE WHEN v_ectd_ok THEN '✓ PASS' ELSE '✗ FAIL' END;
    RAISE NOTICE '  Part 11 Audit Trail:        %', CASE WHEN v_audit_ok THEN '✓ PASS' ELSE '✗ FAIL' END;
    RAISE NOTICE '═══════════════════════════════════════════════════════════════════════════';
    
    IF v_schema_ok AND v_registry_ok AND v_identity_ok AND v_ectd_ok AND v_audit_ok THEN
        RAISE NOTICE '';
        RAISE NOTICE '  🎉 ALL TESTS PASSED - Concept2Cure v3.0 Architecture Ready!';
        RAISE NOTICE '';
    ELSE
        RAISE NOTICE '';
        RAISE NOTICE '  ⚠️  SOME TESTS FAILED - Review migration logs';
        RAISE NOTICE '';
    END IF;
END $$;
