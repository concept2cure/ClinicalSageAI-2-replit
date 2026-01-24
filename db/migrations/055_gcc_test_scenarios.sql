-- ============================================================================
-- Migration 055: Test Scenarios with Example Data
-- Purpose: Comprehensive test data for all client types
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Client Types: Medical Device, IVD/Diagnostic, Biotech/Pharma, Academic Research
-- ============================================================================

BEGIN;

-- =============================================================================
-- A) SEED TEST ORGANIZATIONS
-- =============================================================================

-- Clear existing test data (preserving demo orgs from 051)
DELETE FROM identity.users WHERE email LIKE '%@test.example.com';

-- Insert additional test organizations for scenarios
INSERT INTO identity.organizations (
    id, org_name, org_short_code, business_model, duns_number,
    primary_email, headquarters_country, is_active, part11_signatures_enabled
)
VALUES 
    -- Medical Device Company
    (
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        'CardioTech Medical Devices Inc.',
        'CARDIO',
        'DEVICE_MANUFACTURER',
        '123456789',
        'regulatory@cardiotech-test.example.com',
        'US',
        TRUE,
        TRUE
    ),
    -- IVD/Diagnostic Company
    (
        '550e8400-e29b-41d4-a716-446655440011'::UUID,
        'DiagnoSure Labs Inc.',
        'DIAGSURE',
        'IVD_DIAGNOSTICS',
        '234567890',
        'regulatory@diagnosure-test.example.com',
        'US',
        TRUE,
        TRUE
    ),
    -- Biotech Sponsor
    (
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'NeuroBio Therapeutics',
        'NEUROBIO',
        'BIO_PHARMA_SPONSOR',
        '345678901',
        'regulatory@neurobio-test.example.com',
        'US',
        TRUE,
        TRUE
    ),
    -- Academic Research Institution
    (
        '550e8400-e29b-41d4-a716-446655440013'::UUID,
        'Stanford University Medical Center',
        'STANFORD',
        'ACADEMIC_INSTITUTION',
        '456789012',
        'irb@stanford-test.example.com',
        'US',
        TRUE,
        FALSE  -- Academic typically no Part 11 signatures
    ),
    -- CRO Partner
    (
        '550e8400-e29b-41d4-a716-446655440014'::UUID,
        'GlobalTrials CRO',
        'GTCRO',
        'CRO_PARTNER',
        '567890123',
        'ops@globaltrials-test.example.com',
        'US',
        TRUE,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    org_name = EXCLUDED.org_name,
    business_model = EXCLUDED.business_model;

-- =============================================================================
-- B) SEED TEST USERS
-- =============================================================================

INSERT INTO identity.users (
    id, org_id, email, full_name, job_title, user_role,
    has_signing_authority, is_active, mfa_enabled
)
VALUES
    -- CardioTech Medical Devices
    (
        '660e8400-e29b-41d4-a716-446655440001'::UUID,
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        'sarah.chen@cardiotech-test.example.com',
        'Dr. Sarah Chen',
        'VP Regulatory Affairs',
        'RA_LEAD',
        TRUE,
        TRUE,
        TRUE
    ),
    (
        '660e8400-e29b-41d4-a716-446655440002'::UUID,
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        'mike.johnson@cardiotech-test.example.com',
        'Mike Johnson',
        'Regulatory Specialist',
        'RA_SPECIALIST',
        FALSE,
        TRUE,
        TRUE
    ),
    -- DiagnoSure Labs
    (
        '660e8400-e29b-41d4-a716-446655440003'::UUID,
        '550e8400-e29b-41d4-a716-446655440011'::UUID,
        'lisa.wang@diagnosure-test.example.com',
        'Dr. Lisa Wang',
        'Chief Scientific Officer',
        'RA_LEAD',
        TRUE,
        TRUE,
        TRUE
    ),
    -- NeuroBio Therapeutics
    (
        '660e8400-e29b-41d4-a716-446655440004'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'james.wilson@neurobio-test.example.com',
        'James Wilson',
        'Director of Regulatory',
        'RA_LEAD',
        TRUE,
        TRUE,
        TRUE
    ),
    (
        '660e8400-e29b-41d4-a716-446655440005'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'emily.davis@neurobio-test.example.com',
        'Emily Davis',
        'Clinical Operations Manager',
        'CLINICAL_OPS',
        FALSE,
        TRUE,
        FALSE
    ),
    -- Stanford Academic
    (
        '660e8400-e29b-41d4-a716-446655440006'::UUID,
        '550e8400-e29b-41d4-a716-446655440013'::UUID,
        'dr.martinez@stanford-test.example.com',
        'Dr. Ana Martinez',
        'Principal Investigator',
        'VIEWER',  -- Academic PIs typically have limited submission rights
        FALSE,
        TRUE,
        FALSE
    ),
    -- GlobalTrials CRO
    (
        '660e8400-e29b-41d4-a716-446655440007'::UUID,
        '550e8400-e29b-41d4-a716-446655440014'::UUID,
        'raj.patel@globaltrials-test.example.com',
        'Raj Patel',
        'Senior Project Manager',
        'CRO_MANAGER',
        TRUE,
        TRUE,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    job_title = EXCLUDED.job_title;

-- =============================================================================
-- C) SEED CRO RELATIONSHIPS (Sponsor-CRO Contracts)
-- =============================================================================

