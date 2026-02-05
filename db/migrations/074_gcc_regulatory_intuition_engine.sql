-- Migration 074: Regulatory Intuition Engine
-- Purpose: Learn from rejection letters, CRLs, IRs, RTFs to predict submission outcomes
-- Dependencies: 073_cortex_prime_unified_brain.sql
-- Part of: Cortex Prime - The Definitive Life Sciences AI Mind
-- 
-- This migration implements "30-Year Veteran Intuition" - the ability to detect
-- subtle patterns that experienced regulatory professionals recognize intuitively.

BEGIN;

-- Ensure cortex schema exists (may have been created by 073 or _legacy migration)
CREATE SCHEMA IF NOT EXISTS cortex;

-- Create minimal cortex.atoms table if not exists (dependency for regulatory_signals)
CREATE TABLE IF NOT EXISTS cortex.atoms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID,
    content TEXT,
    content_type TEXT,
    embedding VECTOR(3072),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_proc p
        JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'core' AND p.proname = 'update_timestamp'
    ) THEN
        CREATE OR REPLACE FUNCTION core.update_timestamp()
        RETURNS TRIGGER AS $func$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $func$ LANGUAGE plpgsql;
    END IF;
END $$;

-- ============================================================================
-- SECTION 1: REGULATORY SIGNAL EXTRACTION
-- ============================================================================
-- Signals are atomic patterns extracted from regulatory correspondence that
-- may indicate approval risk. Each signal has an embedding for semantic matching.

CREATE TABLE IF NOT EXISTS cortex.regulatory_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    
    -- Signal identification
    signal_type TEXT NOT NULL CHECK (signal_type IN (
        'crl_deficiency',        -- Complete Response Letter deficiency
        'ir_question',           -- Information Request question pattern
        'rtf_reason',            -- Refuse to File reason
        'ac_concern',            -- Advisory Committee concern
        'label_negotiation',     -- Label negotiation pattern
        'review_timeline_shift', -- Review timeline acceleration/delay
        'reviewer_assignment',   -- Reviewer change patterns
        'division_transfer',     -- Transfer between divisions
        'meeting_outcome',       -- Pre-submission meeting outcome
        'guidance_deviation',    -- Deviation from guidance cited
        'comparator_challenge',  -- Comparator/control arm challenge
        'endpoint_question',     -- Primary/secondary endpoint question
        'safety_signal',         -- Safety signal identification
        'manufacturing_issue',   -- CMC/manufacturing concern
        'clinical_hold_reason',  -- Clinical hold reason pattern
        'special_protocol',      -- SPA/breakthrough/accelerated patterns
        'pediatric_requirement', -- Pediatric study requirement
        'rems_indication',       -- REMS requirement signal
        'foreign_data_concern',  -- Foreign clinical data acceptance
        'biomarker_validation'   -- Biomarker validation concern
    )),
    
    -- Source document reference
    source_atom_id UUID REFERENCES cortex.atoms(id),
    source_document_type TEXT NOT NULL CHECK (source_document_type IN (
        'crl', 'ir', 'rtf', 'ac_transcript', 'ac_briefing', 'ac_vote',
        'meeting_minutes', 'guidance', 'warning_letter', 'approval_letter',
        'label', 'review_document', 'sponsor_response', 'amendment'
    )),
    source_date TIMESTAMPTZ,
    
    -- Signal content
    signal_text TEXT NOT NULL,
    normalized_text TEXT, -- Cleaned/normalized version
    signal_embedding VECTOR(3072),
    signal_embedding_1536 VECTOR(1536), -- Cost-efficient version
    
    -- Regulatory context
    therapeutic_area TEXT,
    indication TEXT,
    submission_type TEXT, -- NDA, BLA, ANDA, 505(b)(2), etc.
    review_division TEXT,
    agency TEXT DEFAULT 'FDA',
    
    -- Signal strength metrics
    severity TEXT CHECK (severity IN ('critical', 'major', 'minor', 'observation')),
    frequency_score NUMERIC(5,4), -- How often this signal appears (0-1)
    preceded_rejection_rate NUMERIC(5,4), -- % of times this signal preceded rejection
    preceded_delay_rate NUMERIC(5,4), -- % of times this signal preceded delay
    resolution_rate NUMERIC(5,4), -- % of times sponsors successfully resolved
    
    -- Learned weights (updated by evolution)
    predictive_weight NUMERIC(8,6) DEFAULT 1.0,
    confidence_in_weight NUMERIC(5,4) DEFAULT 0.5,
    last_weight_update TIMESTAMPTZ,
    weight_update_count INTEGER DEFAULT 0,
    
    -- Metadata
    extracted_by TEXT, -- 'human' | 'ai' | 'hybrid'
    extraction_confidence NUMERIC(5,4),
    validated_by UUID, -- User who validated
    validation_date TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    is_active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE cortex.regulatory_signals IS 
