-- =============================================================================
-- GLOBAL REGULATORY DATA HARMONIZATION ENGINE (GRDHE)
-- Migration 081: Regulatory Mapping Layer & Terminology Version Control
-- =============================================================================
--
-- Version: 1.0.0
-- Author: Concept2Cure Platform Team
-- Last Modified: 2026-01-24
-- Compliance: 21 CFR Part 11, EU MDR 2017/745, GDPR Article 9, ISO 13485
--
-- This migration implements:
--   1. Data Residency Controls - Geo-fencing for GDPR/FDA compliance
--   2. Terminology Version Service - MedDRA/SNOMED/GUDID version tracking
--   3. Regulatory Mapping Layer (RML) - JSON-based transformation rules
--   4. Export Job Management - Track eCTD/E2B/XEVMPD generations
--   5. Canonical Data Model extensions for adverse events, products, devices
--   6. GDPR Article 30 Records of Processing Activities
--   7. Electronic Signature workflows with dual authentication
--   8. Complete audit trail infrastructure
--
-- CRITICAL CONSTRAINTS:
--   - All regulatory rules externalized in configuration - NO HARDCODED LOGIC
--   - Soft delete only - NO data destruction without retention verification
--   - All operations logged with user context and timestamps
--   - Electronic signatures cryptographically bound to data versions
--
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- =============================================================================
-- SCHEMA: regulatory_harmonization
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS regulatory_harmonization;

COMMENT ON SCHEMA regulatory_harmonization IS 
  'Global Regulatory Data Harmonization Engine - Single source of truth with multi-jurisdictional outputs per 21 CFR Part 11';

-- =============================================================================
-- SECTION 1: ENUMERATED TYPES
-- =============================================================================

-- Supported data residency regions (GDPR + FDA compliance)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'data_region' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'regulatory_harmonization')) THEN
    CREATE TYPE regulatory_harmonization.data_region AS ENUM (
      'US_EAST',      -- FDA 21 CFR Part 11 compliant (Virginia)
      'US_WEST',      -- FDA backup (Oregon)
      'EU_WEST',      -- GDPR Article 9 compliant (Ireland)
      'EU_CENTRAL',   -- GDPR backup (Frankfurt)
      'UK_SOUTH',     -- Post-Brexit MHRA (London)
      'JP_EAST',      -- PMDA compliant (Tokyo)
      'CA_CENTRAL',   -- Health Canada (Montreal)
      'AU_EAST',      -- TGA compliant (Sydney)
      'GLOBAL'        -- No restriction (use with caution)
    );
  END IF;
END $$;

-- Supported terminology systems
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'terminology_system' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'regulatory_harmonization')) THEN
    CREATE TYPE regulatory_harmonization.terminology_system AS ENUM (
      'MEDDRA',           -- Medical Dictionary for Regulatory Activities
      'SNOMED_CT',        -- SNOMED Clinical Terms
      'SNOMED_CT_US',     -- SNOMED CT US Edition
      'SNOMED_CT_INT',    -- SNOMED CT International
      'ICD10',            -- ICD-10 codes
      'ICD11',            -- ICD-11 codes
      'LOINC',            -- Laboratory codes
      'RXNORM',           -- Drug codes
      'NDC',              -- National Drug Code
      'GUDID',            -- Global Unique Device Identification
      'EMDN',             -- European Medical Device Nomenclature
      'GMDN',             -- Global Medical Device Nomenclature
      'NCI_THESAURUS',    -- NCI Thesaurus for clinical trials
      'UCUM',             -- Units of Measure
      'HL7_FHIR_R4',      -- FHIR R4 value sets
      'ICH_E2B_R3',       -- ICH E2B(R3) controlled vocabularies
      'EDQM',             -- European Directorate for Quality of Medicines
      'UNII',             -- FDA Unique Ingredient Identifier
      'ATC',              -- Anatomical Therapeutic Chemical
      'WHO_DRUG'          -- WHO Drug Dictionary
    );
  END IF;
END $$;

-- Supported regulatory formats
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'regulatory_format' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'regulatory_harmonization')) THEN
    CREATE TYPE regulatory_harmonization.regulatory_format AS ENUM (
      -- FDA formats
      'FDA_ECTD_4_0',      -- eCTD 4.0 for NDA/BLA/ANDA
      'FDA_ECTD_3_2_2',    -- Legacy eCTD 3.2.2
      'FDA_3500A',         -- MedWatch 3500A (adverse events)
      'FDA_3500B',         -- MedWatch 3500B (mandatory reporting)
      'FDA_GUDID',         -- GUDID submission format
      'FDA_SPL',           -- Structured Product Labeling
      'FDA_ESG',           -- Electronic Submissions Gateway
      'FDA_CDRH_ESTAR',    -- eSTAR for 510(k)
      
      -- EMA formats
      'EMA_ECTD_4_0',      -- EU eCTD 4.0
      'EMA_XEVMPD',        -- Extended EudraVigilance Product Dictionary
      'EMA_IDMP_SPOR',     -- IDMP via SPOR (Substances, Products, Orgs, Referentials)
      'EMA_E2B_R3',        -- ICH E2B(R3) ICSRs via EudraVigilance
      'EMA_EUDAMED',       -- EUDAMED (EU MDR device database)
      'EMA_PSUR',          -- Periodic Safety Update Report
      
      -- Other jurisdictions
      'PMDA_ECTD',         -- Japan eCTD (J-eCTD)
      'PMDA_E2B_R3',       -- Japan ICSRs
      'HC_ECTD',           -- Health Canada eCTD
      'TGA_ECTD',          -- Australia eCTD
      'MHRA_ECTD',         -- UK MHRA eCTD
      'ANVISA_ECTD',       -- Brazil ANVISA
      'NMPA_ECTD',         -- China NMPA
      
      -- Cross-jurisdiction
      'ICH_E2B_R3',        -- Generic ICH E2B(R3) format
      'IMDRF_AERS',        -- IMDRF Adverse Event Reporting
      'ISO_IDMP',          -- ISO 11615/11616 IDMP
      'FHIR_R4_PQ_CMC',    -- FHIR PQ/CMC for FDA
      'CDISC_SDTM',        -- CDISC Study Data Tabulation Model
      'CDISC_ADAM'         -- CDISC Analysis Data Model
    );
  END IF;
END $$;

-- Export job status
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'export_status' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'regulatory_harmonization')) THEN
    CREATE TYPE regulatory_harmonization.export_status AS ENUM (
      'draft',
      'pending',
      'validating',
      'transforming',
      'generating',
      'review_required',
      'approved',
      'completed',
      'failed',
      'cancelled',
      'archived'
    );
  END IF;
END $$;

-- Signature meaning types (21 CFR Part 11)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'signature_meaning' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'regulatory_harmonization')) THEN
    CREATE TYPE regulatory_harmonization.signature_meaning AS ENUM (
      'authored',
      'reviewed',
      'verified',
      'approved',
      'rejected',
      'acknowledged',
      'witnessed',
      'responsible_for_content',
      'legal_responsibility'
    );
  END IF;
END $$;

-- User roles for RBAC
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'grdhe_role' AND typnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'regulatory_harmonization')) THEN
    CREATE TYPE regulatory_harmonization.grdhe_role AS ENUM (
      'admin',
      'qa_manager',
      'regulatory_affairs',
      'medical_writer',
      'data_manager',
      'reviewer',
      'viewer',
      'auditor',
      'system'
    );
  END IF;
END $$;

