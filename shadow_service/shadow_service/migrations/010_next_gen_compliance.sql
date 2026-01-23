-- Migration 010: Next-Generation Compliance Framework
-- AI/ML Governance, Cybersecurity, Data Transparency, Training Compliance
-- 
-- References:
-- - FDA/Health Canada/MHRA GMLP 10 Guiding Principles
-- - PCCP (Predetermined Change Control Plan) per FDA guidance
-- - NTIA SBOM Minimum Elements
-- - CISA VEX Specification
-- - Section 524B FD&C Act (Cyber Device)
-- - EMA Policy 0070 (0.09 threshold)
-- - ISO 19005-3 (PDF/A-3)
-- - GAMP 5 Second Edition
-- - xAPI Specification v1.0.3
-- - 21 CFR Part 11

-- =============================================================================
-- SCHEMA: aiml_governance
-- AI/ML Model Governance per GMLP and FDA guidance
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS aiml_governance;

-- AI/ML Model Registry
CREATE TABLE IF NOT EXISTS aiml_governance.models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Model Identification
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    model_type VARCHAR(100) NOT NULL,
    description TEXT,
    
    -- Regulatory Classification
    intended_use TEXT,
    risk_level VARCHAR(50) DEFAULT 'MEDIUM',
    is_samd BOOLEAN DEFAULT FALSE,
    
    -- Lifecycle
    status VARCHAR(50) DEFAULT 'DRAFT',
    deployment_environment VARCHAR(50),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE,
    updated_by VARCHAR(255),
    
    CONSTRAINT uk_aiml_model_version UNIQUE (program_id, name, version)
);

CREATE INDEX idx_aiml_models_program ON aiml_governance.models(program_id);
CREATE INDEX idx_aiml_models_status ON aiml_governance.models(status);

-- GMLP Assessments
CREATE TABLE IF NOT EXISTS aiml_governance.gmlp_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES aiml_governance.models(id),
    
    -- Assessment
    assessment_date TIMESTAMP WITH TIME ZONE NOT NULL,
    assessor VARCHAR(255) NOT NULL,
    
    -- Overall Status
    overall_compliance_level VARCHAR(50) NOT NULL,
    overall_score DECIMAL(5,2),
    
    -- Principle Scores (1-10)
    principle_1_score DECIMAL(3,1), -- Multi-disciplinary expertise
    principle_2_score DECIMAL(3,1), -- Good software engineering
    principle_3_score DECIMAL(3,1), -- Representative data
    principle_4_score DECIMAL(3,1), -- Independent test sets
    principle_5_score DECIMAL(3,1), -- Reference datasets
    principle_6_score DECIMAL(3,1), -- Model design
    principle_7_score DECIMAL(3,1), -- Focus on performance
    principle_8_score DECIMAL(3,1), -- Explainability
    principle_9_score DECIMAL(3,1), -- Real-world performance monitoring
    principle_10_score DECIMAL(3,1), -- Security and resilience
    
    -- Findings
    findings JSONB DEFAULT '[]',
    recommendations JSONB DEFAULT '[]',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_gmlp_model ON aiml_governance.gmlp_assessments(model_id);

-- Predetermined Change Control Plans (PCCP)
CREATE TABLE IF NOT EXISTS aiml_governance.pccps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES aiml_governance.models(id),
    program_id UUID NOT NULL,
    
    -- PCCP Identification
    pccp_number VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    version VARCHAR(50) NOT NULL,
    status VARCHAR(50) DEFAULT 'DRAFT',
    
    -- Three Components (per FDA guidance)
    modification_description JSONB NOT NULL,
    modification_protocol JSONB NOT NULL,
    impact_assessment JSONB NOT NULL,
    
    -- Submission
    fda_submission_number VARCHAR(100),
    submitted_date TIMESTAMP WITH TIME ZONE,
    fda_clearance_date TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT uk_pccp_version UNIQUE (model_id, pccp_number, version)
);

CREATE INDEX idx_pccp_model ON aiml_governance.pccps(model_id);
CREATE INDEX idx_pccp_status ON aiml_governance.pccps(status);