'Atomic patterns extracted from regulatory correspondence that indicate approval risk. 
Each signal represents a single concern, question, or issue raised by regulators.
Signals are learned from historical CRLs, IRs, RTFs, and advisory committee proceedings.';

-- ============================================================================
-- SECTION 2: REJECTION PATTERN SEQUENCES
-- ============================================================================
-- Patterns are sequences of signals that, when appearing together, predict outcomes.
-- This is where the "30-year veteran intuition" lives.

CREATE TABLE IF NOT EXISTS cortex.rejection_patterns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID, -- NULL = global pattern (learned across all orgs, privacy-safe)
    
    -- Pattern identification
    pattern_name TEXT NOT NULL,
    pattern_description TEXT,
    pattern_embedding VECTOR(3072), -- Semantic representation of pattern
    pattern_embedding_1536 VECTOR(1536),
    
    -- Signal sequence (ordered array of signal types)
    signal_sequence TEXT[] NOT NULL, -- e.g., ['endpoint_question', 'comparator_challenge', 'crl_deficiency']
    signal_ids UUID[], -- Specific signals that formed this pattern (may span orgs)
    
    -- Temporal requirements
    sequence_window_days INTEGER, -- Max days between first and last signal
    typical_gap_days INTEGER[], -- Typical gaps between each signal pair
    
    -- Outcome prediction
    predicted_outcome TEXT NOT NULL CHECK (predicted_outcome IN (
        'approval', 'crl', 'rtf', 'clinical_hold', 'withdrawal',
        'conditional_approval', 'delayed_approval', 'label_restriction',
        'rems_required', 'post_marketing_required', 'advisory_committee'
    )),
    outcome_probability NUMERIC(5,4) NOT NULL, -- 0.0-1.0
    confidence_interval_lower NUMERIC(5,4),
    confidence_interval_upper NUMERIC(5,4),
    
    -- Statistical validation
    support_count INTEGER NOT NULL DEFAULT 0, -- How many times pattern observed
    true_positive_count INTEGER DEFAULT 0,
    false_positive_count INTEGER DEFAULT 0,
    true_negative_count INTEGER DEFAULT 0,
    false_negative_count INTEGER DEFAULT 0,
    precision_score NUMERIC(5,4), -- TP / (TP + FP)
    recall_score NUMERIC(5,4), -- TP / (TP + FN)
    f1_score NUMERIC(5,4), -- Harmonic mean of precision/recall
    lift NUMERIC(8,4), -- How much better than random
    
    -- Recommended actions
    recommended_actions JSONB DEFAULT '[]', -- Array of {action, priority, expected_impact}
    mitigation_success_rate NUMERIC(5,4), -- % of sponsors who mitigated successfully
    
    -- Scope
    therapeutic_areas TEXT[], -- NULL = all
    submission_types TEXT[], -- NULL = all
    agencies TEXT[] DEFAULT ARRAY['FDA'],
    
    -- Evolution tracking
    first_observed TIMESTAMPTZ,
    last_observed TIMESTAMPTZ,
    version INTEGER DEFAULT 1,
    parent_pattern_id UUID REFERENCES cortex.rejection_patterns(id), -- For pattern evolution
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    is_validated BOOLEAN DEFAULT FALSE,
    validated_by UUID,
    validation_date TIMESTAMPTZ
);

COMMENT ON TABLE cortex.rejection_patterns IS
'Sequences of regulatory signals that predict submission outcomes. Patterns are learned
from historical data and continuously refined. Global patterns (org_id IS NULL) represent
privacy-safe learnings aggregated across all organizations.';

-- ============================================================================
-- SECTION 3: INTUITION PREDICTIONS
-- ============================================================================
-- Real-time submission risk scoring using learned patterns