-- NeuroBio hires GlobalTrials CRO
INSERT INTO identity.org_relationships (
    id, sponsor_org_id, cro_org_id, relationship_type, contract_status,
    effective_from, can_view_submissions, can_create_submissions, can_upload_documents
)
VALUES (
    '770e8400-e29b-41d4-a716-446655440001'::UUID,
    '550e8400-e29b-41d4-a716-446655440012'::UUID,  -- NeuroBio (Sponsor)
    '550e8400-e29b-41d4-a716-446655440014'::UUID,  -- GlobalTrials (CRO)
    'CRO_SERVICES',
    'ACTIVE',
    '2024-01-01',
    TRUE,
    TRUE,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    contract_status = EXCLUDED.contract_status;

-- =============================================================================
-- D) SCENARIO 1: MEDICAL DEVICE - 510(k) Submission
-- =============================================================================

-- Create 510(k) regulatory submission
INSERT INTO ectd_v4.regulatory_submissions (
    id, org_id, application_number, application_type,
    proprietary_name, established_name, authority_id,
    sponsor_name, lifecycle_status, internal_tracking_number
)
VALUES (
    '880e8400-e29b-41d4-a716-446655440001'::UUID,
    '550e8400-e29b-41d4-a716-446655440010'::UUID,  -- CardioTech
    'K241234',
    '510K',
    'CardioGuard Pro',
    'Implantable Cardiac Defibrillator',
    'US_FDA',
    'CardioTech Medical Devices Inc.',
    'PENDING',
    'CT-510K-2024-001'
)
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- Create submission unit (initial 510k)
INSERT INTO ectd_v4.submission_units (
    id, submission_id, sequence_number, sequence_description,
    submission_unit_type, lifecycle_status
)
VALUES (
    '990e8400-e29b-41d4-a716-446655440001'::UUID,
    '880e8400-e29b-41d4-a716-446655440001'::UUID,
    '0000',
    'Original 510(k) Submission',
    'ORIGINAL_APPLICATION',
    'PENDING'
)
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- Create 510(k) documents
INSERT INTO ectd_v4.documents (
    id, org_id, title, document_type_code, storage_url, original_filename,
    mime_type, checksum_md5
)
VALUES 
    (
        'aa0e8400-e29b-41d4-a716-446655440001'::UUID,
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        '510(k) Summary - CardioGuard Pro',
        '510K_SUMMARY',
        's3://clinical-sage/cardiotech/510k/K241234/510k_summary.pdf',
        '510k_summary.pdf',
        'application/pdf',
        'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6'
    ),
    (
        'aa0e8400-e29b-41d4-a716-446655440002'::UUID,
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        'Substantial Equivalence Discussion',
        'PREDICATE_COMPARISON',
        's3://clinical-sage/cardiotech/510k/K241234/substantial_equivalence.pdf',
        'substantial_equivalence.pdf',
        'application/pdf',
        'b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7'
    ),
    (
        'aa0e8400-e29b-41d4-a716-446655440003'::UUID,
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        'Electrical Safety Testing Report',
        'DEVICE_SAFETY_DATA',
        's3://clinical-sage/cardiotech/510k/K241234/safety_testing.pdf',
        'electrical_safety_testing.pdf',
        'application/pdf',
        'c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8'
    ),
    (
        'aa0e8400-e29b-41d4-a716-446655440004'::UUID,
        '550e8400-e29b-41d4-a716-446655440010'::UUID,
        'Device Specification Document',
        'DEVICE_DESCRIPTION',
        's3://clinical-sage/cardiotech/510k/K241234/device_spec.pdf',
        'device_specification.pdf',
        'application/pdf',
        'd4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9'
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title;

-- Create Context of Use elements for 510(k)
INSERT INTO ectd_v4.context_of_use_elements (
    id, submission_unit_id, context_group_code, priority_number,
    document_reference_id, lifecycle_status, title, is_required, is_provided
)
VALUES
    -- Cover Letter (Section 1)
    (
        'bb0e8400-e29b-41d4-a716-446655440001'::UUID,
        '990e8400-e29b-41d4-a716-446655440001'::UUID,
        '510k-cover-letter',
        1,
        NULL,  -- Placeholder
        'ACTIVE',
        'Cover Letter',
        TRUE,
        FALSE
    ),
    -- 510(k) Summary (Section 2)
    (
        'bb0e8400-e29b-41d4-a716-446655440002'::UUID,
        '990e8400-e29b-41d4-a716-446655440001'::UUID,
        '510k-summary',
        2,
        'aa0e8400-e29b-41d4-a716-446655440001'::UUID,
        'ACTIVE',
        '510(k) Summary',
        TRUE,
        TRUE
    ),
    -- Substantial Equivalence (Section 3)
    (
        'bb0e8400-e29b-41d4-a716-446655440003'::UUID,
        '990e8400-e29b-41d4-a716-446655440001'::UUID,
        '510k-substantial-equivalence',
        3,
        'aa0e8400-e29b-41d4-a716-446655440002'::UUID,
        'ACTIVE',
        'Substantial Equivalence Comparison',
        TRUE,
        TRUE
    ),
    -- Safety Testing (Section 7 - Performance Data)
    (
        'bb0e8400-e29b-41d4-a716-446655440004'::UUID,
        '990e8400-e29b-41d4-a716-446655440001'::UUID,
        '510k-performance-data',
        7,
        'aa0e8400-e29b-41d4-a716-446655440003'::UUID,
        'ACTIVE',
        'Safety Testing Data',
        TRUE,
        TRUE
    ),
    -- Device Description (Section 5)
    (
        'bb0e8400-e29b-41d4-a716-446655440005'::UUID,
        '990e8400-e29b-41d4-a716-446655440001'::UUID,
        '510k-device-description',
        5,
        'aa0e8400-e29b-41d4-a716-446655440004'::UUID,
        'ACTIVE',
        'Device Description & Specifications',
        TRUE,
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- =============================================================================
-- E) SCENARIO 2: IVD/DIAGNOSTIC - EUA Submission
-- =============================================================================

INSERT INTO ectd_v4.regulatory_submissions (
    id, org_id, application_number, application_type,
    proprietary_name, established_name, authority_id,
    sponsor_name, lifecycle_status, internal_tracking_number
)
VALUES (
    '880e8400-e29b-41d4-a716-446655440002'::UUID,
    '550e8400-e29b-41d4-a716-446655440011'::UUID,  -- DiagnoSure
    'EUA202412345',
    'EUA',
    'DiagnoSure SARS-CoV-2 Rapid Test',
    'SARS-CoV-2 Nucleic Acid Test',
    'US_FDA',
    'DiagnoSure Labs Inc.',
    'UNDER_REVIEW',
    'DS-EUA-2024-001'
)
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

INSERT INTO ectd_v4.submission_units (
    id, submission_id, sequence_number, sequence_description,
    submission_unit_type, lifecycle_status, actual_submission_date
)
VALUES (
    '990e8400-e29b-41d4-a716-446655440002'::UUID,
    '880e8400-e29b-41d4-a716-446655440002'::UUID,
    '0000',
    'Original EUA Request',
    'ORIGINAL_APPLICATION',
    'UNDER_REVIEW',
    '2024-11-01'
)
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- IVD-specific documents
INSERT INTO ectd_v4.documents (
    id, org_id, title, document_type_code, storage_url, original_filename,
    mime_type, checksum_md5
)
VALUES 
    (
        'aa0e8400-e29b-41d4-a716-446655440010'::UUID,
        '550e8400-e29b-41d4-a716-446655440011'::UUID,
        'Analytical Performance Study Report',
        'ANALYTICAL_PERFORMANCE',
        's3://clinical-sage/diagnosure/eua/EUA202412345/analytical_performance.pdf',
        'analytical_performance.pdf',
        'application/pdf',
        'e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0'
    ),
    (
        'aa0e8400-e29b-41d4-a716-446655440011'::UUID,
        '550e8400-e29b-41d4-a716-446655440011'::UUID,
        'Clinical Performance Study Report',
        'CLINICAL_PERFORMANCE',
        's3://clinical-sage/diagnosure/eua/EUA202412345/clinical_performance.pdf',
        'clinical_performance.pdf',
        'application/pdf',
        'f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1'
    ),
    (
        'aa0e8400-e29b-41d4-a716-446655440012'::UUID,
        '550e8400-e29b-41d4-a716-446655440011'::UUID,
        'Instructions for Use',
        'IFU',
        's3://clinical-sage/diagnosure/eua/EUA202412345/ifu.pdf',
        'instructions_for_use.pdf',
        'application/pdf',
        'g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2'
    ),
    (
        'aa0e8400-e29b-41d4-a716-446655440013'::UUID,
        '550e8400-e29b-41d4-a716-446655440011'::UUID,
        'Fact Sheet for Healthcare Providers',
        'LABELING',
        's3://clinical-sage/diagnosure/eua/EUA202412345/hcp_fact_sheet.pdf',
        'fact_sheet_hcp.pdf',
        'application/pdf',
        'h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3'
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title;

-- =============================================================================
-- F) SCENARIO 3: BIOTECH/PHARMA - IND Submission
-- =============================================================================

INSERT INTO ectd_v4.regulatory_submissions (
    id, org_id, application_number, application_type,
    proprietary_name, established_name, authority_id,
    sponsor_name, lifecycle_status, internal_tracking_number
)
VALUES (
    '880e8400-e29b-41d4-a716-446655440003'::UUID,
    '550e8400-e29b-41d4-a716-446655440012'::UUID,  -- NeuroBio
    'IND 999888',
    'IND',
    'NB-401',
    'Neuroplastin Modulator',
    'US_FDA',
    'NeuroBio Therapeutics',
    'ACTIVE',
    'NB-IND-2024-001'
)
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- Multiple sequences for IND
INSERT INTO ectd_v4.submission_units (
    id, submission_id, sequence_number, sequence_description,
    submission_unit_type, lifecycle_status, actual_submission_date
)
VALUES 
    (
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        '880e8400-e29b-41d4-a716-446655440003'::UUID,
        '0000',
        'Original IND Submission',
        'ORIGINAL_APPLICATION',
        'ACTIVE',
        '2024-06-15'
    ),
    (
        '990e8400-e29b-41d4-a716-446655440004'::UUID,
        '880e8400-e29b-41d4-a716-446655440003'::UUID,
        '0001',
        'Protocol Amendment 1',
        'AMENDMENT',
        'ACTIVE',
        '2024-08-20'
    ),
    (
        '990e8400-e29b-41d4-a716-446655440005'::UUID,
        '880e8400-e29b-41d4-a716-446655440003'::UUID,
        '0002',
        'Safety Report Update',
        'SAFETY_REPORT',
        'PENDING',
        NULL
    )
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- IND documents (eCTD Module 2-5)
INSERT INTO ectd_v4.documents (
    id, org_id, title, document_type_code, storage_url, original_filename,
    mime_type, checksum_md5, is_reusable
)
VALUES 
    -- Module 2.5 - Clinical Overview
    (
        'aa0e8400-e29b-41d4-a716-446655440020'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'Clinical Overview - NB-401 Phase 1',
        'CLINICAL_OVERVIEW',
        's3://clinical-sage/neurobio/ind/IND999888/m2-5-clinical-overview.pdf',
        'm2-5-clinical-overview.pdf',
        'application/pdf',
        'i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4',
        TRUE  -- Reusable across regions
    ),
    -- Module 2.7 - Clinical Summary
    (
        'aa0e8400-e29b-41d4-a716-446655440021'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'Clinical Summary - NB-401',
        'CLINICAL_SUMMARY',
        's3://clinical-sage/neurobio/ind/IND999888/m2-7-clinical-summary.pdf',
        'm2-7-clinical-summary.pdf',
        'application/pdf',
        'j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5',
        TRUE
    ),
    -- Module 3.2.S - Drug Substance
    (
        'aa0e8400-e29b-41d4-a716-446655440022'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'Drug Substance Specification - NB-401',
        'CMC_DRUG_SUBSTANCE',
        's3://clinical-sage/neurobio/ind/IND999888/m3-2-s-drug-substance.pdf',
        'm3-2-s-drug-substance.pdf',
        'application/pdf',
        'k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
        TRUE
    ),
    -- Protocol
    (
        'aa0e8400-e29b-41d4-a716-446655440023'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'Phase 1 Study Protocol - NB-401-001',
        'PROTOCOL',
        's3://clinical-sage/neurobio/ind/IND999888/protocol-nb-401-001.pdf',
        'protocol-nb-401-001-v1.0.pdf',
        'application/pdf',
        'l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6a7',
        FALSE  -- Study-specific
    ),
    -- Investigator Brochure
    (
        'aa0e8400-e29b-41d4-a716-446655440024'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'Investigator Brochure - NB-401 Ed. 3',
        'IB',
        's3://clinical-sage/neurobio/ind/IND999888/ib-nb-401-ed3.pdf',
        'investigator-brochure-ed3.pdf',
        'application/pdf',
        'm3n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8',
        TRUE  -- Shared across sites
    ),
    -- Nonclinical Summary
    (
        'aa0e8400-e29b-41d4-a716-446655440025'::UUID,
        '550e8400-e29b-41d4-a716-446655440012'::UUID,
        'Nonclinical Summary - Toxicology',
        'NONCLINICAL_SUMMARY',
        's3://clinical-sage/neurobio/ind/IND999888/m2-4-nonclinical-summary.pdf',
        'm2-4-nonclinical-summary.pdf',
        'application/pdf',
        'n4o5p6q7r8s9t0u1v2w3x4y5z6a7b8c9',
        TRUE
    )
ON CONFLICT (id) DO UPDATE SET
    title = EXCLUDED.title;

-- IND Context of Use elements (eCTD structure)
INSERT INTO ectd_v4.context_of_use_elements (
    id, submission_unit_id, context_group_code, priority_number,
    document_reference_id, lifecycle_status, title, tree_level
)
VALUES
    -- Module 1 header
    (
        'bb0e8400-e29b-41d4-a716-446655440010'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm1',
        1,
        NULL,
        'ACTIVE',
        'Module 1: Administrative Information',
        1
    ),
    -- Module 2 header
    (
        'bb0e8400-e29b-41d4-a716-446655440011'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm2',
        2,
        NULL,
        'ACTIVE',
        'Module 2: Common Technical Document Summaries',
        1
    ),
    -- Module 2.5 Clinical Overview
    (
        'bb0e8400-e29b-41d4-a716-446655440012'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm2-5',
        5,
        'aa0e8400-e29b-41d4-a716-446655440020'::UUID,
        'ACTIVE',
        '2.5 Clinical Overview',
        2
    ),
    -- Module 2.7 Clinical Summary
    (
        'bb0e8400-e29b-41d4-a716-446655440013'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm2-7',
        7,
        'aa0e8400-e29b-41d4-a716-446655440021'::UUID,
        'ACTIVE',
        '2.7 Clinical Summary',
        2
    ),
    -- Module 3 header
    (
        'bb0e8400-e29b-41d4-a716-446655440014'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm3',
        3,
        NULL,
        'ACTIVE',
        'Module 3: Quality',
        1
    ),
    -- Module 3.2.S Drug Substance
    (
        'bb0e8400-e29b-41d4-a716-446655440015'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm3-2-s',
        1,
        'aa0e8400-e29b-41d4-a716-446655440022'::UUID,
        'ACTIVE',
        '3.2.S Drug Substance',
        2
    ),
    -- Module 5 header
    (
        'bb0e8400-e29b-41d4-a716-446655440016'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'm5',
        5,
        NULL,
        'ACTIVE',
        'Module 5: Clinical Study Reports',
        1
    )
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- Set parent relationships for tree structure
UPDATE ectd_v4.context_of_use_elements 
SET parent_cou_id = 'bb0e8400-e29b-41d4-a716-446655440011'::UUID
WHERE id IN (
    'bb0e8400-e29b-41d4-a716-446655440012'::UUID,
    'bb0e8400-e29b-41d4-a716-446655440013'::UUID
);

UPDATE ectd_v4.context_of_use_elements 
SET parent_cou_id = 'bb0e8400-e29b-41d4-a716-446655440014'::UUID
WHERE id = 'bb0e8400-e29b-41d4-a716-446655440015'::UUID;

-- =============================================================================
-- G) SCENARIO 4: ACADEMIC RESEARCH - IRB Protocol
-- =============================================================================