-- Model Cards (Google Model Card Toolkit schema)
CREATE TABLE IF NOT EXISTS aiml_governance.model_cards (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES aiml_governance.models(id),
    
    -- Model Card Version
    version VARCHAR(50) NOT NULL,
    
    -- Model Details
    model_details JSONB NOT NULL,
    
    -- Intended Use
    intended_use JSONB,
    
    -- Factors (demographic, environmental)
    factors JSONB,
    
    -- Metrics
    metrics JSONB,
    
    -- Evaluation Data
    evaluation_data JSONB,
    
    -- Training Data
    training_data JSONB,
    
    -- Ethical Considerations
    ethical_considerations JSONB,
    
    -- Caveats and Recommendations
    caveats_and_recommendations JSONB,
    
    -- Quantitative Analysis
    quantitative_analysis JSONB,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    published_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT uk_model_card_version UNIQUE (model_id, version)
);

CREATE INDEX idx_model_card_model ON aiml_governance.model_cards(model_id);

-- Model Updates (for PCCP tracking)
CREATE TABLE IF NOT EXISTS aiml_governance.model_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id UUID NOT NULL REFERENCES aiml_governance.models(id),
    pccp_id UUID REFERENCES aiml_governance.pccps(id),
    
    -- Update Details
    update_type VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    change_scope VARCHAR(50) NOT NULL,
    
    -- Status
    status VARCHAR(50) DEFAULT 'PENDING',
    
    -- PCCP Compliance
    within_pccp_scope BOOLEAN,
    requires_new_pccp BOOLEAN DEFAULT FALSE,
    
    -- Versions
    from_version VARCHAR(50),
    to_version VARCHAR(50),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    approved_at TIMESTAMP WITH TIME ZONE,
    approved_by VARCHAR(255),
    deployed_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_model_update_model ON aiml_governance.model_updates(model_id);
CREATE INDEX idx_model_update_status ON aiml_governance.model_updates(status);


-- =============================================================================
-- SCHEMA: cybersecurity
-- SBOM, VEX, and Section 524B Cyber Device Compliance
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cybersecurity;

-- Software Bill of Materials (SBOM)
CREATE TABLE IF NOT EXISTS cybersecurity.sboms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    device_id UUID,
    
    -- SBOM Identification
    name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    format VARCHAR(50) NOT NULL, -- SPDX, CycloneDX
    
    -- NTIA Minimum Elements
    supplier_name VARCHAR(255) NOT NULL,
    component_name VARCHAR(255) NOT NULL,
    version_string VARCHAR(100) NOT NULL,
    unique_identifiers JSONB,
    dependency_relationships JSONB,
    author_name VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Full SBOM
    sbom_content JSONB NOT NULL,
    
    -- Compliance
    ntia_compliant BOOLEAN DEFAULT FALSE,
    compliance_gaps JSONB DEFAULT '[]',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    
    CONSTRAINT uk_sbom_version UNIQUE (program_id, name, version)
);

CREATE INDEX idx_sbom_program ON cybersecurity.sboms(program_id);
CREATE INDEX idx_sbom_device ON cybersecurity.sboms(device_id);

-- VEX Documents
CREATE TABLE IF NOT EXISTS cybersecurity.vex_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sbom_id UUID NOT NULL REFERENCES cybersecurity.sboms(id),
    
    -- VEX Identification
    document_id VARCHAR(255) NOT NULL,
    version INTEGER NOT NULL DEFAULT 1,
    
    -- Metadata
    author VARCHAR(255) NOT NULL,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vex_sbom ON cybersecurity.vex_documents(sbom_id);

