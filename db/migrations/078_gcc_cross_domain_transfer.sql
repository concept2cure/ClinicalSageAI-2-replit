-- Migration 078: Cross-Domain Knowledge Transfer
-- Purpose: Apply learnings from one therapeutic area to another
-- Dependencies: 073_cortex_prime_unified_brain.sql, 077_gcc_self_evolving_intelligence.sql
-- Part of: Cortex Prime - The Definitive Life Sciences AI Mind
--
-- This migration implements transfer learning: domain knowledge mapping,
-- transfer viability assessment, adaptation tracking, and meta-learning.

BEGIN;

-- ============================================================================
-- SECTION 1: DOMAIN KNOWLEDGE
-- ============================================================================
-- Structured representation of knowledge per domain

CREATE TABLE IF NOT EXISTS cortex.domain_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Domain identification
    domain_type TEXT NOT NULL CHECK (domain_type IN (
        'therapeutic_area',
        'indication',
        'mechanism_of_action',
        'patient_population',
        'endpoint_type',
        'study_design',
        'regulatory_pathway',
        'safety_category',
        'manufacturing_type',
        'formulation_type'
    )),
    domain_value TEXT NOT NULL,
    domain_hierarchy TEXT[], -- e.g., ['oncology', 'solid_tumors', 'breast_cancer']
    
    -- Knowledge representation
    domain_embedding VECTOR(3072), -- Semantic representation
    key_concepts TEXT[], -- Core concepts in this domain
    concept_embeddings JSONB, -- {concept: embedding_array}
    
    -- Domain characteristics
    complexity_score NUMERIC(5,4), -- How complex is this domain
    data_richness_score NUMERIC(5,4), -- How much data we have
    regulatory_specificity NUMERIC(5,4), -- How unique are regulatory requirements
    
    -- Maturity assessment
    maturity_level TEXT GENERATED ALWAYS AS (
        CASE 
            WHEN data_richness_score >= 0.8 AND complexity_score < 0.7 THEN 'mature'
            WHEN data_richness_score >= 0.5 THEN 'developing'
            WHEN data_richness_score >= 0.2 THEN 'emerging'
            ELSE 'nascent'
        END
    ) STORED,
    
    -- Sample statistics
    sample_count INTEGER DEFAULT 0,
    successful_predictions INTEGER DEFAULT 0,
    prediction_accuracy NUMERIC(5,4),
    
    -- Key patterns learned
    learned_patterns JSONB DEFAULT '[]', -- Array of pattern summaries
    common_challenges TEXT[],
    success_factors TEXT[],
    
    -- Related domains
    parent_domain_id UUID REFERENCES cortex.domain_knowledge(id),
    sibling_domains UUID[], -- Related at same level
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.domain_knowledge IS
'Structured knowledge representation per domain. Enables understanding of
domain characteristics and identification of transfer opportunities.';

-- ============================================================================
-- SECTION 2: TRANSFER MAPPINGS
-- ============================================================================
-- Define how knowledge transfers between domains

CREATE TABLE IF NOT EXISTS cortex.transfer_mappings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Transfer specification
    source_domain_id UUID NOT NULL REFERENCES cortex.domain_knowledge(id),
    target_domain_id UUID NOT NULL REFERENCES cortex.domain_knowledge(id),
    
    -- Transfer viability
    transfer_strength NUMERIC(5,4) NOT NULL, -- 0-1, how well does knowledge transfer
    transfer_type TEXT NOT NULL CHECK (transfer_type IN (
        'direct',           -- Knowledge applies directly
        'analogical',       -- Knowledge applies via analogy
        'structural',       -- Structural similarities enable transfer
        'negative',         -- Anti-transfer (what NOT to do)
        'conditional'       -- Transfer under specific conditions
    )),
    
    -- Concept alignment
    concept_alignments JSONB NOT NULL, -- {source_concept: {target_concept, similarity, mapping_notes}}
    alignment_confidence NUMERIC(5,4),
    unmapped_source_concepts TEXT[], -- Concepts that don't transfer
    unmapped_target_concepts TEXT[], -- Concepts unique to target
    
    -- Risk assessment
    negative_transfer_risk NUMERIC(5,4), -- Risk of harmful transfer
    negative_transfer_factors TEXT[], -- What could go wrong
    
    -- Conditions
    transfer_conditions JSONB, -- When transfer is valid
    exceptions TEXT[], -- When transfer should NOT be used
    
    -- Validation
    validated BOOLEAN DEFAULT FALSE,
    validation_method TEXT,
    validation_score NUMERIC(5,4),
    validated_by UUID,
    validation_date TIMESTAMPTZ,
    
    -- Usage tracking
    usage_count INTEGER DEFAULT 0,
    success_count INTEGER DEFAULT 0,
    failure_count INTEGER DEFAULT 0,
    
    -- Discovery
    discovered_method TEXT, -- 'embedding_similarity', 'expert', 'data_driven', 'literature'
    discovery_date TIMESTAMPTZ DEFAULT NOW(),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    is_active BOOLEAN DEFAULT TRUE,
    
    CONSTRAINT different_domains CHECK (source_domain_id != target_domain_id)
);