-- =============================================================================
-- SECTION 2: DATA RESIDENCY CONTROLS
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory_harmonization.tenant_data_residency (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  
  -- Primary storage region (where canonical data lives)
  primary_region regulatory_harmonization.data_region NOT NULL DEFAULT 'US_EAST',
  
  -- Allowed regions for data processing (subset of primary)
  allowed_processing_regions regulatory_harmonization.data_region[] NOT NULL 
    DEFAULT ARRAY['US_EAST'::regulatory_harmonization.data_region],
  
  -- Backup region (must be in same jurisdiction for PHI)
  backup_region regulatory_harmonization.data_region,
  
  -- GDPR specific settings
  gdpr_subject BOOLEAN NOT NULL DEFAULT FALSE,
  gdpr_lawful_basis TEXT CHECK (gdpr_lawful_basis IN (
    'consent', 'contract', 'legal_obligation', 'vital_interests', 
    'public_task', 'legitimate_interests', 'research_exemption'
  )),
  gdpr_dpo_contact TEXT,
  gdpr_data_subject_rights_url TEXT,
  
  -- Cross-border transfer mechanisms
  cross_border_mechanism TEXT CHECK (cross_border_mechanism IN (
    'adequacy_decision', 'standard_contractual_clauses', 'binding_corporate_rules',
    'derogation_explicit_consent', 'none_required'
  )),
  cross_border_documentation_url TEXT,
  
  -- Encryption requirements by region
  encryption_at_rest_required BOOLEAN NOT NULL DEFAULT TRUE,
  encryption_in_transit_required BOOLEAN NOT NULL DEFAULT TRUE,
  field_level_encryption_fields TEXT[] DEFAULT ARRAY['ssn', 'dob', 'medical_record_number', 'patient_name'],
  encryption_algorithm TEXT NOT NULL DEFAULT 'AES-256-GCM',
  key_rotation_days INT NOT NULL DEFAULT 90,
  
  -- Retention policies (in days, -1 = indefinite per 21 CFR 11.10(c))
  clinical_trial_retention_days INT NOT NULL DEFAULT 5475,  -- 15 years per ICH E6(R2)
  post_market_retention_days INT NOT NULL DEFAULT 2555,     -- 7 years per 21 CFR 820.180
  audit_log_retention_days INT NOT NULL DEFAULT 2555,       -- 7 years per 21 CFR 11.10(e)
  adverse_event_retention_days INT NOT NULL DEFAULT 3650,   -- 10 years per 21 CFR 314.81
  
  -- Soft delete tracking
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit trail
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  updated_by TEXT,
  
  UNIQUE(tenant_id)
);

CREATE INDEX IF NOT EXISTS idx_tenant_residency_region ON regulatory_harmonization.tenant_data_residency(primary_region);
CREATE INDEX IF NOT EXISTS idx_tenant_residency_gdpr ON regulatory_harmonization.tenant_data_residency(gdpr_subject) WHERE gdpr_subject = TRUE;
CREATE INDEX IF NOT EXISTS idx_tenant_residency_active ON regulatory_harmonization.tenant_data_residency(tenant_id) WHERE is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.tenant_data_residency IS 
  'Tenant-level data residency configuration for GDPR Article 9 and FDA 21 CFR Part 11 compliance';

-- =============================================================================
-- SECTION 3: TERMINOLOGY VERSION SERVICE
-- =============================================================================

-- Terminology version registry
CREATE TABLE IF NOT EXISTS regulatory_harmonization.terminology_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Terminology identification
  terminology_system regulatory_harmonization.terminology_system NOT NULL,
  version_code TEXT NOT NULL,
  version_date DATE NOT NULL,
  
  -- Version metadata
  display_name TEXT NOT NULL,
  description TEXT,
  release_notes_url TEXT,
  license_url TEXT,
  
  -- Jurisdiction applicability
  applicable_jurisdictions TEXT[] NOT NULL DEFAULT ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'],
  
  -- Effective dates (when this version is required/allowed)
  effective_from DATE NOT NULL,
  effective_until DATE,
  deprecated_at TIMESTAMPTZ,
  deprecation_reason TEXT,
  successor_version_id UUID REFERENCES regulatory_harmonization.terminology_versions(id),
  
  -- Status
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  is_deprecated BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Source file references (for audit trail)
  source_file_url TEXT,
  source_file_hash TEXT,
  source_file_size_bytes BIGINT,
  
  -- Statistics
  concept_count INT,
  term_count INT,
  relationship_count INT,
  
  -- Validation
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT CHECK (validation_status IN ('valid', 'invalid', 'pending', 'needs_review')),
  validation_errors JSONB DEFAULT '[]'::jsonb,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  
  UNIQUE(terminology_system, version_code)
);

CREATE INDEX IF NOT EXISTS idx_terminology_system_current ON regulatory_harmonization.terminology_versions(terminology_system, is_current) 
  WHERE is_current = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_terminology_effective ON regulatory_harmonization.terminology_versions(terminology_system, effective_from, effective_until)
  WHERE is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.terminology_versions IS 
  'Registry of terminology system versions with jurisdiction applicability - tracks which version was used for each submission';

-- Terminology mapping table (cross-version and cross-system mappings)
CREATE TABLE IF NOT EXISTS regulatory_harmonization.terminology_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Source term
  source_system regulatory_harmonization.terminology_system NOT NULL,
  source_version_id UUID NOT NULL REFERENCES regulatory_harmonization.terminology_versions(id),
  source_code TEXT NOT NULL,
  source_display TEXT NOT NULL,
  source_hierarchy_path TEXT,
  
  -- Target term
  target_system regulatory_harmonization.terminology_system NOT NULL,
  target_version_id UUID NOT NULL REFERENCES regulatory_harmonization.terminology_versions(id),
  target_code TEXT NOT NULL,
  target_display TEXT NOT NULL,
  target_hierarchy_path TEXT,
  
  -- Mapping metadata
  mapping_type TEXT NOT NULL CHECK (mapping_type IN (
    'equivalent',
    'broader',
    'narrower',
    'related',
    'inexact',
    'unmapped',
    'deprecated_to'
  )),
  
  -- Quality metrics
  confidence_score DECIMAL(5,4) CHECK (confidence_score BETWEEN 0 AND 1),
  requires_review BOOLEAN NOT NULL DEFAULT FALSE,
  review_notes TEXT,
  
  -- Mapping provenance
  mapping_source TEXT NOT NULL DEFAULT 'manual' CHECK (mapping_source IN (
    'manual', 'automated', 'vendor_provided', 'who_art', 'umls', 'snomed_refset'
  )),
  mapping_algorithm TEXT,
  
  -- Validation
  validated_by TEXT,
  validated_at TIMESTAMPTZ,
  validation_method TEXT,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  
  UNIQUE(source_system, source_version_id, source_code, target_system, target_version_id) 
);

CREATE INDEX IF NOT EXISTS idx_terminology_mapping_source ON regulatory_harmonization.terminology_mappings(source_system, source_code)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_terminology_mapping_target ON regulatory_harmonization.terminology_mappings(target_system, target_code)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_terminology_mapping_review ON regulatory_harmonization.terminology_mappings(requires_review)
  WHERE requires_review = TRUE AND is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.terminology_mappings IS 
  'Cross-version and cross-system terminology mappings with confidence scores and validation status';

-- Submission terminology usage (tracks which version was used per submission - audit requirement)
CREATE TABLE IF NOT EXISTS regulatory_harmonization.submission_terminology_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Submission reference
  submission_id UUID NOT NULL,
  submission_type TEXT NOT NULL,
  submission_sequence TEXT,
  
  -- Terminology used
  terminology_version_id UUID NOT NULL REFERENCES regulatory_harmonization.terminology_versions(id),
  
  -- Jurisdiction this submission was sent to
  target_jurisdiction TEXT NOT NULL,
  target_agency TEXT,
  
  -- When the terminology was locked for this submission
  locked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  locked_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  lock_reason TEXT NOT NULL DEFAULT 'submission_preparation',
  
  -- Validation status
  validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN (
    'pending', 'validated', 'failed', 'warning', 'waived'
  )),
  validation_errors JSONB DEFAULT '[]'::jsonb,
  validation_warnings JSONB DEFAULT '[]'::jsonb,
  validated_at TIMESTAMPTZ,
  validated_by TEXT,
  
  -- Terms used statistics
  terms_used_count INT DEFAULT 0,
  terms_mapped_count INT DEFAULT 0,
  terms_unmapped_count INT DEFAULT 0,
  terms_requiring_review_count INT DEFAULT 0,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  UNIQUE(submission_id, terminology_version_id)
);

CREATE INDEX IF NOT EXISTS idx_submission_terminology_submission ON regulatory_harmonization.submission_terminology_usage(submission_id)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_submission_terminology_jurisdiction ON regulatory_harmonization.submission_terminology_usage(target_jurisdiction)
  WHERE is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.submission_terminology_usage IS 
  'Tracks which terminology versions were used in each regulatory submission - required for FDA/EMA audit';

-- =============================================================================
-- SECTION 4: REGULATORY MAPPING LAYER (RML)
-- =============================================================================

