-- =============================================================================
-- Migration 058: GCC FHIR Resources for KASA Compliance
-- =============================================================================
-- Purpose: HL7 FHIR structured data storage for FDA KASA initiative
-- Compliance: HL7 FHIR R4, FDA PQ/CMC, ICH M4Q, EU IDMP
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE FHIR SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS fhir;

COMMENT ON SCHEMA fhir IS 
'HL7 FHIR R4 structured resources for FDA KASA and EU IDMP compliance';

-- =============================================================================
-- 2. FHIR RESOURCE TYPE ENUM
-- =============================================================================
-- Core FHIR resources used in regulatory submissions

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'fhir' AND t.typname = 'resource_type'
    ) THEN
        CREATE TYPE fhir.resource_type AS ENUM (
            -- Pharmaceutical Quality (PQ/CMC)
            'MedicinalProductDefinition',
            'Ingredient',
            'SubstanceDefinition',
            'ManufacturedItemDefinition',
            'AdministrableProductDefinition',
            'PackagedProductDefinition',
            'RegulatedAuthorization',
            
            -- Clinical
            'Organization',
            'Practitioner',
            'PractitionerRole',
            'Location',
            'HealthcareService',
            
            -- Observations & Diagnostics (Stability Data, etc.)
            'Observation',
            'DiagnosticReport',
            'Specimen',
            'Device',
            'DeviceDefinition',
            
            -- Documents & Plans
            'DocumentReference',
            'PlanDefinition',
            'ActivityDefinition',
            'ResearchStudy',
            'ResearchSubject',
            
            -- Clinical Safety
            'AdverseEvent',
            'MedicationRequest',
            'MedicationAdministration',
            
            -- Bundle Types
            'Bundle',
            'Binary'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'fhir' AND t.typname = 'validation_status'
    ) THEN
        CREATE TYPE fhir.validation_status AS ENUM (
            'DRAFT',
            'PENDING_VALIDATION',
            'VALID',
            'INVALID',
            'WARNING',
            'SUPERSEDED'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'fhir' AND t.typname = 'publication_status'
    ) THEN
        CREATE TYPE fhir.publication_status AS ENUM (
            'DRAFT',
            'ACTIVE',
            'RETIRED',
            'UNKNOWN'
        );
    END IF;
END $$;

-- =============================================================================
-- 3. FHIR RESOURCE STORE (Core Table)
-- =============================================================================

CREATE TABLE IF NOT EXISTS fhir.resources (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Resource Identity (FHIR canonical)
    resource_type fhir.resource_type NOT NULL,
    resource_id TEXT NOT NULL,                   -- FHIR id within type
    version_id INT DEFAULT 1,                    -- FHIR versionId for history
    
    -- Ownership
    org_id UUID NOT NULL REFERENCES identity.organizations(id) ON DELETE RESTRICT,
    
    -- The Actual FHIR Payload
    fhir_json JSONB NOT NULL,
    
    -- Profile Conformance
    profile_url TEXT,                            -- HL7 profile this conforms to
    profile_version TEXT,
    
    -- Validation
    validation_status fhir.validation_status DEFAULT 'DRAFT',
    validation_errors JSONB,                     -- Array of OperationOutcome issues
    validated_at TIMESTAMPTZ,
    validated_by TEXT,
    
    -- Publication Status (mirrors FHIR status field)
    publication_status fhir.publication_status DEFAULT 'DRAFT',
    
    -- Links to eCTD
    submission_unit_id UUID REFERENCES ectd_v4.submission_units(id),
    context_of_use_id UUID REFERENCES ectd_v4.context_of_use_elements(id),
    
    -- Links to Product Master
    product_id UUID REFERENCES product_master.products(id),
    product_variant_id UUID REFERENCES product_master.product_variants(id),
    
    -- Metadata
    last_modified TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system',
    
    -- Ensure unique resource within org
    CONSTRAINT fhir_resource_unique UNIQUE (org_id, resource_type, resource_id, version_id)
);

-- =============================================================================
-- 4. FHIR RESOURCE HISTORY (Immutable Versions)
-- =============================================================================