INSERT INTO ectd_v4.regulatory_submissions (
    id, org_id, application_number, application_type,
    proprietary_name, established_name, authority_id,
    sponsor_name, lifecycle_status, internal_tracking_number
)
VALUES (
    '880e8400-e29b-41d4-a716-446655440004'::UUID,
    '550e8400-e29b-41d4-a716-446655440013'::UUID,  -- Stanford
    'IRB-2024-5678',
    'IDE',  -- Investigational Device Exemption for academic research
    'Neural Interface Study',
    'Brain-Computer Interface Protocol',
    'US_FDA',
    'Stanford University Medical Center',
    'PENDING',
    'SUMC-IRB-2024-001'
)
ON CONFLICT (id) DO UPDATE SET
    lifecycle_status = EXCLUDED.lifecycle_status;

-- =============================================================================
-- H) KEYWORD DEFINITIONS (Sender-Defined Keywords)
-- =============================================================================

INSERT INTO ectd_v4.keyword_definitions (
    id, submission_unit_id, keyword_code, display_name, keyword_category
)
VALUES
    -- Manufacturing sites for NeuroBio IND
    (
        'cc0e8400-e29b-41d4-a716-446655440001'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'mfg-site-001',
        'Boston Manufacturing Facility',
        'MANUFACTURER'
    ),
    (
        'cc0e8400-e29b-41d4-a716-446655440002'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'mfg-site-002',
        'Dublin API Production',
        'MANUFACTURER'
    ),
    -- Clinical sites
    (
        'cc0e8400-e29b-41d4-a716-446655440003'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'site-001',
        'Massachusetts General Hospital',
        'SITE'
    ),
    (
        'cc0e8400-e29b-41d4-a716-446655440004'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'site-002',
        'Johns Hopkins Medical Center',
        'SITE'
    ),
    -- Indications
    (
        'cc0e8400-e29b-41d4-a716-446655440005'::UUID,
        '990e8400-e29b-41d4-a716-446655440003'::UUID,
        'indication-als',
        'Amyotrophic Lateral Sclerosis (ALS)',
        'INDICATION'
    )
ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name;

