-- =============================================================================
-- Migration 066: Manufacturing Integration & Digital Twins
-- =============================================================================
-- Purpose: ISA-95 to FHIR mapping, Plug & Produce, Real-Time Release Testing
-- Supports: BioPhorum standards, OPC UA integration, Digital Twin lifecycle
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE MANUFACTURING SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS manufacturing;

COMMENT ON SCHEMA manufacturing IS 
'ISA-95/FHIR integrated manufacturing operations with Digital Twin support';

-- =============================================================================
-- 2. ISA-95 RESOURCE MAPPING
-- =============================================================================
-- Maps ISA-95 manufacturing concepts to FHIR resources

CREATE TYPE manufacturing.isa95_resource_type AS ENUM (
    'MATERIAL',                    -- Raw materials, intermediates
    'EQUIPMENT',                   -- Production equipment
    'PERSONNEL',                   -- Human resources
    'PHYSICAL_ASSET',              -- Facility, clean rooms
    'PROCESS_SEGMENT',             -- Process steps
    'PRODUCT_SEGMENT',             -- Product configurations
    'PRODUCTION_SCHEDULE',         -- Planned production
    'PRODUCTION_PERFORMANCE',      -- Actual execution
    'QUALITY_TEST'                 -- Quality control
);

CREATE TYPE manufacturing.fhir_resource_mapping AS ENUM (
    'SubstanceDefinition',         -- Material → FHIR
    'Device',                      -- Equipment → FHIR
    'Practitioner',                -- Personnel → FHIR
    'Location',                    -- Physical Asset → FHIR
    'PlanDefinition',              -- Process Segment → FHIR
    'MedicinalProductDefinition',  -- Product Segment → FHIR
    'Task',                        -- Production Performance → FHIR
    'Observation',                 -- Quality Test → FHIR
    'Provenance'                   -- Traceability → FHIR
);

CREATE TABLE manufacturing.isa95_fhir_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- ISA-95 Source
    isa95_type manufacturing.isa95_resource_type NOT NULL,
    isa95_id TEXT NOT NULL,                    -- ID from ISA-95 system
    isa95_system_name TEXT NOT NULL,           -- Source MES/ERP name
    
    -- FHIR Target
    fhir_resource_type manufacturing.fhir_resource_mapping NOT NULL,
    fhir_resource_id TEXT,                     -- Generated FHIR ID
    fhir_bundle JSONB,                         -- The FHIR resource
    
    -- Mapping Metadata
    mapping_version TEXT NOT NULL DEFAULT '1.0',
    transformation_rules JSONB,                -- How fields map
    
    -- Sync Status
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    sync_status TEXT DEFAULT 'SYNCED',         -- 'SYNCED', 'PENDING', 'ERROR'
    sync_errors JSONB DEFAULT '[]',
    
    -- Organization
    org_id UUID REFERENCES identity.organizations(id),
    facility_id UUID,                          -- Link to facility
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_isa95_mapping UNIQUE (isa95_system_name, isa95_type, isa95_id)
);

CREATE INDEX idx_isa95_mapping_type ON manufacturing.isa95_fhir_mappings(isa95_type);
CREATE INDEX idx_isa95_mapping_fhir ON manufacturing.isa95_fhir_mappings(fhir_resource_type);
CREATE INDEX idx_isa95_mapping_sync ON manufacturing.isa95_fhir_mappings(sync_status);

-- =============================================================================
-- 3. EQUIPMENT REGISTRY (Plug & Produce)
-- =============================================================================
-- BioPhorum P&P standard for self-configuring GMP equipment

CREATE TYPE manufacturing.equipment_status AS ENUM (
    'AVAILABLE',                   -- Ready for use
    'IN_USE',                      -- Currently in production
    'MAINTENANCE',                 -- Under maintenance
    'CALIBRATION_DUE',             -- Needs calibration
    'OUT_OF_SERVICE',              -- Not available
    'DECOMMISSIONED'               -- Permanently retired
);

CREATE TYPE manufacturing.equipment_class AS ENUM (
    'BIOREACTOR',
    'CHROMATOGRAPHY',
    'FILTRATION',
    'MIXING',
    'FILLING',
    'LYOPHILIZATION',
    'STERILIZATION',
    'INSPECTION',
    'PACKAGING',
    'ANALYTICAL',
    'UTILITY',
    'STORAGE',
    'TRANSFER'
);