-- VEX Statements
CREATE TABLE IF NOT EXISTS cybersecurity.vex_statements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vex_document_id UUID NOT NULL REFERENCES cybersecurity.vex_documents(id),
    
    -- Vulnerability
    vulnerability_id VARCHAR(100) NOT NULL, -- CVE ID
    vulnerability_name VARCHAR(255),
    vulnerability_description TEXT,
    
    -- Status
    status VARCHAR(50) NOT NULL, -- NOT_AFFECTED, AFFECTED, FIXED, UNDER_INVESTIGATION
    
    -- Justification (for NOT_AFFECTED)
    justification VARCHAR(100),
    justification_detail TEXT,
    
    -- Impact (for AFFECTED)
    impact_statement TEXT,
    
    -- Action (for AFFECTED)
    action_statement TEXT,
    action_statement_timestamp TIMESTAMP WITH TIME ZONE,
    
    -- Timestamp
    status_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vex_statement_doc ON cybersecurity.vex_statements(vex_document_id);
CREATE INDEX idx_vex_statement_vuln ON cybersecurity.vex_statements(vulnerability_id);

-- Cyber Devices (Section 524B)
CREATE TABLE IF NOT EXISTS cybersecurity.cyber_devices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Device Identification
    name VARCHAR(255) NOT NULL,
    model_number VARCHAR(100),
    version VARCHAR(50) NOT NULL,
    device_type VARCHAR(100) NOT NULL,
    
    -- Classification
    fda_product_code VARCHAR(10),
    device_class VARCHAR(10), -- I, II, III
    
    -- Section 524B Status
    is_cyber_device BOOLEAN DEFAULT TRUE,
    cybersecurity_plan_submitted BOOLEAN DEFAULT FALSE,
    sbom_submitted BOOLEAN DEFAULT FALSE,
    
    -- SBOM Link
    current_sbom_id UUID REFERENCES cybersecurity.sboms(id),
    
    -- Compliance
    section_524b_compliant BOOLEAN DEFAULT FALSE,
    compliance_assessment_date TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_cyber_device_program ON cybersecurity.cyber_devices(program_id);

-- Vulnerability Scans
CREATE TABLE IF NOT EXISTS cybersecurity.vulnerability_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sbom_id UUID NOT NULL REFERENCES cybersecurity.sboms(id),
    
    -- Scan Details
    scanner_name VARCHAR(100) NOT NULL,
    scanner_version VARCHAR(50),
    scan_timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Results
    total_vulnerabilities INTEGER NOT NULL DEFAULT 0,
    critical_count INTEGER NOT NULL DEFAULT 0,
    high_count INTEGER NOT NULL DEFAULT 0,
    medium_count INTEGER NOT NULL DEFAULT 0,
    low_count INTEGER NOT NULL DEFAULT 0,
    
    -- Detailed Findings
    findings JSONB DEFAULT '[]',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_vuln_scan_sbom ON cybersecurity.vulnerability_scans(sbom_id);


-- =============================================================================
-- SCHEMA: transparency
-- EMA Policy 0070, PDF/A-3, GAMP 5 Infrastructure
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS transparency;

-- Anonymization Reports
CREATE TABLE IF NOT EXISTS transparency.anonymization_reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Dataset Reference
    dataset_id UUID NOT NULL,
    dataset_name VARCHAR(255) NOT NULL,
    version VARCHAR(50) NOT NULL,
    
    -- Transformations
    transformations JSONB NOT NULL,
    
    -- Risk Metrics
    risk_metrics JSONB NOT NULL,
    overall_risk_score DECIMAL(5,4) NOT NULL,
    
    -- EMA 0070 Compliance (threshold: 0.09)
    ema_0070_compliant BOOLEAN NOT NULL,
    
    -- Documentation
    methodology_description TEXT,
    utility_impact_assessment TEXT,
    
    -- Approval
    approved_for_publication BOOLEAN DEFAULT FALSE,
    reviewed_by VARCHAR(255),
    reviewed_at TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

CREATE INDEX idx_anon_report_program ON transparency.anonymization_reports(program_id);
CREATE INDEX idx_anon_report_dataset ON transparency.anonymization_reports(dataset_id);

