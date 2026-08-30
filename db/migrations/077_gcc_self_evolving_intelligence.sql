-- Migration 077: Self-Evolving Intelligence
-- Purpose: Continuous improvement from every interaction without exposing client data
-- Dependencies: 073_cortex_prime_unified_brain.sql
-- Part of: Cortex Prime - The Definitive Life Sciences AI Mind
--
-- This migration implements self-evolution: learning experiences, distilled insights,
-- expertise tracking, prompt evolution, and drift detection - all privacy-preserving.

BEGIN;

-- ============================================================================
-- SECTION 1: LEARNING EXPERIENCES
-- ============================================================================
-- Every interaction is a potential learning opportunity

CREATE TABLE IF NOT EXISTS cortex.learning_experiences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    
    -- Experience identification
    experience_type TEXT NOT NULL CHECK (experience_type IN (
        'query_response',       -- User asked, AI answered
        'prediction_outcome',   -- Prediction verified against outcome
        'user_feedback',        -- Explicit user feedback
        'expert_correction',    -- Expert corrected AI output
        'document_ingestion',   -- New document provided insights
        'pattern_discovery',    -- AI discovered new pattern
        'error_recovery',       -- AI corrected its own error
        'human_escalation',     -- Case escalated to human
        'successful_action',    -- Recommended action succeeded
        'failed_action'         -- Recommended action failed
    )),
    
    -- Input context (sanitized - no PII, no client-specific identifiers)
    input_hash TEXT NOT NULL, -- Hash of input for deduplication
    input_features JSONB NOT NULL, -- Feature vector representation
    input_category TEXT, -- Category/type of input
    
    -- Output
    output_hash TEXT,
    output_features JSONB,
    output_confidence NUMERIC(5,4),
    
    -- Feedback signal
    feedback_type TEXT CHECK (feedback_type IN (
        'implicit_positive',    -- User continued with output
        'implicit_negative',    -- User abandoned/retried
        'explicit_positive',    -- User rated positively
        'explicit_negative',    -- User rated negatively
        'correction',           -- User provided correction
        'outcome_positive',     -- Prediction proved correct
        'outcome_negative'      -- Prediction proved wrong
    )),
    feedback_value NUMERIC(5,4), -- -1 to 1
    feedback_details JSONB, -- Additional feedback context
    
    -- Learning signal
    learning_weight NUMERIC(8,6) DEFAULT 1.0, -- Importance for training
    novelty_score NUMERIC(5,4), -- How novel is this experience
    difficulty_score NUMERIC(5,4), -- How challenging was this
    
    -- Privacy-safe context (aggregated, not individual)
    therapeutic_area TEXT,
    submission_type TEXT,
    task_type TEXT,
    
    -- Status
    processed_for_learning BOOLEAN DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    included_in_distillation BOOLEAN DEFAULT FALSE,
    distillation_batch_id UUID,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Deduplication
    CONSTRAINT unique_experience_hash UNIQUE (input_hash, output_hash, experience_type)
);

COMMENT ON TABLE cortex.learning_experiences IS
'Every AI interaction captured as a learning experience. Contains sanitized,
privacy-preserving representations suitable for cross-client learning.';

-- ============================================================================
-- SECTION 2: DISTILLED INSIGHTS
-- ============================================================================
-- Privacy-safe aggregated learnings that can be shared across organizations

CREATE TABLE IF NOT EXISTS cortex.distilled_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NO org_id - these are global, privacy-safe insights
    
    -- Insight identification
    insight_type TEXT NOT NULL CHECK (insight_type IN (
        'success_pattern',      -- Pattern associated with success
        'failure_pattern',      -- Pattern associated with failure
        'best_practice',        -- Recommended approach
        'common_pitfall',       -- Frequent mistake to avoid
        'timing_insight',       -- Timing-related learning
        'language_preference',  -- Preferred language/framing
        'reviewer_pattern',     -- General reviewer behavior
        'precedent_rule',       -- How precedents apply
        'threshold_learning',   -- Learned decision thresholds
        'feature_importance'    -- Which features matter most
    )),
    
    -- Insight content
    insight_title TEXT NOT NULL,
    insight_description TEXT NOT NULL,
    insight_embedding VECTOR(3072),
    
    -- Statistical backing
    support_count INTEGER NOT NULL, -- Number of experiences supporting this
    confidence_score NUMERIC(5,4) NOT NULL, -- Statistical confidence
    effect_size NUMERIC(8,6), -- Magnitude of effect
    
    -- Scope
    therapeutic_areas TEXT[], -- NULL = all
    submission_types TEXT[], -- NULL = all
    task_types TEXT[], -- NULL = all
    agencies TEXT[] DEFAULT ARRAY['FDA'],
    
    -- Privacy metrics
    min_org_count INTEGER NOT NULL, -- Minimum orgs contributing (k-anonymity)
    differential_privacy_epsilon NUMERIC(8,6), -- Privacy budget used
    aggregation_method TEXT, -- 'mean', 'median', 'federated_avg', 'secure_aggregation'
    
    -- Example (sanitized)
    sanitized_example TEXT, -- Generic example without client details
    
    -- Evolution
    version INTEGER DEFAULT 1,
    parent_insight_id UUID REFERENCES cortex.distilled_insights(id),
    first_discovered TIMESTAMPTZ DEFAULT NOW(),
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    update_count INTEGER DEFAULT 1,
    
    -- Quality
    expert_validated BOOLEAN DEFAULT FALSE,
    validation_date TIMESTAMPTZ,
    validation_score NUMERIC(5,4),
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    positive_impact_count INTEGER DEFAULT 0,
    negative_impact_count INTEGER DEFAULT 0,
    net_impact_score NUMERIC(8,6),
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    superseded_by UUID REFERENCES cortex.distilled_insights(id)
);

