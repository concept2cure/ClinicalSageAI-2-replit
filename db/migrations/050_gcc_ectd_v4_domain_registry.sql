-- ============================================================================
-- Migration 050: eCTD v4.0 Domain Registry Layer
-- Purpose: Global regulatory "physics" - authorities, controlled vocabularies,
--          clinical study taxonomy - the foundation for eCTD v4.0 compliance
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- Reference: Concept2Cure Architecture Specification v1.0
-- Compliance: FDA 21 CFR Part 11, ICH eCTD v4.0, HL7 RPS
-- ============================================================================

BEGIN;

-- Create common_standards schema (read-heavy, cacheable)
CREATE SCHEMA IF NOT EXISTS common_standards;

COMMENT ON SCHEMA common_standards IS 
  'Global regulatory standards - shared across all tenants, read-heavy, cacheable';

-- =============================================================================
-- A) GLOBAL REGULATORY AUTHORITIES
-- The external "physics" of the regulatory world - entities that accept submissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.global_regulatory_authorities (
    id TEXT PRIMARY KEY,                     -- 'US_FDA', 'EU_EMA', 'JP_PMDA', 'CA_HC', 'CN_NMPA'
    region_name TEXT NOT NULL,               -- 'United States', 'European Union', etc.
    region_code TEXT NOT NULL,               -- ISO 3166-1 alpha-2 or region code
    
    -- Validation Criteria
    current_validation_criteria_version TEXT NOT NULL DEFAULT 'v4.0',
    supported_ectd_versions TEXT[] NOT NULL DEFAULT ARRAY['v3.2.2', 'v4.0'],
    
    -- Gateway Configuration
    submission_gateway_url TEXT,             -- ESG URL for AS2 dispatch (null if no gateway)
    gateway_protocol TEXT CHECK (gateway_protocol IN ('AS2', 'HTTP', 'SFTP', 'MANUAL')),
    requires_digital_signature BOOLEAN DEFAULT TRUE,
    
    -- Sponsor Requirements
    requires_local_representative BOOLEAN DEFAULT FALSE,
    requires_manufacturer_registration BOOLEAN DEFAULT FALSE,
    
    -- eCTD v4.0 Specifics
    regional_oid TEXT NOT NULL,              -- Object Identifier for region's CVs
    xml_dtd_version TEXT DEFAULT '1.0',
    
    -- Medical Device Support (510(k), PMA, De Novo)
    supports_medical_device BOOLEAN DEFAULT FALSE,
    medical_device_pathways TEXT[],          -- ['510K', 'PMA', 'DE_NOVO', 'HDE']
    
    -- Diagnostic/IVD Support
    supports_ivd BOOLEAN DEFAULT FALSE,
    ivd_pathways TEXT[],                     -- ['510K_IVD', 'EUA', 'DE_NOVO_IVD']
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Metadata
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE common_standards.global_regulatory_authorities IS 
  'Defines regulatory authorities that accept submissions - dictates validation rules';

COMMENT ON COLUMN common_standards.global_regulatory_authorities.requires_local_representative IS 
  'If TRUE, foreign sponsors must designate local agent (e.g., US FDA requires US Agent)';

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS gra_region_idx 
    ON common_standards.global_regulatory_authorities(region_code);
CREATE INDEX IF NOT EXISTS gra_device_idx 
    ON common_standards.global_regulatory_authorities(supports_medical_device) 
    WHERE supports_medical_device = TRUE;

-- =============================================================================
-- B) CONTROLLED VOCABULARIES (CV)
-- eCTD v4.0 is metadata-driven - folder names are CV codes
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.controlled_vocabularies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_id TEXT REFERENCES common_standards.global_regulatory_authorities(id),
    
    -- CV Identification
    cv_oid TEXT NOT NULL,                    -- OID (e.g., 'urn:oid:2.16.840.1.113883.3.989.2.1.1.1')
    cv_code TEXT NOT NULL,                   -- Short code (e.g., 'FDA_COU', 'ICH_DOC_TYPE')
    cv_name TEXT NOT NULL,                   -- Human readable (e.g., 'FDA Context of Use Codes')
    cv_description TEXT,
    
    -- Version Control
    version_date DATE NOT NULL,
    version_number TEXT NOT NULL DEFAULT '1.0',
    effective_date DATE NOT NULL DEFAULT CURRENT_DATE,
    sunset_date DATE,                        -- When this CV version expires
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_mandatory BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Source
    source_url TEXT,                         -- Where to get official CV
    source_document TEXT,                    -- ICH guideline, FDA guidance, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT cv_unique_version UNIQUE (authority_id, cv_code, version_number)
);

COMMENT ON TABLE common_standards.controlled_vocabularies IS 
  'Master list of controlled vocabularies - enforces dropdown consistency';

CREATE INDEX IF NOT EXISTS cv_authority_idx 
    ON common_standards.controlled_vocabularies(authority_id);
