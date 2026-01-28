-- =============================================================================
-- Migration 067: Federated Learning & Regulatory Intelligence
-- =============================================================================
-- Purpose: MELLODDY-style federated ML, pharmacovigilance, KASA/PMDA intelligence
-- Supports: Privacy-preserving federation, differential privacy, horizon scanning
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE FEDERATED ML SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS federated_ml;

COMMENT ON SCHEMA federated_ml IS 
'Privacy-preserving federated learning infrastructure for cross-organization collaboration';

-- =============================================================================
-- 2. FEDERATED MODEL DEFINITIONS
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'federated_ml' AND t.typname = 'model_type'
    ) THEN
        CREATE TYPE federated_ml.model_type AS ENUM (
            'TOXICITY_PREDICTION',         -- MELLODDY-style QSAR
            'SAFETY_SIGNAL_DETECTION',     -- Pharmacovigilance
            'ADVERSE_EVENT_PREDICTION',    -- AE prediction
            'DRUG_INTERACTION',            -- DDI prediction
            'COUNTERFEIT_DETECTION',       -- Supply chain
            'QUALITY_PREDICTION',          -- Manufacturing quality
            'BIOMARKER_DISCOVERY',         -- Clinical biomarkers
            'PATIENT_STRATIFICATION'       -- Clinical trial enrollment
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'federated_ml' AND t.typname = 'model_status'
    ) THEN
        CREATE TYPE federated_ml.model_status AS ENUM (
            'INITIALIZING',
            'TRAINING',
            'AGGREGATING',
            'ACTIVE',
            'PAUSED',
            'FAILED',
            'ARCHIVED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS federated_ml.federated_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    model_code TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    model_type federated_ml.model_type NOT NULL,
    version_number TEXT NOT NULL DEFAULT '1.0.0',
    
    -- Status
    status federated_ml.model_status DEFAULT 'INITIALIZING',
    
    -- Architecture
    architecture_type TEXT NOT NULL,           -- 'NEURAL_NETWORK', 'GRADIENT_BOOSTING'
    architecture_config JSONB NOT NULL,        -- Layer sizes, hyperparameters
    
    -- Federation Config
    aggregation_method TEXT NOT NULL,          -- 'FedAvg', 'FedProx', 'SecureAggregation'
    min_participants INT NOT NULL DEFAULT 3,   -- Minimum nodes for privacy
    communication_rounds INT DEFAULT 100,
    local_epochs_per_round INT DEFAULT 5,
    
    -- Privacy Settings
    differential_privacy_enabled BOOLEAN DEFAULT TRUE,
    epsilon_budget NUMERIC(6, 4) DEFAULT 8.0,  -- Total DP budget
    epsilon_consumed NUMERIC(6, 4) DEFAULT 0,
    delta_parameter NUMERIC(12, 10) DEFAULT 0.00001,
    noise_multiplier NUMERIC(6, 4) DEFAULT 1.1,
    clipping_norm NUMERIC(6, 4) DEFAULT 1.0,
    
    -- Secure Aggregation
    secure_aggregation_enabled BOOLEAN DEFAULT TRUE,
    mpc_protocol TEXT,                         -- 'SPDZ', 'ABY3'
    encryption_scheme TEXT,                    -- 'Paillier', 'BFV'
    
    -- Training Progress
    current_round INT DEFAULT 0,
    total_rounds INT,
    last_round_completed_at TIMESTAMPTZ,
    
    -- Performance Metrics
    global_model_metrics JSONB DEFAULT '{}',   -- AUC, F1, etc.
    validation_metrics JSONB DEFAULT '{}',
    
    -- Model Artifacts
    global_model_weights_ref TEXT,             -- Encrypted model storage
    model_hash TEXT,                           -- Integrity verification
    
    -- Governance
    data_usage_agreement_ref TEXT,             -- Legal agreement
    ethics_approval_ref TEXT,
    
    -- Coordinator
    coordinator_org_id UUID REFERENCES identity.organizations(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_federated_models_type ON federated_ml.federated_models(model_type);
CREATE INDEX IF NOT EXISTS idx_federated_models_status ON federated_ml.federated_models(status);

-- =============================================================================
-- 3. FEDERATION PARTICIPANTS (Local Nodes)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'federated_ml' AND t.typname = 'participant_status'
    ) THEN
        CREATE TYPE federated_ml.participant_status AS ENUM (
            'INVITED',
            'ONBOARDING',
            'ACTIVE',
            'PAUSED',
            'WITHDRAWN',
            'EXCLUDED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS federated_ml.federation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Model Membership
    model_id UUID NOT NULL REFERENCES federated_ml.federated_models(id) ON DELETE CASCADE,
    
    -- Participant Identity
    org_id UUID NOT NULL REFERENCES identity.organizations(id),
    participant_alias TEXT NOT NULL,           -- Anonymized identifier
    
    -- Status
    status federated_ml.participant_status DEFAULT 'INVITED',
    joined_at TIMESTAMPTZ,
    
    -- Local Data Info (Aggregated, not raw)
    local_sample_count INT,                    -- Rough count, not exact
    data_quality_score NUMERIC(5, 4),          -- 0-1
    feature_coverage JSONB,                    -- Which features available
    
    -- Privacy Budget
    local_epsilon_consumed NUMERIC(6, 4) DEFAULT 0,
    local_epsilon_limit NUMERIC(6, 4),
    
    -- Contribution Metrics
    rounds_participated INT DEFAULT 0,
    last_contribution_at TIMESTAMPTZ,
    contribution_quality_score NUMERIC(5, 4),  -- Gradient quality
    
    -- Technical Setup
    node_endpoint TEXT,                        -- gRPC endpoint for federation
    node_public_key TEXT,                      -- For secure aggregation
    node_version TEXT,                         -- Software version
    
    -- Compliance
    data_processing_agreement_signed BOOLEAN DEFAULT FALSE,
    ethics_approved BOOLEAN DEFAULT FALSE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT unique_participant_per_model UNIQUE (model_id, org_id)
);

CREATE INDEX IF NOT EXISTS idx_federation_participants_model ON federated_ml.federation_participants(model_id);
CREATE INDEX IF NOT EXISTS idx_federation_participants_org ON federated_ml.federation_participants(org_id);
CREATE INDEX IF NOT EXISTS idx_federation_participants_status ON federated_ml.federation_participants(status);

-- =============================================================================
-- 4. GRADIENT UPDATES (Secure Aggregation Records)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'federated_ml' AND t.typname = 'gradient_status'
    ) THEN
        CREATE TYPE federated_ml.gradient_status AS ENUM (
            'SUBMITTED',                   -- Received from node
            'VALIDATED',                   -- Passed integrity checks
            'AGGREGATED',                  -- Included in global update
            'REJECTED',                    -- Failed validation
            'EXPIRED'                      -- Timed out
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS federated_ml.gradient_updates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    model_id UUID NOT NULL REFERENCES federated_ml.federated_models(id),
    participant_id UUID NOT NULL REFERENCES federated_ml.federation_participants(id),
    training_round INT NOT NULL,
    
    -- Status
    status federated_ml.gradient_status DEFAULT 'SUBMITTED',
    
    -- Gradient Info (Encrypted/Secured)
    gradient_hash TEXT NOT NULL,               -- Commitment scheme
    gradient_size_bytes BIGINT,
    gradient_storage_ref TEXT,                 -- Encrypted storage location
    
    -- Privacy Accounting
    epsilon_consumed NUMERIC(6, 4),
    noise_added BOOLEAN DEFAULT TRUE,
    
    -- Validation
    integrity_verified BOOLEAN,
    gradient_norm NUMERIC(10, 6),              -- For clipping verification
    outlier_score NUMERIC(5, 4),               -- Byzantine detection
    
    -- Timing
    submitted_at TIMESTAMPTZ DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    aggregated_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_gradient_updates_model ON federated_ml.gradient_updates(model_id, training_round);
CREATE INDEX IF NOT EXISTS idx_gradient_updates_participant ON federated_ml.gradient_updates(participant_id);
CREATE INDEX IF NOT EXISTS idx_gradient_updates_status ON federated_ml.gradient_updates(status);

-- =============================================================================
-- 5. PRIVACY BUDGET LEDGER
-- =============================================================================
-- Tracks differential privacy budget consumption

CREATE TABLE IF NOT EXISTS federated_ml.privacy_budget_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scope
    model_id UUID NOT NULL REFERENCES federated_ml.federated_models(id),
    participant_id UUID REFERENCES federated_ml.federation_participants(id),
    
    -- Transaction
    operation TEXT NOT NULL,                   -- 'TRAINING_ROUND', 'QUERY', 'VALIDATION'
    round_number INT,
    
    -- Budget Change
    epsilon_consumed NUMERIC(6, 4) NOT NULL,
    delta_consumed NUMERIC(12, 10),
    
    -- Running Totals
    epsilon_balance_after NUMERIC(6, 4) NOT NULL,
    delta_balance_after NUMERIC(12, 10),
    
    -- Audit
    justification TEXT,
    authorized_by UUID REFERENCES identity.users(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_privacy_budget_model ON federated_ml.privacy_budget_ledger(model_id);
CREATE INDEX IF NOT EXISTS idx_privacy_budget_participant ON federated_ml.privacy_budget_ledger(participant_id);
CREATE INDEX IF NOT EXISTS idx_privacy_budget_time ON federated_ml.privacy_budget_ledger(created_at DESC);

-- =============================================================================
-- 6. SAFETY SIGNALS (Pharmacovigilance)
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'federated_ml' AND t.typname = 'signal_severity'
    ) THEN
        CREATE TYPE federated_ml.signal_severity AS ENUM (
            'LOW',
            'MEDIUM',
            'HIGH',
            'CRITICAL'
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_type t
        JOIN pg_namespace n ON n.oid = t.typnamespace
        WHERE n.nspname = 'federated_ml' AND t.typname = 'signal_status'
    ) THEN
        CREATE TYPE federated_ml.signal_status AS ENUM (
            'DETECTED',
            'UNDER_REVIEW',
            'CONFIRMED',
            'REFUTED',
            'ACTION_TAKEN',
            'CLOSED'
        );
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS federated_ml.safety_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Detection Source
    detected_by_model_id UUID REFERENCES federated_ml.federated_models(id),
    detection_method TEXT NOT NULL,            -- 'FEDERATED_ML', 'DISPROPORTIONALITY', 'NLP'
    
    -- Signal Details
    signal_code TEXT NOT NULL,
    signal_name TEXT NOT NULL,
    signal_description TEXT,
    
    -- Drug/Product
    product_id UUID REFERENCES product_master.products(id),
    product_name TEXT,
    active_substance TEXT,
    
    -- Adverse Event
    meddra_pt_code TEXT,                       -- MedDRA Preferred Term
    meddra_pt_name TEXT,
    meddra_soc_code TEXT,                      -- System Organ Class
    meddra_soc_name TEXT,
    
    -- Severity & Status
    severity federated_ml.signal_severity NOT NULL,
    status federated_ml.signal_status DEFAULT 'DETECTED',
    
    -- Statistical Evidence
    proportional_reporting_ratio NUMERIC(8, 4),
    reporting_odds_ratio NUMERIC(8, 4),
    ic_025 NUMERIC(8, 4),                      -- Information Component lower bound
    ebgm NUMERIC(8, 4),                        -- Empirical Bayesian Geometric Mean
    case_count INT,
    expected_count NUMERIC(10, 4),
    
    -- ML Evidence (if detected by model)
    ml_confidence_score NUMERIC(5, 4),
    ml_feature_importance JSONB,
    
    -- Timing
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    earliest_case_date DATE,
    
    -- Review
    assigned_to UUID REFERENCES identity.users(id),
    review_deadline DATE,
    review_notes TEXT,
    
    -- Action
    action_taken TEXT,
    action_date DATE,
    regulatory_authority_notified TEXT[],      -- ['FDA', 'EMA']
    
    -- Organization
    org_id UUID REFERENCES identity.organizations(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_safety_signals_product ON federated_ml.safety_signals(product_id);
CREATE INDEX IF NOT EXISTS idx_safety_signals_status ON federated_ml.safety_signals(status);
CREATE INDEX IF NOT EXISTS idx_safety_signals_severity ON federated_ml.safety_signals(severity);
CREATE INDEX IF NOT EXISTS idx_safety_signals_meddra ON federated_ml.safety_signals(meddra_pt_code);
CREATE INDEX IF NOT EXISTS idx_safety_signals_pending ON federated_ml.safety_signals(status, review_deadline)
    WHERE status IN ('DETECTED', 'UNDER_REVIEW');

-- Full-text search on signal descriptions
CREATE INDEX IF NOT EXISTS idx_safety_signals_fts ON federated_ml.safety_signals 
    USING GIN (to_tsvector('english', signal_name || ' ' || COALESCE(signal_description, '')));

-- =============================================================================
-- 7. EXTEND AI SCHEMA: REGULATORY INTELLIGENCE
-- =============================================================================

-- Horizon Scanning (PMDA-style)
CREATE TABLE IF NOT EXISTS ai.horizon_scans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scan Identity
    scan_code TEXT NOT NULL UNIQUE,
    scan_name TEXT NOT NULL,
    scan_type TEXT NOT NULL,                   -- 'MODALITY', 'TECHNOLOGY', 'THERAPEUTIC'
    
    -- Technology/Topic
    technology_area TEXT NOT NULL,             -- 'mRNA', 'Gene Editing', 'AI/ML'
    sub_area TEXT,
    
    -- Intelligence
    trend_summary TEXT NOT NULL,
    key_developments JSONB DEFAULT '[]',       -- Array of development summaries
    patent_activity_score NUMERIC(5, 4),       -- 0-1
    publication_velocity NUMERIC(10, 4),       -- Papers per month
    clinical_trial_count INT,
    funding_estimate_usd BIGINT,
    
    -- Predictions
    predicted_first_approval_year INT,
    predicted_impact_score NUMERIC(5, 4),      -- 0-1
    regulatory_readiness_score NUMERIC(5, 4),
    
    -- Sources
    data_sources TEXT[],                       -- Patents, PubMed, ClinicalTrials.gov
    source_documents JSONB DEFAULT '[]',
    
    -- Timeline
    scan_date DATE NOT NULL,
    next_review_date DATE,
    
    -- AI Analysis
    analyzed_by_agent_id UUID REFERENCES agent_runtime.agent_definitions(id),
    analysis_confidence NUMERIC(5, 4),
    
    -- Embedding for similarity search
    embedding vector(1536),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_horizon_scans_area ON ai.horizon_scans(technology_area);
CREATE INDEX IF NOT EXISTS idx_horizon_scans_date ON ai.horizon_scans(scan_date DESC);
CREATE INDEX IF NOT EXISTS idx_horizon_scans_embedding ON ai.horizon_scans USING hnsw (embedding vector_cosine_ops);

-- Predictive Risk Models (KASA 5.0 style)
CREATE TABLE IF NOT EXISTS ai.predictive_risk_models (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Model Identity
    model_code TEXT NOT NULL UNIQUE,
    model_name TEXT NOT NULL,
    model_purpose TEXT NOT NULL,               -- 'BIOPHARMACEUTICS_RISK', 'CMC_RISK', 'CLINICAL_RISK'
    version_number TEXT NOT NULL,
    
    -- Regulatory Context
    applicable_submission_types TEXT[],        -- ['NDA', 'ANDA', 'BLA']
    applicable_product_types TEXT[],           -- ['SOLID_ORAL', 'INJECTABLE']
    
    -- Model Architecture
    model_type TEXT NOT NULL,                  -- 'PBPK', 'RANDOM_FOREST', 'NEURAL_NETWORK'
    model_config JSONB,
    feature_definitions JSONB NOT NULL,        -- Input features
    output_definitions JSONB NOT NULL,         -- Risk scores, flags
    
    -- Training
    training_data_source TEXT,
    training_sample_count INT,
    training_date DATE,
    
    -- Validation
    validation_method TEXT,                    -- 'CROSS_VALIDATION', 'HOLDOUT'
    validation_metrics JSONB,
    accuracy NUMERIC(5, 4),
    precision_score NUMERIC(5, 4),
    recall_score NUMERIC(5, 4),
    auc_roc NUMERIC(5, 4),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    regulatory_accepted BOOLEAN DEFAULT FALSE,
    acceptance_reference TEXT,                 -- FDA/EMA reference
    
    -- Usage Stats
    total_assessments INT DEFAULT 0,
    last_used_at TIMESTAMPTZ,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictive_risk_models_purpose ON ai.predictive_risk_models(model_purpose);
CREATE INDEX IF NOT EXISTS idx_predictive_risk_models_active ON ai.predictive_risk_models(is_active) WHERE is_active = TRUE;

-- Risk Assessment Results
CREATE TABLE IF NOT EXISTS ai.risk_assessments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Model Used
    model_id UUID NOT NULL REFERENCES ai.predictive_risk_models(id),
    model_version TEXT NOT NULL,
    
    -- Target
    submission_id UUID REFERENCES ectd_v4.regulatory_submissions(id),
    product_id UUID REFERENCES product_master.products(id),
    dossier_id UUID REFERENCES global_dossier.dossier_instances(id),
    
    -- Input
    input_features JSONB NOT NULL,
    
    -- Results
    overall_risk_score NUMERIC(5, 4) NOT NULL, -- 0-1
    risk_category TEXT NOT NULL,               -- 'LOW', 'MEDIUM', 'HIGH'
    component_scores JSONB DEFAULT '{}',       -- Breakdown by category
    risk_factors JSONB DEFAULT '[]',           -- Array of identified risks
    recommendations JSONB DEFAULT '[]',        -- Suggested mitigations
    
    -- Confidence
    confidence_score NUMERIC(5, 4),
    uncertainty_bounds JSONB,                  -- Lower/upper bounds
    
    -- Explanation
    explanation_text TEXT,
    feature_contributions JSONB,               -- SHAP-style explanations
    
    -- Review
    reviewed_by UUID REFERENCES identity.users(id),
    reviewed_at TIMESTAMPTZ,
    review_override TEXT,                      -- If human overrode assessment
    final_risk_category TEXT,                  -- After human review
    
    -- Agent Context
    agent_thread_id UUID REFERENCES agent_runtime.agent_threads(thread_id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_risk_assessments_model ON ai.risk_assessments(model_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_submission ON ai.risk_assessments(submission_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_product ON ai.risk_assessments(product_id);
CREATE INDEX IF NOT EXISTS idx_risk_assessments_category ON ai.risk_assessments(risk_category);

-- FHIR Validation Rules
CREATE TABLE IF NOT EXISTS ai.fhir_validation_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Rule Identity
    rule_code TEXT NOT NULL UNIQUE,
    rule_name TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    
    -- Scope
    fhir_resource_type TEXT NOT NULL,          -- 'MedicinalProductDefinition', 'SubstanceDefinition'
    fhir_profile_url TEXT,                     -- IG profile URL
    implementation_guide TEXT,                 -- 'PQ-CMC', 'SPL'
    
    -- Rule Definition
    rule_type TEXT NOT NULL,                   -- 'SCHEMA', 'BUSINESS', 'SEMANTIC'
    severity TEXT NOT NULL,                    -- 'ERROR', 'WARNING', 'INFO'
    rule_expression TEXT NOT NULL,             -- FHIRPath or custom expression
    rule_description TEXT NOT NULL,
    
    -- Regulatory Reference
    regulatory_reference TEXT,                 -- 'ICH Q3B', '21 CFR 314.50'
    
    -- Validation Logic
    validation_code TEXT,                      -- Executable validation logic
    error_message TEXT NOT NULL,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE NOT NULL,
    effective_until DATE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fhir_validation_rules_resource ON ai.fhir_validation_rules(fhir_resource_type);
CREATE INDEX IF NOT EXISTS idx_fhir_validation_rules_ig ON ai.fhir_validation_rules(implementation_guide);
CREATE INDEX IF NOT EXISTS idx_fhir_validation_rules_active ON ai.fhir_validation_rules(is_active) WHERE is_active = TRUE;

-- =============================================================================
-- 8. HELPER FUNCTIONS
-- =============================================================================

-- Check if model has sufficient privacy budget
CREATE OR REPLACE FUNCTION federated_ml.check_privacy_budget(
    p_model_id UUID,
    p_epsilon_required NUMERIC
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_epsilon_budget NUMERIC;
    v_epsilon_consumed NUMERIC;
BEGIN
    SELECT epsilon_budget, epsilon_consumed
    INTO v_epsilon_budget, v_epsilon_consumed
    FROM federated_ml.federated_models
    WHERE id = p_model_id;
    
    RETURN (v_epsilon_budget - v_epsilon_consumed) >= p_epsilon_required;
END;
$$;

-- Record privacy budget consumption
CREATE OR REPLACE FUNCTION federated_ml.consume_privacy_budget(
    p_model_id UUID,
    p_participant_id UUID,
    p_operation TEXT,
    p_epsilon NUMERIC,
    p_round_number INT DEFAULT NULL,
    p_authorized_by UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_new_balance NUMERIC;
BEGIN
    -- Check if sufficient budget
    IF NOT federated_ml.check_privacy_budget(p_model_id, p_epsilon) THEN
        RETURN FALSE;
    END IF;
    
    -- Update model's consumed budget
    UPDATE federated_ml.federated_models
    SET epsilon_consumed = epsilon_consumed + p_epsilon,
        updated_at = NOW()
    WHERE id = p_model_id
    RETURNING (epsilon_budget - epsilon_consumed) INTO v_new_balance;
    
    -- Update participant's consumed budget if applicable
    IF p_participant_id IS NOT NULL THEN
        UPDATE federated_ml.federation_participants
        SET local_epsilon_consumed = local_epsilon_consumed + p_epsilon,
            updated_at = NOW()
        WHERE id = p_participant_id;
    END IF;
    
    -- Log the transaction
    INSERT INTO federated_ml.privacy_budget_ledger (
        model_id, participant_id, operation, round_number,
        epsilon_consumed, epsilon_balance_after, authorized_by
    ) VALUES (
        p_model_id, p_participant_id, p_operation, p_round_number,
        p_epsilon, v_new_balance, p_authorized_by
    );
    
    RETURN TRUE;
END;
$$;

-- Get active safety signals for a product
CREATE OR REPLACE FUNCTION federated_ml.get_product_signals(
    p_product_id UUID
)
RETURNS TABLE (
    signal_id UUID,
    signal_name TEXT,
    severity federated_ml.signal_severity,
    status federated_ml.signal_status,
    meddra_pt_name TEXT,
    case_count INT,
    detected_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        ss.id,
        ss.signal_name,
        ss.severity,
        ss.status,
        ss.meddra_pt_name,
        ss.case_count,
        ss.detected_at
    FROM federated_ml.safety_signals ss
    WHERE ss.product_id = p_product_id
      AND ss.status NOT IN ('REFUTED', 'CLOSED')
    ORDER BY ss.severity DESC, ss.detected_at DESC;
END;
$$;

-- Similarity search on horizon scans
CREATE OR REPLACE FUNCTION ai.search_horizon_scans(
    p_query_embedding vector(1536),
    p_technology_area TEXT DEFAULT NULL,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    scan_id UUID,
    scan_name TEXT,
    technology_area TEXT,
    trend_summary TEXT,
    predicted_impact_score NUMERIC,
    similarity NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        hs.id,
        hs.scan_name,
        hs.technology_area,
        hs.trend_summary,
        hs.predicted_impact_score,
        (1 - (hs.embedding <=> p_query_embedding))::NUMERIC AS similarity
    FROM ai.horizon_scans hs
    WHERE hs.embedding IS NOT NULL
      AND (p_technology_area IS NULL OR hs.technology_area = p_technology_area)
    ORDER BY hs.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- 9. VIEWS
-- =============================================================================

-- Federation status dashboard
CREATE OR REPLACE VIEW federated_ml.federation_dashboard AS
SELECT 
    fm.id AS model_id,
    fm.model_code,
    fm.model_name,
    fm.model_type,
    fm.status,
    fm.current_round,
    fm.total_rounds,
    ROUND(fm.epsilon_consumed / NULLIF(fm.epsilon_budget, 0) * 100, 2) AS privacy_budget_used_pct,
    COUNT(fp.id) FILTER (WHERE fp.status = 'ACTIVE') AS active_participants,
    SUM(fp.local_sample_count) AS total_samples_approx,
    fm.global_model_metrics->>'auc_roc' AS current_auc,
    fm.last_round_completed_at
FROM federated_ml.federated_models fm
LEFT JOIN federated_ml.federation_participants fp ON fm.id = fp.model_id
GROUP BY fm.id
ORDER BY fm.status, fm.model_code;

-- Critical safety signals
CREATE OR REPLACE VIEW federated_ml.critical_signals AS
SELECT 
    ss.id,
    ss.signal_code,
    ss.signal_name,
    ss.product_name,
    ss.meddra_pt_name,
    ss.severity,
    ss.status,
    ss.case_count,
    ss.ml_confidence_score,
    ss.detected_at,
    ss.review_deadline,
    CASE 
        WHEN ss.review_deadline < CURRENT_DATE THEN 'OVERDUE'
        WHEN ss.review_deadline <= CURRENT_DATE + INTERVAL '3 days' THEN 'URGENT'
        ELSE 'ON_TRACK'
    END AS urgency
FROM federated_ml.safety_signals ss
WHERE ss.severity IN ('HIGH', 'CRITICAL')
  AND ss.status NOT IN ('REFUTED', 'CLOSED')
ORDER BY 
    CASE ss.severity WHEN 'CRITICAL' THEN 1 WHEN 'HIGH' THEN 2 END,
    ss.review_deadline NULLS LAST;

-- Horizon scan summary by technology area
CREATE OR REPLACE VIEW ai.horizon_scan_summary AS
SELECT 
    technology_area,
    COUNT(*) AS scan_count,
    AVG(predicted_impact_score) AS avg_impact_score,
    AVG(regulatory_readiness_score) AS avg_readiness_score,
    MIN(predicted_first_approval_year) AS earliest_predicted_approval,
    SUM(clinical_trial_count) AS total_trials,
    MAX(scan_date) AS latest_scan
FROM ai.horizon_scans
GROUP BY technology_area
ORDER BY AVG(predicted_impact_score) DESC;

-- =============================================================================
-- 10. SEED SAMPLE DATA
-- =============================================================================

-- Sample validation rules
INSERT INTO ai.fhir_validation_rules (
    rule_code, rule_name, rule_version, fhir_resource_type,
    implementation_guide, rule_type, severity,
    rule_expression, rule_description, error_message, effective_from
) VALUES 
    ('PQCMC-001', 'Product Name Required', '1.0', 'MedicinalProductDefinition',
     'PQ-CMC', 'BUSINESS', 'ERROR',
     'name.exists() and name.productName.exists()',
     'MedicinalProductDefinition must have at least one name with productName',
     'Product name is required for CMC submissions',
     CURRENT_DATE),
    
    ('PQCMC-002', 'Drug Substance Characterization', '1.0', 'SubstanceDefinition',
     'PQ-CMC', 'BUSINESS', 'WARNING',
     'structure.exists() or molecularFormula.exists()',
     'SubstanceDefinition should include structural information',
     'Consider adding molecular structure or formula',
     CURRENT_DATE),
    
    ('PQCMC-003', 'Batch Formula Completeness', '1.0', 'Ingredient',
     'PQ-CMC', 'SCHEMA', 'ERROR',
     'substance.exists() and strength.exists()',
     'Each ingredient must specify substance and strength',
     'Ingredient missing substance or strength information',
     CURRENT_DATE),
    
    ('SPL-001', 'NDC Format Validation', '1.0', 'MedicinalProductDefinition',
     'SPL', 'BUSINESS', 'ERROR',
     'identifier.where(system=''http://hl7.org/fhir/sid/ndc'').value.matches(''[0-9]{4,5}-[0-9]{3,4}-[0-9]{1,2}'')',
     'NDC must follow FDA format (XXXXX-XXXX-XX or similar)',
     'Invalid NDC format',
     CURRENT_DATE)
ON CONFLICT (rule_code) DO NOTHING;

-- Sample predictive risk model definition
INSERT INTO ai.predictive_risk_models (
    model_code, model_name, model_purpose, version_number,
    applicable_submission_types, applicable_product_types,
    model_type, feature_definitions, output_definitions,
    is_active
) VALUES 
    ('KASA_BCS_RISK', 'KASA Biopharmaceutics Classification Risk', 'BIOPHARMACEUTICS_RISK', '1.0',
     ARRAY['ANDA', 'NDA', '505B2'],
     ARRAY['SOLID_ORAL'],
     'RANDOM_FOREST',
     '[{"name": "bcs_class", "type": "categorical"}, {"name": "dissolution_f2", "type": "numeric"}, {"name": "api_solubility", "type": "numeric"}]'::JSONB,
     '[{"name": "bioequivalence_risk", "type": "score"}, {"name": "dissolution_risk", "type": "category"}]'::JSONB,
     TRUE)
ON CONFLICT (model_code) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

/*
-- Check schemas and tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'federated_ml';
SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai';

-- Check privacy budget function
SELECT federated_ml.check_privacy_budget('model-uuid', 1.0);

-- Check validation rules
SELECT rule_code, rule_name, severity FROM ai.fhir_validation_rules;

-- Check predictive models
SELECT model_code, model_purpose, is_active FROM ai.predictive_risk_models;
*/
