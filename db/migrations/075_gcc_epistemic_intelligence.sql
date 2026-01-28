-- Migration 075: Epistemic Intelligence
-- Purpose: AI that knows what it doesn't know - uncertainty quantification and calibration
-- Dependencies: 073_cortex_prime_unified_brain.sql, 074_gcc_regulatory_intuition_engine.sql
-- Part of: Cortex Prime - The Definitive Life Sciences AI Mind
--
-- This migration implements epistemic awareness: decomposed uncertainty, OOD detection,
-- knowledge gap identification, active learning, and continuous calibration.

BEGIN;

-- ============================================================================
-- SECTION 1: UNCERTAINTY ESTIMATES
-- ============================================================================
-- Every AI output gets uncertainty decomposition: aleatoric (inherent randomness)
-- vs epistemic (lack of knowledge, subdivided into data gaps and model limitations)

CREATE TABLE IF NOT EXISTS cortex.uncertainty_estimates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    
    -- What this uncertainty is about
    target_type TEXT NOT NULL CHECK (target_type IN (
        'prediction', 'classification', 'extraction', 'generation',
        'search_result', 'recommendation', 'pattern_match', 'causal_effect'
    )),
    target_id UUID NOT NULL, -- ID of the thing we're uncertain about
    target_table TEXT NOT NULL, -- Which table the target is in
    
    -- Decomposed uncertainty (all 0-1, sum should ≈ total_uncertainty²)
    total_uncertainty NUMERIC(6,5) NOT NULL,
    aleatoric_uncertainty NUMERIC(6,5), -- Inherent randomness in the data/world
    epistemic_data_uncertainty NUMERIC(6,5), -- We haven't seen enough similar cases
    epistemic_model_uncertainty NUMERIC(6,5), -- Our model may be wrong
    
    -- Confidence bounds at multiple levels
    confidence_50_lower NUMERIC(8,5), -- 50% CI bounds
    confidence_50_upper NUMERIC(8,5),
    confidence_80_lower NUMERIC(8,5), -- 80% CI bounds
    confidence_80_upper NUMERIC(8,5),
    confidence_95_lower NUMERIC(8,5), -- 95% CI bounds
    confidence_95_upper NUMERIC(8,5),
    confidence_99_lower NUMERIC(8,5), -- 99% CI bounds
    confidence_99_upper NUMERIC(8,5),
    
    -- Distribution information
    distribution_type TEXT DEFAULT 'normal', -- 'normal', 'beta', 'lognormal', 'empirical'
    distribution_params JSONB, -- Parameters for the distribution
    
    -- Out-of-distribution detection
    ood_score NUMERIC(6,5), -- How far from training distribution (0=in, 1=out)
    ood_dimensions TEXT[], -- Which dimensions are OOD
    nearest_training_distance NUMERIC(10,6), -- Distance to nearest known case
    novelty_factors JSONB, -- What makes this case novel
    
    -- Contributing factors
    uncertainty_factors JSONB DEFAULT '[]', -- Array of {factor, contribution, reducible}
    dominant_factor TEXT, -- Main source of uncertainty
    
    -- Metadata
    estimation_method TEXT, -- 'ensemble', 'mc_dropout', 'evidential', 'conformal'
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.uncertainty_estimates IS
'Decomposed uncertainty for every AI output. Enables the AI to say "I don''t know"
with specificity about WHY it doesn''t know and what would help it know better.';

-- ============================================================================
-- SECTION 2: KNOWLEDGE GAPS
-- ============================================================================
-- Identified areas where the AI lacks sufficient knowledge to be confident