CREATE INDEX IF NOT EXISTS cv_code_idx 
    ON common_standards.controlled_vocabularies(cv_code);
CREATE INDEX IF NOT EXISTS cv_active_idx 
    ON common_standards.controlled_vocabularies(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- C) CV TERMS (The actual allowed values)
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.cv_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vocabulary_id UUID NOT NULL REFERENCES common_standards.controlled_vocabularies(id) ON DELETE CASCADE,
    
    -- Term Identification
    code TEXT NOT NULL,                      -- Machine-readable (e.g., 'C12345', 'm3.2.s')
    display_name TEXT NOT NULL,              -- Human-readable (e.g., 'Clinical Study Report')
    definition TEXT,                         -- ICH/FDA definition
    
    -- Hierarchy (some CVs are hierarchical)
    parent_term_id UUID REFERENCES common_standards.cv_terms(id),
    hierarchy_level INT NOT NULL DEFAULT 1,
    sort_order INT NOT NULL DEFAULT 0,       -- Display order within parent
    
    -- v4.0 Context Grouping
    context_group_code TEXT,                 -- For CoU grouping
    
    -- Legacy Support (migration from v3.2.2)
    legacy_mapping_code TEXT,                -- v3.2.2 equivalent
    legacy_folder_path TEXT,                 -- v3.2.2 folder (e.g., 'm3/32-body-data/')
    
    -- Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_selectable BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE for parent-only nodes
    
    -- Applicability
    applicable_authorities TEXT[],           -- NULL = all, or specific ['US_FDA', 'EU_EMA']
    applicable_submission_types TEXT[],      -- ['IND', 'NDA', 'BLA', 'ANDA', '510K']
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT cv_term_unique UNIQUE (vocabulary_id, code)
);

COMMENT ON TABLE common_standards.cv_terms IS 
  'Individual CV term values - these populate dropdowns and validate user input';

CREATE INDEX IF NOT EXISTS cv_terms_vocab_idx ON common_standards.cv_terms(vocabulary_id);
CREATE INDEX IF NOT EXISTS cv_terms_code_idx ON common_standards.cv_terms(code);
CREATE INDEX IF NOT EXISTS cv_terms_parent_idx ON common_standards.cv_terms(parent_term_id);
CREATE INDEX IF NOT EXISTS cv_terms_context_idx ON common_standards.cv_terms(context_group_code);
CREATE INDEX IF NOT EXISTS cv_terms_legacy_idx ON common_standards.cv_terms(legacy_mapping_code);

-- =============================================================================
-- D) CLINICAL STUDY TYPES (Logic Gates for Validation)
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.clinical_study_types (
    code TEXT PRIMARY KEY,                   -- 'PHASE_1', 'PHASE_3_PIVOTAL', 'BE_STUDY'
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Development Phase
    development_phase TEXT,                  -- 'PRECLINICAL', 'PHASE_1', 'PHASE_2', 'PHASE_3', 'PHASE_4'
    
    -- Data Standards Requirements
    requires_cdisc_standards BOOLEAN NOT NULL DEFAULT TRUE,
    cdisc_version TEXT DEFAULT 'SDTM v1.8',
    required_datasets TEXT[],                -- ['DM', 'AE', 'EX', 'LB', 'VS']
    
    -- Risk Classification
    risk_classification TEXT NOT NULL CHECK (risk_classification IN ('MINIMAL_RISK', 'MODERATE_RISK', 'HIGH_RISK')),
    
    -- Regulatory Requirements
    requires_irb_approval BOOLEAN NOT NULL DEFAULT TRUE,
    requires_informed_consent BOOLEAN NOT NULL DEFAULT TRUE,
    requires_dsmb BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Default Template
    default_structure_template_id UUID,      -- Links to eCTD structure template
    
    -- Applicable Indications
    therapeutic_areas TEXT[],                -- NULL = all, or ['ONCOLOGY', 'CNS', 'CARDIO']
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE common_standards.clinical_study_types IS 
  'Study type taxonomy - drives template selection and validation rules';

-- =============================================================================
-- E) SUBMISSION TYPES (IND, NDA, BLA, 510(k), etc.)
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.submission_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    authority_id TEXT NOT NULL REFERENCES common_standards.global_regulatory_authorities(id),
    
    -- Type Identification
    type_code TEXT NOT NULL,                 -- 'IND', 'NDA', 'BLA', '510K', 'PMA', 'DE_NOVO'
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Category
    category TEXT NOT NULL CHECK (category IN (
        'INVESTIGATIONAL',                   -- IND, CTA
        'MARKETING',                         -- NDA, BLA, MAA
        'MEDICAL_DEVICE',                    -- 510(k), PMA, De Novo
        'DIAGNOSTIC_IVD',                    -- IVD submissions
        'POST_MARKET',                       -- Annual reports, supplements
        'ACADEMIC_RESEARCH'                  -- IRB-only studies
    )),
    
    -- eCTD Requirements
    requires_ectd BOOLEAN NOT NULL DEFAULT TRUE,
    ectd_version TEXT DEFAULT 'v4.0',
    
    -- Module Requirements
    required_modules TEXT[] NOT NULL,        -- ['M1', 'M2', 'M3', 'M4', 'M5']
    optional_modules TEXT[],
    
    -- Default eCTD Structure Template
    default_template_id UUID,
    
    -- Lifecycle Operations
    allowed_lifecycle_ops TEXT[] NOT NULL DEFAULT ARRAY['NEW', 'REPLACE', 'SUSPEND'],
    
    -- Fees
    application_fee_usd DECIMAL(12,2),
    
    -- Review Timeline
    standard_review_days INT,                -- FDA standard review timeline
    priority_review_days INT,
    
    -- Active Status
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    CONSTRAINT submission_type_unique UNIQUE (authority_id, type_code)
);