-- Clinical Data Packages
CREATE TABLE IF NOT EXISTS transparency.clinical_data_packages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Study Reference
    study_id UUID NOT NULL,
    study_name VARCHAR(255) NOT NULL,
    
    -- Package Details
    package_type VARCHAR(50) NOT NULL, -- IPD, CSR, Protocol
    datasets JSONB DEFAULT '[]',
    anonymization_report_ids UUID[] DEFAULT ARRAY[]::UUID[],
    
    -- Submission
    status VARCHAR(50) DEFAULT 'DRAFT',
    submission_date TIMESTAMP WITH TIME ZONE,
    published_date TIMESTAMP WITH TIME ZONE,
    ema_submission_number VARCHAR(100),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

CREATE INDEX idx_cdp_program ON transparency.clinical_data_packages(program_id);
CREATE INDEX idx_cdp_study ON transparency.clinical_data_packages(study_id);

-- PDF/A Archival Documents
CREATE TABLE IF NOT EXISTS transparency.archival_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Document Info
    document_type VARCHAR(100) NOT NULL,
    title VARCHAR(500) NOT NULL,
    source_file_path VARCHAR(1000),
    pdfa_file_path VARCHAR(1000),
    
    -- PDF/A-3 Compliance
    conformance_level VARCHAR(20) NOT NULL, -- PDF/A-3A, PDF/A-3B, PDF/A-3U
    validation_status VARCHAR(50) DEFAULT 'PENDING',
    validation_errors JSONB DEFAULT '[]',
    
    -- Embedded Files
    embedded_files JSONB DEFAULT '[]',
    
    -- File Details
    file_size_bytes BIGINT,
    md5_hash VARCHAR(32),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    converted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_archival_program ON transparency.archival_documents(program_id);
CREATE INDEX idx_archival_status ON transparency.archival_documents(validation_status);

-- Infrastructure Components (GAMP 5)
CREATE TABLE IF NOT EXISTS transparency.infrastructure_components (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Component Info
    name VARCHAR(255) NOT NULL,
    component_type VARCHAR(100) NOT NULL,
    version VARCHAR(50) NOT NULL,
    
    -- GAMP 5 Classification
    gamp_category VARCHAR(20) NOT NULL, -- CATEGORY_1, CATEGORY_3, CATEGORY_4, CATEGORY_5
    validation_approach VARCHAR(100) NOT NULL,
    
    -- IaC
    iac_provider VARCHAR(50), -- TERRAFORM, PULUMI, CLOUDFORMATION, KUBERNETES
    iac_configuration_path VARCHAR(1000),
    
    -- GxP Impact
    gxp_impact VARCHAR(20) NOT NULL, -- HIGH, MEDIUM, LOW
    data_integrity_impact VARCHAR(20) NOT NULL,
    
    -- Qualification Status
    qualification_status VARCHAR(50) DEFAULT 'PENDING',
    last_validation_date TIMESTAMP WITH TIME ZONE,
    next_validation_due TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

CREATE INDEX idx_infra_program ON transparency.infrastructure_components(program_id);
CREATE INDEX idx_infra_category ON transparency.infrastructure_components(gamp_category);

-- IaC Validation Runs
CREATE TABLE IF NOT EXISTS transparency.iac_validation_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    component_id UUID REFERENCES transparency.infrastructure_components(id),
    
    -- IaC Details
    iac_provider VARCHAR(50) NOT NULL,
    configuration_path VARCHAR(1000),
    git_commit_sha VARCHAR(40),
    
    -- Results
    policy_results JSONB NOT NULL,
    drift_detected BOOLEAN DEFAULT FALSE,
    drift_details JSONB,
    
    -- Summary
    passed_checks INTEGER NOT NULL DEFAULT 0,
    failed_checks INTEGER NOT NULL DEFAULT 0,
    overall_status VARCHAR(50) NOT NULL,
    
    -- Execution
    executed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    executed_by VARCHAR(255) NOT NULL,
    duration_seconds INTEGER
);

CREATE INDEX idx_iac_validation_program ON transparency.iac_validation_runs(program_id);
CREATE INDEX idx_iac_validation_component ON transparency.iac_validation_runs(component_id);