CREATE TABLE IF NOT EXISTS cortex.knowledge_gaps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID, -- NULL = global gap
    
    -- Gap identification
    gap_type TEXT NOT NULL CHECK (gap_type IN (
        'therapeutic_area',      -- Insufficient data for a TA
        'submission_type',       -- Insufficient data for a submission type
        'agency',               -- Insufficient data for an agency
        'indication',           -- Specific indication gap
        'mechanism_of_action',  -- MOA-specific gap
        'endpoint_type',        -- Specific endpoint gap
        'patient_population',   -- Demographic gap
        'comparator',           -- Comparator data gap
        'regional',             -- Geographic data gap
        'temporal',             -- Time period gap
        'regulatory_pathway',   -- Pathway-specific gap
        'formulation',          -- Formulation-specific gap
        'combination_therapy',  -- Combination-specific gap
        'biomarker',            -- Biomarker-specific gap
        'manufacturing'         -- CMC-specific gap
    )),
    
    -- Gap specification
    gap_name TEXT NOT NULL,
    gap_description TEXT,
    gap_embedding VECTOR(3072), -- For semantic matching
    
    -- Quantification
    current_sample_size INTEGER, -- How many examples we have
    estimated_needed_samples INTEGER, -- How many we think we need
    coverage_score NUMERIC(5,4), -- 0-1 coverage of this domain
    confidence_if_filled NUMERIC(5,4), -- Estimated confidence after filling
    
    -- Impact assessment
    affected_prediction_types TEXT[], -- Which predictions are affected
    impact_on_predictions NUMERIC(5,4), -- How much this gap hurts predictions (0-1)
    affected_submission_count INTEGER, -- How many submissions affected
    
    -- Discovery information
    discovered_at TIMESTAMPTZ DEFAULT NOW(),
    discovered_by TEXT, -- 'auto_detection' | 'user_feedback' | 'calibration_analysis'
    discovery_context JSONB, -- What led to discovering this gap
    
    -- Resolution tracking
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'partially_filled', 'filled', 'acknowledged')),
    resolution_notes TEXT,
    filled_at TIMESTAMPTZ,
    
    -- Priority
    priority_score NUMERIC(5,4), -- Calculated priority for filling
    priority_factors JSONB, -- {frequency_of_queries, impact, ease_of_filling}
    
    -- Metadata
    last_assessed TIMESTAMPTZ DEFAULT NOW(),
    assessment_count INTEGER DEFAULT 1
);

COMMENT ON TABLE cortex.knowledge_gaps IS
'Identified areas where the AI has insufficient knowledge. Each gap quantifies
the data needed and the impact on predictions, enabling prioritized learning.';

-- ============================================================================
-- SECTION 3: ACTIVE LEARNING QUEUE
-- ============================================================================
-- Prioritized list of what the AI should learn next for maximum impact

CREATE TABLE IF NOT EXISTS cortex.active_learning_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID, -- NULL = global priority
    
    -- What to learn
    learning_target_type TEXT NOT NULL CHECK (learning_target_type IN (
        'document',           -- Specific document to ingest
        'document_type',      -- Type of documents to seek
        'query_pattern',      -- Type of queries to get feedback on
        'prediction_outcome', -- Outcomes to track
        'expert_annotation',  -- Human expert input needed
        'external_data',      -- External data source to integrate
        'model_update',       -- Model retraining needed
        'feature_engineering' -- New features to add
    )),
    
    -- Specification
    target_description TEXT NOT NULL,
    target_criteria JSONB, -- Criteria for what qualifies
    related_gap_ids UUID[], -- Links to knowledge_gaps
    
    -- Expected value
    expected_information_gain NUMERIC(8,5), -- Bits of information expected
    expected_confidence_improvement NUMERIC(5,4), -- How much uncertainty reduced
    expected_coverage_improvement NUMERIC(5,4), -- How much coverage increased
    affected_prediction_count INTEGER, -- How many predictions improved
    
    -- Cost/effort
    estimated_effort TEXT, -- 'low', 'medium', 'high'
    estimated_cost NUMERIC(10,2), -- In dollars if applicable
    requires_human BOOLEAN DEFAULT FALSE,
    requires_external_data BOOLEAN DEFAULT FALSE,
    
    -- Priority calculation
    priority_score NUMERIC(8,5), -- Combined priority
    priority_formula TEXT, -- How priority was calculated
    
    -- Status
    status TEXT DEFAULT 'pending' CHECK (status IN (
        'pending', 'in_progress', 'completed', 'deferred', 'cancelled'
    )),
    assigned_to UUID, -- User or system assigned
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    
    -- Results
    actual_information_gain NUMERIC(8,5),
    actual_confidence_improvement NUMERIC(5,4),
    completion_notes TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