COMMENT ON TABLE common_standards.submission_types IS 
  'Master list of submission types per authority - drives eCTD structure';

CREATE INDEX IF NOT EXISTS st_authority_idx ON common_standards.submission_types(authority_id);
CREATE INDEX IF NOT EXISTS st_category_idx ON common_standards.submission_types(category);
CREATE INDEX IF NOT EXISTS st_type_idx ON common_standards.submission_types(type_code);

-- =============================================================================
-- F) THERAPEUTIC AREAS (For study categorization)
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.therapeutic_areas (
    code TEXT PRIMARY KEY,                   -- 'ONCOLOGY', 'CNS', 'IMMUNOLOGY'
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- MeSH/MedDRA Mapping
    mesh_descriptor TEXT,
    meddra_soc_code TEXT,
    
    -- Parent (for hierarchy)
    parent_code TEXT REFERENCES common_standards.therapeutic_areas(code),
    
    -- Special Programs
    has_breakthrough_pathway BOOLEAN DEFAULT TRUE,
    has_accelerated_approval BOOLEAN DEFAULT TRUE,
    has_priority_review BOOLEAN DEFAULT TRUE,
    has_orphan_designation BOOLEAN DEFAULT TRUE,
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- G) DOCUMENT TYPES (What can be uploaded)
-- =============================================================================

CREATE TABLE IF NOT EXISTS common_standards.document_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identification
    type_code TEXT NOT NULL UNIQUE,          -- 'CSR', 'PROTOCOL', 'IB', 'SAP', 'LABELING'
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Category
    category TEXT NOT NULL CHECK (category IN (
        'CLINICAL',                          -- CSR, Protocol, IB
        'NONCLINICAL',                       -- Tox studies, PK
        'QUALITY_CMC',                       -- Drug substance, drug product
        'ADMINISTRATIVE',                    -- Cover letters, forms
        'LABELING',                          -- Package insert, labeling
        'STATISTICAL',                       -- SAP, tables, figures
        'MEDICAL_DEVICE',                    -- 510(k) specific
        'DIAGNOSTIC'                         -- IVD specific
    )),
    
    -- File Requirements
    allowed_mime_types TEXT[] NOT NULL DEFAULT ARRAY['application/pdf'],
    max_file_size_mb INT DEFAULT 100,
    requires_bookmarks BOOLEAN DEFAULT TRUE,
    requires_hyperlinks BOOLEAN DEFAULT FALSE,
    
    -- eCTD Placement
    default_module TEXT,                     -- 'M1', 'M2', 'M3', 'M4', 'M5'
    default_context_group TEXT,
    
    -- Validation
    requires_md5_checksum BOOLEAN NOT NULL DEFAULT TRUE,
    requires_virus_scan BOOLEAN NOT NULL DEFAULT TRUE,
    
    -- Part 11 Requirements
    requires_esignature BOOLEAN DEFAULT FALSE,
    signature_role TEXT,                     -- 'QA', 'RA', 'MEDICAL_OFFICER'
    
    -- Timestamps
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE common_standards.document_types IS 
  'Master document type registry - controls upload validation';

-- =============================================================================
-- H) SEED DATA: Global Regulatory Authorities
-- =============================================================================