COMMENT ON TABLE cortex.transfer_mappings IS
'Define how knowledge transfers between domains. Includes concept alignment,
risk assessment, and validation tracking.';

-- ============================================================================
-- SECTION 3: TRANSFER EPISODES
-- ============================================================================
-- Actual instances of knowledge transfer

CREATE TABLE IF NOT EXISTS cortex.transfer_episodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL,
    
    -- Transfer context
    mapping_id UUID NOT NULL REFERENCES cortex.transfer_mappings(id),
    task_type TEXT NOT NULL, -- What task triggered transfer
    task_id UUID, -- Reference to specific task
    
    -- Source knowledge
    source_knowledge_ids UUID[], -- Atoms/insights from source domain
    source_knowledge_summary TEXT,
    
    -- Adaptation applied
    adaptation_method TEXT NOT NULL CHECK (adaptation_method IN (
        'direct_application',    -- Apply without modification
        'feature_transform',     -- Transform features
        'embedding_projection',  -- Project to new embedding space
        'fine_tuning',          -- Fine-tune on target domain
        'prompt_adaptation',     -- Adapt prompts
        'weighted_ensemble',     -- Ensemble with domain weights
        'analogy_mapping'        -- Explicit analogy construction
    )),
    adaptation_params JSONB, -- Parameters used
    
    -- Transferred knowledge
    transferred_knowledge_ids UUID[], -- New atoms created from transfer
    transferred_knowledge_summary TEXT,
    
    -- Performance
    baseline_performance NUMERIC(5,4), -- Performance without transfer
    transfer_performance NUMERIC(5,4), -- Performance with transfer
    performance_lift NUMERIC(6,4), -- Improvement from transfer
    
    -- Confidence
    transfer_confidence NUMERIC(5,4), -- Confidence in transfer validity
    uncertainty_added NUMERIC(5,4), -- Additional uncertainty from transfer
    
    -- Outcome
    outcome TEXT CHECK (outcome IN ('success', 'partial', 'failure', 'pending')),
    outcome_notes TEXT,
    outcome_recorded_at TIMESTAMPTZ,
    
    -- Feedback
    user_feedback TEXT,
    user_rating INTEGER CHECK (user_rating BETWEEN 1 AND 5),
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.transfer_episodes IS
'Track actual knowledge transfer instances. Enables learning about
which transfers work and continuous improvement of transfer strategies.';

-- ============================================================================
-- SECTION 4: META-TRANSFER MODEL
-- ============================================================================
-- AI that learns HOW to transfer knowledge