CREATE TABLE IF NOT EXISTS cortex.intuition_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    program_id UUID,
    submission_id UUID, -- Links to regulatory.submissions
    
    -- Prediction context
    prediction_type TEXT NOT NULL CHECK (prediction_type IN (
        'pre_submission', 'during_review', 'post_action', 'what_if'
    )),
    prediction_date TIMESTAMPTZ DEFAULT NOW(),
    prediction_horizon_days INTEGER, -- How far ahead we're predicting
    
    -- Core predictions
    approval_probability NUMERIC(5,4),
    crl_probability NUMERIC(5,4),
    rtf_probability NUMERIC(5,4),
    delay_probability NUMERIC(5,4),
    
    -- Timeline predictions
    expected_action_date DATE,
    earliest_action_date DATE,
    latest_action_date DATE,
    expected_review_months NUMERIC(4,1),
    
    -- Risk decomposition
    risk_factors JSONB NOT NULL DEFAULT '[]', -- Array of {factor, contribution, signal_ids, mitigation}
    top_risk_factor TEXT,
    risk_concentration NUMERIC(5,4), -- Herfindahl index of risk sources
    
    -- Pattern matches
    matched_pattern_ids UUID[],
    pattern_match_scores NUMERIC(5,4)[],
    strongest_pattern_id UUID REFERENCES cortex.rejection_patterns(id),
    
    -- Similar historical cases
    similar_cases JSONB DEFAULT '[]', -- Array of {submission_id, similarity, outcome, key_differences}
    most_similar_case_id UUID,
    similarity_to_most_similar NUMERIC(5,4),
    
    -- Confidence and uncertainty
    overall_confidence NUMERIC(5,4),
    epistemic_uncertainty NUMERIC(5,4), -- Uncertainty from lack of data
    aleatoric_uncertainty NUMERIC(5,4), -- Inherent uncertainty
    out_of_distribution_score NUMERIC(5,4), -- How novel is this submission
    
    -- Explanation
    explanation_text TEXT,
    key_concerns TEXT[],
    recommended_actions TEXT[],
    
    -- Outcome tracking (for learning)
    actual_outcome TEXT,
    actual_action_date DATE,
    outcome_recorded_at TIMESTAMPTZ,
    prediction_error NUMERIC(5,4), -- Brier score component
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    model_version TEXT,
    
    CONSTRAINT valid_probabilities CHECK (
        approval_probability + crl_probability + rtf_probability <= 1.05 -- Allow small rounding
    )
);

COMMENT ON TABLE cortex.intuition_predictions IS
'Real-time submission risk predictions based on pattern matching and historical analysis.
Each prediction decomposes risk into factors and provides actionable recommendations.
Outcomes are tracked for continuous learning and model improvement.';

-- ============================================================================
-- SECTION 4: SOFT SIGNALS (Subtle Language Patterns)
-- ============================================================================
-- These are the nuanced signals that 30-year veterans "feel" but can't always articulate.

CREATE TABLE IF NOT EXISTS cortex.soft_signals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID, -- NULL = global
    
    -- Signal identification
    signal_category TEXT NOT NULL CHECK (signal_category IN (
        'reviewer_word_choice',     -- Specific word/phrase patterns
        'tone_shift',               -- Change in communication tone
        'question_depth',           -- Depth/specificity of questions
        'response_timing',          -- How quickly agency responds
        'meeting_dynamics',         -- Meeting behavior patterns
        'document_formatting',      -- How documents are structured
        'cross_reference_density',  -- How often guidance/regulations cited
        'precedent_citation',       -- Which precedents cited
        'safety_language_intensity',-- Intensity of safety-related language
        'efficacy_skepticism',      -- Level of efficacy questioning
        'statistical_scrutiny',     -- Depth of statistical review
        'sponsor_cooperation',      -- Perception of sponsor cooperation
        'data_quality_concern',     -- Data quality/integrity concerns
        'regulatory_pathway_fit'    -- Fit with chosen pathway
    )),
    
    -- Signal definition
    signal_name TEXT NOT NULL,
    signal_description TEXT,
    detection_rules JSONB, -- Rules for automatic detection
    
    -- Examples
    positive_examples TEXT[], -- Examples where signal is present
    negative_examples TEXT[], -- Examples where signal is absent
    signal_embedding VECTOR(3072),
    
    -- Learned weights
    weight_approval NUMERIC(8,6) DEFAULT 0.0, -- Contribution to approval prediction
    weight_rejection NUMERIC(8,6) DEFAULT 0.0, -- Contribution to rejection prediction
    weight_delay NUMERIC(8,6) DEFAULT 0.0, -- Contribution to delay prediction
    weight_confidence NUMERIC(5,4) DEFAULT 0.5,
    
    -- Validation
    expert_validated BOOLEAN DEFAULT FALSE,
    expert_agreement_rate NUMERIC(5,4), -- % of experts who agree signal is meaningful
    inter_rater_reliability NUMERIC(5,4), -- Kappa or similar
    
    -- Metadata
    discovered_by TEXT, -- 'human_expert' | 'ai_discovery' | 'literature'
    discovery_date TIMESTAMPTZ,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    update_count INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT TRUE
);