INSERT INTO common_standards.global_regulatory_authorities (id, region_name, region_code, current_validation_criteria_version, supported_ectd_versions, submission_gateway_url, gateway_protocol, requires_digital_signature, requires_local_representative, requires_manufacturer_registration, regional_oid, supports_medical_device, medical_device_pathways, supports_ivd, ivd_pathways)
VALUES
    ('US_FDA', 'United States', 'US', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://esg.fda.gov', 'AS2', TRUE, TRUE, TRUE, 'urn:oid:2.16.840.1.113883.3.989', TRUE, ARRAY['510K', 'PMA', 'DE_NOVO', 'HDE'], TRUE, ARRAY['510K_IVD', 'EUA', 'DE_NOVO_IVD']),
    ('EU_EMA', 'European Union', 'EU', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://esubmission.ema.europa.eu', 'HTTP', TRUE, TRUE, FALSE, 'urn:oid:2.16.840.1.113883.3.4424', TRUE, ARRAY['CE_MARK', 'MDR'], TRUE, ARRAY['IVDR']),
    ('JP_PMDA', 'Japan', 'JP', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://gateway.pmda.go.jp', 'AS2', TRUE, TRUE, TRUE, 'urn:oid:2.16.840.1.113883.2.249.3.7', TRUE, ARRAY['SHONIN', 'PMD_ACT'], TRUE, ARRAY['IVD_SHONIN']),
    ('CA_HC', 'Health Canada', 'CA', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://submissions.hc-sc.gc.ca', 'HTTP', TRUE, FALSE, FALSE, 'urn:oid:2.16.840.1.113883.2.20.2', TRUE, ARRAY['MDL_CLASS_I', 'MDL_CLASS_II', 'MDL_CLASS_III', 'MDL_CLASS_IV'], TRUE, ARRAY['IVDD']),
    ('CN_NMPA', 'China', 'CN', 'v4.0', ARRAY['v3.2.2', 'v4.0'], NULL, 'MANUAL', TRUE, TRUE, TRUE, 'urn:oid:2.16.156.10011.2.5.1.1', TRUE, ARRAY['CLASS_I', 'CLASS_II', 'CLASS_III'], TRUE, ARRAY['IVD_CLASS_I', 'IVD_CLASS_II', 'IVD_CLASS_III']),
    ('AU_TGA', 'Australia', 'AU', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://esubmission.tga.gov.au', 'HTTP', TRUE, TRUE, FALSE, 'urn:oid:1.2.36.1.2001.1005.1', TRUE, ARRAY['ARTG'], TRUE, ARRAY['IVD_ARTG']),
    ('BR_ANVISA', 'Brazil', 'BR', 'v3.2.2', ARRAY['v3.2.2'], NULL, 'MANUAL', TRUE, TRUE, TRUE, 'urn:oid:2.16.76.1.2.1.1.1', TRUE, ARRAY['ANVISA_CLASS_I', 'ANVISA_CLASS_II', 'ANVISA_CLASS_III', 'ANVISA_CLASS_IV'], TRUE, ARRAY['IVD_ANVISA']),
    ('KR_MFDS', 'South Korea', 'KR', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://ectd.mfds.go.kr', 'HTTP', TRUE, TRUE, TRUE, 'urn:oid:1.2.410.100001.1.1', TRUE, ARRAY['CLASS_I', 'CLASS_II', 'CLASS_III', 'CLASS_IV'], TRUE, ARRAY['IVD_CLASS_I', 'IVD_CLASS_II', 'IVD_CLASS_III']),
    ('IN_CDSCO', 'India', 'IN', 'v3.2.2', ARRAY['v3.2.2'], NULL, 'MANUAL', FALSE, TRUE, TRUE, 'urn:oid:2.16.356.100000.1.1.1', TRUE, ARRAY['CLASS_A', 'CLASS_B', 'CLASS_C', 'CLASS_D'], TRUE, ARRAY['IVD_A', 'IVD_B', 'IVD_C', 'IVD_D']),
    ('CH_SWISSMEDIC', 'Switzerland', 'CH', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://esubmission.swissmedic.ch', 'HTTP', TRUE, FALSE, FALSE, 'urn:oid:2.16.756.5.30.1.1.1.1', TRUE, ARRAY['CLASS_I', 'CLASS_IIA', 'CLASS_IIB', 'CLASS_III'], TRUE, ARRAY['IVD_A', 'IVD_B', 'IVD_C', 'IVD_D']),
    ('UK_MHRA', 'United Kingdom', 'GB', 'v4.0', ARRAY['v3.2.2', 'v4.0'], 'https://submissions.mhra.gov.uk', 'HTTP', TRUE, TRUE, FALSE, 'urn:oid:2.16.840.1.113883.2.1.4', TRUE, ARRAY['UKCA_CLASS_I', 'UKCA_CLASS_IIA', 'UKCA_CLASS_IIB', 'UKCA_CLASS_III'], TRUE, ARRAY['UKCA_IVD'])
ON CONFLICT (id) DO UPDATE SET
    updated_at = NOW(),
    current_validation_criteria_version = EXCLUDED.current_validation_criteria_version,
    supported_ectd_versions = EXCLUDED.supported_ectd_versions;

-- =============================================================================
-- I) SEED DATA: Submission Types
-- =============================================================================

INSERT INTO common_standards.submission_types (authority_id, type_code, display_name, description, category, requires_ectd, ectd_version, required_modules, standard_review_days, priority_review_days)
VALUES
    -- FDA Drug Submissions
    ('US_FDA', 'IND', 'Investigational New Drug', 'Application to conduct clinical trials', 'INVESTIGATIONAL', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 30, 30),
    ('US_FDA', 'NDA', 'New Drug Application', 'Marketing application for new drug', 'MARKETING', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 365, 180),
    ('US_FDA', 'BLA', 'Biologics License Application', 'Marketing application for biologics', 'MARKETING', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 365, 180),
    ('US_FDA', 'ANDA', 'Abbreviated New Drug Application', 'Generic drug application', 'MARKETING', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3'], 365, NULL),
    
    -- FDA Medical Device Submissions
    ('US_FDA', '510K', '510(k) Premarket Notification', 'Substantial equivalence to predicate device', 'MEDICAL_DEVICE', TRUE, 'v4.0', ARRAY['M1'], 90, NULL),
    ('US_FDA', 'PMA', 'Premarket Approval', 'High-risk device approval', 'MEDICAL_DEVICE', TRUE, 'v4.0', ARRAY['M1', 'M2'], 180, NULL),
    ('US_FDA', 'DE_NOVO', 'De Novo Classification', 'Novel low-moderate risk device', 'MEDICAL_DEVICE', TRUE, 'v4.0', ARRAY['M1', 'M2'], 150, NULL),
    ('US_FDA', 'HDE', 'Humanitarian Device Exemption', 'Rare disease device', 'MEDICAL_DEVICE', TRUE, 'v4.0', ARRAY['M1', 'M2'], 75, NULL),
    
    -- FDA IVD Submissions
    ('US_FDA', '510K_IVD', '510(k) for IVD', 'IVD substantial equivalence', 'DIAGNOSTIC_IVD', TRUE, 'v4.0', ARRAY['M1'], 90, NULL),
    ('US_FDA', 'EUA', 'Emergency Use Authorization', 'Emergency diagnostic authorization', 'DIAGNOSTIC_IVD', FALSE, NULL, ARRAY['M1'], 14, NULL),
    
    -- EMA Submissions
    ('EU_EMA', 'CTA', 'Clinical Trial Application', 'EU clinical trial application', 'INVESTIGATIONAL', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 60, 30),
    ('EU_EMA', 'MAA', 'Marketing Authorization Application', 'EU marketing application', 'MARKETING', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 210, 150),
    
    -- Japan PMDA
    ('JP_PMDA', 'CTN', 'Clinical Trial Notification', 'Japan clinical trial notification', 'INVESTIGATIONAL', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 30, 30),
    ('JP_PMDA', 'JNDA', 'Japan New Drug Application', 'Japan marketing application', 'MARKETING', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 365, 180),
    
    -- Health Canada
    ('CA_HC', 'CTA_CA', 'Clinical Trial Application (Canada)', 'Canada clinical trial', 'INVESTIGATIONAL', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 30, 30),
    ('CA_HC', 'NDS', 'New Drug Submission', 'Canada marketing application', 'MARKETING', TRUE, 'v4.0', ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], 300, 180)
ON CONFLICT (authority_id, type_code) DO UPDATE SET
    updated_at = NOW();

-- =============================================================================
-- J) SEED DATA: Clinical Study Types
-- =============================================================================

INSERT INTO common_standards.clinical_study_types (code, display_name, description, development_phase, requires_cdisc_standards, cdisc_version, required_datasets, risk_classification, requires_irb_approval, requires_informed_consent, requires_dsmb, therapeutic_areas)
VALUES
    ('PHASE_1_FIH', 'Phase 1 First-in-Human', 'Initial human dosing study', 'PHASE_1', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'PC', 'PP'], 'HIGH_RISK', TRUE, TRUE, TRUE, NULL),
    ('PHASE_1_SAD', 'Phase 1 SAD', 'Single ascending dose study', 'PHASE_1', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'PC', 'PP'], 'HIGH_RISK', TRUE, TRUE, FALSE, NULL),
    ('PHASE_1_MAD', 'Phase 1 MAD', 'Multiple ascending dose study', 'PHASE_1', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'PC', 'PP'], 'HIGH_RISK', TRUE, TRUE, FALSE, NULL),
    ('PHASE_2A', 'Phase 2a POC', 'Proof of concept study', 'PHASE_2', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'EG', 'QS'], 'MODERATE_RISK', TRUE, TRUE, TRUE, NULL),
    ('PHASE_2B', 'Phase 2b Dose-Finding', 'Dose-finding efficacy study', 'PHASE_2', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'EG', 'QS', 'RS', 'TU', 'TR'], 'MODERATE_RISK', TRUE, TRUE, TRUE, NULL),
    ('PHASE_3_PIVOTAL', 'Phase 3 Pivotal', 'Pivotal efficacy and safety study', 'PHASE_3', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'EG', 'QS', 'RS', 'TU', 'TR', 'DS', 'MH'], 'HIGH_RISK', TRUE, TRUE, TRUE, NULL),
    ('PHASE_3_CONFIRMATORY', 'Phase 3 Confirmatory', 'Confirmatory efficacy study', 'PHASE_3', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS', 'EG', 'QS', 'RS', 'TU', 'TR', 'DS', 'MH'], 'HIGH_RISK', TRUE, TRUE, TRUE, NULL),
    ('PHASE_4_COMMITMENT', 'Phase 4 Post-Market', 'Post-marketing commitment study', 'PHASE_4', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'VS'], 'MODERATE_RISK', TRUE, TRUE, FALSE, NULL),
    ('BE_STUDY', 'Bioequivalence Study', 'Generic drug BE study', 'PHASE_1', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'PC', 'PP'], 'MINIMAL_RISK', TRUE, TRUE, FALSE, NULL),
    ('PK_STUDY', 'PK Study', 'Pharmacokinetic study', 'PHASE_1', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'LB', 'PC', 'PP'], 'MODERATE_RISK', TRUE, TRUE, FALSE, NULL),
    ('DDI_STUDY', 'Drug-Drug Interaction', 'DDI assessment study', 'PHASE_1', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'EX', 'CM', 'PC', 'PP'], 'MODERATE_RISK', TRUE, TRUE, FALSE, NULL),
    
    -- Medical Device Studies
    ('DEVICE_PIVOTAL', 'Device Pivotal', 'Medical device pivotal clinical trial', 'PHASE_3', TRUE, 'SDTM v1.8', ARRAY['DM', 'AE', 'DS', 'DV', 'PR'], 'HIGH_RISK', TRUE, TRUE, TRUE, NULL),
    ('DEVICE_FEASIBILITY', 'Device Feasibility', 'Early feasibility study', 'PHASE_1', FALSE, NULL, NULL, 'HIGH_RISK', TRUE, TRUE, TRUE, NULL),
    
    -- IVD Studies
    ('IVD_CLINICAL_PERFORMANCE', 'IVD Clinical Performance', 'Diagnostic clinical performance study', 'PHASE_3', FALSE, NULL, NULL, 'MODERATE_RISK', TRUE, TRUE, FALSE, NULL),
    ('IVD_ANALYTICAL_VALIDATION', 'IVD Analytical Validation', 'Analytical validation study', 'PHASE_1', FALSE, NULL, NULL, 'MINIMAL_RISK', FALSE, FALSE, FALSE, NULL)