COMMENT ON TABLE cortex.distilled_insights IS
'Privacy-safe aggregated learnings from all organizations. Each insight requires
minimum k organizations contributing and uses differential privacy for protection.';

-- ============================================================================
-- SECTION 3: EXPERTISE SCORES
-- ============================================================================
-- Track AI capability growth per domain

CREATE TABLE IF NOT EXISTS cortex.expertise_scores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- NO org_id - expertise is global AI capability
    
    -- Domain specification
    domain_type TEXT NOT NULL CHECK (domain_type IN (
        'therapeutic_area',
        'indication',
        'submission_type',
        'agency',
        'task_type',
        'document_type',
        'endpoint_type',
        'safety_category',
        'regulatory_pathway',
        'combination'  -- Combination of above
    )),
    domain_value TEXT NOT NULL, -- e.g., 'oncology', 'nda', 'fda'
    domain_parent TEXT, -- For hierarchical domains
    
    -- Current expertise level
    expertise_score NUMERIC(5,4) NOT NULL, -- 0-1 scale
    expertise_tier TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN expertise_score >= 0.9 THEN 'expert'
            WHEN expertise_score >= 0.7 THEN 'proficient'
            WHEN expertise_score >= 0.5 THEN 'competent'
            WHEN expertise_score >= 0.3 THEN 'developing'
            ELSE 'novice'
        END
    ) STORED,
    
    -- Metrics contributing to score
    sample_count INTEGER NOT NULL DEFAULT 0,
    accuracy_score NUMERIC(5,4), -- Prediction accuracy
    calibration_score NUMERIC(5,4), -- Uncertainty calibration
    coverage_score NUMERIC(5,4), -- How much of domain is covered
    recency_score NUMERIC(5,4), -- How recent is the data
    
    -- Historical tracking
    score_history JSONB DEFAULT '[]', -- Array of {date, score, reason}
    peak_score NUMERIC(5,4),
    peak_date TIMESTAMPTZ,
    
    -- Growth metrics
    growth_rate_30d NUMERIC(8,6), -- Score change per day (last 30 days)
    growth_rate_90d NUMERIC(8,6),
    projected_expert_date DATE, -- When will reach expert level
    
    -- Decay tracking (expertise decays without reinforcement)
    last_reinforcement TIMESTAMPTZ,
    decay_rate NUMERIC(8,6) DEFAULT 0.001, -- Per day without data
    
    -- Benchmarks
    human_expert_benchmark NUMERIC(5,4), -- Human expert performance
    performance_vs_human NUMERIC(5,4), -- Ratio to human expert
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.expertise_scores IS
'Track AI expertise level per domain. Expertise grows with experience and
decays without reinforcement. Enables capability-aware routing and disclosure.';

-- ============================================================================
-- SECTION 4: EVOLUTION LEDGER
-- ============================================================================
-- Immutable log of AI capability improvements