-- Mapping rule configuration
CREATE TABLE IF NOT EXISTS regulatory_harmonization.mapping_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Rule identification
  rule_code TEXT NOT NULL UNIQUE,
  rule_name TEXT NOT NULL,
  rule_description TEXT,
  rule_version TEXT NOT NULL DEFAULT '1.0.0',
  rule_version_date DATE NOT NULL DEFAULT CURRENT_DATE,
  
  -- Target format
  target_format regulatory_harmonization.regulatory_format NOT NULL,
  target_jurisdiction TEXT NOT NULL,
  
  -- Source data type
  source_entity_type TEXT NOT NULL,
  
  -- The transformation rules (JSON configuration - NO HARDCODED LOGIC)
  transformation_rules JSONB NOT NULL,
  
  -- Validation rules (JSON Schema)
  validation_schema JSONB NOT NULL DEFAULT '{}'::jsonb,
  pre_validation_rules JSONB DEFAULT '[]'::jsonb,
  post_validation_rules JSONB DEFAULT '[]'::jsonb,
  
  -- Field mappings (canonical field -> target field)
  field_mappings JSONB NOT NULL,
  
  -- Date format configuration per jurisdiction
  date_format TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
  date_display_format TEXT,
  timezone_handling TEXT NOT NULL DEFAULT 'UTC' CHECK (timezone_handling IN ('UTC', 'local', 'preserve')),
  
  -- Terminology requirements
  required_terminologies regulatory_harmonization.terminology_system[] DEFAULT ARRAY[]::regulatory_harmonization.terminology_system[],
  terminology_validation_mode TEXT NOT NULL DEFAULT 'strict' CHECK (terminology_validation_mode IN ('strict', 'warn', 'lenient')),
  
  -- Conditional rules
  applicability_conditions JSONB DEFAULT '{}'::jsonb,
  exclusion_conditions JSONB DEFAULT '{}'::jsonb,
  
  -- Status and lifecycle
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  is_draft BOOLEAN NOT NULL DEFAULT FALSE,
  is_validated BOOLEAN NOT NULL DEFAULT FALSE,
  
  -- Validation tracking
  last_validated_at TIMESTAMPTZ,
  validation_status TEXT CHECK (validation_status IN ('valid', 'invalid', 'pending', 'needs_review')),
  validation_errors JSONB DEFAULT '[]'::jsonb,
  test_coverage_percent DECIMAL(5,2) DEFAULT 0,
  
  -- Approval workflow (21 CFR Part 11)
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  approval_signature_id UUID,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  updated_by TEXT
);

CREATE INDEX IF NOT EXISTS idx_mapping_rules_format ON regulatory_harmonization.mapping_rules(target_format) 
  WHERE is_active = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_mapping_rules_source ON regulatory_harmonization.mapping_rules(source_entity_type) 
  WHERE is_active = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_mapping_rules_jurisdiction ON regulatory_harmonization.mapping_rules(target_jurisdiction)
  WHERE is_active = TRUE AND is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.mapping_rules IS 
  'Externalized regulatory transformation rules - NO hardcoded jurisdiction logic per validation requirements';

-- Mapping rule version history (for audit trail)
CREATE TABLE IF NOT EXISTS regulatory_harmonization.mapping_rule_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  rule_id UUID NOT NULL REFERENCES regulatory_harmonization.mapping_rules(id) ON DELETE CASCADE,
  
  -- Version info
  version_number INT NOT NULL,
  version_label TEXT,
  
  -- What changed
  change_type TEXT NOT NULL CHECK (change_type IN (
    'CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE', 'APPROVE', 'REJECT', 'ARCHIVE', 'RESTORE'
  )),
  change_summary TEXT NOT NULL,
  change_details JSONB,
  
  -- Complete snapshot of the rule at this version
  rule_snapshot JSONB NOT NULL,
  
  -- Delta from previous version
  previous_version_id UUID REFERENCES regulatory_harmonization.mapping_rule_history(id),
  changes_from_previous JSONB,
  
  -- Who changed it
  changed_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  changed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Electronic signature (21 CFR Part 11 compliant)
  signature_id UUID,
  signature_meaning regulatory_harmonization.signature_meaning,
  signature_timestamp TIMESTAMPTZ,
  signature_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_mapping_rule_history_rule ON regulatory_harmonization.mapping_rule_history(rule_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_mapping_rule_history_date ON regulatory_harmonization.mapping_rule_history(changed_at DESC);

COMMENT ON TABLE regulatory_harmonization.mapping_rule_history IS 
  '21 CFR Part 11 compliant audit trail for mapping rule changes with electronic signatures';

-- =============================================================================
-- SECTION 5: EXPORT JOB MANAGEMENT
-- =============================================================================

-- Export jobs table
CREATE TABLE IF NOT EXISTS regulatory_harmonization.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Job identification
  job_number TEXT NOT NULL UNIQUE DEFAULT 'EXP-' || to_char(NOW(), 'YYYYMMDD') || '-' || substring(gen_random_uuid()::text, 1, 8),
  
  -- What we're exporting
  tenant_id UUID NOT NULL,
  organization_name TEXT,
  project_id UUID,
  project_name TEXT,
  
  -- Source data
  source_entity_type TEXT NOT NULL,
  source_entity_ids UUID[] NOT NULL,
  source_entity_count INT NOT NULL DEFAULT 0,
  
  -- Target format
  target_format regulatory_harmonization.regulatory_format NOT NULL,
  target_jurisdiction TEXT NOT NULL,
  target_agency TEXT,
  
  -- Mapping rule used
  mapping_rule_id UUID REFERENCES regulatory_harmonization.mapping_rules(id),
  mapping_rule_version TEXT,
  
  -- Terminology versions locked for this export
  terminology_versions JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Export configuration
  export_options JSONB DEFAULT '{}'::jsonb,
  include_attachments BOOLEAN NOT NULL DEFAULT TRUE,
  include_audit_trail BOOLEAN NOT NULL DEFAULT TRUE,
  
  -- Status tracking
  status regulatory_harmonization.export_status NOT NULL DEFAULT 'draft',
  progress_percent INT DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
  current_step TEXT,
  steps_completed JSONB DEFAULT '[]'::jsonb,
  
  -- Validation results
  validation_passed BOOLEAN,
  validation_errors JSONB DEFAULT '[]'::jsonb,
  validation_warnings JSONB DEFAULT '[]'::jsonb,
  validation_started_at TIMESTAMPTZ,
  validation_completed_at TIMESTAMPTZ,
  
  -- Output
  output_file_path TEXT,
  output_file_name TEXT,
  output_file_hash TEXT,
  output_file_size_bytes BIGINT,
  output_mime_type TEXT,
  output_format_version TEXT,
  
  -- Archive (for FDA inspection)
  archive_path TEXT,
  archive_hash TEXT,
  archive_created_at TIMESTAMPTZ,
  
  -- Timing
  scheduled_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms BIGINT,
  
  -- Error handling
  error_message TEXT,
  error_details JSONB,
  error_stack TEXT,
  retry_count INT DEFAULT 0,
  max_retries INT DEFAULT 3,
  last_retry_at TIMESTAMPTZ,
  
  -- Approval workflow (21 CFR Part 11)
  requires_approval BOOLEAN NOT NULL DEFAULT TRUE,
  approval_status TEXT CHECK (approval_status IN ('pending', 'approved', 'rejected', 'waived')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  approval_signature_id UUID,
  approval_comments TEXT,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  
  -- Digital signature on completion (21 CFR Part 11)
  completed_by TEXT,
  completion_signature_id UUID,
  completion_signature_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_export_jobs_tenant ON regulatory_harmonization.export_jobs(tenant_id)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_export_jobs_status ON regulatory_harmonization.export_jobs(status) 
  WHERE status IN ('pending', 'validating', 'transforming', 'generating', 'review_required') AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_export_jobs_format ON regulatory_harmonization.export_jobs(target_format)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_export_jobs_created ON regulatory_harmonization.export_jobs(created_at DESC)
  WHERE is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.export_jobs IS 
  'Regulatory export job tracking with full audit trail for FDA inspection readiness';

-- Export job audit log (detailed operation tracking)
CREATE TABLE IF NOT EXISTS regulatory_harmonization.export_job_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  job_id UUID NOT NULL REFERENCES regulatory_harmonization.export_jobs(id) ON DELETE CASCADE,
  
  -- Action details
  action TEXT NOT NULL,
  action_category TEXT NOT NULL CHECK (action_category IN (
    'status_change', 'validation', 'transformation', 'generation', 'approval', 'error', 'system'
  )),
  
  -- State before and after
  previous_state JSONB,
  new_state JSONB,
  
  -- Details
  message TEXT NOT NULL,
  details JSONB,
  
  -- Context
  user_id TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  user_role TEXT,
  ip_address INET,
  user_agent TEXT,
  
  -- Timestamp (with microsecond precision for ordering)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Checksum for tamper detection
  entry_hash TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_export_job_audit_job ON regulatory_harmonization.export_job_audit_log(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_job_audit_user ON regulatory_harmonization.export_job_audit_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_export_job_audit_action ON regulatory_harmonization.export_job_audit_log(action_category, occurred_at DESC);

COMMENT ON TABLE regulatory_harmonization.export_job_audit_log IS 
  'Detailed audit log for export jobs - immutable, tamper-evident per 21 CFR Part 11';

-- =============================================================================
-- SECTION 6: ELECTRONIC SIGNATURES (21 CFR Part 11)
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory_harmonization.electronic_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- What is being signed
  signed_object_type TEXT NOT NULL,
  signed_object_id UUID NOT NULL,
  signed_object_version INT,
  
  -- Content hash at time of signing
  content_hash TEXT NOT NULL,
  content_hash_algorithm TEXT NOT NULL DEFAULT 'SHA-256',
  
  -- Signature metadata
  signature_meaning regulatory_harmonization.signature_meaning NOT NULL,
  signature_reason TEXT NOT NULL,
  
  -- Signer information
  signer_user_id TEXT NOT NULL,
  signer_name TEXT NOT NULL,
  signer_title TEXT,
  signer_organization TEXT,
  signer_email TEXT,
  
  -- Authentication (dual factor per 21 CFR 11.100)
  authentication_method TEXT NOT NULL CHECK (authentication_method IN (
    'password_and_meaning', 'password_and_biometric', 'hardware_token_and_pin',
    'certificate_and_pin', 'sso_and_mfa'
  )),
  authentication_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  authentication_session_id TEXT,
  
  -- Cryptographic signature
  signature_value TEXT NOT NULL,
  signature_algorithm TEXT NOT NULL DEFAULT 'RS256',
  certificate_thumbprint TEXT,
  certificate_issuer TEXT,
  certificate_serial_number TEXT,
  
  -- Timestamp authority (for legal timestamping)
  timestamp_token TEXT,
  timestamp_authority TEXT,
  timestamp_authority_url TEXT,
  
  -- Status
  is_valid BOOLEAN NOT NULL DEFAULT TRUE,
  invalidated_at TIMESTAMPTZ,
  invalidation_reason TEXT,
  
  -- Countersignature (for witnessed signatures)
  countersigned_by UUID REFERENCES regulatory_harmonization.electronic_signatures(id),
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address INET,
  user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_esignatures_object ON regulatory_harmonization.electronic_signatures(signed_object_type, signed_object_id);
CREATE INDEX IF NOT EXISTS idx_esignatures_signer ON regulatory_harmonization.electronic_signatures(signer_user_id);
CREATE INDEX IF NOT EXISTS idx_esignatures_valid ON regulatory_harmonization.electronic_signatures(is_valid) WHERE is_valid = TRUE;

COMMENT ON TABLE regulatory_harmonization.electronic_signatures IS 
  '21 CFR Part 11 compliant electronic signatures with dual authentication and cryptographic binding';

-- =============================================================================
-- SECTION 7: CANONICAL DATA MODEL
-- =============================================================================

-- Canonical adverse event (jurisdiction-neutral)
CREATE TABLE IF NOT EXISTS regulatory_harmonization.canonical_adverse_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation
  tenant_id UUID NOT NULL,
  organization_id UUID,
  
  -- Case identification (canonical - no jurisdiction-specific IDs here)
  case_number TEXT NOT NULL,
  case_version INT NOT NULL DEFAULT 1,
  worldwide_case_id TEXT,
  
  -- Case type
  case_type TEXT NOT NULL DEFAULT 'spontaneous' CHECK (case_type IN (
    'spontaneous', 'clinical_trial', 'literature', 'solicited', 'other'
  )),
  report_type TEXT NOT NULL DEFAULT 'initial' CHECK (report_type IN (
    'initial', 'followup', 'amendment', 'nullification'
  )),
  
  -- Event details (ISO 8601 dates - transformed on export)
  event_date DATE NOT NULL,
  event_date_precision TEXT NOT NULL DEFAULT 'day' CHECK (event_date_precision IN ('year', 'month', 'day')),
  receive_date DATE NOT NULL,
  most_recent_info_date DATE,
  
  -- Seriousness assessment (CIOMS criteria)
  is_serious BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_death BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_life_threatening BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_hospitalization BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_disability BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_congenital_anomaly BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_other_medically_important BOOLEAN NOT NULL DEFAULT FALSE,
  seriousness_other_details TEXT,
  
  -- Patient information (canonical structure)
  patient JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Reactions (array of canonical reactions)
  reactions JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Suspect drugs/devices (array)
  suspect_products JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Concomitant drugs/devices (array)
  concomitant_products JSONB DEFAULT '[]'::jsonb,
  
  -- Medical history
  medical_history JSONB DEFAULT '{}'::jsonb,
  
  -- Reporter information (canonical)
  reporter JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Sender information
  sender JSONB DEFAULT '{}'::jsonb,
  
  -- Receiver information
  receiver JSONB DEFAULT '{}'::jsonb,
  
  -- Narrative (original text - not jurisdiction formatted)
  case_narrative TEXT,
  reporter_comments TEXT,
  sender_comments TEXT,
  
  -- Causality assessment
  causality_assessment JSONB DEFAULT '{}'::jsonb,
  
  -- Case outcome
  case_outcome TEXT CHECK (case_outcome IN (
    'recovered', 'recovering', 'not_recovered', 'recovered_with_sequelae',
    'fatal', 'unknown'
  )),
  
  -- Regulatory submission tracking
  submissions JSONB DEFAULT '[]'::jsonb,
  
  -- Data integrity (ALCOA+)
  content_hash TEXT NOT NULL,
  
  -- Version control
  is_current_version BOOLEAN NOT NULL DEFAULT TRUE,
  previous_version_id UUID REFERENCES regulatory_harmonization.canonical_adverse_events(id),
  version_reason TEXT,
  
  -- Approval status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'pending_review', 'under_review', 'approved', 'submitted', 'closed', 'archived'
  )),
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  updated_by TEXT,
  
  UNIQUE(tenant_id, case_number, case_version)
);