ON CONFLICT (code) DO UPDATE SET
    updated_at = NOW();

-- =============================================================================
-- K) SEED DATA: Therapeutic Areas
-- =============================================================================

INSERT INTO common_standards.therapeutic_areas (code, display_name, description, has_breakthrough_pathway, has_accelerated_approval, has_priority_review, has_orphan_designation)
VALUES
    ('ONCOLOGY', 'Oncology', 'Cancer therapeutics', TRUE, TRUE, TRUE, TRUE),
    ('HEMATOLOGY', 'Hematology', 'Blood disorders', TRUE, TRUE, TRUE, TRUE),
    ('CNS', 'Central Nervous System', 'Neurological and psychiatric disorders', TRUE, TRUE, TRUE, TRUE),
    ('IMMUNOLOGY', 'Immunology', 'Autoimmune and inflammatory diseases', TRUE, TRUE, TRUE, TRUE),
    ('INFECTIOUS_DISEASE', 'Infectious Disease', 'Bacterial, viral, fungal infections', TRUE, TRUE, TRUE, TRUE),
    ('CARDIO', 'Cardiovascular', 'Heart and vascular diseases', TRUE, TRUE, TRUE, TRUE),
    ('RESPIRATORY', 'Respiratory', 'Lung and respiratory diseases', TRUE, TRUE, TRUE, TRUE),
    ('GI', 'Gastrointestinal', 'Digestive system disorders', TRUE, TRUE, TRUE, TRUE),
    ('METABOLIC', 'Metabolic', 'Diabetes, obesity, metabolic disorders', TRUE, TRUE, TRUE, TRUE),
    ('DERMATOLOGY', 'Dermatology', 'Skin diseases', TRUE, TRUE, TRUE, TRUE),
    ('OPHTHALMOLOGY', 'Ophthalmology', 'Eye diseases', TRUE, TRUE, TRUE, TRUE),
    ('RARE_DISEASE', 'Rare Disease', 'Orphan indications', TRUE, TRUE, TRUE, TRUE),
    ('GENE_THERAPY', 'Gene Therapy', 'Gene and cell therapies', TRUE, TRUE, TRUE, TRUE),
    ('VACCINES', 'Vaccines', 'Prophylactic and therapeutic vaccines', TRUE, TRUE, TRUE, TRUE),
    ('WOMENS_HEALTH', 'Womens Health', 'Reproductive and gynecologic conditions', TRUE, TRUE, TRUE, TRUE),
    ('PEDIATRICS', 'Pediatrics', 'Pediatric-specific indications', TRUE, TRUE, TRUE, TRUE)