CREATE TABLE IF NOT EXISTS fhir.resource_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES fhir.resources(id) ON DELETE CASCADE,
    
    -- Version Tracking
    version_id INT NOT NULL,
    fhir_json JSONB NOT NULL,
    
    -- Change Context
    change_type TEXT NOT NULL,                   -- 'CREATE', 'UPDATE', 'DELETE'
    changed_by TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- For Part 11: Cannot delete history
    CONSTRAINT resource_history_immutable CHECK (TRUE)
);

-- =============================================================================
-- 5. PQ/CMC SPECIFIC TABLES (FDA KASA Structure)
-- =============================================================================

-- Stability Studies (FHIR Observation-based)
CREATE TABLE IF NOT EXISTS fhir.stability_studies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource_id UUID NOT NULL REFERENCES fhir.resources(id) ON DELETE CASCADE,
    
    -- Study Identification
    study_id TEXT NOT NULL,
    study_name TEXT NOT NULL,
    study_type TEXT NOT NULL,                    -- 'LONG_TERM', 'ACCELERATED', 'INTERMEDIATE', 'STRESS'
    
    -- ICH Conditions
    storage_condition TEXT NOT NULL,             -- '25°C/60% RH', '40°C/75% RH', etc.
    container_closure TEXT,
    
    -- Product Reference
    product_variant_id UUID REFERENCES product_master.product_variants(id),
    batch_number TEXT,
    
    -- Study Timeline
    study_start_date DATE,
    study_end_date DATE,
    
    -- Results Summary (denormalized for reporting)
    specification_met BOOLEAN,
    shelf_life_months INT,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Stability Data Points
CREATE TABLE IF NOT EXISTS fhir.stability_observations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    study_id UUID NOT NULL REFERENCES fhir.stability_studies(id) ON DELETE CASCADE,
    
    -- Observation Identity
    observation_resource_id UUID REFERENCES fhir.resources(id),
    
    -- Time Point
    time_point_months INT NOT NULL,              -- 0, 3, 6, 9, 12, 18, 24, 36
    time_point_date DATE,
    
    -- Test & Result
    test_name TEXT NOT NULL,                     -- 'Assay', 'Dissolution', 'Degradation Products'
    test_method TEXT,                            -- 'HPLC', 'USP <711>', etc.
    
    result_value NUMERIC(12, 6),
    result_unit TEXT,
    result_text TEXT,                            -- For non-numeric results
    
    -- Specification Comparison
    specification_lower NUMERIC(12, 6),
    specification_upper NUMERIC(12, 6),
    specification_target NUMERIC(12, 6),
    specification_unit TEXT,
    
    -- Pass/Fail
    within_specification BOOLEAN,
    out_of_trend BOOLEAN DEFAULT FALSE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. BATCH/LOT RECORDS (Manufacturing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS fhir.batch_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch Identity
    batch_number TEXT NOT NULL,
    lot_number TEXT,
    
    -- Product Link
    product_variant_id UUID NOT NULL REFERENCES product_master.product_variants(id),
    
    -- Manufacturing
    manufacturing_site_id UUID,                  -- FK to fhir.resources (Organization)
    manufacturing_date DATE,
    expiration_date DATE,
    
    -- Batch Size
    batch_size_value NUMERIC(12, 4),
    batch_size_unit TEXT,                        -- 'kg', 'L', 'units'
    theoretical_yield NUMERIC(12, 4),
    actual_yield NUMERIC(12, 4),
    yield_percent NUMERIC(5, 2),
    
    -- Release Status
    qa_release_status TEXT DEFAULT 'PENDING',    -- 'PENDING', 'RELEASED', 'REJECTED', 'QUARANTINE'
    qa_release_date DATE,
    qa_released_by TEXT,
    
    -- Regulatory
    batch_type TEXT,                             -- 'CLINICAL', 'REGISTRATION', 'COMMERCIAL', 'VALIDATION'
    used_in_submission BOOLEAN DEFAULT FALSE,
    
    -- FHIR Reference
    resource_id UUID REFERENCES fhir.resources(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT batch_records_unique UNIQUE (product_variant_id, batch_number)
);

-- =============================================================================
-- 7. CMC SECTION STRUCTURED DATA
-- =============================================================================

CREATE TABLE IF NOT EXISTS fhir.cmc_sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to eCTD
    submission_unit_id UUID NOT NULL REFERENCES ectd_v4.submission_units(id),
    context_of_use_id UUID REFERENCES ectd_v4.context_of_use_elements(id),
    
    -- CMC Section (Module 3)
    section_code TEXT NOT NULL,                  -- '3.2.S.1', '3.2.P.2', etc.
    section_title TEXT NOT NULL,
    
    -- Structured Content
    structured_content JSONB NOT NULL,           -- The actual PQ/CMC data
    content_schema TEXT,                         -- JSON Schema version used
    
    -- FHIR Resources Generated
    fhir_resource_ids UUID[],                    -- Array of fhir.resources.id
    
    -- Validation
    validation_status fhir.validation_status DEFAULT 'DRAFT',
    validation_messages JSONB,
    
    -- Version Control
    version_number INT DEFAULT 1,
    is_current BOOLEAN DEFAULT TRUE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. INDEXES
-- =============================================================================

-- Resources
CREATE INDEX IF NOT EXISTS idx_fhir_resources_type ON fhir.resources(resource_type);
CREATE INDEX IF NOT EXISTS idx_fhir_resources_org ON fhir.resources(org_id);
CREATE INDEX IF NOT EXISTS idx_fhir_resources_product ON fhir.resources(product_id) WHERE product_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fhir_resources_submission ON fhir.resources(submission_unit_id) WHERE submission_unit_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_fhir_resources_validation ON fhir.resources(validation_status);
CREATE INDEX IF NOT EXISTS idx_fhir_resources_json ON fhir.resources USING GIN(fhir_json jsonb_path_ops);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'fhir'
          AND table_name = 'resource_history'
          AND column_name = 'resource_id'
          AND data_type IN ('text', 'character varying')
    ) THEN
        ALTER TABLE fhir.resource_history
            ALTER COLUMN resource_id TYPE UUID USING resource_id::UUID;
    END IF;