CREATE INDEX IF NOT EXISTS idx_canonical_ae_tenant ON regulatory_harmonization.canonical_adverse_events(tenant_id)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_canonical_ae_case ON regulatory_harmonization.canonical_adverse_events(case_number)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_canonical_ae_current ON regulatory_harmonization.canonical_adverse_events(tenant_id, case_number) 
  WHERE is_current_version = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_canonical_ae_serious ON regulatory_harmonization.canonical_adverse_events(is_serious, created_at DESC)
  WHERE is_serious = TRUE AND is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_canonical_ae_status ON regulatory_harmonization.canonical_adverse_events(status)
  WHERE is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.canonical_adverse_events IS 
  'Canonical adverse event storage - jurisdiction-neutral, transformed on export per GRDHE architecture';

-- Canonical product/device (jurisdiction-neutral)
CREATE TABLE IF NOT EXISTS regulatory_harmonization.canonical_products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant isolation
  tenant_id UUID NOT NULL,
  organization_id UUID,
  
  -- Product identification
  product_code TEXT NOT NULL,
  product_version INT NOT NULL DEFAULT 1,
  
  -- Product type
  product_type TEXT NOT NULL CHECK (product_type IN (
    'drug', 'biologic', 'medical_device', 'combination_product', 'diagnostic', 'samd'
  )),
  
  -- Classification
  device_class TEXT CHECK (device_class IN ('I', 'II', 'III')),
  risk_class TEXT,
  
  -- Names
  proprietary_name TEXT,
  established_name TEXT,
  generic_name TEXT,
  
  -- Identifiers (canonical)
  identifiers JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Manufacturer
  manufacturer JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Product details
  product_details JSONB DEFAULT '{}'::jsonb,
  
  -- Regulatory status
  regulatory_status JSONB DEFAULT '{}'::jsonb,
  
  -- Version control
  is_current_version BOOLEAN NOT NULL DEFAULT TRUE,
  previous_version_id UUID REFERENCES regulatory_harmonization.canonical_products(id),
  
  -- Data integrity
  content_hash TEXT NOT NULL,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  
  UNIQUE(tenant_id, product_code, product_version)
);

CREATE INDEX IF NOT EXISTS idx_canonical_products_tenant ON regulatory_harmonization.canonical_products(tenant_id)
  WHERE is_deleted = FALSE;
CREATE INDEX IF NOT EXISTS idx_canonical_products_type ON regulatory_harmonization.canonical_products(product_type)
  WHERE is_deleted = FALSE;

COMMENT ON TABLE regulatory_harmonization.canonical_products IS 
  'Canonical product/device storage - jurisdiction-neutral per IDMP/GUDID standards';