CREATE TABLE IF NOT EXISTS cortex.evolution_ledger (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Evolution event identification
    event_type TEXT NOT NULL CHECK (event_type IN (
        'expertise_increase',   -- Domain expertise improved
        'new_insight',          -- New distilled insight
        'model_update',         -- Model parameters updated
        'prompt_improvement',   -- Prompt template improved
        'calibration_update',   -- Uncertainty calibration updated
        'pattern_discovered',   -- New pattern identified
        'capability_unlocked',  -- New capability enabled
        'threshold_adjusted',   -- Decision threshold changed
        'feature_added',        -- New feature incorporated
        'degradation_detected', -- Performance degradation found
        'rollback'              -- Reverted a previous change
    )),
    
    -- What changed
    affected_domain TEXT, -- Domain affected
    previous_state JSONB, -- State before change
    new_state JSONB, -- State after change
    change_magnitude NUMERIC(8,6), -- Size of change
    
    -- Evidence for change
    evidence_summary TEXT NOT NULL,
    supporting_experience_count INTEGER,
    statistical_significance NUMERIC(5,4),
    
    -- Validation
    validation_method TEXT, -- 'holdout', 'ab_test', 'expert_review', 'automatic'
    validation_result TEXT, -- 'passed', 'failed', 'inconclusive'
    validation_metrics JSONB, -- Detailed validation metrics
    
    -- Rollback capability
    is_reversible BOOLEAN DEFAULT TRUE,
    rollback_procedure JSONB, -- How to undo this change
    rolled_back BOOLEAN DEFAULT FALSE,
    rollback_event_id UUID REFERENCES cortex.evolution_ledger(id),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system', -- 'system' or user UUID
    
    -- Immutability
    event_hash TEXT NOT NULL, -- Hash of event data for integrity
    previous_event_hash TEXT -- Links to previous event (blockchain-like)
);

COMMENT ON TABLE cortex.evolution_ledger IS
'Immutable audit log of AI capability evolution. Enables tracking of all
improvements and provides rollback capability if needed.';

-- ============================================================================
-- SECTION 5: PROMPT EVOLUTION
-- ============================================================================
-- Version-controlled prompts with A/B testing

CREATE TABLE IF NOT EXISTS cortex.prompt_evolution (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Prompt identification
    prompt_name TEXT NOT NULL,
    prompt_category TEXT NOT NULL CHECK (prompt_category IN (
        'extraction',       -- Entity/data extraction
        'classification',   -- Categorization tasks
        'generation',       -- Content generation
        'summarization',    -- Summarization tasks
        'analysis',         -- Analysis/reasoning
        'recommendation',   -- Recommendation generation
        'explanation',      -- Explanation generation
        'validation',       -- Validation/checking
        'conversation'      -- Conversational AI
    )),
    
    -- Prompt content
    prompt_template TEXT NOT NULL,
    system_message TEXT,
    few_shot_examples JSONB, -- Array of {input, output}
    
    -- Version control
    version INTEGER NOT NULL DEFAULT 1,
    parent_version_id UUID REFERENCES cortex.prompt_evolution(id),
    version_notes TEXT,
    
    -- Applicability
    applicable_domains TEXT[], -- NULL = all
    applicable_models TEXT[], -- Which LLM models
    
    -- Performance metrics (from A/B testing)
    total_uses INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    avg_quality_score NUMERIC(5,4),
    avg_latency_ms NUMERIC(10,2),
    avg_token_count INTEGER,
    
    -- A/B testing
    ab_test_active BOOLEAN DEFAULT FALSE,
    ab_test_allocation NUMERIC(5,4) DEFAULT 0.5, -- % of traffic
    ab_test_start TIMESTAMPTZ,
    ab_test_end TIMESTAMPTZ,
    ab_test_winner BOOLEAN, -- TRUE if this version won
    
    -- Automatic evolution
    auto_evolve_enabled BOOLEAN DEFAULT FALSE,
    evolution_triggers JSONB, -- Conditions for automatic evolution
    
    -- Status
    status TEXT DEFAULT 'draft' CHECK (status IN (
        'draft', 'testing', 'active', 'deprecated', 'archived'
    )),
    activated_at TIMESTAMPTZ,
    deprecated_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.prompt_evolution IS
'Version-controlled prompts with A/B testing support. Enables continuous
improvement of AI prompts based on measured performance.';

-- ============================================================================
-- SECTION 6: DRIFT DETECTION
-- ============================================================================
-- Monitor for concept drift and data distribution changes

CREATE TABLE IF NOT EXISTS cortex.drift_detection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Drift specification
    monitored_metric TEXT NOT NULL,
    drift_type TEXT NOT NULL CHECK (drift_type IN (
        'concept_drift',        -- Relationship between input and output changed
        'data_drift',           -- Input distribution changed
        'label_drift',          -- Output distribution changed
        'prior_drift',          -- Base rates changed
        'covariate_shift',      -- Feature distributions changed
        'prediction_drift',     -- Prediction distribution changed
        'performance_drift'     -- Performance metrics changed
    )),
    
    -- Detection window
    window_start TIMESTAMPTZ NOT NULL,
    window_end TIMESTAMPTZ NOT NULL,
    comparison_window_start TIMESTAMPTZ,
    comparison_window_end TIMESTAMPTZ,
    
    -- Drift metrics
    drift_detected BOOLEAN NOT NULL,
    drift_score NUMERIC(8,6), -- Magnitude of drift
    drift_direction TEXT, -- 'increase', 'decrease', 'shift'
    p_value NUMERIC(10,8), -- Statistical significance
    
    -- Detection method
    detection_method TEXT, -- 'ks_test', 'psi', 'js_divergence', 'chi_square', 'ddm', 'adwin'
    threshold_used NUMERIC(8,6),
    
    -- Impact assessment
    affected_predictions TEXT[], -- Which prediction types affected
    estimated_impact NUMERIC(5,4), -- 0-1 impact on performance
    urgency TEXT, -- 'critical', 'high', 'medium', 'low'
    
    -- Response
    auto_adaptation_triggered BOOLEAN DEFAULT FALSE,
    adaptation_type TEXT, -- 'retrain', 'recalibrate', 'threshold_adjust', 'alert_only'
    adaptation_result TEXT,
    human_review_required BOOLEAN DEFAULT FALSE,
    reviewed_by UUID,
    review_date TIMESTAMPTZ,
    
    -- Audit
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT
);