ON CONFLICT (code) DO UPDATE SET
    updated_at = NOW();

-- =============================================================================
-- L) SEED DATA: Document Types
-- =============================================================================

INSERT INTO common_standards.document_types (type_code, display_name, description, category, allowed_mime_types, max_file_size_mb, requires_bookmarks, default_module, requires_esignature, signature_role)
VALUES
    -- Clinical Documents
    ('CSR', 'Clinical Study Report', 'ICH E3 compliant CSR', 'CLINICAL', ARRAY['application/pdf'], 500, TRUE, 'M5', TRUE, 'MEDICAL_OFFICER'),
    ('PROTOCOL', 'Study Protocol', 'Clinical trial protocol', 'CLINICAL', ARRAY['application/pdf'], 100, TRUE, 'M5', TRUE, 'MEDICAL_OFFICER'),
    ('IB', 'Investigator Brochure', 'Investigator information document', 'CLINICAL', ARRAY['application/pdf'], 200, TRUE, 'M5', TRUE, 'MEDICAL_OFFICER'),
    ('SAP', 'Statistical Analysis Plan', 'Pre-specified analysis plan', 'STATISTICAL', ARRAY['application/pdf'], 50, TRUE, 'M5', TRUE, 'STATISTICIAN'),
    ('ICF', 'Informed Consent Form', 'Patient consent document', 'CLINICAL', ARRAY['application/pdf'], 20, FALSE, 'M5', FALSE, NULL),
    
    -- Nonclinical Documents
    ('TOX_STUDY', 'Toxicology Study Report', 'GLP toxicology study', 'NONCLINICAL', ARRAY['application/pdf'], 300, TRUE, 'M4', TRUE, 'STUDY_DIRECTOR'),
    ('PK_REPORT', 'Pharmacokinetic Report', 'PK/ADME study report', 'NONCLINICAL', ARRAY['application/pdf'], 200, TRUE, 'M4', FALSE, NULL),
    ('CARCINOGENICITY', 'Carcinogenicity Study', 'Long-term carcinogenicity', 'NONCLINICAL', ARRAY['application/pdf'], 400, TRUE, 'M4', TRUE, 'STUDY_DIRECTOR'),
    
    -- CMC/Quality Documents
    ('DRUG_SUBSTANCE', 'Drug Substance Information', 'CTD 3.2.S documentation', 'QUALITY_CMC', ARRAY['application/pdf'], 200, TRUE, 'M3', TRUE, 'QA'),
    ('DRUG_PRODUCT', 'Drug Product Information', 'CTD 3.2.P documentation', 'QUALITY_CMC', ARRAY['application/pdf'], 200, TRUE, 'M3', TRUE, 'QA'),
    ('STABILITY', 'Stability Data', 'ICH stability studies', 'QUALITY_CMC', ARRAY['application/pdf'], 100, TRUE, 'M3', TRUE, 'QA'),
    ('ANALYTICAL', 'Analytical Procedures', 'Method validation', 'QUALITY_CMC', ARRAY['application/pdf'], 100, TRUE, 'M3', TRUE, 'QA'),
    
    -- Administrative Documents
    ('COVER_LETTER', 'Cover Letter', 'Submission cover letter', 'ADMINISTRATIVE', ARRAY['application/pdf'], 10, FALSE, 'M1', TRUE, 'RA'),
    ('FORM_FDA_356H', 'Form FDA 356h', 'Application form', 'ADMINISTRATIVE', ARRAY['application/pdf'], 5, FALSE, 'M1', TRUE, 'RA'),
    ('FORM_FDA_1571', 'Form FDA 1571', 'IND application form', 'ADMINISTRATIVE', ARRAY['application/pdf'], 5, FALSE, 'M1', TRUE, 'RA'),
    
    -- Labeling Documents
    ('USPI', 'US Package Insert', 'FDA-approved labeling', 'LABELING', ARRAY['application/pdf'], 30, TRUE, 'M1', TRUE, 'RA'),
    ('SPL', 'Structured Product Labeling', 'FDA SPL XML', 'LABELING', ARRAY['application/xml', 'text/xml'], 20, FALSE, 'M1', FALSE, NULL),
    
    -- Medical Device Documents
    ('510K_SUMMARY', '510(k) Summary', 'Device summary for 510(k)', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 50, TRUE, 'M1', TRUE, 'RA'),
    ('PREDICATE_COMPARISON', 'Predicate Comparison', 'Substantial equivalence comparison', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 100, TRUE, 'M1', FALSE, NULL),
    ('DEVICE_DESCRIPTION', 'Device Description', 'Technical device description', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 100, TRUE, 'M1', FALSE, NULL),
    ('PERFORMANCE_DATA', 'Performance Testing', 'Bench and clinical performance', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 200, TRUE, 'M1', FALSE, NULL),
    ('BIOCOMPATIBILITY', 'Biocompatibility Report', 'ISO 10993 assessment', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 150, TRUE, 'M1', FALSE, NULL),
    ('STERILIZATION', 'Sterilization Validation', 'Sterility validation report', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 100, TRUE, 'M1', FALSE, NULL),
    ('SOFTWARE_DOC', 'Software Documentation', 'IEC 62304 software lifecycle', 'MEDICAL_DEVICE', ARRAY['application/pdf'], 200, TRUE, 'M1', FALSE, NULL),
    
    -- Diagnostic/IVD Documents
    ('ANALYTICAL_PERFORMANCE', 'Analytical Performance', 'IVD analytical validation', 'DIAGNOSTIC', ARRAY['application/pdf'], 150, TRUE, 'M1', FALSE, NULL),
    ('CLINICAL_PERFORMANCE', 'Clinical Performance', 'IVD clinical validation', 'DIAGNOSTIC', ARRAY['application/pdf'], 200, TRUE, 'M1', FALSE, NULL),
    ('CROSS_REACTIVITY', 'Cross-Reactivity Study', 'Interfering substances', 'DIAGNOSTIC', ARRAY['application/pdf'], 50, TRUE, 'M1', FALSE, NULL),
    ('LOD_DETERMINATION', 'Limit of Detection', 'LOD/LOQ determination', 'DIAGNOSTIC', ARRAY['application/pdf'], 30, TRUE, 'M1', FALSE, NULL)