COMMENT ON TABLE cortex.soft_signals IS
'Subtle language and behavioral patterns that indicate regulatory sentiment. These are
the nuanced signals that experienced regulatory professionals intuit but may not 
consciously articulate. Learned through expert interviews and outcome correlation.';

-- ============================================================================
-- SECTION 5: TIMELINE PREDICTIONS
-- ============================================================================
-- Detailed milestone and timeline predictions with uncertainty

CREATE TABLE IF NOT EXISTS cortex.timeline_predictions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    submission_id UUID,
    program_id UUID,
    
    -- Milestone identification
    milestone_type TEXT NOT NULL CHECK (milestone_type IN (
        'filing_decision', 'mid_cycle_meeting', 'late_cycle_meeting',
        'advisory_committee', 'action_date', 'crl_response_due',
        'ir_response_due', 'label_negotiation_complete', 'approval_letter',
        'launch_readiness', 'first_commercial_sale'
    )),
    milestone_name TEXT,
    
    -- Point estimates
    predicted_date DATE NOT NULL,
    predicted_duration_days INTEGER, -- From previous milestone
    
    -- Uncertainty bounds (multiple confidence levels)
    date_p10 DATE, -- 10th percentile (optimistic)
    date_p25 DATE,
    date_p50 DATE, -- Median
    date_p75 DATE,
    date_p90 DATE, -- 90th percentile (pessimistic)
    
    -- Distribution parameters
    distribution_type TEXT DEFAULT 'lognormal', -- 'normal', 'lognormal', 'weibull', 'empirical'
    distribution_params JSONB, -- {mu, sigma} or {shape, scale} depending on type
    
    -- Risk events that could cause delay
    delay_risk_events JSONB DEFAULT '[]', -- Array of {event, probability, impact_days, mitigation}
    total_delay_risk_days NUMERIC(6,1),
    
    -- Factors driving prediction
    key_factors JSONB DEFAULT '[]', -- Array of {factor, direction, magnitude}
    similar_historical_durations INTEGER[], -- Days for similar submissions
    
    -- Tracking
    actual_date DATE,
    prediction_error_days INTEGER,
    recorded_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    model_version TEXT,
    confidence_score NUMERIC(5,4)
);

COMMENT ON TABLE cortex.timeline_predictions IS
'Detailed milestone predictions with full uncertainty quantification. Each milestone
has probability distributions and identified risk events that could cause delays.';

-- ============================================================================
-- SECTION 6: INDEXES FOR PERFORMANCE
-- ============================================================================

-- Regulatory signals indexes
CREATE INDEX IF NOT EXISTS idx_reg_signals_org_type ON cortex.regulatory_signals(org_id, signal_type);
CREATE INDEX IF NOT EXISTS idx_reg_signals_therapeutic ON cortex.regulatory_signals(therapeutic_area, indication);
CREATE INDEX IF NOT EXISTS idx_reg_signals_source ON cortex.regulatory_signals(source_atom_id);
CREATE INDEX IF NOT EXISTS idx_reg_signals_severity ON cortex.regulatory_signals(severity, preceded_rejection_rate DESC);
-- NOTE: Skip index for 3072-dim embeddings (pgvector index dimension limit).
CREATE INDEX IF NOT EXISTS idx_reg_signals_embedding_1536 ON cortex.regulatory_signals 
    USING hnsw (signal_embedding_1536 vector_cosine_ops) WITH (m = 16, ef_construction = 64);