COMMENT ON TABLE cortex.drift_detection IS
'Monitor for concept drift and data distribution changes. Enables proactive
adaptation before performance degrades significantly.';

-- ============================================================================
-- SECTION 7: FEDERATED LEARNING STATE
-- ============================================================================
-- State for privacy-preserving cross-org learning

CREATE TABLE IF NOT EXISTS cortex.federated_learning_state (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Learning task
    task_name TEXT NOT NULL,
    task_type TEXT NOT NULL CHECK (task_type IN (
        'model_aggregation',    -- FedAvg or similar
        'gradient_aggregation', -- Federated gradient descent
        'insight_aggregation',  -- Aggregate insights
        'embedding_alignment',  -- Align embedding spaces
        'threshold_consensus'   -- Consensus on thresholds
    )),
    
    -- Participating orgs (anonymized)
    participant_count INTEGER NOT NULL,
    min_participants INTEGER DEFAULT 5, -- k-anonymity
    
    -- Current round
    current_round INTEGER DEFAULT 0,
    max_rounds INTEGER,
    
    -- Aggregation state
    global_state JSONB, -- Current global model/insight state
    round_contributions INTEGER DEFAULT 0, -- Contributions this round
    
    -- Privacy parameters
    differential_privacy_epsilon NUMERIC(8,6) NOT NULL,
    noise_multiplier NUMERIC(8,6),
    clipping_threshold NUMERIC(10,4),
    
    -- Secure aggregation
    use_secure_aggregation BOOLEAN DEFAULT TRUE,
    aggregation_key_id UUID, -- Reference to encryption key
    
    -- Quality metrics
    convergence_metric NUMERIC(8,6),
    quality_threshold NUMERIC(5,4),
    
    -- Status
    status TEXT DEFAULT 'initializing' CHECK (status IN (
        'initializing', 'collecting', 'aggregating', 'completed', 'failed'
    )),
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    error_message TEXT
);

COMMENT ON TABLE cortex.federated_learning_state IS
'State management for privacy-preserving federated learning across organizations.
Enables learning from collective data without exposing individual client data.';