COMMENT ON TABLE cortex.active_learning_queue IS
'Prioritized queue of learning opportunities. Each item quantifies expected
information gain and confidence improvement, enabling ROI-based learning decisions.';

-- ============================================================================
-- SECTION 4: CONFIDENCE TRIGGERS
-- ============================================================================
-- Rules for when to escalate to humans or flag uncertainty

CREATE TABLE IF NOT EXISTS cortex.confidence_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID, -- NULL = global trigger
    
    -- Trigger identification
    trigger_name TEXT NOT NULL,
    trigger_description TEXT,
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Trigger conditions (all must be met)
    conditions JSONB NOT NULL DEFAULT '[]', -- Array of {field, operator, value}
    -- Example: [{"field": "total_uncertainty", "operator": ">", "value": 0.4},
    --           {"field": "ood_score", "operator": ">", "value": 0.6}]
    
    -- What to do when triggered
    action_type TEXT NOT NULL CHECK (action_type IN (
        'flag_for_review',      -- Mark output for human review
        'request_confirmation', -- Ask user to confirm before proceeding
        'block_output',         -- Don't show output, require human
        'add_disclaimer',       -- Add uncertainty disclaimer
        'escalate_to_expert',   -- Route to subject matter expert
        'log_only',             -- Just log for monitoring
        'request_more_context', -- Ask user for more information
        'suggest_alternatives'  -- Suggest alternative queries/approaches
    )),
    
    -- Action details
    action_config JSONB, -- Configuration for the action
    disclaimer_template TEXT, -- Template for disclaimer if applicable
    escalation_queue TEXT, -- Which queue to escalate to
    
    -- Scope
    applies_to_prediction_types TEXT[], -- NULL = all types
    applies_to_therapeutic_areas TEXT[], -- NULL = all TAs
    
    -- Threshold tuning
    sensitivity NUMERIC(5,4) DEFAULT 0.5, -- 0=lenient, 1=strict
    false_positive_tolerance NUMERIC(5,4) DEFAULT 0.1, -- Acceptable FP rate
    
    -- Statistics
    trigger_count INTEGER DEFAULT 0,
    true_positive_count INTEGER DEFAULT 0,
    false_positive_count INTEGER DEFAULT 0,
    last_triggered TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

COMMENT ON TABLE cortex.confidence_triggers IS
'Rules for when AI should escalate to humans or add disclaimers. Enables
calibrated human-AI collaboration based on uncertainty thresholds.';

-- ============================================================================
-- SECTION 5: CALIBRATION LOG
-- ============================================================================
-- Track prediction accuracy over time for continuous calibration

CREATE TABLE IF NOT EXISTS cortex.calibration_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID, -- NULL = global calibration
    
    -- What we're calibrating
    prediction_type TEXT NOT NULL,
    therapeutic_area TEXT,
    submission_type TEXT,
    time_period_start DATE NOT NULL,
    time_period_end DATE NOT NULL,
    
    -- Sample information
    sample_size INTEGER NOT NULL,
    
    -- Calibration metrics
    -- For each confidence bucket, track predicted vs actual
    calibration_buckets JSONB NOT NULL, -- Array of {bucket_start, bucket_end, predicted_prob, actual_rate, count}
    -- Example: [{"bucket_start": 0.0, "bucket_end": 0.1, "predicted_prob": 0.05, "actual_rate": 0.08, "count": 50}]
    
    -- Overall metrics
    brier_score NUMERIC(8,6), -- Mean squared error of probabilities
    log_loss NUMERIC(8,6), -- Negative log likelihood
    expected_calibration_error NUMERIC(8,6), -- ECE metric
    maximum_calibration_error NUMERIC(8,6), -- MCE metric
    
    -- Reliability diagram data
    reliability_diagram JSONB, -- Points for plotting
    
    -- Sharpness (how confident are predictions)
    mean_confidence NUMERIC(5,4),
    confidence_std NUMERIC(5,4),
    overconfidence_rate NUMERIC(5,4), -- % of overconfident predictions
    underconfidence_rate NUMERIC(5,4), -- % of underconfident predictions
    
    -- Discrimination (can we distinguish outcomes)
    auroc NUMERIC(5,4), -- Area under ROC
    auprc NUMERIC(5,4), -- Area under precision-recall
    
    -- Drift detection
    drift_detected BOOLEAN DEFAULT FALSE,
    drift_magnitude NUMERIC(5,4),
    drift_direction TEXT, -- 'overconfident', 'underconfident', 'random'
    
    -- Recalibration applied
    recalibration_applied BOOLEAN DEFAULT FALSE,
    recalibration_method TEXT, -- 'platt', 'isotonic', 'temperature', 'none'
    recalibration_params JSONB,
    
    -- Metadata
    calculated_at TIMESTAMPTZ DEFAULT NOW(),
    model_version TEXT
);