-- Rejection patterns indexes
CREATE INDEX IF NOT EXISTS idx_rej_patterns_outcome ON cortex.rejection_patterns(predicted_outcome, outcome_probability DESC);
CREATE INDEX IF NOT EXISTS idx_rej_patterns_therapeutic ON cortex.rejection_patterns USING GIN (therapeutic_areas);
CREATE INDEX IF NOT EXISTS idx_rej_patterns_signals ON cortex.rejection_patterns USING GIN (signal_sequence);
-- NOTE: Skip index for 3072-dim embeddings (pgvector index dimension limit).
CREATE INDEX IF NOT EXISTS idx_rej_patterns_validated ON cortex.rejection_patterns(is_validated, f1_score DESC);

-- Intuition predictions indexes
CREATE INDEX IF NOT EXISTS idx_intuition_org_submission ON cortex.intuition_predictions(org_id, submission_id);
CREATE INDEX IF NOT EXISTS idx_intuition_program ON cortex.intuition_predictions(program_id, prediction_date DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_risk ON cortex.intuition_predictions(crl_probability DESC, rtf_probability DESC);
CREATE INDEX IF NOT EXISTS idx_intuition_patterns ON cortex.intuition_predictions USING GIN (matched_pattern_ids);
CREATE INDEX IF NOT EXISTS idx_intuition_outcome_tracking ON cortex.intuition_predictions(actual_outcome) 
    WHERE actual_outcome IS NOT NULL;

-- Soft signals indexes
CREATE INDEX IF NOT EXISTS idx_soft_signals_category ON cortex.soft_signals(signal_category, is_active);
-- NOTE: Skip index for 3072-dim embeddings (pgvector index dimension limit).

-- Timeline predictions indexes
CREATE INDEX IF NOT EXISTS idx_timeline_submission ON cortex.timeline_predictions(submission_id, milestone_type);
CREATE INDEX IF NOT EXISTS idx_timeline_program ON cortex.timeline_predictions(program_id, predicted_date);
CREATE INDEX IF NOT EXISTS idx_timeline_tracking ON cortex.timeline_predictions(actual_date) 
    WHERE actual_date IS NOT NULL;

-- ============================================================================
-- SECTION 7: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cortex.regulatory_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.rejection_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.intuition_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.soft_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.timeline_predictions ENABLE ROW LEVEL SECURITY;

-- Regulatory signals: org-scoped + global readable
DROP POLICY IF EXISTS regulatory_signals_org_isolation ON cortex.regulatory_signals;
CREATE POLICY regulatory_signals_org_isolation ON cortex.regulatory_signals
    FOR ALL USING (
        org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id)
        OR org_id IS NULL -- Global signals readable by all
    );

-- Rejection patterns: org-scoped + global readable
DROP POLICY IF EXISTS rejection_patterns_org_isolation ON cortex.rejection_patterns;
CREATE POLICY rejection_patterns_org_isolation ON cortex.rejection_patterns
    FOR ALL USING (
        org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id)
        OR org_id IS NULL -- Global patterns readable by all
    );

-- Intuition predictions: strict org isolation
DROP POLICY IF EXISTS intuition_predictions_org_isolation ON cortex.intuition_predictions;
CREATE POLICY intuition_predictions_org_isolation ON cortex.intuition_predictions
    FOR ALL USING (
        org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id)
    );

-- Soft signals: org-scoped + global readable
DROP POLICY IF EXISTS soft_signals_org_isolation ON cortex.soft_signals;
CREATE POLICY soft_signals_org_isolation ON cortex.soft_signals
    FOR ALL USING (
        org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id)
        OR org_id IS NULL -- Global signals readable by all
    );

-- Timeline predictions: strict org isolation
DROP POLICY IF EXISTS timeline_predictions_org_isolation ON cortex.timeline_predictions;
CREATE POLICY timeline_predictions_org_isolation ON cortex.timeline_predictions
    FOR ALL USING (
        org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id)
    );

-- ============================================================================
-- SECTION 8: CORE FUNCTIONS
-- ============================================================================