CREATE TABLE IF NOT EXISTS cortex.meta_transfer_model (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Model identification
    model_name TEXT NOT NULL UNIQUE,
    model_version INTEGER DEFAULT 1,
    model_description TEXT,
    
    -- What predicts successful transfer
    feature_importance JSONB NOT NULL, -- {feature: importance_score}
    -- Features might include:
    -- - embedding_similarity
    -- - concept_overlap
    -- - regulatory_similarity
    -- - sample_size_ratio
    -- - complexity_difference
    
    -- Model parameters
    model_type TEXT NOT NULL, -- 'gradient_boosting', 'neural', 'rule_based'
    model_params JSONB,
    
    -- Training information
    training_episodes INTEGER, -- How many episodes trained on
    training_date TIMESTAMPTZ,
    
    -- Performance metrics
    transfer_prediction_accuracy NUMERIC(5,4), -- Can we predict if transfer will work
    lift_prediction_r2 NUMERIC(5,4), -- Can we predict how much lift
    calibration_score NUMERIC(5,4), -- Are confidence estimates accurate
    
    -- Decision thresholds
    min_transfer_strength NUMERIC(5,4) DEFAULT 0.5, -- When to attempt transfer
    negative_transfer_threshold NUMERIC(5,4) DEFAULT 0.3, -- When to block transfer
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.meta_transfer_model IS
'Model that learns to predict transfer success. Enables intelligent decisions
about when and how to transfer knowledge between domains.';

-- ============================================================================
-- SECTION 5: DOMAIN SIMILARITY CACHE
-- ============================================================================
-- Precomputed domain similarities for fast lookup

CREATE TABLE IF NOT EXISTS cortex.domain_similarity_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    domain_a_id UUID NOT NULL REFERENCES cortex.domain_knowledge(id),
    domain_b_id UUID NOT NULL REFERENCES cortex.domain_knowledge(id),
    
    -- Similarity metrics
    embedding_similarity NUMERIC(5,4), -- Cosine similarity of embeddings
    concept_overlap NUMERIC(5,4), -- Jaccard similarity of concepts
    structural_similarity NUMERIC(5,4), -- Similarity in hierarchy/structure
    regulatory_similarity NUMERIC(5,4), -- Similarity in regulatory requirements
    
    -- Composite score
    overall_similarity NUMERIC(5,4),
    
    -- Computation metadata
    computed_at TIMESTAMPTZ DEFAULT NOW(),
    computation_method TEXT,
    
    CONSTRAINT unique_domain_pair UNIQUE (domain_a_id, domain_b_id),
    CONSTRAINT ordered_domains CHECK (domain_a_id < domain_b_id)
);

COMMENT ON TABLE cortex.domain_similarity_cache IS
'Precomputed pairwise domain similarities. Enables fast identification
of transfer candidates without real-time computation.';

-- ============================================================================
-- SECTION 6: TRANSFER TEMPLATES
-- ============================================================================
-- Reusable patterns for common transfer scenarios

CREATE TABLE IF NOT EXISTS cortex.transfer_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Template identification
    template_name TEXT NOT NULL,
    template_description TEXT,
    
    -- Applicability
    source_domain_types TEXT[], -- Which domain types this template applies to
    target_domain_types TEXT[],
    task_types TEXT[], -- Which tasks
    
    -- Transfer recipe
    adaptation_steps JSONB NOT NULL, -- Array of {step, action, params}
    -- Example: [
    --   {"step": 1, "action": "extract_concepts", "params": {"threshold": 0.7}},
    --   {"step": 2, "action": "align_concepts", "params": {"method": "embedding"}},
    --   {"step": 3, "action": "transform_features", "params": {"projection": "linear"}}
    -- ]
    
    -- Configuration
    default_params JSONB,
    tunable_params TEXT[],
    
    -- Performance
    avg_success_rate NUMERIC(5,4),
    avg_lift NUMERIC(5,4),
    usage_count INTEGER DEFAULT 0,
    
    -- Validation
    validated BOOLEAN DEFAULT FALSE,
    validation_notes TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE cortex.transfer_templates IS
'Reusable recipes for knowledge transfer. Encodes best practices for
common transfer scenarios.';

-- ============================================================================
-- SECTION 7: INDEXES
-- ============================================================================

-- Domain knowledge
CREATE INDEX IF NOT EXISTS idx_domain_type_value ON cortex.domain_knowledge(domain_type, domain_value);
CREATE INDEX IF NOT EXISTS idx_domain_embedding ON cortex.domain_knowledge 
    USING hnsw (domain_embedding vector_cosine_ops) WITH (m = 16, ef_construction = 64);