CREATE TABLE manufacturing.equipment_registry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    equipment_code TEXT NOT NULL UNIQUE,       -- 'BIOREACTOR-001'
    equipment_name TEXT NOT NULL,
    equipment_class manufacturing.equipment_class NOT NULL,
    manufacturer TEXT NOT NULL,
    model_number TEXT,
    serial_number TEXT,
    
    -- Status
    status manufacturing.equipment_status DEFAULT 'AVAILABLE',
    
    -- P&P Module Type Package (MTP)
    mtp_manifest JSONB,                        -- OPC UA MTP descriptor
    capabilities JSONB NOT NULL DEFAULT '{}',  -- What it can do
    interfaces JSONB DEFAULT '[]',             -- Communication interfaces
    
    -- Qualification Status
    iq_completed BOOLEAN DEFAULT FALSE,
    iq_date DATE,
    iq_document_ref TEXT,
    oq_completed BOOLEAN DEFAULT FALSE,
    oq_date DATE,
    oq_document_ref TEXT,
    pq_completed BOOLEAN DEFAULT FALSE,
    pq_date DATE,
    pq_document_ref TEXT,
    
    -- Calibration
    calibration_status TEXT DEFAULT 'VALID',
    last_calibration_date DATE,
    next_calibration_due DATE,
    calibration_certificate_ref TEXT,
    
    -- Maintenance
    last_maintenance_date DATE,
    next_maintenance_due DATE,
    maintenance_log JSONB DEFAULT '[]',
    
    -- Location
    facility_id UUID,
    building TEXT,
    room TEXT,
    clean_room_class TEXT,                     -- 'ISO 5', 'ISO 7', etc.
    
    -- FHIR Representation
    fhir_device_resource JSONB,                -- FHIR Device resource
    
    -- Organization
    org_id UUID REFERENCES identity.organizations(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_equipment_registry_class ON manufacturing.equipment_registry(equipment_class);
CREATE INDEX idx_equipment_registry_status ON manufacturing.equipment_registry(status);
CREATE INDEX idx_equipment_registry_calibration ON manufacturing.equipment_registry(next_calibration_due) 
    WHERE status != 'DECOMMISSIONED';
CREATE INDEX idx_equipment_registry_org ON manufacturing.equipment_registry(org_id);

-- GIN index on capabilities for queries
CREATE INDEX idx_equipment_registry_capabilities ON manufacturing.equipment_registry 
    USING GIN (capabilities jsonb_path_ops);

-- =============================================================================
-- 4. BATCH EXECUTION RECORDS
-- =============================================================================
-- Production performance from MES, mapped to FHIR Task/Provenance

CREATE TYPE manufacturing.batch_status AS ENUM (
    'SCHEDULED',
    'IN_PROGRESS',
    'PAUSED',
    'COMPLETED',
    'RELEASED',
    'REJECTED',
    'QUARANTINE'
);

CREATE TABLE manufacturing.batch_execution_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch Identity
    batch_number TEXT NOT NULL UNIQUE,
    product_id UUID REFERENCES product_master.products(id),
    product_name TEXT NOT NULL,
    
    -- Recipe/Process
    master_batch_record_ref TEXT,              -- Reference to MBR
    recipe_id TEXT,                            -- MES recipe ID
    recipe_version TEXT,
    
    -- Status
    status manufacturing.batch_status DEFAULT 'SCHEDULED',
    
    -- Timing
    scheduled_start TIMESTAMPTZ,
    actual_start TIMESTAMPTZ,
    scheduled_end TIMESTAMPTZ,
    actual_end TIMESTAMPTZ,
    
    -- Quantities
    planned_quantity NUMERIC(15, 4),
    actual_quantity NUMERIC(15, 4),
    quantity_unit TEXT,                        -- 'kg', 'L', 'units'
    yield_percentage NUMERIC(5, 2),
    
    -- Equipment Used
    equipment_ids UUID[],                      -- References to equipment_registry
    
    -- Process Parameters (from MES)
    process_parameters JSONB DEFAULT '{}',     -- Captured parameters
    critical_process_parameters JSONB DEFAULT '{}', -- CPPs
    
    -- In-Process Controls
    ipc_results JSONB DEFAULT '[]',            -- In-process control tests
    
    -- Quality
    quality_status TEXT DEFAULT 'PENDING',     -- 'PENDING', 'PASS', 'FAIL', 'DEVIATION'
    deviations JSONB DEFAULT '[]',
    deviation_count INT DEFAULT 0,
    
    -- Release
    released_by UUID REFERENCES identity.users(id),
    released_at TIMESTAMPTZ,
    release_method TEXT,                       -- 'TRADITIONAL', 'RTRT', 'PARAMETRIC'
    
    -- FHIR Representation
    fhir_task_resource JSONB,                  -- FHIR Task
    fhir_provenance_resource JSONB,            -- FHIR Provenance (chain of custody)
    
    -- Organization
    org_id UUID REFERENCES identity.organizations(id),
    facility_id UUID,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_batch_execution_product ON manufacturing.batch_execution_records(product_id);
CREATE INDEX idx_batch_execution_status ON manufacturing.batch_execution_records(status);
CREATE INDEX idx_batch_execution_dates ON manufacturing.batch_execution_records(actual_start, actual_end);
CREATE INDEX idx_batch_execution_quality ON manufacturing.batch_execution_records(quality_status);
CREATE INDEX idx_batch_execution_org ON manufacturing.batch_execution_records(org_id);

-- GIN index on process parameters
CREATE INDEX idx_batch_execution_params ON manufacturing.batch_execution_records 
    USING GIN (process_parameters jsonb_path_ops);

-- =============================================================================
-- 5. QUALITY TEST RESULTS (LIMS Integration)
-- =============================================================================
-- Maps to FHIR Observation with ObservationDefinition specs

CREATE TYPE manufacturing.test_status AS ENUM (
    'PENDING',
    'IN_PROGRESS',
    'COMPLETED',
    'REVIEWED',
    'APPROVED',
    'REJECTED',
    'INVALIDATED'
);

CREATE TYPE manufacturing.result_disposition AS ENUM (
    'PASS',
    'FAIL',
    'OOS',                         -- Out of Specification
    'OOT',                         -- Out of Trend
    'ATYPICAL',
    'PENDING'
);

CREATE TABLE manufacturing.quality_test_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Sample Identity
    sample_id TEXT NOT NULL,
    sample_type TEXT NOT NULL,                 -- 'IPC', 'RELEASE', 'STABILITY'
    sample_point TEXT,                         -- Where sample was taken
    
    -- Link to Batch
    batch_id UUID REFERENCES manufacturing.batch_execution_records(id),
    batch_number TEXT,
    
    -- Test Identity
    test_code TEXT NOT NULL,                   -- 'ASSAY', 'pH', 'DISSOLUTION'
    test_name TEXT NOT NULL,
    test_method TEXT,                          -- 'USP <621>'
    test_method_version TEXT,
    
    -- Status
    status manufacturing.test_status DEFAULT 'PENDING',
    
    -- Result
    result_value NUMERIC,
    result_string TEXT,                        -- For qualitative results
    result_unit TEXT,
    result_date TIMESTAMPTZ,
    
    -- Specification (from ObservationDefinition)
    spec_lower_limit NUMERIC,
    spec_upper_limit NUMERIC,
    spec_target_value NUMERIC,
    spec_context TEXT,                         -- 'RELEASE', 'SHELF_LIFE'
    
    -- Disposition
    disposition manufacturing.result_disposition DEFAULT 'PENDING',
    oos_investigation_ref TEXT,                -- OOS investigation if applicable
    
    -- Equipment/Instrument
    instrument_id UUID REFERENCES manufacturing.equipment_registry(id),
    instrument_name TEXT,
    
    -- Analyst
    performed_by TEXT,
    performed_at TIMESTAMPTZ,
    reviewed_by UUID REFERENCES identity.users(id),
    reviewed_at TIMESTAMPTZ,
    approved_by UUID REFERENCES identity.users(id),
    approved_at TIMESTAMPTZ,
    
    -- FHIR Representation
    fhir_observation_resource JSONB,           -- FHIR Observation
    
    -- Organization
    org_id UUID REFERENCES identity.organizations(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quality_tests_batch ON manufacturing.quality_test_results(batch_id);
CREATE INDEX idx_quality_tests_test ON manufacturing.quality_test_results(test_code);
CREATE INDEX idx_quality_tests_status ON manufacturing.quality_test_results(status);
CREATE INDEX idx_quality_tests_disposition ON manufacturing.quality_test_results(disposition);
CREATE INDEX idx_quality_tests_oos ON manufacturing.quality_test_results(batch_id) 
    WHERE disposition = 'OOS';

-- =============================================================================
-- 6. DIGITAL TWINS
-- =============================================================================
-- Models for predictive/simulation-based manufacturing

CREATE TYPE manufacturing.twin_type AS ENUM (
    'PROCESS',                     -- Process simulation
    'EQUIPMENT',                   -- Equipment model
    'BATCH',                       -- Batch-specific twin
    'FACILITY',                    -- Entire facility
    'PRODUCT'                      -- Product-level twin
);

CREATE TYPE manufacturing.twin_status AS ENUM (
    'TRAINING',                    -- Model being trained
    'VALIDATING',                  -- Under validation
    'VALIDATED',                   -- Approved for use
    'ACTIVE',                      -- In production use
    'DRIFTED',                     -- Needs retraining
    'SUSPENDED',                   -- Temporarily disabled
    'DEPRECATED'                   -- Replaced
);

CREATE TABLE manufacturing.digital_twins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    twin_code TEXT NOT NULL UNIQUE,            -- 'PROC_TWIN_FERM_001'
    twin_name TEXT NOT NULL,
    twin_type manufacturing.twin_type NOT NULL,
    version_number TEXT NOT NULL DEFAULT '1.0.0',
    
    -- Status
    status manufacturing.twin_status DEFAULT 'TRAINING',
    
    -- Target Entity
    target_product_id UUID REFERENCES product_master.products(id),
    target_equipment_id UUID REFERENCES manufacturing.equipment_registry(id),
    target_process_segment TEXT,
    
    -- Model Definition
    model_framework TEXT NOT NULL,             -- 'PBPK', 'CFD', 'NEURAL_NETWORK'
    model_architecture JSONB,                  -- Model structure
    model_parameters JSONB,                    -- Trained parameters
    model_artifact_ref TEXT,                   -- Link to serialized model
    
    -- Training Data
    training_data_source TEXT,                 -- Where data came from
    training_batch_count INT,                  -- Batches used for training
    training_date_range_start DATE,
    training_date_range_end DATE,
    training_metrics JSONB,                    -- Loss, accuracy, etc.
    
    -- Validation
    validation_protocol_ref TEXT,
    validation_date DATE,
    validation_results JSONB,
    validation_accuracy NUMERIC(5, 4),         -- 0-1
    validated_by UUID REFERENCES identity.users(id),
    
    -- Performance Monitoring
    drift_detection_enabled BOOLEAN DEFAULT TRUE,
    drift_threshold NUMERIC(5, 4) DEFAULT 0.05,
    last_drift_check TIMESTAMPTZ,
    current_drift_score NUMERIC(5, 4),
    
    -- Inputs/Outputs
    input_parameters TEXT[],                   -- What the model takes
    output_predictions TEXT[],                 -- What it predicts (CQAs)
    
    -- Regulatory
    regulatory_approved BOOLEAN DEFAULT FALSE,
    regulatory_approval_ref TEXT,
    intended_use TEXT,                         -- 'RTRT', 'PAT', 'PROCESS_OPTIMIZATION'
    
    -- Organization
    org_id UUID REFERENCES identity.organizations(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_digital_twins_type ON manufacturing.digital_twins(twin_type);
CREATE INDEX idx_digital_twins_status ON manufacturing.digital_twins(status);
CREATE INDEX idx_digital_twins_product ON manufacturing.digital_twins(target_product_id);
CREATE INDEX idx_digital_twins_drifted ON manufacturing.digital_twins(status) 
    WHERE status = 'DRIFTED';

-- =============================================================================
-- 7. REAL-TIME RELEASE TESTING (RTRT) PREDICTIONS
-- =============================================================================
-- Digital Twin predictions used for batch release

CREATE TYPE manufacturing.rtrt_status AS ENUM (
    'PREDICTED',                   -- Model made prediction
    'PENDING_REVIEW',              -- Awaiting human review
    'APPROVED',                    -- Accepted for release
    'REJECTED',                    -- Rejected, use traditional
    'CONFIRMED',                   -- Confirmed by lab test
    'INVALIDATED'                  -- Prediction was wrong
);

CREATE TABLE manufacturing.rtrt_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Batch
    batch_id UUID NOT NULL REFERENCES manufacturing.batch_execution_records(id),
    batch_number TEXT NOT NULL,
    
    -- Digital Twin Used
    twin_id UUID NOT NULL REFERENCES manufacturing.digital_twins(id),
    twin_version TEXT NOT NULL,
    
    -- Prediction
    predicted_attribute TEXT NOT NULL,         -- 'DISSOLUTION', 'ASSAY'
    predicted_value NUMERIC NOT NULL,
    prediction_unit TEXT,
    prediction_confidence NUMERIC(5, 4),       -- 0-1 confidence
    prediction_interval_low NUMERIC,           -- 95% CI lower
    prediction_interval_high NUMERIC,          -- 95% CI upper
    
    -- Input Data
    input_parameters JSONB NOT NULL,           -- What was fed to the model
    input_timestamp TIMESTAMPTZ,               -- When inputs were captured
    
    -- Specification Check
    spec_lower NUMERIC,
    spec_upper NUMERIC,
    passes_specification BOOLEAN,
    
    -- Status
    status manufacturing.rtrt_status DEFAULT 'PREDICTED',
    
    -- Review
    reviewed_by UUID REFERENCES identity.users(id),
    reviewed_at TIMESTAMPTZ,
    review_decision TEXT,
    review_notes TEXT,
    
    -- Confirmation (optional lab verification)
    confirmed_by_test_id UUID REFERENCES manufacturing.quality_test_results(id),
    actual_value NUMERIC,
    prediction_error NUMERIC,                  -- Absolute error
    prediction_error_pct NUMERIC(5, 2),        -- Percentage error
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_rtrt_predictions_batch ON manufacturing.rtrt_predictions(batch_id);
CREATE INDEX idx_rtrt_predictions_twin ON manufacturing.rtrt_predictions(twin_id);
CREATE INDEX idx_rtrt_predictions_status ON manufacturing.rtrt_predictions(status);
CREATE INDEX idx_rtrt_predictions_pending ON manufacturing.rtrt_predictions(batch_id) 
    WHERE status = 'PENDING_REVIEW';

-- =============================================================================
-- 8. HELPER FUNCTIONS
-- =============================================================================

-- Auto-register equipment via P&P handshake
CREATE OR REPLACE FUNCTION manufacturing.register_equipment_pnp(
    p_equipment_code TEXT,
    p_mtp_manifest JSONB,
    p_org_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_equipment_id UUID;
    v_equipment_name TEXT;
    v_equipment_class manufacturing.equipment_class;
    v_manufacturer TEXT;
    v_capabilities JSONB;
BEGIN
    -- Extract from MTP manifest
    v_equipment_name := p_mtp_manifest->>'deviceName';
    v_manufacturer := p_mtp_manifest->>'manufacturer';
    v_capabilities := p_mtp_manifest->'capabilities';
    
    -- Determine class from MTP
    v_equipment_class := CASE 
        WHEN p_mtp_manifest->>'deviceType' ILIKE '%reactor%' THEN 'BIOREACTOR'
        WHEN p_mtp_manifest->>'deviceType' ILIKE '%chrom%' THEN 'CHROMATOGRAPHY'
        WHEN p_mtp_manifest->>'deviceType' ILIKE '%filter%' THEN 'FILTRATION'
        WHEN p_mtp_manifest->>'deviceType' ILIKE '%analyt%' THEN 'ANALYTICAL'
        ELSE 'UTILITY'
    END;
    
    -- Insert or update
    INSERT INTO manufacturing.equipment_registry (
        equipment_code, equipment_name, equipment_class,
        manufacturer, mtp_manifest, capabilities,
        org_id, status
    ) VALUES (
        p_equipment_code, v_equipment_name, v_equipment_class,
        v_manufacturer, p_mtp_manifest, v_capabilities,
        p_org_id, 'AVAILABLE'
    )
    ON CONFLICT (equipment_code) DO UPDATE SET
        mtp_manifest = p_mtp_manifest,
        capabilities = v_capabilities,
        updated_at = NOW()
    RETURNING id INTO v_equipment_id;
    
    RETURN v_equipment_id;
END;
$$;

-- Check digital twin drift
CREATE OR REPLACE FUNCTION manufacturing.check_twin_drift(
    p_twin_id UUID
)
RETURNS TABLE (
    twin_id UUID,
    twin_code TEXT,
    drift_score NUMERIC,
    needs_retraining BOOLEAN,
    prediction_count INT,
    avg_error_pct NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_drift_threshold NUMERIC;
BEGIN
    SELECT drift_threshold INTO v_drift_threshold
    FROM manufacturing.digital_twins
    WHERE id = p_twin_id;
    
    RETURN QUERY
    WITH recent_predictions AS (
        SELECT 
            rp.twin_id,
            rp.prediction_error_pct
        FROM manufacturing.rtrt_predictions rp
        WHERE rp.twin_id = p_twin_id
          AND rp.actual_value IS NOT NULL
          AND rp.created_at > NOW() - INTERVAL '30 days'
    )
    SELECT 
        dt.id AS twin_id,
        dt.twin_code,
        COALESCE(AVG(ABS(rp.prediction_error_pct)) / 100, 0)::NUMERIC AS drift_score,
        (COALESCE(AVG(ABS(rp.prediction_error_pct)) / 100, 0) > v_drift_threshold) AS needs_retraining,
        COUNT(rp.*)::INT AS prediction_count,
        COALESCE(AVG(rp.prediction_error_pct), 0)::NUMERIC AS avg_error_pct
    FROM manufacturing.digital_twins dt
    LEFT JOIN recent_predictions rp ON dt.id = rp.twin_id
    WHERE dt.id = p_twin_id
    GROUP BY dt.id, dt.twin_code;
END;
$$;

-- Generate FHIR Observation from test result
CREATE OR REPLACE FUNCTION manufacturing.test_result_to_fhir(
    p_test_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_test manufacturing.quality_test_results;
    v_fhir JSONB;
BEGIN
    SELECT * INTO v_test
    FROM manufacturing.quality_test_results
    WHERE id = p_test_id;
    
    IF v_test IS NULL THEN
        RETURN NULL;
    END IF;
    
    v_fhir := jsonb_build_object(
        'resourceType', 'Observation',
        'id', v_test.id::TEXT,
        'status', CASE v_test.status
            WHEN 'APPROVED' THEN 'final'
            WHEN 'COMPLETED' THEN 'preliminary'
            ELSE 'registered'
        END,
        'category', jsonb_build_array(
            jsonb_build_object(
                'coding', jsonb_build_array(
                    jsonb_build_object(
                        'system', 'http://terminology.hl7.org/CodeSystem/observation-category',
                        'code', 'laboratory'
                    )
                )
            )
        ),
        'code', jsonb_build_object(
            'coding', jsonb_build_array(
                jsonb_build_object(
                    'system', 'http://hl7.org/fhir/uv/pq-cmc/CodeSystem/test-code',
                    'code', v_test.test_code,
                    'display', v_test.test_name
                )
            )
        ),
        'effectiveDateTime', v_test.result_date,
        'valueQuantity', CASE WHEN v_test.result_value IS NOT NULL THEN
            jsonb_build_object(
                'value', v_test.result_value,
                'unit', v_test.result_unit
            )
        ELSE NULL END,
        'interpretation', jsonb_build_array(
            jsonb_build_object(
                'coding', jsonb_build_array(
                    jsonb_build_object(
                        'system', 'http://terminology.hl7.org/CodeSystem/v3-ObservationInterpretation',
                        'code', CASE v_test.disposition
                            WHEN 'PASS' THEN 'N'
                            WHEN 'FAIL' THEN 'A'
                            WHEN 'OOS' THEN 'AA'
                            ELSE 'U'
                        END
                    )
                )
            )
        ),
        'referenceRange', jsonb_build_array(
            jsonb_build_object(
                'low', CASE WHEN v_test.spec_lower_limit IS NOT NULL THEN
                    jsonb_build_object('value', v_test.spec_lower_limit, 'unit', v_test.result_unit)
                ELSE NULL END,
                'high', CASE WHEN v_test.spec_upper_limit IS NOT NULL THEN
                    jsonb_build_object('value', v_test.spec_upper_limit, 'unit', v_test.result_unit)
                ELSE NULL END
            )
        )
    );
    
    RETURN v_fhir;
END;
$$;

-- =============================================================================
-- 9. VIEWS
-- =============================================================================

-- Equipment requiring attention
CREATE OR REPLACE VIEW manufacturing.equipment_attention_required AS
SELECT 
    er.id,
    er.equipment_code,
    er.equipment_name,
    er.equipment_class,
    er.status,
    er.calibration_status,
    er.next_calibration_due,
    er.next_maintenance_due,
    CASE 
        WHEN er.next_calibration_due < CURRENT_DATE THEN 'CALIBRATION_OVERDUE'
        WHEN er.next_calibration_due <= CURRENT_DATE + INTERVAL '7 days' THEN 'CALIBRATION_DUE_SOON'
        WHEN er.next_maintenance_due < CURRENT_DATE THEN 'MAINTENANCE_OVERDUE'
        WHEN er.next_maintenance_due <= CURRENT_DATE + INTERVAL '7 days' THEN 'MAINTENANCE_DUE_SOON'
        ELSE 'OK'
    END AS attention_reason
FROM manufacturing.equipment_registry er
WHERE er.status NOT IN ('DECOMMISSIONED', 'OUT_OF_SERVICE')
  AND (
    er.next_calibration_due <= CURRENT_DATE + INTERVAL '7 days'
    OR er.next_maintenance_due <= CURRENT_DATE + INTERVAL '7 days'
  )
ORDER BY LEAST(er.next_calibration_due, er.next_maintenance_due);

-- Batch quality dashboard
CREATE OR REPLACE VIEW manufacturing.batch_quality_dashboard AS
SELECT 
    ber.id AS batch_id,
    ber.batch_number,
    ber.product_name,
    ber.status,
    ber.actual_start,
    ber.actual_end,
    ber.yield_percentage,
    ber.quality_status,
    ber.deviation_count,
    COUNT(qtr.id) AS test_count,
    COUNT(qtr.id) FILTER (WHERE qtr.disposition = 'PASS') AS pass_count,
    COUNT(qtr.id) FILTER (WHERE qtr.disposition IN ('FAIL', 'OOS')) AS fail_count,
    ROUND(
        COUNT(qtr.id) FILTER (WHERE qtr.disposition = 'PASS')::NUMERIC / 
        NULLIF(COUNT(qtr.id), 0) * 100, 2
    ) AS pass_rate
FROM manufacturing.batch_execution_records ber
LEFT JOIN manufacturing.quality_test_results qtr ON ber.id = qtr.batch_id
GROUP BY ber.id
ORDER BY ber.actual_start DESC NULLS LAST;

-- Digital twin performance
CREATE OR REPLACE VIEW manufacturing.twin_performance AS
SELECT 
    dt.id AS twin_id,
    dt.twin_code,
    dt.twin_name,
    dt.twin_type,
    dt.status,
    dt.validation_accuracy,
    COUNT(rp.id) AS total_predictions,
    COUNT(rp.id) FILTER (WHERE rp.actual_value IS NOT NULL) AS confirmed_predictions,
    AVG(ABS(rp.prediction_error_pct)) AS avg_error_pct,
    MAX(rp.created_at) AS last_prediction
FROM manufacturing.digital_twins dt
LEFT JOIN manufacturing.rtrt_predictions rp ON dt.id = rp.twin_id
GROUP BY dt.id
ORDER BY dt.status, dt.twin_code;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

/*
-- Check schema and tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'manufacturing';

-- Check enum types
SELECT typname FROM pg_type WHERE typnamespace = 'manufacturing'::regnamespace;

-- Test P&P registration
SELECT manufacturing.register_equipment_pnp(
    'TEST-REACTOR-001',
    '{"deviceName": "BioReactor 5000", "deviceType": "bioreactor", "manufacturer": "Sartorius"}'::JSONB,
    NULL
);
*/