-- Function: Extract signals from regulatory document
CREATE OR REPLACE FUNCTION cortex.extract_regulatory_signals(
    p_atom_id UUID,
    p_org_id UUID,
    p_document_type TEXT,
    p_extraction_config JSONB DEFAULT '{}'
)
RETURNS TABLE(signal_id UUID, signal_type TEXT, signal_text TEXT, severity TEXT, confidence NUMERIC)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_content TEXT;
    v_metadata JSONB;
BEGIN
    -- Get document content
    SELECT content, metadata INTO v_content, v_metadata
    FROM cortex.atoms WHERE id = p_atom_id;
    
    IF v_content IS NULL THEN
        RAISE EXCEPTION 'Atom not found: %', p_atom_id;
    END IF;
    
    -- This is a placeholder for AI-powered extraction
    -- In production, this would call an LLM or specialized NLP model
    -- For now, return empty set - actual extraction happens in application layer
    RETURN;
END;
$$;

COMMENT ON FUNCTION cortex.extract_regulatory_signals IS
'Extract regulatory signals from a document atom. In production, this integrates
with LLM-based extraction. Returns extracted signals with type, text, and confidence.';

-- Function: Match patterns against submission
CREATE OR REPLACE FUNCTION cortex.match_rejection_patterns(
    p_submission_id UUID,
    p_org_id UUID,
    p_min_confidence NUMERIC DEFAULT 0.5
)
RETURNS TABLE(
    pattern_id UUID,
    pattern_name TEXT,
    match_score NUMERIC,
    matched_signals UUID[],
    predicted_outcome TEXT,
    outcome_probability NUMERIC,
    recommended_actions JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
BEGIN
    -- Find all signals associated with this submission
    -- Then match against known patterns
    RETURN QUERY
    WITH submission_signals AS (
        SELECT rs.id, rs.signal_type, rs.signal_embedding
        FROM cortex.regulatory_signals rs
        JOIN cortex.atoms a ON rs.source_atom_id = a.id
        WHERE a.metadata->>'submission_id' = p_submission_id::TEXT
          AND rs.org_id = p_org_id
          AND rs.is_active = TRUE
    ),
    pattern_matches AS (
        SELECT 
            rp.id AS pattern_id,
            rp.pattern_name,
            rp.predicted_outcome,
            rp.outcome_probability,
            rp.recommended_actions,
            -- Calculate match score based on signal overlap
            (
                SELECT COUNT(*)::NUMERIC / GREATEST(array_length(rp.signal_sequence, 1), 1)
                FROM unnest(rp.signal_sequence) seq_type
                WHERE EXISTS (
                    SELECT 1 FROM submission_signals ss 
                    WHERE ss.signal_type = seq_type
                )
            ) AS match_score,
            ARRAY(
                SELECT ss.id FROM submission_signals ss
                WHERE ss.signal_type = ANY(rp.signal_sequence)
            ) AS matched_signals
        FROM cortex.rejection_patterns rp
        WHERE rp.is_active = TRUE
          AND (rp.org_id = p_org_id OR rp.org_id IS NULL)
    )
    SELECT 
        pm.pattern_id,
        pm.pattern_name,
        pm.match_score,
        pm.matched_signals,
        pm.predicted_outcome,
        pm.outcome_probability,
        pm.recommended_actions
    FROM pattern_matches pm
    WHERE pm.match_score >= p_min_confidence
    ORDER BY pm.match_score DESC, pm.outcome_probability DESC;
END;
$$;

COMMENT ON FUNCTION cortex.match_rejection_patterns IS
'Match known rejection patterns against signals found in a submission.
Returns matching patterns with scores and recommended actions.';

-- Function: Generate intuition prediction
CREATE OR REPLACE FUNCTION cortex.generate_intuition_prediction(
    p_submission_id UUID,
    p_org_id UUID,
    p_prediction_type TEXT DEFAULT 'during_review'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_prediction_id UUID;
    v_pattern_matches RECORD;
    v_approval_prob NUMERIC := 0.7; -- Base rate
    v_crl_prob NUMERIC := 0.2;
    v_rtf_prob NUMERIC := 0.05;
    v_matched_patterns UUID[] := ARRAY[]::UUID[];
    v_pattern_scores NUMERIC[] := ARRAY[]::NUMERIC[];
    v_risk_factors JSONB := '[]'::JSONB;
BEGIN
    -- Get pattern matches
    FOR v_pattern_matches IN 
        SELECT * FROM cortex.match_rejection_patterns(p_submission_id, p_org_id, 0.3)
    LOOP
        v_matched_patterns := array_append(v_matched_patterns, v_pattern_matches.pattern_id);
        v_pattern_scores := array_append(v_pattern_scores, v_pattern_matches.match_score);
        
        -- Adjust probabilities based on patterns
        IF v_pattern_matches.predicted_outcome = 'crl' THEN
            v_crl_prob := v_crl_prob + (v_pattern_matches.outcome_probability * v_pattern_matches.match_score * 0.3);
            v_approval_prob := v_approval_prob - (v_pattern_matches.outcome_probability * v_pattern_matches.match_score * 0.3);
        ELSIF v_pattern_matches.predicted_outcome = 'rtf' THEN
            v_rtf_prob := v_rtf_prob + (v_pattern_matches.outcome_probability * v_pattern_matches.match_score * 0.2);
            v_approval_prob := v_approval_prob - (v_pattern_matches.outcome_probability * v_pattern_matches.match_score * 0.2);
        END IF;
        
        -- Add to risk factors
        v_risk_factors := v_risk_factors || jsonb_build_object(
            'factor', v_pattern_matches.pattern_name,
            'contribution', v_pattern_matches.match_score * v_pattern_matches.outcome_probability,
            'pattern_id', v_pattern_matches.pattern_id
        );
    END LOOP;
    
    -- Normalize probabilities
    DECLARE
        v_total NUMERIC := v_approval_prob + v_crl_prob + v_rtf_prob;
    BEGIN
        v_approval_prob := v_approval_prob / v_total;
        v_crl_prob := v_crl_prob / v_total;
        v_rtf_prob := v_rtf_prob / v_total;
    END;
    
    -- Insert prediction
    INSERT INTO cortex.intuition_predictions (
        org_id, submission_id, prediction_type,
        approval_probability, crl_probability, rtf_probability,
        matched_pattern_ids, pattern_match_scores, risk_factors,
        overall_confidence, model_version
    ) VALUES (
        p_org_id, p_submission_id, p_prediction_type,
        LEAST(v_approval_prob, 1.0), LEAST(v_crl_prob, 1.0), LEAST(v_rtf_prob, 1.0),
        v_matched_patterns, v_pattern_scores, v_risk_factors,
        0.7, -- Base confidence
        'v1.0.0'
    )
    RETURNING id INTO v_prediction_id;
    
    RETURN v_prediction_id;
END;
$$;

COMMENT ON FUNCTION cortex.generate_intuition_prediction IS
'Generate a risk prediction for a submission based on matched patterns and signals.
Returns the ID of the created prediction record.';

-- Function: Record prediction outcome (for learning)
CREATE OR REPLACE FUNCTION cortex.record_prediction_outcome(
    p_prediction_id UUID,
    p_actual_outcome TEXT,
    p_actual_date DATE DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_predicted_outcome TEXT;
    v_approval_prob NUMERIC;
    v_crl_prob NUMERIC;
    v_rtf_prob NUMERIC;
    v_brier_score NUMERIC;
BEGIN
    -- Get prediction
    SELECT 
        CASE 
            WHEN approval_probability >= crl_probability AND approval_probability >= rtf_probability THEN 'approval'
            WHEN crl_probability >= approval_probability AND crl_probability >= rtf_probability THEN 'crl'
            ELSE 'rtf'
        END,
        approval_probability, crl_probability, rtf_probability
    INTO v_predicted_outcome, v_approval_prob, v_crl_prob, v_rtf_prob
    FROM cortex.intuition_predictions
    WHERE id = p_prediction_id;
    
    -- Calculate Brier score component
    v_brier_score := CASE p_actual_outcome
        WHEN 'approval' THEN POWER(1 - v_approval_prob, 2)
        WHEN 'crl' THEN POWER(1 - v_crl_prob, 2)
        WHEN 'rtf' THEN POWER(1 - v_rtf_prob, 2)
        ELSE 0.25 -- Unknown outcome
    END;
    
    -- Update prediction record
    UPDATE cortex.intuition_predictions
    SET actual_outcome = p_actual_outcome,
        actual_action_date = p_actual_date,
        outcome_recorded_at = NOW(),
        prediction_error = v_brier_score
    WHERE id = p_prediction_id;
    
    -- Update pattern statistics
    UPDATE cortex.rejection_patterns rp
    SET 
        true_positive_count = CASE 
            WHEN rp.predicted_outcome = p_actual_outcome THEN true_positive_count + 1 
            ELSE true_positive_count 
        END,
        false_positive_count = CASE 
            WHEN rp.predicted_outcome != p_actual_outcome THEN false_positive_count + 1 
            ELSE false_positive_count 
        END,
        last_observed = NOW(),
        precision_score = CASE 
            WHEN (true_positive_count + false_positive_count) > 0 
            THEN true_positive_count::NUMERIC / (true_positive_count + false_positive_count)
            ELSE NULL
        END
    WHERE rp.id = ANY(
        SELECT unnest(matched_pattern_ids) 
        FROM cortex.intuition_predictions 
        WHERE id = p_prediction_id
    );
END;
$$;

COMMENT ON FUNCTION cortex.record_prediction_outcome IS
'Record the actual outcome of a prediction for model learning and pattern refinement.
Updates pattern statistics and calculates prediction error.';

-- ============================================================================
-- SECTION 9: AUDIT TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS regulatory_signals_updated_at ON cortex.regulatory_signals;
CREATE TRIGGER regulatory_signals_updated_at
    BEFORE UPDATE ON cortex.regulatory_signals
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

DROP TRIGGER IF EXISTS rejection_patterns_updated_at ON cortex.rejection_patterns;
CREATE TRIGGER rejection_patterns_updated_at
    BEFORE UPDATE ON cortex.rejection_patterns
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

DROP TRIGGER IF EXISTS soft_signals_updated_at ON cortex.soft_signals;
CREATE TRIGGER soft_signals_updated_at
    BEFORE UPDATE ON cortex.soft_signals
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

-- ============================================================================
-- SECTION 10: SEED INITIAL SOFT SIGNALS
-- ============================================================================

INSERT INTO cortex.soft_signals (signal_category, signal_name, signal_description, discovered_by, is_active)
VALUES
    ('reviewer_word_choice', 'Hedging Language', 'Increased use of words like "may", "could", "potentially" indicating uncertainty', 'human_expert', TRUE),
    ('reviewer_word_choice', 'Definitive Language', 'Use of "must", "required", "essential" indicating firm positions', 'human_expert', TRUE),
    ('tone_shift', 'Formality Increase', 'Shift from casual to formal language mid-review', 'human_expert', TRUE),
    ('tone_shift', 'Urgency Markers', 'Language indicating time pressure or escalation', 'human_expert', TRUE),
    ('question_depth', 'Follow-up Depth', 'Number of follow-up questions on single topic', 'human_expert', TRUE),
    ('question_depth', 'Technical Granularity', 'Level of technical detail requested', 'human_expert', TRUE),
    ('response_timing', 'Rapid Response', 'Unusually quick agency response (within 24-48 hours)', 'human_expert', TRUE),
    ('response_timing', 'Extended Silence', 'Unusually long gap between communications', 'human_expert', TRUE),
    ('safety_language_intensity', 'Safety Emphasis', 'Frequency and intensity of safety-related concerns', 'human_expert', TRUE),
    ('efficacy_skepticism', 'Efficacy Questioning', 'Depth of questioning around efficacy claims', 'human_expert', TRUE),
    ('statistical_scrutiny', 'Statistical Deep Dive', 'Requests for additional statistical analyses', 'human_expert', TRUE),
    ('precedent_citation', 'Negative Precedent', 'Citation of cases where similar approaches failed', 'human_expert', TRUE),
    ('precedent_citation', 'Positive Precedent', 'Citation of successful precedent cases', 'human_expert', TRUE)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 11: COMPLETION
-- ============================================================================

COMMIT;

-- Log completion
DO $$
BEGIN
    RAISE NOTICE 'Migration 074: Regulatory Intuition Engine complete';
    RAISE NOTICE 'Tables created: regulatory_signals, rejection_patterns, intuition_predictions, soft_signals, timeline_predictions';
    RAISE NOTICE 'Functions created: extract_regulatory_signals, match_rejection_patterns, generate_intuition_prediction, record_prediction_outcome';
    RAISE NOTICE 'RLS enabled on all tables';
END $$;