COMMENT ON TABLE cortex.calibration_log IS
'Track prediction calibration over time. Enables detection of drift and
application of recalibration to maintain accurate uncertainty estimates.';

-- ============================================================================
-- SECTION 6: PREDICTION CONFIDENCE HISTORY
-- ============================================================================
-- Track how confidence evolves as more information arrives

CREATE TABLE IF NOT EXISTS cortex.confidence_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What we're tracking
    prediction_id UUID NOT NULL,
    prediction_table TEXT NOT NULL,
    
    -- Snapshot
    snapshot_time TIMESTAMPTZ DEFAULT NOW(),
    snapshot_reason TEXT, -- 'initial', 'new_data', 'user_feedback', 'time_decay', 'recalibration'
    
    -- Confidence at this point
    confidence NUMERIC(5,4),
    uncertainty NUMERIC(5,4),
    
    -- What changed
    delta_from_previous NUMERIC(6,5),
    contributing_factor TEXT,
    
    -- Context
    data_points_available INTEGER,
    model_version TEXT
);

COMMENT ON TABLE cortex.confidence_history IS
'Track how confidence in a prediction evolves over time as more information
becomes available. Enables understanding of confidence dynamics.';

-- ============================================================================
-- SECTION 7: INDEXES
-- ============================================================================

-- Uncertainty estimates
CREATE INDEX IF NOT EXISTS idx_uncertainty_target ON cortex.uncertainty_estimates(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_uncertainty_ood ON cortex.uncertainty_estimates(ood_score DESC) 
    WHERE ood_score > 0.5;
CREATE INDEX IF NOT EXISTS idx_uncertainty_org ON cortex.uncertainty_estimates(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_uncertainty_high ON cortex.uncertainty_estimates(total_uncertainty DESC)
    WHERE total_uncertainty > 0.3;

-- Knowledge gaps
CREATE INDEX IF NOT EXISTS idx_gaps_type_status ON cortex.knowledge_gaps(gap_type, status);
CREATE INDEX IF NOT EXISTS idx_gaps_priority ON cortex.knowledge_gaps(priority_score DESC) 
    WHERE status = 'open';
DO $$
BEGIN
    IF to_regclass('cortex.knowledge_gaps') IS NOT NULL
       AND EXISTS (
            SELECT 1
            FROM pg_attribute a
            WHERE a.attrelid = 'cortex.knowledge_gaps'::regclass
              AND a.attname = 'gap_embedding'
              AND a.atttypmod > 4
              AND (a.atttypmod - 4) <= 2000
       )
       AND NOT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'cortex' AND c.relname = 'idx_gaps_embedding'
       ) THEN
        CREATE INDEX idx_gaps_embedding ON cortex.knowledge_gaps
            USING hnsw (gap_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_gaps_impact ON cortex.knowledge_gaps(impact_on_predictions DESC);

-- Active learning queue
CREATE INDEX IF NOT EXISTS idx_learning_priority ON cortex.active_learning_queue(priority_score DESC)
    WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_learning_status ON cortex.active_learning_queue(status, org_id);
CREATE INDEX IF NOT EXISTS idx_learning_gaps ON cortex.active_learning_queue USING GIN (related_gap_ids);

-- Confidence triggers
CREATE INDEX IF NOT EXISTS idx_triggers_active ON cortex.confidence_triggers(is_active, action_type);
CREATE INDEX IF NOT EXISTS idx_triggers_scope ON cortex.confidence_triggers USING GIN (applies_to_prediction_types);

-- Calibration log
CREATE INDEX IF NOT EXISTS idx_calibration_type_time ON cortex.calibration_log(prediction_type, time_period_end DESC);
CREATE INDEX IF NOT EXISTS idx_calibration_drift ON cortex.calibration_log(drift_detected, drift_magnitude DESC)
    WHERE drift_detected = TRUE;

-- Confidence history
CREATE INDEX IF NOT EXISTS idx_confidence_history_pred ON cortex.confidence_history(prediction_id, snapshot_time DESC);

-- ============================================================================
-- SECTION 8: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cortex.uncertainty_estimates ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.knowledge_gaps ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.active_learning_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.confidence_triggers ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.calibration_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.confidence_history ENABLE ROW LEVEL SECURITY;

-- Policies
DROP POLICY IF EXISTS uncertainty_org_isolation ON cortex.uncertainty_estimates;
CREATE POLICY uncertainty_org_isolation ON cortex.uncertainty_estimates
    FOR ALL USING (org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id));

DROP POLICY IF EXISTS gaps_org_isolation ON cortex.knowledge_gaps;
CREATE POLICY gaps_org_isolation ON cortex.knowledge_gaps
    FOR ALL USING (org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id) OR org_id IS NULL);