ON CONFLICT (type_code) DO UPDATE SET
    updated_at = NOW();

-- =============================================================================
-- M) HELPER FUNCTIONS
-- =============================================================================

-- Get current validation criteria for an authority
CREATE OR REPLACE FUNCTION common_standards.get_validation_criteria(p_authority_id TEXT)
RETURNS TABLE (
    authority_id TEXT,
    validation_version TEXT,
    supported_ectd_versions TEXT[],
    requires_digital_signature BOOLEAN
)
LANGUAGE SQL
STABLE
AS $$
    SELECT 
        id,
        current_validation_criteria_version,
        supported_ectd_versions,
        requires_digital_signature
    FROM common_standards.global_regulatory_authorities
    WHERE id = p_authority_id;
$$;

-- Get CV terms for a specific vocabulary
CREATE OR REPLACE FUNCTION common_standards.get_cv_terms(
    p_cv_code TEXT,
    p_authority_id TEXT DEFAULT 'US_FDA'
)
RETURNS TABLE (
    term_code TEXT,
    term_display TEXT,
    parent_code TEXT,
    hierarchy_level INT
)
LANGUAGE SQL
STABLE
AS $$
    SELECT 
        t.code,
        t.display_name,
        pt.code,
        t.hierarchy_level
    FROM common_standards.cv_terms t
    JOIN common_standards.controlled_vocabularies v ON t.vocabulary_id = v.id
    LEFT JOIN common_standards.cv_terms pt ON t.parent_term_id = pt.id
    WHERE v.cv_code = p_cv_code
      AND (v.authority_id = p_authority_id OR v.authority_id IS NULL)
      AND v.is_active = TRUE
      AND t.is_active = TRUE
    ORDER BY t.hierarchy_level, t.sort_order, t.display_name;