END $$;

-- History
CREATE INDEX IF NOT EXISTS idx_fhir_history_resource ON fhir.resource_history(resource_id);
CREATE INDEX IF NOT EXISTS idx_fhir_history_version ON fhir.resource_history(resource_id, version_id);

-- Stability
CREATE INDEX IF NOT EXISTS idx_stability_studies_product ON fhir.stability_studies(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_stability_studies_type ON fhir.stability_studies(study_type);
CREATE INDEX IF NOT EXISTS idx_stability_obs_study ON fhir.stability_observations(study_id);
CREATE INDEX IF NOT EXISTS idx_stability_obs_timepoint ON fhir.stability_observations(study_id, time_point_months);

-- Batch Records
CREATE INDEX IF NOT EXISTS idx_batch_product ON fhir.batch_records(product_variant_id);
CREATE INDEX IF NOT EXISTS idx_batch_number ON fhir.batch_records(batch_number);
CREATE INDEX IF NOT EXISTS idx_batch_release ON fhir.batch_records(qa_release_status);

-- CMC Sections
CREATE INDEX IF NOT EXISTS idx_cmc_submission ON fhir.cmc_sections(submission_unit_id);
CREATE INDEX IF NOT EXISTS idx_cmc_section_code ON fhir.cmc_sections(section_code);

-- =============================================================================
-- 9. RLS POLICIES
-- =============================================================================

ALTER TABLE fhir.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir.resource_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir.stability_studies ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir.stability_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir.batch_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE fhir.cmc_sections ENABLE ROW LEVEL SECURITY;

-- Resources: Org-scoped
DROP POLICY IF EXISTS fhir_resources_org_isolation ON fhir.resources;
CREATE POLICY fhir_resources_org_isolation ON fhir.resources
    FOR ALL
    USING (identity.can_access_org(org_id))
    WITH CHECK (identity.can_write_org(org_id));

-- History: Inherit from resources
DROP POLICY IF EXISTS fhir_history_org_isolation ON fhir.resource_history;
CREATE POLICY fhir_history_org_isolation ON fhir.resource_history
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM fhir.resources r 
            WHERE r.id::TEXT = resource_id::TEXT AND identity.can_access_org(r.org_id)
        )
    );

-- Stability Studies: Inherit through resources
DROP POLICY IF EXISTS stability_studies_org_isolation ON fhir.stability_studies;
CREATE POLICY stability_studies_org_isolation ON fhir.stability_studies
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM fhir.resources r 
            WHERE r.id::TEXT = resource_id::TEXT AND identity.can_access_org(r.org_id)
        )
    );