CREATE INDEX IF NOT EXISTS idx_domain_maturity ON cortex.domain_knowledge(maturity_level);
CREATE INDEX IF NOT EXISTS idx_domain_hierarchy ON cortex.domain_knowledge USING GIN (domain_hierarchy);

-- Transfer mappings
CREATE INDEX IF NOT EXISTS idx_transfer_source ON cortex.transfer_mappings(source_domain_id, is_active);
CREATE INDEX IF NOT EXISTS idx_transfer_target ON cortex.transfer_mappings(target_domain_id, is_active);
CREATE INDEX IF NOT EXISTS idx_transfer_strength ON cortex.transfer_mappings(transfer_strength DESC) 
    WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_transfer_validated ON cortex.transfer_mappings(validated, validation_score DESC);

-- Transfer episodes
CREATE INDEX IF NOT EXISTS idx_episodes_org ON cortex.transfer_episodes(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_episodes_mapping ON cortex.transfer_episodes(mapping_id, outcome);
CREATE INDEX IF NOT EXISTS idx_episodes_lift ON cortex.transfer_episodes(performance_lift DESC);

-- Similarity cache
CREATE INDEX IF NOT EXISTS idx_similarity_domain_a ON cortex.domain_similarity_cache(domain_a_id);
CREATE INDEX IF NOT EXISTS idx_similarity_domain_b ON cortex.domain_similarity_cache(domain_b_id);
CREATE INDEX IF NOT EXISTS idx_similarity_score ON cortex.domain_similarity_cache(overall_similarity DESC);

-- Transfer templates
CREATE INDEX IF NOT EXISTS idx_templates_domains ON cortex.transfer_templates 
    USING GIN (source_domain_types);
CREATE INDEX IF NOT EXISTS idx_templates_active ON cortex.transfer_templates(is_active, avg_success_rate DESC);

-- ============================================================================
-- SECTION 8: ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE cortex.domain_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.transfer_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.transfer_episodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.meta_transfer_model ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.domain_similarity_cache ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.transfer_templates ENABLE ROW LEVEL SECURITY;

-- Domain knowledge: global read
CREATE POLICY domain_knowledge_read ON cortex.domain_knowledge
    FOR SELECT USING (TRUE);

-- Transfer mappings: global read
CREATE POLICY transfer_mappings_read ON cortex.transfer_mappings
    FOR SELECT USING (TRUE);

-- Transfer episodes: org-isolated
CREATE POLICY transfer_episodes_isolation ON cortex.transfer_episodes
    FOR ALL USING (org_id = COALESCE(current_setting('app.current_org_id', true)::UUID, org_id));

-- Meta-transfer model: global read
CREATE POLICY meta_transfer_read ON cortex.meta_transfer_model
    FOR SELECT USING (TRUE);

-- Similarity cache: global read
CREATE POLICY similarity_cache_read ON cortex.domain_similarity_cache
    FOR SELECT USING (TRUE);

-- Templates: global read
CREATE POLICY templates_read ON cortex.transfer_templates
    FOR SELECT USING (TRUE);

-- ============================================================================
-- SECTION 9: CORE FUNCTIONS
-- ============================================================================

-- Function: Find transfer candidates for a domain
CREATE OR REPLACE FUNCTION cortex.find_transfer_candidates(
    p_target_domain_id UUID,
    p_min_similarity NUMERIC DEFAULT 0.5,
    p_max_results INTEGER DEFAULT 10
)
RETURNS TABLE(
    source_domain_id UUID,
    source_domain_type TEXT,
    source_domain_value TEXT,
    similarity_score NUMERIC,
    transfer_strength NUMERIC,
    mapping_id UUID
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    WITH target_domain AS (
        SELECT id, domain_embedding FROM cortex.domain_knowledge WHERE id = p_target_domain_id
    ),
    candidates AS (
        SELECT 
            dk.id,
            dk.domain_type,
            dk.domain_value,
            1 - (dk.domain_embedding <=> td.domain_embedding) AS sim_score
        FROM cortex.domain_knowledge dk
        CROSS JOIN target_domain td
        WHERE dk.id != p_target_domain_id
          AND dk.domain_embedding IS NOT NULL
          AND td.domain_embedding IS NOT NULL
    )
    SELECT 
        c.id AS source_domain_id,
        c.domain_type AS source_domain_type,
        c.domain_value AS source_domain_value,
        c.sim_score AS similarity_score,
        tm.transfer_strength,
        tm.id AS mapping_id
    FROM candidates c
    LEFT JOIN cortex.transfer_mappings tm 
        ON tm.source_domain_id = c.id 
        AND tm.target_domain_id = p_target_domain_id
        AND tm.is_active = TRUE
    WHERE c.sim_score >= p_min_similarity
    ORDER BY COALESCE(tm.transfer_strength, c.sim_score) DESC
    LIMIT p_max_results;
END;
$$;

COMMENT ON FUNCTION cortex.find_transfer_candidates IS
'Find domains that could transfer knowledge to a target domain.
Returns candidates ranked by similarity and transfer strength.';

-- Function: Execute knowledge transfer
CREATE OR REPLACE FUNCTION cortex.execute_transfer(
    p_org_id UUID,
    p_mapping_id UUID,
    p_task_type TEXT,
    p_task_id UUID DEFAULT NULL,
    p_source_knowledge_ids UUID[] DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_episode_id UUID;
    v_mapping RECORD;
    v_adaptation_method TEXT;
    v_transfer_confidence NUMERIC;
BEGIN
    -- Get mapping details
    SELECT * INTO v_mapping FROM cortex.transfer_mappings WHERE id = p_mapping_id;
    IF v_mapping IS NULL THEN
        RAISE EXCEPTION 'Transfer mapping not found: %', p_mapping_id;
    END IF;
    
    -- Determine adaptation method based on transfer type
    v_adaptation_method := CASE v_mapping.transfer_type
        WHEN 'direct' THEN 'direct_application'
        WHEN 'analogical' THEN 'analogy_mapping'
        WHEN 'structural' THEN 'feature_transform'
        WHEN 'conditional' THEN 'weighted_ensemble'
        ELSE 'embedding_projection'
    END;
    
    -- Calculate transfer confidence
    v_transfer_confidence := v_mapping.transfer_strength * 
                             v_mapping.alignment_confidence * 
                             (1 - v_mapping.negative_transfer_risk);
    
    -- Create transfer episode
    INSERT INTO cortex.transfer_episodes (
        org_id, mapping_id, task_type, task_id,
        source_knowledge_ids,
        adaptation_method, adaptation_params,
        transfer_confidence, outcome
    ) VALUES (
        p_org_id, p_mapping_id, p_task_type, p_task_id,
        p_source_knowledge_ids,
        v_adaptation_method, 
        jsonb_build_object(
            'mapping_transfer_type', v_mapping.transfer_type,
            'concept_alignments', v_mapping.concept_alignments
        ),
        v_transfer_confidence,
        'pending'
    )
    RETURNING id INTO v_episode_id;
    
    -- Update mapping usage count
    UPDATE cortex.transfer_mappings
    SET usage_count = usage_count + 1,
        updated_at = NOW()
    WHERE id = p_mapping_id;
    
    RETURN v_episode_id;
END;
$$;

COMMENT ON FUNCTION cortex.execute_transfer IS
'Execute a knowledge transfer using the specified mapping.
Returns the ID of the transfer episode for outcome tracking.';

-- Function: Record transfer outcome
CREATE OR REPLACE FUNCTION cortex.record_transfer_outcome(
    p_episode_id UUID,
    p_outcome TEXT,
    p_baseline_performance NUMERIC DEFAULT NULL,
    p_transfer_performance NUMERIC DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_mapping_id UUID;
    v_lift NUMERIC;
BEGIN
    -- Calculate lift
    v_lift := CASE 
        WHEN p_baseline_performance IS NOT NULL AND p_baseline_performance > 0 
        THEN (p_transfer_performance - p_baseline_performance) / p_baseline_performance
        ELSE NULL
    END;
    
    -- Update episode
    UPDATE cortex.transfer_episodes
    SET outcome = p_outcome,
        baseline_performance = p_baseline_performance,
        transfer_performance = p_transfer_performance,
        performance_lift = v_lift,
        outcome_notes = p_notes,
        outcome_recorded_at = NOW()
    WHERE id = p_episode_id
    RETURNING mapping_id INTO v_mapping_id;
    
    -- Update mapping statistics
    UPDATE cortex.transfer_mappings
    SET success_count = CASE WHEN p_outcome = 'success' THEN success_count + 1 ELSE success_count END,
        failure_count = CASE WHEN p_outcome = 'failure' THEN failure_count + 1 ELSE failure_count END,
        updated_at = NOW()
    WHERE id = v_mapping_id;
END;
$$;

COMMENT ON FUNCTION cortex.record_transfer_outcome IS
'Record the outcome of a transfer episode. Updates statistics for
continuous improvement of transfer decisions.';

-- Function: Compute domain similarity
CREATE OR REPLACE FUNCTION cortex.compute_domain_similarity(
    p_domain_a_id UUID,
    p_domain_b_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_domain_a RECORD;
    v_domain_b RECORD;
    v_embedding_sim NUMERIC;
    v_concept_overlap NUMERIC;
    v_overall_sim NUMERIC;
BEGIN
    -- Ensure consistent ordering
    IF p_domain_a_id > p_domain_b_id THEN
        SELECT p_domain_a_id, p_domain_b_id INTO p_domain_b_id, p_domain_a_id;
    END IF;
    
    -- Check cache
    SELECT overall_similarity INTO v_overall_sim
    FROM cortex.domain_similarity_cache
    WHERE domain_a_id = p_domain_a_id AND domain_b_id = p_domain_b_id;
    
    IF v_overall_sim IS NOT NULL THEN
        RETURN v_overall_sim;
    END IF;
    
    -- Get domain data
    SELECT * INTO v_domain_a FROM cortex.domain_knowledge WHERE id = p_domain_a_id;
    SELECT * INTO v_domain_b FROM cortex.domain_knowledge WHERE id = p_domain_b_id;
    
    IF v_domain_a IS NULL OR v_domain_b IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Compute embedding similarity
    v_embedding_sim := CASE 
        WHEN v_domain_a.domain_embedding IS NOT NULL AND v_domain_b.domain_embedding IS NOT NULL
        THEN 1 - (v_domain_a.domain_embedding <=> v_domain_b.domain_embedding)
        ELSE 0.5
    END;
    
    -- Compute concept overlap (Jaccard)
    v_concept_overlap := CASE 
        WHEN v_domain_a.key_concepts IS NOT NULL AND v_domain_b.key_concepts IS NOT NULL
        THEN (
            SELECT COUNT(*)::NUMERIC / NULLIF(
                (SELECT COUNT(DISTINCT c) FROM (
                    SELECT unnest(v_domain_a.key_concepts) AS c
                    UNION
                    SELECT unnest(v_domain_b.key_concepts)
                ) t), 0)
            FROM (
                SELECT unnest(v_domain_a.key_concepts)
                INTERSECT
                SELECT unnest(v_domain_b.key_concepts)
            ) t
        )
        ELSE 0.5
    END;
    
    -- Weighted combination
    v_overall_sim := 0.6 * v_embedding_sim + 0.4 * COALESCE(v_concept_overlap, 0.5);
    
    -- Cache result
    INSERT INTO cortex.domain_similarity_cache (
        domain_a_id, domain_b_id,
        embedding_similarity, concept_overlap, overall_similarity
    ) VALUES (
        p_domain_a_id, p_domain_b_id,
        v_embedding_sim, v_concept_overlap, v_overall_sim
    )
    ON CONFLICT (domain_a_id, domain_b_id) DO UPDATE
    SET embedding_similarity = EXCLUDED.embedding_similarity,
        concept_overlap = EXCLUDED.concept_overlap,
        overall_similarity = EXCLUDED.overall_similarity,
        computed_at = NOW();
    
    RETURN v_overall_sim;
END;
$$;

COMMENT ON FUNCTION cortex.compute_domain_similarity IS
'Compute and cache similarity between two domains.
Uses embedding similarity and concept overlap.';

-- Function: Suggest transfer mapping
CREATE OR REPLACE FUNCTION cortex.suggest_transfer_mapping(
    p_source_domain_id UUID,
    p_target_domain_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_source RECORD;
    v_target RECORD;
    v_similarity NUMERIC;
    v_transfer_type TEXT;
    v_risk NUMERIC;
    v_suggestion JSONB;
BEGIN
    -- Get domain info
    SELECT * INTO v_source FROM cortex.domain_knowledge WHERE id = p_source_domain_id;
    SELECT * INTO v_target FROM cortex.domain_knowledge WHERE id = p_target_domain_id;
    
    IF v_source IS NULL OR v_target IS NULL THEN
        RETURN NULL;
    END IF;
    
    -- Compute similarity
    v_similarity := cortex.compute_domain_similarity(p_source_domain_id, p_target_domain_id);
    
    -- Determine transfer type
    v_transfer_type := CASE 
        WHEN v_similarity > 0.8 THEN 'direct'
        WHEN v_similarity > 0.6 THEN 'structural'
        WHEN v_similarity > 0.4 THEN 'analogical'
        ELSE 'conditional'
    END;
    
    -- Estimate risk (higher if domains are very different or target has unique requirements)
    v_risk := CASE
        WHEN v_similarity < 0.3 THEN 0.7
        WHEN v_target.regulatory_specificity > 0.8 THEN 0.5
        WHEN v_similarity > 0.7 THEN 0.1
        ELSE 0.3
    END;
    
    v_suggestion := jsonb_build_object(
        'source_domain', v_source.domain_value,
        'target_domain', v_target.domain_value,
        'similarity', v_similarity,
        'suggested_transfer_type', v_transfer_type,
        'estimated_transfer_strength', v_similarity * (1 - v_risk * 0.5),
        'estimated_risk', v_risk,
        'recommendation', CASE 
            WHEN v_similarity > 0.6 AND v_risk < 0.4 THEN 'recommended'
            WHEN v_similarity > 0.4 AND v_risk < 0.5 THEN 'consider'
            ELSE 'caution'
        END,
        'notes', CASE
            WHEN v_similarity > 0.8 THEN 'High similarity suggests direct transfer is viable'
            WHEN v_risk > 0.5 THEN 'High risk - validate carefully before applying'
            ELSE 'Moderate similarity - structural or analogical transfer may work'
        END
    );
    
    RETURN v_suggestion;
END;
$$;

COMMENT ON FUNCTION cortex.suggest_transfer_mapping IS
'Suggest a transfer mapping between two domains based on similarity analysis.
Returns recommendation with estimated strength and risk.';

-- ============================================================================
-- SECTION 10: SEED INITIAL DOMAIN KNOWLEDGE
-- ============================================================================

INSERT INTO cortex.domain_knowledge (domain_type, domain_value, domain_hierarchy, key_concepts, complexity_score, data_richness_score)
VALUES
    ('therapeutic_area', 'oncology', ARRAY['oncology'], 
     ARRAY['tumor response', 'overall survival', 'progression-free survival', 'biomarkers', 'combination therapy'],
     0.85, 0.9),
    ('therapeutic_area', 'neurology', ARRAY['neurology'], 
     ARRAY['cognitive endpoints', 'neuroimaging', 'biomarkers', 'disease modification', 'symptomatic treatment'],
     0.9, 0.7),
    ('therapeutic_area', 'cardiology', ARRAY['cardiology'], 
     ARRAY['MACE', 'cardiovascular outcomes', 'heart failure', 'arrhythmia', 'lipid endpoints'],
     0.75, 0.8),
    ('therapeutic_area', 'immunology', ARRAY['immunology'], 
     ARRAY['autoimmune', 'inflammation markers', 'disease activity scores', 'remission', 'flare rates'],
     0.8, 0.7),
    ('therapeutic_area', 'rare_disease', ARRAY['rare_disease'], 
     ARRAY['natural history', 'patient registries', 'biomarkers', 'functional endpoints', 'caregiver burden'],
     0.85, 0.4),
    ('submission_type', 'nda', ARRAY['submission', 'nda'], 
     ARRAY['efficacy', 'safety', 'CMC', 'labeling', 'risk-benefit'],
     0.7, 0.9),
    ('submission_type', 'bla', ARRAY['submission', 'bla'], 
     ARRAY['immunogenicity', 'manufacturing', 'potency', 'comparability', 'lot consistency'],
     0.8, 0.7),
    ('regulatory_pathway', 'accelerated_approval', ARRAY['pathway', 'accelerated'], 
     ARRAY['surrogate endpoint', 'post-marketing', 'confirmatory trial', 'withdrawal risk'],
     0.75, 0.6),
    ('regulatory_pathway', 'breakthrough_therapy', ARRAY['pathway', 'breakthrough'], 
     ARRAY['substantial improvement', 'intensive guidance', 'rolling review', 'organizational commitment'],
     0.7, 0.5)
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 11: SEED INITIAL TRANSFER TEMPLATES
-- ============================================================================

INSERT INTO cortex.transfer_templates (
    template_name, template_description,
    source_domain_types, target_domain_types, task_types,
    adaptation_steps, avg_success_rate, is_active
) VALUES
    (
        'Oncology to Rare Oncology',
        'Transfer knowledge from common cancers to rare/orphan oncology indications',
        ARRAY['therapeutic_area'], ARRAY['therapeutic_area'], ARRAY['prediction', 'recommendation'],
        '[
            {"step": 1, "action": "extract_efficacy_patterns", "params": {"endpoint_types": ["ORR", "PFS", "OS"]}},
            {"step": 2, "action": "adjust_sample_size_expectations", "params": {"reduction_factor": 0.5}},
            {"step": 3, "action": "apply_rare_disease_regulatory_context", "params": {}}
        ]'::JSONB,
        0.75, TRUE
    ),
    (
        'NDA to BLA Adaptation',
        'Transfer NDA submission knowledge to BLA submissions with biologics adjustments',
        ARRAY['submission_type'], ARRAY['submission_type'], ARRAY['analysis', 'recommendation'],
        '[
            {"step": 1, "action": "map_cmc_concepts", "params": {"add_biologics_specific": true}},
            {"step": 2, "action": "add_immunogenicity_context", "params": {}},
            {"step": 3, "action": "adjust_manufacturing_expectations", "params": {}}
        ]'::JSONB,
        0.7, TRUE
    ),
    (
        'Standard to Accelerated Pathway',
        'Adapt standard approval knowledge to accelerated approval contexts',
        ARRAY['regulatory_pathway'], ARRAY['regulatory_pathway'], ARRAY['prediction', 'analysis'],
        '[
            {"step": 1, "action": "identify_surrogate_endpoints", "params": {}},
            {"step": 2, "action": "add_post_marketing_requirements", "params": {}},
            {"step": 3, "action": "adjust_timeline_expectations", "params": {"factor": 0.7}}
        ]'::JSONB,
        0.65, TRUE
    )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- SECTION 12: TRIGGERS
-- ============================================================================

CREATE TRIGGER domain_knowledge_updated_at
    BEFORE UPDATE ON cortex.domain_knowledge
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

CREATE TRIGGER transfer_mappings_updated_at
    BEFORE UPDATE ON cortex.transfer_mappings
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

CREATE TRIGGER meta_transfer_updated_at
    BEFORE UPDATE ON cortex.meta_transfer_model
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

CREATE TRIGGER templates_updated_at
    BEFORE UPDATE ON cortex.transfer_templates
    FOR EACH ROW EXECUTE FUNCTION core.update_timestamp();

-- ============================================================================
-- SECTION 13: COMPLETION
-- ============================================================================

COMMIT;

DO $$
BEGIN
    RAISE NOTICE 'Migration 078: Cross-Domain Knowledge Transfer complete';
    RAISE NOTICE 'Tables: domain_knowledge, transfer_mappings, transfer_episodes, meta_transfer_model, domain_similarity_cache, transfer_templates';
    RAISE NOTICE 'Functions: find_transfer_candidates, execute_transfer, record_transfer_outcome, compute_domain_similarity, suggest_transfer_mapping';
    RAISE NOTICE 'Seeded 9 initial domains and 3 transfer templates';
    RAISE NOTICE 'RLS enabled on all tables';
END $$;