-- =============================================================================
-- I) VERIFICATION QUERIES
-- =============================================================================

-- These will be used for testing
DO $$
DECLARE
    v_org_count INT;
    v_user_count INT;
    v_submission_count INT;
    v_document_count INT;
    v_cou_count INT;
BEGIN
    SELECT COUNT(*) INTO v_org_count FROM identity.organizations;
    SELECT COUNT(*) INTO v_user_count FROM identity.users;
    SELECT COUNT(*) INTO v_submission_count FROM ectd_v4.regulatory_submissions;
    SELECT COUNT(*) INTO v_document_count FROM ectd_v4.documents;
    SELECT COUNT(*) INTO v_cou_count FROM ectd_v4.context_of_use_elements;
    
    RAISE NOTICE '=== Test Data Summary ===';
    RAISE NOTICE 'Organizations: %', v_org_count;
    RAISE NOTICE 'Users: %', v_user_count;
    RAISE NOTICE 'Regulatory Submissions: %', v_submission_count;
    RAISE NOTICE 'Documents: %', v_document_count;
    RAISE NOTICE 'Context of Use Elements: %', v_cou_count;
END $$;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 055_gcc_test_scenarios completed successfully';
    RAISE NOTICE 'Created test scenarios for:';
    RAISE NOTICE '  - Medical Device (510k) - CardioTech';
    RAISE NOTICE '  - IVD/Diagnostic (EUA) - DiagnoSure';
    RAISE NOTICE '  - Biotech/Pharma (IND) - NeuroBio';
    RAISE NOTICE '  - Academic Research (IDE) - Stanford';
    RAISE NOTICE '  - CRO Partnership - GlobalTrials';
END $$;