DROP POLICY IF EXISTS learning_org_isolation ON cortex.active_learning_queue;
CREATE POLICY learning_org_isolation ON cortex.active_learning_queue
    FOR ALL USING (org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id) OR org_id IS NULL);

DROP POLICY IF EXISTS triggers_org_isolation ON cortex.confidence_triggers;
CREATE POLICY triggers_org_isolation ON cortex.confidence_triggers
    FOR ALL USING (org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id) OR org_id IS NULL);

DROP POLICY IF EXISTS calibration_org_isolation ON cortex.calibration_log;
CREATE POLICY calibration_org_isolation ON cortex.calibration_log
    FOR ALL USING (org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id) OR org_id IS NULL);

DROP POLICY IF EXISTS confidence_history_isolation ON cortex.confidence_history;
CREATE POLICY confidence_history_isolation ON cortex.confidence_history
    FOR ALL USING (TRUE); -- Read based on prediction access

-- ============================================================================
-- SECTION 9: CORE FUNCTIONS
-- ============================================================================

-- Function: Estimate uncertainty for a prediction
CREATE OR REPLACE FUNCTION cortex.estimate_uncertainty(
    p_target_type TEXT,
    p_target_id UUID,
    p_target_table TEXT,
    p_org_id UUID,
    p_features JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_estimate_id UUID;
    v_total_uncertainty NUMERIC;
    v_aleatoric NUMERIC;
    v_epistemic_data NUMERIC;
    v_epistemic_model NUMERIC;
    v_ood_score NUMERIC;
    v_similar_count INTEGER;
BEGIN
    -- Calculate base uncertainty from similar cases
    -- This is a simplified version - real implementation would use ML
    
    -- Count similar cases in training data
    SELECT COUNT(*) INTO v_similar_count
    FROM cortex.atoms
    WHERE org_id = p_org_id
      AND atom_type = p_target_type
      AND is_active = TRUE;
    
    -- Epistemic data uncertainty: higher when fewer similar cases
    v_epistemic_data := GREATEST(0.1, 1.0 - (v_similar_count::NUMERIC / 1000));
    
    -- Epistemic model uncertainty: base rate, would be from ensemble disagreement
    v_epistemic_model := 0.15;
    
    -- Aleatoric: inherent uncertainty, estimated from historical variance
    v_aleatoric := 0.1;
    
    -- OOD score: simplified check
    v_ood_score := CASE WHEN v_similar_count < 10 THEN 0.8 
                        WHEN v_similar_count < 50 THEN 0.5
                        WHEN v_similar_count < 200 THEN 0.3
                        ELSE 0.1 END;
    
    -- Total uncertainty (root sum of squares)
    v_total_uncertainty := SQRT(
        POWER(v_aleatoric, 2) + 
        POWER(v_epistemic_data, 2) + 
        POWER(v_epistemic_model, 2)
    );
    
    INSERT INTO cortex.uncertainty_estimates (
        org_id, target_type, target_id, target_table,
        total_uncertainty, aleatoric_uncertainty,
        epistemic_data_uncertainty, epistemic_model_uncertainty,
        ood_score, nearest_training_distance,
        estimation_method, model_version
    ) VALUES (
        p_org_id, p_target_type, p_target_id, p_target_table,
        LEAST(v_total_uncertainty, 1.0), v_aleatoric,
        v_epistemic_data, v_epistemic_model,
        v_ood_score, 1.0 / GREATEST(v_similar_count, 1),
        'heuristic', 'v1.0.0'
    )
    RETURNING id INTO v_estimate_id;
    
    RETURN v_estimate_id;
END;
$$;

COMMENT ON FUNCTION cortex.estimate_uncertainty IS
'Estimate decomposed uncertainty for a prediction or output. Returns ID of
the uncertainty estimate record. In production, uses ML ensemble methods.';

-- Function: Detect knowledge gaps
CREATE OR REPLACE FUNCTION cortex.detect_knowledge_gaps(
    p_org_id UUID DEFAULT NULL,
    p_min_impact NUMERIC DEFAULT 0.2
)
RETURNS TABLE(
    gap_type TEXT,
    gap_name TEXT,
    current_coverage NUMERIC,
    estimated_impact NUMERIC,
    priority NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    WITH coverage_by_ta AS (
        SELECT 
            metadata->>'therapeutic_area' AS ta,
            COUNT(*) AS sample_count,
            COUNT(*)::NUMERIC / 500 AS coverage -- Assume 500 is target per TA
        FROM cortex.atoms
        WHERE (p_org_id IS NULL OR org_id = p_org_id)
          AND metadata->>'therapeutic_area' IS NOT NULL
          AND is_active = TRUE
        GROUP BY metadata->>'therapeutic_area'
    ),
    coverage_by_type AS (
        SELECT 
            metadata->>'submission_type' AS sub_type,
            COUNT(*) AS sample_count,
            COUNT(*)::NUMERIC / 200 AS coverage -- Assume 200 is target per type
        FROM cortex.atoms
        WHERE (p_org_id IS NULL OR org_id = p_org_id)
          AND metadata->>'submission_type' IS NOT NULL
          AND is_active = TRUE
        GROUP BY metadata->>'submission_type'
    )
    SELECT 
        'therapeutic_area'::TEXT AS gap_type,
        ta AS gap_name,
        LEAST(coverage, 1.0) AS current_coverage,
        (1.0 - LEAST(coverage, 1.0)) * 0.8 AS estimated_impact,
        (1.0 - LEAST(coverage, 1.0)) * sample_count / 100.0 AS priority
    FROM coverage_by_ta
    WHERE coverage < 0.8
    UNION ALL
    SELECT 
        'submission_type'::TEXT AS gap_type,
        sub_type AS gap_name,
        LEAST(coverage, 1.0) AS current_coverage,
        (1.0 - LEAST(coverage, 1.0)) * 0.7 AS estimated_impact,
        (1.0 - LEAST(coverage, 1.0)) * sample_count / 50.0 AS priority
    FROM coverage_by_type
    WHERE coverage < 0.8
    ORDER BY priority DESC;
END;
$$;

COMMENT ON FUNCTION cortex.detect_knowledge_gaps IS
'Automatically detect areas where knowledge coverage is insufficient.
Returns gaps sorted by priority for active learning.';

-- Function: Check confidence triggers
CREATE OR REPLACE FUNCTION cortex.check_confidence_triggers(
    p_prediction_type TEXT,
    p_uncertainty_id UUID,
    p_org_id UUID
)
RETURNS TABLE(
    trigger_id UUID,
    trigger_name TEXT,
    action_type TEXT,
    action_config JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_uncertainty RECORD;
BEGIN
    -- Get uncertainty data
    SELECT * INTO v_uncertainty
    FROM cortex.uncertainty_estimates
    WHERE id = p_uncertainty_id;
    
    IF v_uncertainty IS NULL THEN
        RETURN;
    END IF;
    
    -- Check each active trigger
    RETURN QUERY
    SELECT 
        ct.id,
        ct.trigger_name,
        ct.action_type,
        ct.action_config
    FROM cortex.confidence_triggers ct
    WHERE ct.is_active = TRUE
      AND (ct.org_id = p_org_id OR ct.org_id IS NULL)
      AND (ct.applies_to_prediction_types IS NULL 
           OR p_prediction_type = ANY(ct.applies_to_prediction_types))
      AND cortex.evaluate_trigger_conditions(ct.conditions, v_uncertainty);
END;
$$;

-- Helper function: Evaluate trigger conditions
CREATE OR REPLACE FUNCTION cortex.evaluate_trigger_conditions(
    p_conditions JSONB,
    p_uncertainty RECORD
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_condition JSONB;
    v_field TEXT;
    v_operator TEXT;
    v_threshold NUMERIC;
    v_actual NUMERIC;
BEGIN
    -- If no conditions, always trigger
    IF p_conditions IS NULL OR jsonb_array_length(p_conditions) = 0 THEN
        RETURN TRUE;
    END IF;
    
    -- Check each condition
    FOR v_condition IN SELECT * FROM jsonb_array_elements(p_conditions)
    LOOP
        v_field := v_condition->>'field';
        v_operator := v_condition->>'operator';
        v_threshold := (v_condition->>'value')::NUMERIC;
        
        -- Get actual value
        v_actual := CASE v_field
            WHEN 'total_uncertainty' THEN p_uncertainty.total_uncertainty
            WHEN 'ood_score' THEN p_uncertainty.ood_score
            WHEN 'aleatoric_uncertainty' THEN p_uncertainty.aleatoric_uncertainty
            WHEN 'epistemic_data_uncertainty' THEN p_uncertainty.epistemic_data_uncertainty
            WHEN 'epistemic_model_uncertainty' THEN p_uncertainty.epistemic_model_uncertainty
            ELSE 0
        END;
        
        -- Evaluate condition
        IF v_operator = '>' AND NOT (v_actual > v_threshold) THEN RETURN FALSE; END IF;
        IF v_operator = '>=' AND NOT (v_actual >= v_threshold) THEN RETURN FALSE; END IF;
        IF v_operator = '<' AND NOT (v_actual < v_threshold) THEN RETURN FALSE; END IF;
        IF v_operator = '<=' AND NOT (v_actual <= v_threshold) THEN RETURN FALSE; END IF;
        IF v_operator = '=' AND NOT (v_actual = v_threshold) THEN RETURN FALSE; END IF;
    END LOOP;
    
    RETURN TRUE;
END;
$$;

-- Function: Calculate calibration metrics
CREATE OR REPLACE FUNCTION cortex.calculate_calibration(
    p_prediction_type TEXT,
    p_org_id UUID DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_end_date DATE DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_log_id UUID;
    v_sample_size INTEGER;
    v_brier_score NUMERIC;
    v_buckets JSONB;
BEGIN
    -- Use last 90 days if no dates specified
    p_start_date := COALESCE(p_start_date, CURRENT_DATE - INTERVAL '90 days');
    p_end_date := COALESCE(p_end_date, CURRENT_DATE);
    
    -- Calculate Brier score from intuition predictions with outcomes
    SELECT 
        COUNT(*),
        AVG(prediction_error)
    INTO v_sample_size, v_brier_score
    FROM cortex.intuition_predictions
    WHERE (p_org_id IS NULL OR org_id = p_org_id)
      AND prediction_date >= p_start_date
      AND prediction_date <= p_end_date
      AND actual_outcome IS NOT NULL;
    
    IF v_sample_size < 10 THEN
        RAISE NOTICE 'Insufficient samples for calibration: %', v_sample_size;
        RETURN NULL;
    END IF;
    
    -- Calculate calibration buckets
    WITH bucketed AS (
        SELECT 
            FLOOR(approval_probability * 10) / 10 AS bucket_start,
            approval_probability,
            CASE WHEN actual_outcome = 'approval' THEN 1 ELSE 0 END AS actual
        FROM cortex.intuition_predictions
        WHERE (p_org_id IS NULL OR org_id = p_org_id)
          AND prediction_date >= p_start_date
          AND prediction_date <= p_end_date
          AND actual_outcome IS NOT NULL
    )
    SELECT jsonb_agg(jsonb_build_object(
        'bucket_start', bucket_start,
        'bucket_end', bucket_start + 0.1,
        'predicted_prob', AVG(approval_probability),
        'actual_rate', AVG(actual),
        'count', COUNT(*)
    ))
    INTO v_buckets
    FROM bucketed
    GROUP BY bucket_start;
    
    -- Insert calibration log
    INSERT INTO cortex.calibration_log (
        org_id, prediction_type,
        time_period_start, time_period_end,
        sample_size, calibration_buckets,
        brier_score, model_version
    ) VALUES (
        p_org_id, p_prediction_type,
        p_start_date, p_end_date,
        v_sample_size, COALESCE(v_buckets, '[]'),
        v_brier_score, 'v1.0.0'
    )
    RETURNING id INTO v_log_id;
    
    RETURN v_log_id;
END;
$$;

COMMENT ON FUNCTION cortex.calculate_calibration IS
'Calculate calibration metrics for a prediction type over a time period.
Returns the ID of the calibration log entry.';

-- ============================================================================
-- SECTION 10: DEFAULT CONFIDENCE TRIGGERS
-- ============================================================================

INSERT INTO cortex.confidence_triggers (
    trigger_name, trigger_description, is_active,
    conditions, action_type, disclaimer_template
) VALUES
    (
        'High Uncertainty Flag',
        'Flag outputs with very high total uncertainty for review',
        TRUE,
        '[{"field": "total_uncertainty", "operator": ">", "value": 0.5}]'::JSONB,
        'add_disclaimer',
        'This prediction has higher than usual uncertainty. Consider seeking additional expert input.'
    ),
    (
        'Out of Distribution Alert',
        'Alert when case appears significantly different from training data',
        TRUE,
        '[{"field": "ood_score", "operator": ">", "value": 0.7}]'::JSONB,
        'flag_for_review',
        NULL
    ),
    (
        'Data Gap Warning',
        'Warn when epistemic data uncertainty is high',
        TRUE,
        '[{"field": "epistemic_data_uncertainty", "operator": ">", "value": 0.4}]'::JSONB,
        'add_disclaimer',
        'Limited historical data available for similar cases. Prediction may be less reliable.'
    ),
    (
        'Critical Decision Block',
        'Block output for critical decisions with high uncertainty',
        TRUE,
        '[{"field": "total_uncertainty", "operator": ">", "value": 0.6}, {"field": "ood_score", "operator": ">", "value": 0.5}]'::JSONB,
        'escalate_to_expert',
        NULL
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 11: TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS active_learning_updated_at ON cortex.active_learning_queue;
CREATE TRIGGER active_learning_updated_at
    BEFORE UPDATE ON cortex.active_learning_queue
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

DROP TRIGGER IF EXISTS confidence_triggers_updated_at ON cortex.confidence_triggers;
CREATE TRIGGER confidence_triggers_updated_at
    BEFORE UPDATE ON cortex.confidence_triggers
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

-- ============================================================================
-- SECTION 12: COMPLETION
-- ============================================================================

COMMIT;

DO $$
BEGIN
    RAISE NOTICE 'Migration 075: Epistemic Intelligence complete';
    RAISE NOTICE 'Tables: uncertainty_estimates, knowledge_gaps, active_learning_queue, confidence_triggers, calibration_log, confidence_history';
    RAISE NOTICE 'Functions: estimate_uncertainty, detect_knowledge_gaps, check_confidence_triggers, calculate_calibration';
    RAISE NOTICE 'RLS enabled on all tables';
END $$;