-- GxP Policies (Policy as Code)
CREATE TABLE IF NOT EXISTS transparency.gxp_policies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Policy Info
    name VARCHAR(255) NOT NULL,
    description TEXT,
    category VARCHAR(100),
    severity VARCHAR(20) NOT NULL,
    
    -- Rego Policy
    rego_policy TEXT NOT NULL,
    
    -- Applicability
    applicable_providers VARCHAR(50)[] DEFAULT ARRAY[]::VARCHAR(50)[],
    regulatory_reference TEXT,
    
    -- Status
    status VARCHAR(50) DEFAULT 'DRAFT',
    version VARCHAR(50) NOT NULL DEFAULT '1.0',
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT uk_policy_name_version UNIQUE (program_id, name, version)
);

CREATE INDEX idx_gxp_policy_program ON transparency.gxp_policies(program_id);
CREATE INDEX idx_gxp_policy_status ON transparency.gxp_policies(status);


-- =============================================================================
-- SCHEMA: training
-- xAPI Learning Records and Part 11 Training Compliance
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS training;

-- xAPI Statements (Learning Record Store)
CREATE TABLE IF NOT EXISTS training.xapi_statements (
    id UUID PRIMARY KEY,
    program_id UUID NOT NULL,
    
    -- Actor
    actor JSONB NOT NULL,
    
    -- Verb
    verb JSONB NOT NULL,
    
    -- Object (Activity)
    object JSONB NOT NULL,
    
    -- Result
    result JSONB,
    
    -- Context
    context JSONB,
    
    -- Timestamp
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL,
    stored TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    -- xAPI Version
    version VARCHAR(10) DEFAULT '1.0.3',
    
    -- Part 11 Extensions
    electronic_signature VARCHAR(100),
    signature_meaning TEXT
);

CREATE INDEX idx_xapi_program ON training.xapi_statements(program_id);
CREATE INDEX idx_xapi_timestamp ON training.xapi_statements(timestamp);
CREATE INDEX idx_xapi_actor ON training.xapi_statements USING GIN (actor);
CREATE INDEX idx_xapi_verb ON training.xapi_statements USING GIN (verb);

-- Training Curricula
CREATE TABLE IF NOT EXISTS training.curricula (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Identification
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    
    -- Requirements
    training_type VARCHAR(50) NOT NULL,
    required_for_roles VARCHAR(100)[] DEFAULT ARRAY[]::VARCHAR(100)[],
    prerequisite_curricula UUID[] DEFAULT ARRAY[]::UUID[],
    
    -- Completion Criteria
    passing_score DECIMAL(5,2) DEFAULT 80.0,
    max_attempts INTEGER DEFAULT 3,
    validity_months INTEGER DEFAULT 12,
    
    -- Content
    modules UUID[] DEFAULT ARRAY[]::UUID[],
    estimated_duration_minutes INTEGER,
    
    -- Regulatory
    regulatory_basis TEXT[],
    
    -- Lifecycle
    effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
    sunset_date TIMESTAMP WITH TIME ZONE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    approved_by VARCHAR(255),
    approved_at TIMESTAMP WITH TIME ZONE,
    
    CONSTRAINT uk_curriculum_version UNIQUE (program_id, code, version)
);

CREATE INDEX idx_curriculum_program ON training.curricula(program_id);
CREATE INDEX idx_curriculum_type ON training.curricula(training_type);

-- Training Modules
CREATE TABLE IF NOT EXISTS training.modules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    curriculum_id UUID NOT NULL REFERENCES training.curricula(id),
    
    -- Identification
    code VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    version VARCHAR(50) NOT NULL,
    
    -- Content
    activity_type VARCHAR(100) NOT NULL,
    content_url VARCHAR(1000),
    estimated_duration_minutes INTEGER,
    
    -- Assessment
    has_assessment BOOLEAN DEFAULT FALSE,
    passing_score DECIMAL(5,2),
    
    -- Sequence
    sequence_order INTEGER NOT NULL,
    is_required BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL
);

CREATE INDEX idx_module_curriculum ON training.modules(curriculum_id);