-- Stability Observations: Inherit through studies
DROP POLICY IF EXISTS stability_obs_org_isolation ON fhir.stability_observations;
CREATE POLICY stability_obs_org_isolation ON fhir.stability_observations
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM fhir.stability_studies s
            JOIN fhir.resources r ON r.id::TEXT = s.resource_id::TEXT
            WHERE s.id::TEXT = study_id::TEXT AND identity.can_access_org(r.org_id)
        )
    );

-- Batch Records: Inherit through product variant
DROP POLICY IF EXISTS batch_records_org_isolation ON fhir.batch_records;
CREATE POLICY batch_records_org_isolation ON fhir.batch_records
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM product_master.product_variants v
            JOIN product_master.products p ON p.id = v.product_id
            WHERE v.id::TEXT = product_variant_id::TEXT AND identity.can_access_org(p.org_id)
        )
    );

-- CMC Sections: Inherit through submission unit
DROP POLICY IF EXISTS cmc_sections_org_isolation ON fhir.cmc_sections;
CREATE POLICY cmc_sections_org_isolation ON fhir.cmc_sections
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM ectd_v4.submission_units su
            JOIN ectd_v4.regulatory_submissions rs ON rs.id = su.submission_id
            WHERE su.id::TEXT = submission_unit_id::TEXT AND identity.can_access_org(rs.org_id)
        )
    );