$$;

-- Get required modules for submission type
CREATE OR REPLACE FUNCTION common_standards.get_required_modules(
    p_authority_id TEXT,
    p_submission_type TEXT
)
RETURNS TEXT[]
LANGUAGE SQL
STABLE
AS $$
    SELECT required_modules
    FROM common_standards.submission_types
    WHERE authority_id = p_authority_id
      AND type_code = p_submission_type
      AND is_active = TRUE;
$$;

-- Check if authority supports medical devices
CREATE OR REPLACE FUNCTION common_standards.supports_medical_device(p_authority_id TEXT)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
AS $$
    SELECT COALESCE(supports_medical_device, FALSE)
    FROM common_standards.global_regulatory_authorities
    WHERE id = p_authority_id;
$$;

-- =============================================================================
-- N) GRANTS
-- =============================================================================

-- Read access for all application roles
GRANT USAGE ON SCHEMA common_standards TO PUBLIC;
GRANT SELECT ON ALL TABLES IN SCHEMA common_standards TO PUBLIC;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA common_standards TO PUBLIC;

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 050_gcc_ectd_v4_domain_registry completed successfully';
    RAISE NOTICE 'Created common_standards schema with:';
    RAISE NOTICE '  - global_regulatory_authorities (11 agencies)';
    RAISE NOTICE '  - controlled_vocabularies';
    RAISE NOTICE '  - cv_terms';
    RAISE NOTICE '  - clinical_study_types (15 types)';
    RAISE NOTICE '  - submission_types (16 types)';
    RAISE NOTICE '  - therapeutic_areas (16 areas)';
    RAISE NOTICE '  - document_types (28 types)';
END $$;