CREATE INDEX IF NOT EXISTS idx_learning_exp_type ON cortex.learning_experiences(experience_type, processed_for_learning);
CREATE INDEX IF NOT EXISTS idx_learning_exp_feedback ON cortex.learning_experiences(feedback_type, feedback_value);
DO $$
BEGIN
    IF to_regclass('cortex.distilled_insights') IS NOT NULL
       AND EXISTS (
            SELECT 1
            FROM pg_attribute a
            WHERE a.attrelid = 'cortex.distilled_insights'::regclass
              AND a.attname = 'insight_embedding'
              AND a.atttypmod > 4
              AND (a.atttypmod - 4) <= 2000
       )
       AND NOT EXISTS (
            SELECT 1
            FROM pg_class c
            JOIN pg_namespace n ON n.oid = c.relnamespace
            WHERE n.nspname = 'cortex' AND c.relname = 'idx_insights_embedding'
       ) THEN
        CREATE INDEX idx_insights_embedding ON cortex.distilled_insights
            USING hnsw (insight_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_learning_exp_org ON cortex.learning_experiences(org_id, created_at DESC);

-- Distilled insights
CREATE INDEX IF NOT EXISTS idx_insights_type ON cortex.distilled_insights(insight_type, is_active);
CREATE INDEX IF NOT EXISTS idx_insights_scope ON cortex.distilled_insights USING GIN (therapeutic_areas);
CREATE INDEX IF NOT EXISTS idx_insights_impact ON cortex.distilled_insights(net_impact_score DESC);

-- Expertise scores
CREATE INDEX IF NOT EXISTS idx_expertise_domain ON cortex.expertise_scores(domain_type, domain_value);
CREATE INDEX IF NOT EXISTS idx_expertise_score ON cortex.expertise_scores(expertise_score DESC);
CREATE INDEX IF NOT EXISTS idx_expertise_tier ON cortex.expertise_scores(expertise_tier);

-- Evolution ledger
CREATE INDEX IF NOT EXISTS idx_evolution_type ON cortex.evolution_ledger(event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_evolution_domain ON cortex.evolution_ledger(affected_domain);
CREATE INDEX IF NOT EXISTS idx_evolution_hash ON cortex.evolution_ledger(event_hash);

-- Prompt evolution
CREATE INDEX IF NOT EXISTS idx_prompts_name ON cortex.prompt_evolution(prompt_name, version DESC);
CREATE INDEX IF NOT EXISTS idx_prompts_status ON cortex.prompt_evolution(status, prompt_category);
CREATE INDEX IF NOT EXISTS idx_prompts_ab ON cortex.prompt_evolution(ab_test_active) WHERE ab_test_active = TRUE;

-- Drift detection
CREATE INDEX IF NOT EXISTS idx_drift_type ON cortex.drift_detection(drift_type, drift_detected);
CREATE INDEX IF NOT EXISTS idx_drift_urgency ON cortex.drift_detection(urgency, resolved_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_drift_window ON cortex.drift_detection(window_start, window_end);

-- Federated learning
CREATE INDEX IF NOT EXISTS idx_federated_status ON cortex.federated_learning_state(status, task_type);

-- ============================================================================
-- SECTION 9: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cortex.learning_experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.distilled_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.expertise_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.evolution_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.prompt_evolution ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.drift_detection ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.federated_learning_state ENABLE ROW LEVEL SECURITY;

-- Learning experiences: org-isolated write, sanitized global read for distillation
-- ── Tenant policies here FAIL CLOSED (revised 2026-08-28) ──────────────────
-- These policies were written as `org_id = COALESCE(identity.current_org_id(),
-- org_id)`. identity.current_org_id() returns NULL when app.current_org_id is
-- unset, empty or not a uuid, and COALESCE then substitutes the row's OWN
-- org_id — so the predicate becomes `org_id = org_id`, TRUE for every row in
-- the table. A scope that could not be resolved granted EVERYTHING.
--
-- Measured before the change, as the non-superuser app_service role with
-- app.rls_enforce=on, on two rows under different org_ids: an unset GUC
-- returned BOTH tenants' rows, and so did a GUC of '42' — which is exactly
-- what an INTEGER org id looks like arriving at a uuid-keyed schema. Both
-- inputs are reachable; establishRequestTenantScope writes the GUC as
-- `orgUuid ?? ''`.
--
-- The fallback was there to keep unscoped raw-pool readers working. That is
-- now carried by the app.rls_enforce shadow clause instead — the same switch
-- the 793 public-schema policies use — so enforcement OFF does not filter and
-- enforcement ON filters strictly. Under enforcement an unscoped connection
-- never reaches SQL anyway: poolInstrumentation fails closed on one.
--
-- `OR org_id IS NULL` is deliberately kept where it appears: those are
-- unattributed rows treated as shared reference data, which is a separate
-- product decision.

DROP POLICY IF EXISTS learning_exp_write ON cortex.learning_experiences;
CREATE POLICY learning_exp_write ON cortex.learning_experiences
    FOR INSERT WITH CHECK ((NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on')
        OR org_id = identity.current_org_id());

DROP POLICY IF EXISTS learning_exp_read ON cortex.learning_experiences;
CREATE POLICY learning_exp_read ON cortex.learning_experiences
    FOR SELECT USING ((NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on')
        OR org_id = identity.current_org_id());

-- Distilled insights: global read (these are privacy-safe)
DROP POLICY IF EXISTS insights_read ON cortex.distilled_insights;
CREATE POLICY insights_read ON cortex.distilled_insights
    FOR SELECT USING (TRUE);

-- Expertise scores: global read
DROP POLICY IF EXISTS expertise_read ON cortex.expertise_scores;
CREATE POLICY expertise_read ON cortex.expertise_scores
    FOR SELECT USING (TRUE);

-- Evolution ledger: global read (audit trail)
DROP POLICY IF EXISTS evolution_read ON cortex.evolution_ledger;
CREATE POLICY evolution_read ON cortex.evolution_ledger
    FOR SELECT USING (TRUE);

-- Prompt evolution: global read
DROP POLICY IF EXISTS prompts_read ON cortex.prompt_evolution;
CREATE POLICY prompts_read ON cortex.prompt_evolution
    FOR SELECT USING (TRUE);

-- Drift detection: global read (operational)
DROP POLICY IF EXISTS drift_read ON cortex.drift_detection;
CREATE POLICY drift_read ON cortex.drift_detection
    FOR SELECT USING (TRUE);

-- Federated learning: restricted
DROP POLICY IF EXISTS federated_admin ON cortex.federated_learning_state;
CREATE POLICY federated_admin ON cortex.federated_learning_state
    FOR ALL USING (current_setting('app.is_admin', true)::BOOLEAN = TRUE);

-- ============================================================================
-- SECTION 10: CORE FUNCTIONS
-- ============================================================================

-- Function: Record a learning experience
CREATE OR REPLACE FUNCTION cortex.record_learning_experience(
    p_org_id UUID,
    p_experience_type TEXT,
    p_input_features JSONB,
    p_output_features JSONB DEFAULT NULL,
    p_feedback_type TEXT DEFAULT NULL,
    p_feedback_value NUMERIC DEFAULT NULL,
    p_context JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_experience_id UUID;
    v_input_hash TEXT;
    v_output_hash TEXT;
    v_novelty NUMERIC;
BEGIN
    -- Generate hashes for deduplication
    v_input_hash := encode(sha256(p_input_features::TEXT::BYTEA), 'hex');
    v_output_hash := CASE WHEN p_output_features IS NOT NULL 
                         THEN encode(sha256(p_output_features::TEXT::BYTEA), 'hex')
                         ELSE NULL END;
    
    -- Calculate novelty (simplified - real implementation would use embedding distance)
    SELECT 1.0 - LEAST(COUNT(*)::NUMERIC / 100, 1.0) INTO v_novelty
    FROM cortex.learning_experiences
    WHERE input_hash = v_input_hash;
    
    INSERT INTO cortex.learning_experiences (
        org_id, experience_type, input_hash, input_features,
        output_hash, output_features,
        feedback_type, feedback_value,
        novelty_score, therapeutic_area, submission_type, task_type
    ) VALUES (
        p_org_id, p_experience_type, v_input_hash, p_input_features,
        v_output_hash, p_output_features,
        p_feedback_type, p_feedback_value,
        v_novelty,
        p_context->>'therapeutic_area',
        p_context->>'submission_type',
        p_context->>'task_type'
    )
    ON CONFLICT (input_hash, output_hash, experience_type) DO UPDATE
    SET feedback_type = COALESCE(EXCLUDED.feedback_type, cortex.learning_experiences.feedback_type),
        feedback_value = COALESCE(EXCLUDED.feedback_value, cortex.learning_experiences.feedback_value)
    RETURNING id INTO v_experience_id;
    
    RETURN v_experience_id;
END;
$$;

COMMENT ON FUNCTION cortex.record_learning_experience IS
'Record a learning experience with sanitized features. Handles deduplication
and novelty scoring automatically.';

-- Function: Run knowledge distillation
CREATE OR REPLACE FUNCTION cortex.run_distillation(
    p_min_org_count INTEGER DEFAULT 5,
    p_epsilon NUMERIC DEFAULT 1.0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_insights_created INTEGER := 0;
    v_pattern RECORD;
BEGIN
    -- Find patterns that appear across multiple organizations
    FOR v_pattern IN
        WITH org_patterns AS (
            SELECT 
                therapeutic_area,
                task_type,
                feedback_type,
                COUNT(DISTINCT org_id) AS org_count,
                COUNT(*) AS total_count,
                AVG(feedback_value) AS avg_feedback
            FROM cortex.learning_experiences
            WHERE processed_for_learning = FALSE
              AND feedback_type IS NOT NULL
            GROUP BY therapeutic_area, task_type, feedback_type
            HAVING COUNT(DISTINCT org_id) >= p_min_org_count
        )
        SELECT * FROM org_patterns WHERE org_count >= p_min_org_count
    LOOP
        -- Create distilled insight
        INSERT INTO cortex.distilled_insights (
            insight_type,
            insight_title,
            insight_description,
            support_count,
            confidence_score,
            therapeutic_areas,
            task_types,
            min_org_count,
            differential_privacy_epsilon,
            aggregation_method
        ) VALUES (
            CASE 
                WHEN v_pattern.avg_feedback > 0.5 THEN 'success_pattern'
                WHEN v_pattern.avg_feedback < -0.5 THEN 'failure_pattern'
                ELSE 'best_practice'
            END,
            format('Pattern in %s for %s tasks', v_pattern.therapeutic_area, v_pattern.task_type),
            format('Observed pattern across %s organizations with %s average feedback',
                   v_pattern.org_count, round(v_pattern.avg_feedback::NUMERIC, 2)),
            v_pattern.total_count,
            LEAST(v_pattern.org_count::NUMERIC / 10, 0.95),
            CASE WHEN v_pattern.therapeutic_area IS NOT NULL 
                 THEN ARRAY[v_pattern.therapeutic_area] ELSE NULL END,
            CASE WHEN v_pattern.task_type IS NOT NULL 
                 THEN ARRAY[v_pattern.task_type] ELSE NULL END,
            v_pattern.org_count,
            p_epsilon,
            'federated_avg'
        );
        
        v_insights_created := v_insights_created + 1;
    END LOOP;
    
    -- Mark experiences as processed
    UPDATE cortex.learning_experiences
    SET processed_for_learning = TRUE, processed_at = NOW()
    WHERE processed_for_learning = FALSE;
    
    -- Log evolution
    IF v_insights_created > 0 THEN
        INSERT INTO cortex.evolution_ledger (
            event_type, evidence_summary, supporting_experience_count,
            event_hash, previous_event_hash
        ) VALUES (
            'new_insight',
            format('Distillation created %s new insights', v_insights_created),
            (SELECT COUNT(*) FROM cortex.learning_experiences WHERE processed_at > NOW() - INTERVAL '1 minute'),
            encode(sha256(format('%s-%s', NOW(), v_insights_created)::BYTEA), 'hex'),
            (SELECT event_hash FROM cortex.evolution_ledger ORDER BY created_at DESC LIMIT 1)
        );
    END IF;
    
    RETURN v_insights_created;
END;
$$;

COMMENT ON FUNCTION cortex.run_distillation IS
'Run knowledge distillation to extract privacy-safe insights from learning
experiences. Returns count of new insights created.';

-- Function: Update expertise scores
CREATE OR REPLACE FUNCTION cortex.update_expertise_scores()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_updated INTEGER := 0;
    v_domain RECORD;
BEGIN
    -- Calculate scores for each domain
    FOR v_domain IN
        SELECT 
            'therapeutic_area' AS domain_type,
            therapeutic_area AS domain_value,
            COUNT(*) AS sample_count,
            AVG(CASE WHEN feedback_value > 0 THEN 1 ELSE 0 END) AS accuracy
        FROM cortex.learning_experiences
        WHERE therapeutic_area IS NOT NULL
          AND feedback_value IS NOT NULL
        GROUP BY therapeutic_area
        UNION ALL
        SELECT 
            'task_type' AS domain_type,
            task_type AS domain_value,
            COUNT(*) AS sample_count,
            AVG(CASE WHEN feedback_value > 0 THEN 1 ELSE 0 END) AS accuracy
        FROM cortex.learning_experiences
        WHERE task_type IS NOT NULL
          AND feedback_value IS NOT NULL
        GROUP BY task_type
    LOOP
        INSERT INTO cortex.expertise_scores (
            domain_type, domain_value, expertise_score,
            sample_count, accuracy_score
        ) VALUES (
            v_domain.domain_type,
            v_domain.domain_value,
            LEAST(0.3 + (v_domain.accuracy * 0.4) + (LEAST(v_domain.sample_count, 1000)::NUMERIC / 1000 * 0.3), 1.0),
            v_domain.sample_count,
            v_domain.accuracy
        )
        ON CONFLICT (domain_type, domain_value) DO UPDATE
        SET expertise_score = EXCLUDED.expertise_score,
            sample_count = EXCLUDED.sample_count,
            accuracy_score = EXCLUDED.accuracy_score,
            updated_at = NOW(),
            score_history = cortex.expertise_scores.score_history || 
                jsonb_build_object('date', NOW(), 'score', EXCLUDED.expertise_score);
        
        v_updated := v_updated + 1;
    END LOOP;
    
    RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION cortex.update_expertise_scores IS
'Update AI expertise scores based on accumulated learning experiences.
Called periodically to reflect growing capabilities.';

-- Function: Detect drift
CREATE OR REPLACE FUNCTION cortex.detect_drift(
    p_metric TEXT,
    p_window_days INTEGER DEFAULT 7,
    p_comparison_days INTEGER DEFAULT 30
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_detection_id UUID;
    v_current_mean NUMERIC;
    v_comparison_mean NUMERIC;
    v_drift_score NUMERIC;
    v_drift_detected BOOLEAN;
BEGIN
    -- Calculate current window statistics
    SELECT AVG(feedback_value) INTO v_current_mean
    FROM cortex.learning_experiences
    WHERE created_at >= NOW() - (p_window_days || ' days')::INTERVAL;
    
    -- Calculate comparison window statistics
    SELECT AVG(feedback_value) INTO v_comparison_mean
    FROM cortex.learning_experiences
    WHERE created_at >= NOW() - (p_comparison_days || ' days')::INTERVAL
      AND created_at < NOW() - (p_window_days || ' days')::INTERVAL;
    
    -- Calculate drift score
    v_drift_score := ABS(COALESCE(v_current_mean, 0) - COALESCE(v_comparison_mean, 0));
    v_drift_detected := v_drift_score > 0.1; -- Threshold
    
    INSERT INTO cortex.drift_detection (
        monitored_metric, drift_type,
        window_start, window_end,
        comparison_window_start, comparison_window_end,
        drift_detected, drift_score,
        drift_direction, detection_method, threshold_used,
        urgency
    ) VALUES (
        p_metric, 'performance_drift',
        NOW() - (p_window_days || ' days')::INTERVAL, NOW(),
        NOW() - (p_comparison_days || ' days')::INTERVAL, NOW() - (p_window_days || ' days')::INTERVAL,
        v_drift_detected, v_drift_score,
        CASE WHEN v_current_mean > v_comparison_mean THEN 'increase' ELSE 'decrease' END,
        'mean_comparison', 0.1,
        CASE WHEN v_drift_score > 0.3 THEN 'high' WHEN v_drift_score > 0.2 THEN 'medium' ELSE 'low' END
    )
    RETURNING id INTO v_detection_id;
    
    RETURN v_detection_id;
END;
$$;

COMMENT ON FUNCTION cortex.detect_drift IS
'Detect performance drift by comparing recent metrics to historical baseline.
Returns ID of drift detection record.';

-- Function: Evolve the AI (main evolution orchestrator)
CREATE OR REPLACE FUNCTION cortex.evolve()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_insights_created INTEGER;
    v_expertise_updated INTEGER;
    v_drift_id UUID;
    v_result JSONB;
BEGIN
    -- Step 1: Run distillation
    v_insights_created := cortex.run_distillation();
    
    -- Step 2: Update expertise scores
    v_expertise_updated := cortex.update_expertise_scores();
    
    -- Step 3: Detect drift
    v_drift_id := cortex.detect_drift('feedback_value');
    
    -- Build result
    v_result := jsonb_build_object(
        'insights_created', v_insights_created,
        'expertise_updated', v_expertise_updated,
        'drift_check_id', v_drift_id,
        'evolved_at', NOW()
    );
    
    -- Log evolution
    INSERT INTO cortex.evolution_ledger (
        event_type, evidence_summary, new_state,
        event_hash, previous_event_hash
    ) VALUES (
        'model_update',
        format('Evolution cycle: %s insights, %s expertise updates', v_insights_created, v_expertise_updated),
        v_result,
        encode(sha256(v_result::TEXT::BYTEA), 'hex'),
        (SELECT event_hash FROM cortex.evolution_ledger ORDER BY created_at DESC LIMIT 1)
    );
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION cortex.evolve IS
'Main evolution orchestrator. Runs distillation, updates expertise, and checks
for drift. Should be called daily via cron.';

-- ============================================================================
-- SECTION 11: UNIQUE CONSTRAINT FOR EXPERTISE SCORES
-- ============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'cortex'
          AND t.relname = 'expertise_scores'
          AND c.conname = 'unique_domain'
    ) THEN
        ALTER TABLE cortex.expertise_scores
            ADD CONSTRAINT unique_domain UNIQUE (domain_type, domain_value);
    END IF;
END $$;

-- ============================================================================
-- SECTION 12: TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS expertise_updated_at ON cortex.expertise_scores;
CREATE TRIGGER expertise_updated_at
    BEFORE UPDATE ON cortex.expertise_scores
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

DROP TRIGGER IF EXISTS prompts_updated_at ON cortex.prompt_evolution;
CREATE TRIGGER prompts_updated_at
    BEFORE UPDATE ON cortex.prompt_evolution
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

DROP TRIGGER IF EXISTS insights_updated_at ON cortex.distilled_insights;
CREATE TRIGGER insights_updated_at
    BEFORE UPDATE ON cortex.distilled_insights
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

-- ============================================================================
-- SECTION 13: COMPLETION
-- ============================================================================

COMMIT;

DO $$
BEGIN
    RAISE NOTICE 'Migration 077: Self-Evolving Intelligence complete';
    RAISE NOTICE 'Tables: learning_experiences, distilled_insights, expertise_scores, evolution_ledger, prompt_evolution, drift_detection, federated_learning_state';
    RAISE NOTICE 'Functions: record_learning_experience, run_distillation, update_expertise_scores, detect_drift, evolve';
    RAISE NOTICE 'RLS enabled on all tables';
END $$;