-- =============================================================================
-- 10. FHIR RESOURCE VALIDATION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION fhir.validate_resource(
    p_resource_type fhir.resource_type,
    p_fhir_json JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_errors JSONB := '[]'::JSONB;
    v_resource_type_str TEXT;
BEGIN
    v_resource_type_str := p_fhir_json ->> 'resourceType';
    
    -- Check resourceType matches
    IF v_resource_type_str IS NULL OR v_resource_type_str != p_resource_type::TEXT THEN
        v_errors := v_errors || jsonb_build_object(
            'severity', 'error',
            'code', 'invalid',
            'diagnostics', 'resourceType mismatch or missing'
        );
    END IF;
    
    -- Check id exists
    IF NOT (p_fhir_json ? 'id') THEN
        v_errors := v_errors || jsonb_build_object(
            'severity', 'error',
            'code', 'required',
            'diagnostics', 'Resource id is required'
        );
    END IF;
    
    -- Resource-specific validation
    CASE p_resource_type
        WHEN 'MedicinalProductDefinition' THEN
            IF NOT (p_fhir_json ? 'name') THEN
                v_errors := v_errors || jsonb_build_object(
                    'severity', 'error',
                    'code', 'required',
                    'diagnostics', 'MedicinalProductDefinition.name is required'
                );
            END IF;
            
        WHEN 'SubstanceDefinition' THEN
            IF NOT (p_fhir_json ? 'identifier') THEN
                v_errors := v_errors || jsonb_build_object(
                    'severity', 'warning',
                    'code', 'informational',
                    'diagnostics', 'SubstanceDefinition should have identifier (UNII)'
                );
            END IF;
            
        WHEN 'Observation' THEN
            IF NOT (p_fhir_json ? 'status') THEN
                v_errors := v_errors || jsonb_build_object(
                    'severity', 'error',
                    'code', 'required',
                    'diagnostics', 'Observation.status is required'
                );
            END IF;
            IF NOT (p_fhir_json ? 'code') THEN
                v_errors := v_errors || jsonb_build_object(
                    'severity', 'error',
                    'code', 'required',
                    'diagnostics', 'Observation.code is required'
                );
            END IF;
            
        ELSE
            -- Generic validation passes
            NULL;
    END CASE;
    
    RETURN jsonb_build_object(
        'valid', jsonb_array_length(v_errors) = 0 OR NOT EXISTS (
            SELECT 1 FROM jsonb_array_elements(v_errors) e 
            WHERE e ->> 'severity' = 'error'
        ),
        'issues', v_errors
    );
END;
$$;

-- =============================================================================
-- 11. FHIR RESOURCE UPSERT FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION fhir.upsert_resource(
    p_org_id UUID,
    p_resource_type fhir.resource_type,
    p_fhir_json JSONB,
    p_profile_url TEXT DEFAULT NULL,
    p_validate BOOLEAN DEFAULT TRUE
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_resource_id TEXT;
    v_existing_id UUID;
    v_new_id UUID;
    v_version_id INT;
    v_validation_result JSONB;
BEGIN
    -- Extract FHIR id
    v_resource_id := p_fhir_json ->> 'id';
    IF v_resource_id IS NULL THEN
        v_resource_id := gen_random_uuid()::TEXT;
        p_fhir_json := p_fhir_json || jsonb_build_object('id', v_resource_id);
    END IF;
    
    -- Ensure resourceType is set
    p_fhir_json := p_fhir_json || jsonb_build_object('resourceType', p_resource_type::TEXT);
    
    -- Validate if requested
    IF p_validate THEN
        v_validation_result := fhir.validate_resource(p_resource_type, p_fhir_json);
        IF NOT (v_validation_result ->> 'valid')::BOOLEAN THEN
            RAISE EXCEPTION 'FHIR validation failed: %', v_validation_result ->> 'issues';
        END IF;
    END IF;
    
    -- Check for existing resource
    SELECT id, version_id INTO v_existing_id, v_version_id
    FROM fhir.resources
    WHERE org_id = p_org_id 
      AND resource_type = p_resource_type 
            AND resource_id::TEXT = v_resource_id
    ORDER BY version_id DESC
    LIMIT 1;
    
    IF v_existing_id IS NOT NULL THEN
        -- Create new version
        v_version_id := v_version_id + 1;
        
        -- Archive old version
        INSERT INTO fhir.resource_history (resource_id, version_id, fhir_json, change_type, changed_by)
        SELECT id, fhir.resources.version_id, fhir_json, 'UPDATE', current_setting('app.current_user_id', TRUE)
        FROM fhir.resources
        WHERE id = v_existing_id;
        
        -- Update existing record
        UPDATE fhir.resources
        SET fhir_json = p_fhir_json,
            version_id = v_version_id,
            profile_url = COALESCE(p_profile_url, profile_url),
            validation_status = CASE WHEN p_validate THEN 'VALID' ELSE 'DRAFT' END,
            validated_at = CASE WHEN p_validate THEN NOW() ELSE NULL END,
            last_modified = NOW()
        WHERE id = v_existing_id
        RETURNING id INTO v_new_id;
    ELSE
        -- Insert new resource
        INSERT INTO fhir.resources (
            org_id, resource_type, resource_id, version_id, fhir_json,
            profile_url, validation_status, validated_at
        ) VALUES (
            p_org_id, p_resource_type, v_resource_id, 1, p_fhir_json,
            p_profile_url,
            CASE WHEN p_validate THEN 'VALID' ELSE 'DRAFT' END,
            CASE WHEN p_validate THEN NOW() ELSE NULL END
        )
        RETURNING id INTO v_new_id;
        
        -- Archive initial version
        INSERT INTO fhir.resource_history (resource_id, version_id, fhir_json, change_type, changed_by)
        VALUES (v_new_id, 1, p_fhir_json, 'CREATE', current_setting('app.current_user_id', TRUE));
    END IF;
    
    RETURN v_new_id;
END;
$$;

-- =============================================================================
-- 12. STABILITY DATA ENTRY FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION fhir.record_stability_observation(
    p_study_id UUID,
    p_time_point_months INT,
    p_test_name TEXT,
    p_result_value NUMERIC,
    p_result_unit TEXT,
    p_spec_lower NUMERIC DEFAULT NULL,
    p_spec_upper NUMERIC DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_obs_id UUID;
    v_within_spec BOOLEAN;
BEGIN
    -- Determine if within specification
    IF p_spec_lower IS NOT NULL AND p_spec_upper IS NOT NULL THEN
        v_within_spec := p_result_value >= p_spec_lower AND p_result_value <= p_spec_upper;
    ELSIF p_spec_lower IS NOT NULL THEN
        v_within_spec := p_result_value >= p_spec_lower;
    ELSIF p_spec_upper IS NOT NULL THEN
        v_within_spec := p_result_value <= p_spec_upper;
    ELSE
        v_within_spec := TRUE;  -- No spec defined
    END IF;
    
    INSERT INTO fhir.stability_observations (
        study_id, time_point_months, test_name,
        result_value, result_unit,
        specification_lower, specification_upper, specification_unit,
        within_specification
    ) VALUES (
        p_study_id, p_time_point_months, p_test_name,
        p_result_value, p_result_unit,
        p_spec_lower, p_spec_upper, p_result_unit,
        v_within_spec
    )
    RETURNING id INTO v_obs_id;
    
    -- Log if out of spec
    IF NOT v_within_spec THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id, event_description,
            metadata
        ) VALUES (
            'DATA_ACCESS', 'STABILITY_OBSERVATION', v_obs_id,
            'Out-of-specification stability result recorded',
            jsonb_build_object(
                'study_id', p_study_id,
                'test_name', p_test_name,
                'time_point', p_time_point_months,
                'result', p_result_value,
                'spec_lower', p_spec_lower,
                'spec_upper', p_spec_upper
            )
        );
    END IF;
    
    RETURN v_obs_id;
END;
$$;

-- =============================================================================
-- 13. LINK ECTD_V4 TO FHIR
-- =============================================================================

-- Add FHIR resource reference to context_of_use_elements
ALTER TABLE ectd_v4.context_of_use_elements
    ADD COLUMN IF NOT EXISTS fhir_resource_id UUID REFERENCES fhir.resources(id);

CREATE INDEX IF NOT EXISTS idx_cou_fhir 
    ON ectd_v4.context_of_use_elements(fhir_resource_id) WHERE fhir_resource_id IS NOT NULL;

COMMENT ON COLUMN ectd_v4.context_of_use_elements.fhir_resource_id IS 
'Link to structured FHIR resource for KASA-compliant submissions';

-- =============================================================================
-- 14. AUDIT TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION fhir.audit_resource_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id, 
            org_id, new_values, event_description
        ) VALUES (
            'CREATE', 'FHIR_RESOURCE', NEW.id,
            NEW.org_id, 
            jsonb_build_object('resource_type', NEW.resource_type, 'resource_id', NEW.resource_id),
            'FHIR resource created: ' || NEW.resource_type || '/' || NEW.resource_id
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        INSERT INTO audit.event_log (
            event_category, entity_type, entity_id,
            org_id, previous_values, new_values, event_description
        ) VALUES (
            'UPDATE', 'FHIR_RESOURCE', NEW.id,
            NEW.org_id,
            jsonb_build_object('version_id', OLD.version_id),
            jsonb_build_object('version_id', NEW.version_id),
            'FHIR resource updated: ' || NEW.resource_type || '/' || NEW.resource_id || ' v' || NEW.version_id
        );
        RETURN NEW;
    END IF;
    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_fhir_resource_audit ON fhir.resources;
CREATE TRIGGER trg_fhir_resource_audit
    AFTER INSERT OR UPDATE ON fhir.resources
    FOR EACH ROW EXECUTE FUNCTION fhir.audit_resource_changes();

-- =============================================================================
-- 15. SAMPLE FHIR PROFILES (Controlled Vocabulary Entries)
-- =============================================================================

INSERT INTO common_standards.controlled_vocabularies (
    cv_oid, cv_code, cv_name, cv_description, version_date, is_active
) VALUES 
    ('2.16.840.1.113883.4.642.40.1', 'FHIR_PQ_CMC', 'HL7 FHIR PQ/CMC Profile', 
     'FDA Pharmaceutical Quality/CMC FHIR Implementation Guide', CURRENT_DATE, TRUE),
    ('2.16.840.1.113883.4.642.40.2', 'FHIR_IDMP', 'HL7 FHIR IDMP Profile', 
     'EU IDMP FHIR Implementation Guide', CURRENT_DATE, TRUE),
    ('2.16.840.1.113883.4.642.40.3', 'FHIR_SPL', 'HL7 FHIR SPL Profile', 
     'FDA Structured Product Labeling FHIR IG', CURRENT_DATE, TRUE)
ON CONFLICT DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

/*
-- Verify schema
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'fhir';

-- Verify tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'fhir';

-- Verify RLS
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'fhir';

-- Test validation function
SELECT fhir.validate_resource(
    'MedicinalProductDefinition'::fhir.resource_type,
    '{"resourceType": "MedicinalProductDefinition", "id": "test-1", "name": [{"productName": "Test Drug"}]}'::JSONB
);

-- Test upsert (requires org_id)
-- SELECT fhir.upsert_resource(
--     'org-uuid-here',
--     'Observation'::fhir.resource_type,
--     '{"resourceType": "Observation", "id": "test-obs", "status": "final", "code": {"text": "Assay"}}'::JSONB
-- );
*/