-- Training Records (Part 11 Compliant)
CREATE TABLE IF NOT EXISTS training.records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    
    -- Trainee
    user_id UUID NOT NULL,
    user_email VARCHAR(255) NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    department VARCHAR(100),
    role VARCHAR(100),
    
    -- Training
    curriculum_id UUID NOT NULL REFERENCES training.curricula(id),
    curriculum_code VARCHAR(50) NOT NULL,
    curriculum_title VARCHAR(255) NOT NULL,
    training_type VARCHAR(50) NOT NULL,
    
    -- Status
    status VARCHAR(50) NOT NULL DEFAULT 'NOT_STARTED',
    
    -- Completion
    started_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    score DECIMAL(5,2),
    attempts INTEGER DEFAULT 0,
    
    -- Expiration
    valid_until TIMESTAMP WITH TIME ZONE,
    is_expired BOOLEAN DEFAULT FALSE,
    
    -- xAPI Tracking
    xapi_statements UUID[] DEFAULT ARRAY[]::UUID[],
    registration_id UUID,
    
    -- Part 11 Signature
    signed_at TIMESTAMP WITH TIME ZONE,
    signature_meaning TEXT,
    electronic_signature_id VARCHAR(100),
    
    -- Audit
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    created_by VARCHAR(255) NOT NULL,
    last_modified_at TIMESTAMP WITH TIME ZONE,
    last_modified_by VARCHAR(255)
);

CREATE INDEX idx_training_record_program ON training.records(program_id);
CREATE INDEX idx_training_record_user ON training.records(user_id);
CREATE INDEX idx_training_record_status ON training.records(status);
CREATE INDEX idx_training_record_curriculum ON training.records(curriculum_id);

-- Competency Assessments
CREATE TABLE IF NOT EXISTS training.competency_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    -- Assessment
    competency_area VARCHAR(255) NOT NULL,
    assessment_type VARCHAR(100) NOT NULL,
    
    -- Result
    level_achieved VARCHAR(50) NOT NULL,
    score DECIMAL(5,2),
    
    -- Assessor
    assessed_by VARCHAR(255) NOT NULL,
    assessed_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Evidence
    evidence_references TEXT[] DEFAULT ARRAY[]::TEXT[],
    comments TEXT,
    
    -- Validity
    valid_until TIMESTAMP WITH TIME ZONE,
    
    -- xAPI Link
    xapi_statement_id UUID
);

CREATE INDEX idx_competency_program ON training.competency_assessments(program_id);
CREATE INDEX idx_competency_user ON training.competency_assessments(user_id);

-- SOP Acknowledgments
CREATE TABLE IF NOT EXISTS training.sop_acknowledgments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID NOT NULL,
    user_id UUID NOT NULL,
    
    -- SOP Reference
    sop_id VARCHAR(100) NOT NULL,
    sop_number VARCHAR(50) NOT NULL,
    sop_title VARCHAR(500) NOT NULL,
    sop_version VARCHAR(50) NOT NULL,
    sop_effective_date TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Acknowledgment
    acknowledged_at TIMESTAMP WITH TIME ZONE NOT NULL,
    
    -- Part 11 Signature
    signature_meaning TEXT NOT NULL,
    electronic_signature_id VARCHAR(100) NOT NULL,
    
    -- xAPI Link
    xapi_statement_id UUID
);

CREATE INDEX idx_sop_ack_program ON training.sop_acknowledgments(program_id);
CREATE INDEX idx_sop_ack_user ON training.sop_acknowledgments(user_id);
CREATE INDEX idx_sop_ack_sop ON training.sop_acknowledgments(sop_id);


-- =============================================================================
-- Migration Record
-- =============================================================================

INSERT INTO shadow.migrations (version, name, description, applied_by)
VALUES (
    10,
    '010_next_gen_compliance',
    'Next-Generation Compliance Framework: AI/ML Governance (GMLP, PCCP, Model Cards), Cybersecurity (SBOM, VEX, Section 524B), Data Transparency (EMA 0070, PDF/A-3, GAMP 5), Training Compliance (xAPI, Part 11)',
    current_user
);