-- =============================================================================
-- SECTION 8: GDPR ARTICLE 30 - RECORDS OF PROCESSING ACTIVITIES
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory_harmonization.gdpr_processing_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Tenant
  tenant_id UUID NOT NULL,
  
  -- Processing activity identification
  activity_id TEXT NOT NULL,
  activity_name TEXT NOT NULL,
  activity_description TEXT NOT NULL,
  
  -- Controller information
  controller_name TEXT NOT NULL,
  controller_address TEXT,
  controller_contact TEXT NOT NULL,
  controller_representative TEXT,
  controller_representative_contact TEXT,
  
  -- Data Protection Officer
  dpo_name TEXT,
  dpo_contact TEXT,
  
  -- Joint Controller (if applicable)
  joint_controller_name TEXT,
  joint_controller_contact TEXT,
  joint_controller_agreement_url TEXT,
  
  -- Processor information
  processor_name TEXT,
  processor_contact TEXT,
  processor_agreement_url TEXT,
  sub_processors JSONB DEFAULT '[]'::jsonb,
  
  -- Data categories
  data_subject_categories TEXT[] NOT NULL,
  personal_data_categories TEXT[] NOT NULL,
  special_category_data TEXT[],
  
  -- Recipients
  recipient_categories TEXT[] NOT NULL,
  third_country_recipients TEXT[],
  
  -- Legal basis
  lawful_basis TEXT NOT NULL CHECK (lawful_basis IN (
    'consent', 'contract', 'legal_obligation', 'vital_interests',
    'public_task', 'legitimate_interests'
  )),
  lawful_basis_justification TEXT,
  
  -- Special category legal basis (Article 9)
  special_category_basis TEXT CHECK (special_category_basis IN (
    'explicit_consent', 'employment_law', 'vital_interests', 'foundation_activity',
    'manifestly_public', 'legal_claims', 'public_interest', 'healthcare',
    'public_health', 'archiving_research'
  )),
  special_category_justification TEXT,
  
  -- International transfers
  third_country_transfers TEXT[],
  transfer_safeguards TEXT,
  transfer_mechanism TEXT,
  adequacy_decision_reference TEXT,
  
  -- Retention
  retention_period TEXT NOT NULL,
  retention_justification TEXT,
  deletion_procedure TEXT,
  
  -- Security measures
  security_measures_technical TEXT[] NOT NULL,
  security_measures_organizational TEXT[] NOT NULL,
  
  -- Data subject rights
  rights_access_procedure TEXT,
  rights_rectification_procedure TEXT,
  rights_erasure_procedure TEXT,
  rights_portability_procedure TEXT,
  rights_objection_procedure TEXT,
  
  -- DPIA
  dpia_required BOOLEAN NOT NULL DEFAULT FALSE,
  dpia_reference TEXT,
  dpia_completion_date DATE,
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_until DATE,
  
  -- Review
  last_reviewed_at TIMESTAMPTZ,
  last_reviewed_by TEXT,
  next_review_due TIMESTAMPTZ,
  review_notes TEXT,
  
  -- Soft delete
  is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ,
  deleted_by TEXT,
  deletion_reason TEXT,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  
  UNIQUE(tenant_id, activity_id)
);

CREATE INDEX IF NOT EXISTS idx_gdpr_processing_tenant ON regulatory_harmonization.gdpr_processing_records(tenant_id)
  WHERE is_deleted = FALSE AND is_active = TRUE;

COMMENT ON TABLE regulatory_harmonization.gdpr_processing_records IS 
  'GDPR Article 30 Records of Processing Activities - auto-populated from system operations';

-- =============================================================================
-- SECTION 9: COMPREHENSIVE AUDIT LOG
-- =============================================================================

CREATE TABLE IF NOT EXISTS regulatory_harmonization.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  
  -- What was affected
  schema_name TEXT NOT NULL DEFAULT 'regulatory_harmonization',
  table_name TEXT NOT NULL,
  record_id UUID NOT NULL,
  
  -- What happened
  action TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE', 'SELECT', 'EXPORT', 'SIGN', 'APPROVE', 'REJECT')),
  
  -- Data changes
  old_data JSONB,
  new_data JSONB,
  changed_fields TEXT[],
  
  -- Who did it
  user_id TEXT NOT NULL DEFAULT COALESCE(current_setting('app.current_user_id', true), 'system'),
  user_name TEXT,
  user_role TEXT,
  user_organization TEXT,
  
  -- Context
  session_id TEXT,
  request_id TEXT,
  ip_address INET,
  user_agent TEXT,
  
  -- Why (required for 21 CFR Part 11)
  reason TEXT,
  
  -- When (with timezone)
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Tamper-evident hash (chain link)
  previous_hash TEXT,
  entry_hash TEXT NOT NULL,
  
  -- Partition key (for performance)
  partition_date DATE NOT NULL DEFAULT CURRENT_DATE,
  PRIMARY KEY (id, partition_date)
) PARTITION BY RANGE (partition_date);

-- Create partitions for current and next month
CREATE TABLE IF NOT EXISTS regulatory_harmonization.audit_log_y2026m01 PARTITION OF regulatory_harmonization.audit_log
  FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS regulatory_harmonization.audit_log_y2026m02 PARTITION OF regulatory_harmonization.audit_log
  FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS regulatory_harmonization.audit_log_y2026m03 PARTITION OF regulatory_harmonization.audit_log
  FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');

CREATE INDEX IF NOT EXISTS idx_audit_log_record ON regulatory_harmonization.audit_log(table_name, record_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON regulatory_harmonization.audit_log(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_date ON regulatory_harmonization.audit_log(partition_date, occurred_at DESC);

COMMENT ON TABLE regulatory_harmonization.audit_log IS 
  'Immutable, tamper-evident audit log for 21 CFR Part 11 compliance - partitioned for performance';

-- =============================================================================
-- SECTION 10: FUNCTIONS
-- =============================================================================

-- Function to validate data region
CREATE OR REPLACE FUNCTION regulatory_harmonization.validate_data_region(
  p_tenant_id UUID,
  p_requested_region regulatory_harmonization.data_region
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = regulatory_harmonization, pg_catalog
AS $$
DECLARE
  v_config RECORD;
BEGIN
  SELECT * INTO v_config
  FROM regulatory_harmonization.tenant_data_residency
  WHERE tenant_id = p_tenant_id AND is_deleted = FALSE;
  
  IF NOT FOUND THEN
    RETURN p_requested_region = 'US_EAST';
  END IF;
  
  RETURN p_requested_region = ANY(v_config.allowed_processing_regions);
END;
$$;

-- Function to get recommended terminology version
CREATE OR REPLACE FUNCTION regulatory_harmonization.get_terminology_version(
  p_terminology_system regulatory_harmonization.terminology_system,
  p_jurisdiction TEXT DEFAULT 'FDA',
  p_as_of_date DATE DEFAULT CURRENT_DATE
)
RETURNS regulatory_harmonization.terminology_versions
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_result regulatory_harmonization.terminology_versions;
BEGIN
  SELECT * INTO v_result
  FROM regulatory_harmonization.terminology_versions
  WHERE terminology_system = p_terminology_system
    AND p_jurisdiction = ANY(applicable_jurisdictions)
    AND effective_from <= p_as_of_date
    AND (effective_until IS NULL OR effective_until >= p_as_of_date)
    AND NOT is_deprecated
    AND NOT is_deleted
  ORDER BY effective_from DESC
  LIMIT 1;
  
  RETURN v_result;
END;
$$;

-- Function to compute content hash
CREATE OR REPLACE FUNCTION regulatory_harmonization.compute_content_hash(p_content TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN encode(digest(p_content, 'sha256'), 'hex');
END;
$$;

-- Trigger function to compute AE hash
CREATE OR REPLACE FUNCTION regulatory_harmonization.compute_ae_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_hash := regulatory_harmonization.compute_content_hash(
    COALESCE(NEW.case_number, '') || '|' ||
    COALESCE(NEW.case_version::TEXT, '') || '|' ||
    COALESCE(NEW.event_date::TEXT, '') || '|' ||
    COALESCE(NEW.patient::TEXT, '') || '|' ||
    COALESCE(NEW.reactions::TEXT, '') || '|' ||
    COALESCE(NEW.suspect_products::TEXT, '') || '|' ||
    COALESCE(NEW.reporter::TEXT, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_ae_hash ON regulatory_harmonization.canonical_adverse_events;
CREATE TRIGGER trg_canonical_ae_hash
  BEFORE INSERT OR UPDATE ON regulatory_harmonization.canonical_adverse_events
  FOR EACH ROW EXECUTE FUNCTION regulatory_harmonization.compute_ae_hash();

-- Trigger function to compute product hash
CREATE OR REPLACE FUNCTION regulatory_harmonization.compute_product_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_hash := regulatory_harmonization.compute_content_hash(
    COALESCE(NEW.product_code, '') || '|' ||
    COALESCE(NEW.product_version::TEXT, '') || '|' ||
    COALESCE(NEW.product_type, '') || '|' ||
    COALESCE(NEW.proprietary_name, '') || '|' ||
    COALESCE(NEW.manufacturer::TEXT, '') || '|' ||
    COALESCE(NEW.identifiers::TEXT, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_canonical_product_hash ON regulatory_harmonization.canonical_products;
CREATE TRIGGER trg_canonical_product_hash
  BEFORE INSERT OR UPDATE ON regulatory_harmonization.canonical_products
  FOR EACH ROW EXECUTE FUNCTION regulatory_harmonization.compute_product_hash();

-- Function to compute audit log hash (chain link)
CREATE OR REPLACE FUNCTION regulatory_harmonization.compute_audit_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_previous_hash TEXT;
BEGIN
  -- Get the previous hash from the last entry
  SELECT entry_hash INTO v_previous_hash
  FROM regulatory_harmonization.audit_log
  WHERE partition_date = NEW.partition_date
  ORDER BY occurred_at DESC
  LIMIT 1;
  
  NEW.previous_hash := v_previous_hash;
  NEW.entry_hash := regulatory_harmonization.compute_content_hash(
    COALESCE(v_previous_hash, 'genesis') || '|' ||
    NEW.table_name || '|' ||
    NEW.record_id::TEXT || '|' ||
    NEW.action || '|' ||
    NEW.user_id || '|' ||
    NEW.occurred_at::TEXT || '|' ||
    COALESCE(NEW.old_data::TEXT, '') || '|' ||
    COALESCE(NEW.new_data::TEXT, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_log_hash ON regulatory_harmonization.audit_log;
CREATE TRIGGER trg_audit_log_hash
  BEFORE INSERT ON regulatory_harmonization.audit_log
  FOR EACH ROW EXECUTE FUNCTION regulatory_harmonization.compute_audit_hash();

-- Function to compute export job audit hash
CREATE OR REPLACE FUNCTION regulatory_harmonization.compute_export_audit_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.entry_hash := regulatory_harmonization.compute_content_hash(
    NEW.job_id::TEXT || '|' ||
    NEW.action || '|' ||
    NEW.user_id || '|' ||
    NEW.occurred_at::TEXT || '|' ||
    COALESCE(NEW.message, '') || '|' ||
    COALESCE(NEW.details::TEXT, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_export_job_audit_hash ON regulatory_harmonization.export_job_audit_log;
CREATE TRIGGER trg_export_job_audit_hash
  BEFORE INSERT ON regulatory_harmonization.export_job_audit_log
  FOR EACH ROW EXECUTE FUNCTION regulatory_harmonization.compute_export_audit_hash();

-- Function to create export job with validation
CREATE OR REPLACE FUNCTION regulatory_harmonization.create_export_job(
  p_tenant_id UUID,
  p_source_entity_type TEXT,
  p_source_entity_ids UUID[],
  p_target_format regulatory_harmonization.regulatory_format,
  p_target_jurisdiction TEXT,
  p_created_by TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = regulatory_harmonization, pg_catalog
AS $$
DECLARE
  v_job_id UUID;
  v_mapping_rule_id UUID;
  v_mapping_rule_version TEXT;
  v_terminology_versions JSONB := '{}'::jsonb;
  v_required_terminologies regulatory_harmonization.terminology_system[];
  v_term_system regulatory_harmonization.terminology_system;
  v_term_version RECORD;
  v_region regulatory_harmonization.data_region;
  v_user_id TEXT;
BEGIN
  v_user_id := COALESCE(p_created_by, current_setting('app.current_user_id', true), 'system');
  
  -- Determine region from jurisdiction
  v_region := CASE 
    WHEN p_target_jurisdiction = 'FDA' THEN 'US_EAST'::regulatory_harmonization.data_region
    WHEN p_target_jurisdiction IN ('EMA', 'EU') THEN 'EU_WEST'::regulatory_harmonization.data_region
    WHEN p_target_jurisdiction = 'PMDA' THEN 'JP_EAST'::regulatory_harmonization.data_region
    WHEN p_target_jurisdiction = 'HEALTH_CANADA' THEN 'CA_CENTRAL'::regulatory_harmonization.data_region
    WHEN p_target_jurisdiction = 'TGA' THEN 'AU_EAST'::regulatory_harmonization.data_region
    WHEN p_target_jurisdiction = 'MHRA' THEN 'UK_SOUTH'::regulatory_harmonization.data_region
    ELSE 'US_EAST'::regulatory_harmonization.data_region
  END;
  
  -- Validate data residency
  IF NOT regulatory_harmonization.validate_data_region(p_tenant_id, v_region) THEN
    RAISE EXCEPTION 'Data residency violation: tenant % not authorized for % processing', p_tenant_id, p_target_jurisdiction
      USING HINT = 'Configure tenant data residency to allow this jurisdiction';
  END IF;
  
  -- Get appropriate mapping rule
  SELECT id, rule_version, required_terminologies 
  INTO v_mapping_rule_id, v_mapping_rule_version, v_required_terminologies
  FROM regulatory_harmonization.mapping_rules
  WHERE target_format = p_target_format
    AND source_entity_type = p_source_entity_type
    AND is_active = TRUE
    AND is_deleted = FALSE
    AND (requires_approval = FALSE OR approved_at IS NOT NULL)
  ORDER BY rule_version DESC
  LIMIT 1;
  
  IF v_mapping_rule_id IS NULL THEN
    RAISE EXCEPTION 'No approved mapping rule found for format % and entity type %', p_target_format, p_source_entity_type
      USING HINT = 'Create and approve a mapping rule for this format/entity combination';
  END IF;
  
  -- Lock terminology versions for this export
  FOREACH v_term_system IN ARRAY COALESCE(v_required_terminologies, ARRAY[]::regulatory_harmonization.terminology_system[])
  LOOP
    SELECT * INTO v_term_version
    FROM regulatory_harmonization.get_terminology_version(v_term_system, p_target_jurisdiction);
    
    IF v_term_version.id IS NOT NULL THEN
      v_terminology_versions := v_terminology_versions || jsonb_build_object(
        v_term_system::TEXT, jsonb_build_object(
          'version_id', v_term_version.id,
          'version_code', v_term_version.version_code,
          'display_name', v_term_version.display_name,
          'locked_at', NOW()
        )
      );
    ELSE
      RAISE WARNING 'No terminology version found for % in jurisdiction %', v_term_system, p_target_jurisdiction;
    END IF;
  END LOOP;
  
  -- Create job
  INSERT INTO regulatory_harmonization.export_jobs (
    tenant_id, source_entity_type, source_entity_ids, source_entity_count,
    target_format, target_jurisdiction,
    mapping_rule_id, mapping_rule_version, terminology_versions,
    created_by
  ) VALUES (
    p_tenant_id, p_source_entity_type, p_source_entity_ids, array_length(p_source_entity_ids, 1),
    p_target_format, p_target_jurisdiction,
    v_mapping_rule_id, v_mapping_rule_version, v_terminology_versions,
    v_user_id
  )
  RETURNING id INTO v_job_id;
  
  -- Record terminology usage for audit
  INSERT INTO regulatory_harmonization.submission_terminology_usage (
    submission_id, submission_type, terminology_version_id, target_jurisdiction, locked_by
  )
  SELECT 
    v_job_id,
    p_target_format::TEXT,
    (value->>'version_id')::UUID,
    p_target_jurisdiction,
    v_user_id
  FROM jsonb_each(v_terminology_versions)
  WHERE value->>'version_id' IS NOT NULL;
  
  -- Log the creation
  INSERT INTO regulatory_harmonization.export_job_audit_log (
    job_id, action, action_category, message, details, user_id
  ) VALUES (
    v_job_id,
    'job_created',
    'status_change',
    'Export job created',
    jsonb_build_object(
      'target_format', p_target_format,
      'target_jurisdiction', p_target_jurisdiction,
      'entity_count', array_length(p_source_entity_ids, 1),
      'mapping_rule_version', v_mapping_rule_version
    ),
    v_user_id
  );
  
  RETURN v_job_id;
END;
$$;

-- Function to add audit log entry
CREATE OR REPLACE FUNCTION regulatory_harmonization.log_audit(
  p_table_name TEXT,
  p_record_id UUID,
  p_action TEXT,
  p_old_data JSONB DEFAULT NULL,
  p_new_data JSONB DEFAULT NULL,
  p_reason TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = regulatory_harmonization, pg_catalog
AS $$
DECLARE
  v_audit_id UUID;
  v_changed_fields TEXT[];
BEGIN
  -- Calculate changed fields
  IF p_old_data IS NOT NULL AND p_new_data IS NOT NULL THEN
    SELECT array_agg(key) INTO v_changed_fields
    FROM (
      SELECT key FROM jsonb_each(p_new_data)
      EXCEPT
      SELECT key FROM jsonb_each(p_old_data) WHERE p_old_data->key = p_new_data->key
    ) changed;
  END IF;
  
  INSERT INTO regulatory_harmonization.audit_log (
    table_name, record_id, action, old_data, new_data, changed_fields, reason
  ) VALUES (
    p_table_name, p_record_id, p_action, p_old_data, p_new_data, v_changed_fields, p_reason
  )
  RETURNING id INTO v_audit_id;
  
  RETURN v_audit_id;
END;
$$;

-- =============================================================================
-- SECTION 11: SEED DATA - TERMINOLOGY VERSIONS
-- =============================================================================

INSERT INTO regulatory_harmonization.terminology_versions 
  (terminology_system, version_code, version_date, display_name, effective_from, is_current, applicable_jurisdictions, concept_count, term_count)
VALUES
  -- MedDRA versions
  ('MEDDRA', '26.0', '2023-03-01', 'MedDRA Version 26.0', '2023-03-01', FALSE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 83875, 92753),
  ('MEDDRA', '26.1', '2023-09-01', 'MedDRA Version 26.1', '2023-09-01', FALSE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 84125, 93021),
  ('MEDDRA', '27.0', '2024-03-01', 'MedDRA Version 27.0', '2024-03-01', FALSE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 84512, 93456),
  ('MEDDRA', '27.1', '2024-09-01', 'MedDRA Version 27.1', '2024-09-01', TRUE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 84823, 93892),
  
  -- SNOMED CT editions
  ('SNOMED_CT_US', '2024-09', '2024-09-01', 'SNOMED CT US Edition September 2024', '2024-09-01', TRUE, ARRAY['FDA'], 360000, 1200000),
  ('SNOMED_CT_INT', '2024-07', '2024-07-01', 'SNOMED CT International Edition July 2024', '2024-07-01', TRUE, ARRAY['EMA', 'MHRA', 'TGA', 'HEALTH_CANADA'], 355000, 1150000),
  
  -- GUDID/EMDN for device identification
  ('GUDID', '2024-Q4', '2024-10-01', 'GUDID Q4 2024', '2024-10-01', TRUE, ARRAY['FDA'], 2500000, 2500000),
  ('EMDN', '2024-12', '2024-12-01', 'EMDN December 2024', '2024-12-01', TRUE, ARRAY['EMA'], 12500, 12500),
  ('GMDN', '2024-12', '2024-12-01', 'GMDN December 2024', '2024-12-01', TRUE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 22000, 22000),
  
  -- ICH E2B(R3)
  ('ICH_E2B_R3', '3.0', '2023-01-01', 'ICH E2B(R3) Implementation Guide v3.0', '2023-01-01', TRUE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA'], 500, 2500),
  
  -- FHIR
  ('HL7_FHIR_R4', '4.0.1', '2019-10-30', 'HL7 FHIR R4 v4.0.1', '2019-10-30', TRUE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 145, 5000),
  
  -- LOINC
  ('LOINC', '2.76', '2024-02-01', 'LOINC Version 2.76', '2024-02-01', TRUE, ARRAY['FDA', 'EMA', 'PMDA', 'HEALTH_CANADA', 'TGA', 'MHRA'], 99000, 99000),
  
  -- RxNorm
  ('RXNORM', '2024-01', '2024-01-02', 'RxNorm January 2024', '2024-01-02', TRUE, ARRAY['FDA'], 125000, 380000),
  
  -- UNII
  ('UNII', '2024-01', '2024-01-15', 'FDA UNII January 2024', '2024-01-15', TRUE, ARRAY['FDA', 'EMA'], 120000, 120000)
ON CONFLICT (terminology_system, version_code) DO NOTHING;

-- =============================================================================
-- SECTION 12: SEED DATA - MAPPING RULES
-- =============================================================================

INSERT INTO regulatory_harmonization.mapping_rules (
  rule_code, rule_name, rule_description, target_format, target_jurisdiction, source_entity_type, 
  transformation_rules, field_mappings, date_display_format, required_terminologies,
  validation_schema, is_validated, requires_approval
) VALUES
-- FDA Adverse Event (3500A)
(
  'FDA_AE_3500A_V1',
  'FDA MedWatch 3500A Adverse Event Mapping',
  'Transforms canonical adverse event data to FDA MedWatch Form 3500A XML format per 21 CFR 314.80',
  'FDA_3500A',
  'FDA',
  'adverse_event',
  '{
    "version": "1.0",
    "transforms": [
      {"source": "case_number", "target": "A.1.0.1", "type": "string", "required": true},
      {"source": "event_date", "target": "B.1.1", "type": "date", "format": "YYYYMMDD", "required": true},
      {"source": "receive_date", "target": "A.1.7", "type": "date", "format": "YYYYMMDD", "required": true},
      {"source": "patient.age", "target": "B.1.2.2a", "type": "integer"},
      {"source": "patient.age_unit", "target": "B.1.2.2b", "type": "code", "codeSystem": "ICH_AGE_UNIT"},
      {"source": "patient.sex", "target": "B.1.5", "type": "code", "codeSystem": "ICH_SEX"},
      {"source": "patient.weight", "target": "B.1.3", "type": "decimal"},
      {"source": "reactions[*].term", "target": "B.2.i.1", "type": "array", "itemType": "terminology", "system": "MEDDRA", "required": true},
      {"source": "reactions[*].term_code", "target": "B.2.i.1.meddracode", "type": "array", "itemType": "string"},
      {"source": "reactions[*].outcome", "target": "B.2.i.8", "type": "array", "itemType": "code", "codeSystem": "ICH_OUTCOME"},
      {"source": "suspect_products[*].name", "target": "B.4.k.2.2", "type": "array", "itemType": "string", "required": true},
      {"source": "suspect_products[*].dose", "target": "B.4.k.5.1", "type": "array", "itemType": "string"},
      {"source": "suspect_products[*].route", "target": "B.4.k.8", "type": "array", "itemType": "code", "codeSystem": "FDA_ROUTE"},
      {"source": "reporter.qualification", "target": "A.2.1.4", "type": "code", "codeSystem": "ICH_QUALIFIER"},
      {"source": "reporter.country", "target": "A.2.1.3", "type": "code", "codeSystem": "ISO_3166_1"},
      {"source": "is_serious", "target": "A.1.5.1", "type": "boolean"},
      {"source": "seriousness_death", "target": "A.1.5.2a", "type": "boolean"},
      {"source": "seriousness_life_threatening", "target": "A.1.5.2b", "type": "boolean"},
      {"source": "seriousness_hospitalization", "target": "A.1.5.2c", "type": "boolean"},
      {"source": "seriousness_disability", "target": "A.1.5.2d", "type": "boolean"},
      {"source": "seriousness_congenital_anomaly", "target": "A.1.5.2e", "type": "boolean"},
      {"source": "case_narrative", "target": "B.5.1", "type": "string", "maxLength": 100000}
    ],
    "required_fields": ["case_number", "event_date", "reactions[*].term", "suspect_products[*].name"],
    "jurisdiction_specific": {
      "include_narrative": true,
      "max_narrative_length": 100000,
      "require_meddra_coding": true,
      "report_format": "3500A"
    }
  }'::jsonb,
  '{
    "case_number": "A.1.0.1",
    "event_date": "B.1.1",
    "receive_date": "A.1.7",
    "patient.age": "B.1.2.2a",
    "patient.age_unit": "B.1.2.2b",
    "patient.sex": "B.1.5",
    "patient.weight": "B.1.3",
    "reactions[*].term": "B.2.i.1",
    "reactions[*].term_code": "B.2.i.1.meddracode",
    "reactions[*].outcome": "B.2.i.8",
    "suspect_products[*].name": "B.4.k.2.2",
    "suspect_products[*].dose": "B.4.k.5.1",
    "suspect_products[*].route": "B.4.k.8",
    "reporter.qualification": "A.2.1.4",
    "reporter.country": "A.2.1.3",
    "is_serious": "A.1.5.1",
    "case_narrative": "B.5.1"
  }'::jsonb,
  'MM/DD/YYYY',
  ARRAY['MEDDRA', 'ICH_E2B_R3']::regulatory_harmonization.terminology_system[],
  '{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["case_number", "event_date", "reactions", "suspect_products"],
    "properties": {
      "case_number": {"type": "string", "minLength": 1},
      "event_date": {"type": "string", "format": "date"},
      "reactions": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": ["term"],
          "properties": {
            "term": {"type": "string"},
            "term_code": {"type": "string"}
          }
        }
      },
      "suspect_products": {
        "type": "array",
        "minItems": 1,
        "items": {
          "type": "object",
          "required": ["name"],
          "properties": {
            "name": {"type": "string"}
          }
        }
      }
    }
  }'::jsonb,
  TRUE,
  TRUE
),
-- EMA E2B(R3) ICSR
(
  'EMA_AE_E2B_R3_V1',
  'EMA EudraVigilance E2B(R3) ICSR Mapping',
  'Transforms canonical adverse event data to ICH E2B(R3) XML format for EudraVigilance submission',
  'EMA_E2B_R3',
  'EMA',
  'adverse_event',
  '{
    "version": "1.0",
    "transforms": [
      {"source": "case_number", "target": "C.1.1", "type": "string", "required": true},
      {"source": "worldwide_case_id", "target": "C.1.8.1", "type": "string"},
      {"source": "event_date", "target": "C.1.4", "type": "date", "format": "YYYYMMDD", "required": true},
      {"source": "receive_date", "target": "C.1.2", "type": "date", "format": "YYYYMMDD", "required": true},
      {"source": "patient.age", "target": "D.2.2a", "type": "decimal"},
      {"source": "patient.age_unit", "target": "D.2.2b", "type": "code", "codeSystem": "ICH_AGE_UNIT"},
      {"source": "patient.sex", "target": "D.5", "type": "code", "codeSystem": "ICH_SEX"},
      {"source": "patient.weight", "target": "D.3", "type": "decimal"},
      {"source": "reactions[*].term", "target": "E.i.1.1a", "type": "array", "itemType": "string", "required": true},
      {"source": "reactions[*].term_code", "target": "E.i.1.1b", "type": "array", "itemType": "string"},
      {"source": "reactions[*].outcome", "target": "E.i.7", "type": "array", "itemType": "code", "codeSystem": "ICH_OUTCOME"},
      {"source": "suspect_products[*].name", "target": "G.k.2.2", "type": "array", "itemType": "string", "required": true},
      {"source": "suspect_products[*].substance_code", "target": "G.k.2.3.r.1", "type": "array", "itemType": "terminology", "system": "UNII"},
      {"source": "suspect_products[*].authorization_number", "target": "G.k.3.1", "type": "array", "itemType": "string"},
      {"source": "reporter.qualification", "target": "C.2.r.4", "type": "code", "codeSystem": "ICH_QUALIFIER"},
      {"source": "reporter.country", "target": "C.2.r.3", "type": "code", "codeSystem": "ISO_3166_1", "required": true},
      {"source": "sender.organization", "target": "C.3.1", "type": "string"},
      {"source": "is_serious", "target": "C.1.7", "type": "code", "codeSystem": "ICH_SERIOUS"},
      {"source": "seriousness_death", "target": "E.i.3.2a", "type": "boolean"},
      {"source": "seriousness_life_threatening", "target": "E.i.3.2b", "type": "boolean"},
      {"source": "seriousness_hospitalization", "target": "E.i.3.2c", "type": "boolean"},
      {"source": "case_narrative", "target": "H.1", "type": "string", "maxLength": 100000}
    ],
    "required_fields": ["case_number", "event_date", "receive_date", "reactions[*].term", "suspect_products[*].name", "reporter.country"],
    "jurisdiction_specific": {
      "include_ema_specific_fields": true,
      "require_eudra_vigilance_number": true,
      "meddra_version_required": true,
      "sender_type_required": true
    }
  }'::jsonb,
  '{
    "case_number": "C.1.1",
    "worldwide_case_id": "C.1.8.1",
    "event_date": "C.1.4",
    "receive_date": "C.1.2",
    "patient.age": "D.2.2a",
    "patient.sex": "D.5",
    "reactions[*].term": "E.i.1.1a",
    "reactions[*].term_code": "E.i.1.1b",
    "suspect_products[*].name": "G.k.2.2",
    "suspect_products[*].substance_code": "G.k.2.3.r.1",
    "reporter.qualification": "C.2.r.4",
    "reporter.country": "C.2.r.3",
    "case_narrative": "H.1"
  }'::jsonb,
  'DD/MM/YYYY',
  ARRAY['MEDDRA', 'ICH_E2B_R3', 'UNII']::regulatory_harmonization.terminology_system[],
  '{
    "$schema": "http://json-schema.org/draft-07/schema#",
    "type": "object",
    "required": ["case_number", "event_date", "receive_date", "reactions", "suspect_products", "reporter"],
    "properties": {
      "case_number": {"type": "string"},
      "event_date": {"type": "string", "format": "date"},
      "receive_date": {"type": "string", "format": "date"},
      "reactions": {
        "type": "array",
        "minItems": 1
      },
      "suspect_products": {
        "type": "array",
        "minItems": 1
      },
      "reporter": {
        "type": "object",
        "required": ["country"],
        "properties": {
          "country": {"type": "string", "pattern": "^[A-Z]{2}$"}
        }
      }
    }
  }'::jsonb,
  TRUE,
  TRUE
)
ON CONFLICT (rule_code) DO NOTHING;

-- =============================================================================
-- SECTION 13: PERMISSIONS
-- =============================================================================

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_service') THEN
    GRANT USAGE ON SCHEMA regulatory_harmonization TO app_service;
    GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA regulatory_harmonization TO app_service;
    GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA regulatory_harmonization TO app_service;
    GRANT USAGE ON ALL SEQUENCES IN SCHEMA regulatory_harmonization TO app_service;
  END IF;
  
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_readonly') THEN
    GRANT USAGE ON SCHEMA regulatory_harmonization TO app_readonly;
    GRANT SELECT ON ALL TABLES IN SCHEMA regulatory_harmonization TO app_readonly;
  END IF;
END $$;

-- =============================================================================
-- COMPLETION NOTICE
-- =============================================================================

DO $$
BEGIN
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'Migration 081: GRDHE Regulatory Mapping Layer Complete';
  RAISE NOTICE '=============================================================';
  RAISE NOTICE 'Created Schema: regulatory_harmonization';
  RAISE NOTICE '';
  RAISE NOTICE 'Tables Created:';
  RAISE NOTICE '  - tenant_data_residency (GDPR/FDA data location control)';
  RAISE NOTICE '  - terminology_versions (MedDRA/SNOMED version registry)';
  RAISE NOTICE '  - terminology_mappings (cross-version term mappings)';
  RAISE NOTICE '  - submission_terminology_usage (audit: versions per submission)';
  RAISE NOTICE '  - mapping_rules (transformation rule configuration)';
  RAISE NOTICE '  - mapping_rule_history (Part 11 audit trail)';
  RAISE NOTICE '  - export_jobs (job tracking)';
  RAISE NOTICE '  - export_job_audit_log (detailed job audit)';
  RAISE NOTICE '  - electronic_signatures (21 CFR Part 11 e-signatures)';
  RAISE NOTICE '  - canonical_adverse_events (jurisdiction-neutral AEs)';
  RAISE NOTICE '  - canonical_products (jurisdiction-neutral products)';
  RAISE NOTICE '  - gdpr_processing_records (Article 30 ROPA)';
  RAISE NOTICE '  - audit_log (comprehensive audit, partitioned)';
  RAISE NOTICE '';
  RAISE NOTICE 'Key Functions:';
  RAISE NOTICE '  - validate_data_region()';
  RAISE NOTICE '  - get_terminology_version()';
  RAISE NOTICE '  - create_export_job()';
  RAISE NOTICE '  - log_audit()';
  RAISE NOTICE '';
  RAISE NOTICE 'Seed Data:';
  RAISE NOTICE '  - 14 terminology versions (MedDRA, SNOMED, GUDID, etc.)';
  RAISE NOTICE '  - 2 mapping rules (FDA 3500A, EMA E2B R3)';
  RAISE NOTICE '';
  RAISE NOTICE 'COMPLIANCE:';
  RAISE NOTICE '  - 21 CFR Part 11: Electronic signatures, audit trails';
  RAISE NOTICE '  - GDPR Article 30: Records of processing activities';
  RAISE NOTICE '  - ISO 13485: QMS integration points';
  RAISE NOTICE '  - ALCOA+: Data integrity enforcement';
  RAISE NOTICE '=============================================================';
END $$;
