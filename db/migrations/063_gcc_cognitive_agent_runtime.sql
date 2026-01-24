-- =============================================================================
-- Migration 063: Cognitive Agent Runtime Schema
-- =============================================================================
-- Purpose: LangGraph-compatible autonomous regulatory agent infrastructure
-- Supports: Checkpointing, branching ("time travel"), semantic audit trails
-- Reference: 21 CFR Part 11, EU Annex 11, LangGraph PostgresSaver pattern
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE AGENT RUNTIME SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS agent_runtime;

COMMENT ON SCHEMA agent_runtime IS 
'LangGraph-compatible autonomous regulatory agent infrastructure with GxP governance';

-- =============================================================================
-- 2. AGENT PERSONA DEFINITIONS
-- =============================================================================

CREATE TYPE agent_runtime.agent_type AS ENUM (
    -- Regulatory Authoring
    'CMC_AUTHOR',                  -- Chemistry, Manufacturing, Controls
    'CLINICAL_AUTHOR',             -- Clinical Study Reports
    'NONCLINICAL_AUTHOR',          -- Toxicology, Pharmacology
    'LABELING_AUTHOR',             -- SPL, SmPC, PIL
    
    -- Quality & Compliance
    'COMPLIANCE_REVIEWER',         -- Reviews for Part 11, GxP
    'ADVERSARIAL_REVIEWER',        -- Critiques other agents
    'QA_VALIDATOR',                -- Quality validation
    
    -- Regulatory Strategy
    'REGULATORY_STRATEGIST',       -- Pathway selection
    'SUBMISSION_ORCHESTRATOR',     -- Multi-region coordination
    'IR_RESPONDER',                -- Information Request handling
    
    -- Safety & Surveillance
    'PHARMACOVIGILANCE_AGENT',     -- Safety signal detection
    'SIGNAL_DETECTOR',             -- Real-time safety monitoring
    'LABELING_UPDATER',            -- Safety-driven label changes
    
    -- Manufacturing
    'BATCH_RELEASE_AGENT',         -- Digital twin / RTRT
    'DEVIATION_INVESTIGATOR',      -- CAPA automation
    'EQUIPMENT_VALIDATOR',         -- Plug & Produce validation
    
    -- Intelligence
    'HORIZON_SCANNER',             -- PMDA-style technology scanning
    'KNOWLEDGE_CURATOR'            -- Regulatory intelligence
);

CREATE TYPE agent_runtime.agent_status AS ENUM (
    'DRAFT',                       -- Being configured
    'VALIDATED',                   -- Passed IQ/OQ/PQ
    'ACTIVE',                      -- Production use
    'SUSPENDED',                   -- Temporarily disabled
    'DEPRECATED',                  -- Replaced by newer version
    'RETIRED'                      -- No longer used
);

CREATE TABLE agent_runtime.agent_definitions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    agent_code TEXT NOT NULL UNIQUE,           -- 'CMC_AUTHOR_V3'
    agent_name TEXT NOT NULL,                  -- 'CMC Authoring Agent v3.1'
    agent_type agent_runtime.agent_type NOT NULL,
    version_number TEXT NOT NULL,              -- Semantic versioning
    
    -- Model Configuration
    llm_provider TEXT NOT NULL,                -- 'OPENAI', 'ANTHROPIC', 'AZURE'
    llm_model_id TEXT NOT NULL,                -- 'gpt-4-turbo', 'claude-3-opus'
    model_version TEXT,                        -- Provider's model version
    temperature NUMERIC(3, 2) DEFAULT 0.1,     -- Lower for regulatory precision
    max_tokens INT DEFAULT 4096,
    
    -- System Prompt (The "Constitution")
    system_prompt TEXT NOT NULL,               -- Base persona instructions
    system_prompt_hash TEXT NOT NULL,          -- SHA256 for audit
    governance_constraints JSONB DEFAULT '[]', -- Array of rule references
    
    -- Tool Configuration
    enabled_tools TEXT[],                      -- ['search_regulations', 'validate_fhir']
    tool_config JSONB DEFAULT '{}',            -- Tool-specific parameters
    
    -- Governance
    requires_hitl_approval BOOLEAN DEFAULT TRUE,
    max_autonomous_steps INT DEFAULT 10,       -- Force HITL after N steps
    confidence_threshold NUMERIC(5, 4) DEFAULT 0.85,
    
    -- Validation Status
    status agent_runtime.agent_status DEFAULT 'DRAFT',
    validated_at TIMESTAMPTZ,
    validated_by TEXT,
    validation_protocol_ref TEXT,              -- IQ/OQ/PQ document reference
    
    -- Ownership
    org_id UUID REFERENCES identity.organizations(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by TEXT DEFAULT 'system'
);

CREATE INDEX idx_agent_definitions_type ON agent_runtime.agent_definitions(agent_type);
CREATE INDEX idx_agent_definitions_status ON agent_runtime.agent_definitions(status);
CREATE INDEX idx_agent_definitions_org ON agent_runtime.agent_definitions(org_id);
CREATE INDEX idx_agent_definitions_prompt_hash ON agent_runtime.agent_definitions(system_prompt_hash);

-- =============================================================================
-- 3. AGENT THREADS (Regulatory Activities)
-- =============================================================================
-- Each thread represents a long-running regulatory workflow

CREATE TYPE agent_runtime.thread_status AS ENUM (
    'ACTIVE',
    'PAUSED',                      -- Awaiting HITL
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);

CREATE TABLE agent_runtime.agent_threads (
    thread_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    org_id UUID NOT NULL REFERENCES identity.organizations(id),
    agent_definition_id UUID NOT NULL REFERENCES agent_runtime.agent_definitions(id),
    
    -- Regulatory Context
    submission_id UUID REFERENCES ectd_v4.regulatory_submissions(id),
    product_id UUID REFERENCES product_master.products(id),
    regulatory_activity_type TEXT,             -- 'ORIGINAL_APPLICATION', 'VARIATION', 'IR_RESPONSE'
    target_authority TEXT,                     -- 'US_FDA', 'EU_EMA', 'JP_PMDA'
    
    -- Status
    status agent_runtime.thread_status DEFAULT 'ACTIVE',
    current_step TEXT,                         -- Current node in the graph
    steps_executed INT DEFAULT 0,
    
    -- Timestamps
    started_at TIMESTAMPTZ DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- User Context
    initiated_by UUID REFERENCES identity.users(id),
    
    -- Thread Metadata
    thread_config JSONB DEFAULT '{}',          -- Runtime configuration
    thread_metadata JSONB DEFAULT '{}',
    
    CONSTRAINT thread_org_agent_fk CHECK (agent_definition_id IS NOT NULL)
);

CREATE INDEX idx_agent_threads_org ON agent_runtime.agent_threads(org_id);
CREATE INDEX idx_agent_threads_status ON agent_runtime.agent_threads(status);
CREATE INDEX idx_agent_threads_submission ON agent_runtime.agent_threads(submission_id);
CREATE INDEX idx_agent_threads_product ON agent_runtime.agent_threads(product_id);
CREATE INDEX idx_agent_threads_started ON agent_runtime.agent_threads(started_at DESC);

-- =============================================================================
-- 4. AGENT CHECKPOINTS (LangGraph PostgresSaver Compatible)
-- =============================================================================
-- Core checkpointing table following LangGraph schema patterns

CREATE TABLE agent_runtime.checkpoints (
    -- Primary Key (composite for efficient queries)
    thread_id UUID NOT NULL REFERENCES agent_runtime.agent_threads(thread_id) ON DELETE CASCADE,
    checkpoint_ns TEXT NOT NULL DEFAULT '',    -- Namespace for branching
    checkpoint_id TEXT NOT NULL,               -- Monotonic, time-ordered UUID
    
    -- Lineage
    parent_checkpoint_id TEXT,                 -- For graph reconstruction
    
    -- State Data (Denormalized JSONB for performance)
    channel_values JSONB NOT NULL,             -- Serialized agent state
    channel_versions JSONB NOT NULL DEFAULT '{}',
    
    -- Pending Operations
    pending_sends JSONB NOT NULL DEFAULT '[]',
    pending_writes JSONB NOT NULL DEFAULT '[]',
    
    -- Metadata for Compliance
    metadata JSONB NOT NULL DEFAULT '{}',      -- Model ID, prompt version, etc.
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id)
);

-- Optimized indexes for LangGraph query patterns
CREATE INDEX idx_checkpoints_thread_ns ON agent_runtime.checkpoints(thread_id, checkpoint_ns);
CREATE INDEX idx_checkpoints_parent ON agent_runtime.checkpoints(parent_checkpoint_id);
CREATE INDEX idx_checkpoints_created ON agent_runtime.checkpoints(created_at DESC);

-- GIN index on channel_values for state queries
CREATE INDEX idx_checkpoints_channel_gin ON agent_runtime.checkpoints 
    USING GIN (channel_values jsonb_path_ops);

-- =============================================================================
-- 5. CHECKPOINT WRITES (Pending Operations)
-- =============================================================================

CREATE TABLE agent_runtime.checkpoint_writes (
    thread_id UUID NOT NULL,
    checkpoint_ns TEXT NOT NULL DEFAULT '',
    checkpoint_id TEXT NOT NULL,
    task_id TEXT NOT NULL,
    idx INT NOT NULL,
    
    channel TEXT NOT NULL,
    type TEXT,                                 -- Write type identifier
    blob BYTEA,                                -- Serialized data
    
    PRIMARY KEY (thread_id, checkpoint_ns, checkpoint_id, task_id, idx),
    FOREIGN KEY (thread_id, checkpoint_ns, checkpoint_id) 
        REFERENCES agent_runtime.checkpoints(thread_id, checkpoint_ns, checkpoint_id)
        ON DELETE CASCADE
);

-- =============================================================================
-- 6. AGENT BRANCHES ("Time Travel" / Simulation)
-- =============================================================================
-- Enables counterfactual regulatory simulation

CREATE TYPE agent_runtime.branch_status AS ENUM (
    'ACTIVE',                      -- Currently executing
    'PAUSED',
    'COMPLETED',
    'MERGED',                      -- Merged back to parent
    'ABANDONED'                    -- Discarded simulation
);

CREATE TABLE agent_runtime.thread_branches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Hierarchy
    thread_id UUID NOT NULL REFERENCES agent_runtime.agent_threads(thread_id),
    parent_branch_id UUID REFERENCES agent_runtime.thread_branches(id),
    branch_namespace TEXT NOT NULL,            -- Unique within thread
    
    -- Branch Purpose
    branch_name TEXT NOT NULL,                 -- 'Conservative Strategy', 'Aggressive Strategy'
    branch_description TEXT,
    simulation_hypothesis TEXT,                -- What we're testing
    
    -- Fork Point
    forked_from_checkpoint_id TEXT NOT NULL,   -- Where we branched from
    forked_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Status
    status agent_runtime.branch_status DEFAULT 'ACTIVE',
    
    -- Outcome (for comparison)
    outcome_summary JSONB,                     -- Results of this branch
    risk_assessment_score NUMERIC(5, 4),       -- 0-1 risk score
    recommended_for_merge BOOLEAN DEFAULT FALSE,
    
    -- Merge Info
    merged_to_branch_id UUID REFERENCES agent_runtime.thread_branches(id),
    merged_at TIMESTAMPTZ,
    merged_by UUID REFERENCES identity.users(id),
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES identity.users(id)
);

CREATE INDEX idx_thread_branches_thread ON agent_runtime.thread_branches(thread_id);
CREATE INDEX idx_thread_branches_parent ON agent_runtime.thread_branches(parent_branch_id);
CREATE INDEX idx_thread_branches_status ON agent_runtime.thread_branches(status);

COMMENT ON TABLE agent_runtime.thread_branches IS 
'Enables "Time Travel" - branching regulatory workflows for parallel simulation and strategy comparison';

-- =============================================================================
-- 7. REASONING TRACES (Chain of Thought Logging)
-- =============================================================================
-- Captures WHY the agent made each decision (21 CFR Part 11 semantic audit)

CREATE TYPE agent_runtime.trace_type AS ENUM (
    'TOOL_CALL',                   -- Agent invoked a tool
    'TOOL_RESULT',                 -- Tool returned data
    'REASONING_STEP',              -- Internal reasoning
    'DECISION_POINT',              -- Choice between options
    'CONFIDENCE_CHECK',            -- Self-assessment
    'GOVERNANCE_CHECK',            -- Rule validation
    'HUMAN_INTERVENTION',          -- HITL occurred
    'ERROR_RECOVERY',              -- Error handling
    'FINAL_OUTPUT'                 -- Generated content
);

CREATE TABLE agent_runtime.reasoning_traces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    thread_id UUID NOT NULL REFERENCES agent_runtime.agent_threads(thread_id),
    checkpoint_id TEXT NOT NULL,
    branch_namespace TEXT DEFAULT '',
    
    -- Trace Details
    trace_type agent_runtime.trace_type NOT NULL,
    step_number INT NOT NULL,
    node_name TEXT,                            -- Graph node that generated this
    
    -- Content
    input_data JSONB,                          -- What the agent saw
    reasoning_text TEXT,                       -- Chain of thought / scratchpad
    output_data JSONB,                         -- What the agent produced
    
    -- Tool Specifics
    tool_name TEXT,
    tool_arguments JSONB,
    tool_result JSONB,
    
    -- Confidence & Validation
    confidence_score NUMERIC(5, 4),            -- 0-1 self-assessed confidence
    governance_rules_checked TEXT[],           -- Which rules were evaluated
    governance_passed BOOLEAN,
    
    -- Timing
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    duration_ms INT,
    
    -- Token Usage (for cost tracking)
    tokens_input INT,
    tokens_output INT,
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_reasoning_traces_thread ON agent_runtime.reasoning_traces(thread_id);
CREATE INDEX idx_reasoning_traces_checkpoint ON agent_runtime.reasoning_traces(checkpoint_id);
CREATE INDEX idx_reasoning_traces_type ON agent_runtime.reasoning_traces(trace_type);
CREATE INDEX idx_reasoning_traces_step ON agent_runtime.reasoning_traces(thread_id, step_number);
CREATE INDEX idx_reasoning_traces_tool ON agent_runtime.reasoning_traces(tool_name) WHERE tool_name IS NOT NULL;

-- Full-text search on reasoning
CREATE INDEX idx_reasoning_traces_text_fts ON agent_runtime.reasoning_traces 
    USING GIN (to_tsvector('english', COALESCE(reasoning_text, '')));

-- =============================================================================
-- 8. GOVERNANCE CONSTRAINTS ("Constitution" Rule Sets)
-- =============================================================================

CREATE TYPE agent_runtime.constraint_severity AS ENUM (
    'MANDATORY',                   -- Must comply, blocks execution
    'WARNING',                     -- Should comply, logs warning
    'ADVISORY'                     -- Best practice, informational
);

CREATE TABLE agent_runtime.governance_constraints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    constraint_code TEXT NOT NULL UNIQUE,      -- 'GXP_NO_UNVALIDATED_DATA'
    constraint_name TEXT NOT NULL,
    constraint_version TEXT NOT NULL,
    
    -- Classification
    severity agent_runtime.constraint_severity NOT NULL,
    regulatory_reference TEXT,                 -- '21 CFR 11.10(e)'
    
    -- Rule Definition
    rule_description TEXT NOT NULL,
    rule_implementation TEXT NOT NULL,         -- Natural language for LLM
    validation_logic JSONB,                    -- Machine-readable validation
    
    -- Scope
    applicable_agent_types agent_runtime.agent_type[],
    applicable_domains TEXT[],                 -- ['CMC', 'CLINICAL', 'SAFETY']
    
    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    effective_from DATE NOT NULL,
    effective_until DATE,
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_governance_constraints_code ON agent_runtime.governance_constraints(constraint_code);
CREATE INDEX idx_governance_constraints_active ON agent_runtime.governance_constraints(is_active) WHERE is_active = TRUE;
CREATE INDEX idx_governance_constraints_severity ON agent_runtime.governance_constraints(severity);

-- =============================================================================
-- 9. HUMAN-IN-THE-LOOP (HITL) BREAKPOINTS
-- =============================================================================

CREATE TYPE agent_runtime.breakpoint_reason AS ENUM (
    'CONFIDENCE_BELOW_THRESHOLD',
    'MAX_STEPS_EXCEEDED',
    'GOVERNANCE_VIOLATION',
    'ADVERSARIAL_REVIEW_FAILED',
    'USER_REQUESTED',
    'ERROR_RECOVERY',
    'APPROVAL_REQUIRED',
    'SENSITIVE_CONTENT'
);

CREATE TYPE agent_runtime.breakpoint_resolution AS ENUM (
    'APPROVED',                    -- Human approved, continue
    'REJECTED',                    -- Human rejected, rollback
    'MODIFIED',                    -- Human edited output
    'ESCALATED',                   -- Sent to higher authority
    'CANCELLED'                    -- Workflow terminated
);

CREATE TABLE agent_runtime.hitl_breakpoints (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    thread_id UUID NOT NULL REFERENCES agent_runtime.agent_threads(thread_id),
    checkpoint_id TEXT NOT NULL,
    branch_namespace TEXT DEFAULT '',
    
    -- Trigger
    reason agent_runtime.breakpoint_reason NOT NULL,
    trigger_description TEXT NOT NULL,
    
    -- State at Breakpoint
    agent_output JSONB NOT NULL,               -- What agent proposed
    confidence_score NUMERIC(5, 4),
    governance_violations TEXT[],
    
    -- Review
    assigned_to UUID REFERENCES identity.users(id),
    assigned_at TIMESTAMPTZ,
    
    -- Resolution
    resolution agent_runtime.breakpoint_resolution,
    resolution_notes TEXT,
    human_edits JSONB,                         -- Delta of human changes
    resolved_by UUID REFERENCES identity.users(id),
    resolved_at TIMESTAMPTZ,
    
    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    sla_deadline TIMESTAMPTZ,                  -- When review must be done
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_hitl_breakpoints_thread ON agent_runtime.hitl_breakpoints(thread_id);
CREATE INDEX idx_hitl_breakpoints_pending ON agent_runtime.hitl_breakpoints(resolution) 
    WHERE resolution IS NULL;
CREATE INDEX idx_hitl_breakpoints_assigned ON agent_runtime.hitl_breakpoints(assigned_to) 
    WHERE resolution IS NULL;

-- =============================================================================
-- 10. ADVERSARIAL REVIEWS (Agent vs Agent)
-- =============================================================================

CREATE TABLE agent_runtime.adversarial_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    thread_id UUID NOT NULL REFERENCES agent_runtime.agent_threads(thread_id),
    checkpoint_id TEXT NOT NULL,
    
    -- Author Agent
    author_agent_id UUID NOT NULL REFERENCES agent_runtime.agent_definitions(id),
    authored_content JSONB NOT NULL,
    
    -- Reviewer Agent
    reviewer_agent_id UUID NOT NULL REFERENCES agent_runtime.agent_definitions(id),
    
    -- Review Results
    review_score NUMERIC(5, 4) NOT NULL,       -- 0-1 score
    passed_threshold BOOLEAN NOT NULL,
    
    -- Detailed Feedback
    issues_found JSONB,                        -- Array of issues
    suggestions JSONB,                         -- Array of improvements
    reasoning_trace_id UUID REFERENCES agent_runtime.reasoning_traces(id),
    
    -- Outcome
    triggered_hitl BOOLEAN DEFAULT FALSE,
    hitl_breakpoint_id UUID REFERENCES agent_runtime.hitl_breakpoints(id),
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_adversarial_reviews_thread ON agent_runtime.adversarial_reviews(thread_id);
CREATE INDEX idx_adversarial_reviews_score ON agent_runtime.adversarial_reviews(review_score);

-- =============================================================================
-- 11. HELPER FUNCTIONS
-- =============================================================================

-- Get latest checkpoint for a thread/branch
CREATE OR REPLACE FUNCTION agent_runtime.get_latest_checkpoint(
    p_thread_id UUID,
    p_checkpoint_ns TEXT DEFAULT ''
)
RETURNS agent_runtime.checkpoints
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
DECLARE
    v_checkpoint agent_runtime.checkpoints;
BEGIN
    SELECT * INTO v_checkpoint
    FROM agent_runtime.checkpoints
    WHERE thread_id = p_thread_id
      AND checkpoint_ns = p_checkpoint_ns
    ORDER BY created_at DESC
    LIMIT 1;
    
    RETURN v_checkpoint;
END;
$$;

-- Create a branch from current state
CREATE OR REPLACE FUNCTION agent_runtime.create_branch(
    p_thread_id UUID,
    p_branch_name TEXT,
    p_branch_description TEXT DEFAULT NULL,
    p_simulation_hypothesis TEXT DEFAULT NULL,
    p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_latest_checkpoint agent_runtime.checkpoints;
    v_branch_id UUID;
    v_branch_ns TEXT;
BEGIN
    -- Get latest checkpoint
    v_latest_checkpoint := agent_runtime.get_latest_checkpoint(p_thread_id);
    
    IF v_latest_checkpoint.checkpoint_id IS NULL THEN
        RAISE EXCEPTION 'No checkpoints found for thread %', p_thread_id;
    END IF;
    
    -- Generate unique namespace
    v_branch_ns := 'branch_' || gen_random_uuid()::TEXT;
    
    -- Create branch record
    INSERT INTO agent_runtime.thread_branches (
        thread_id, branch_namespace, branch_name, branch_description,
        simulation_hypothesis, forked_from_checkpoint_id, created_by
    ) VALUES (
        p_thread_id, v_branch_ns, p_branch_name, p_branch_description,
        p_simulation_hypothesis, v_latest_checkpoint.checkpoint_id, p_created_by
    ) RETURNING id INTO v_branch_id;
    
    -- Copy current checkpoint to new namespace
    INSERT INTO agent_runtime.checkpoints (
        thread_id, checkpoint_ns, checkpoint_id, parent_checkpoint_id,
        channel_values, channel_versions, pending_sends, pending_writes, metadata
    )
    SELECT 
        thread_id, v_branch_ns, checkpoint_id, parent_checkpoint_id,
        channel_values, channel_versions, pending_sends, pending_writes,
        metadata || jsonb_build_object('branched_from', v_latest_checkpoint.checkpoint_ns)
    FROM agent_runtime.checkpoints
    WHERE thread_id = p_thread_id
      AND checkpoint_ns = v_latest_checkpoint.checkpoint_ns
      AND checkpoint_id = v_latest_checkpoint.checkpoint_id;
    
    RETURN v_branch_id;
END;
$$;

-- Replay reasoning trace for a checkpoint
CREATE OR REPLACE FUNCTION agent_runtime.replay_reasoning(
    p_thread_id UUID,
    p_checkpoint_id TEXT
)
RETURNS TABLE (
    step_number INT,
    trace_type agent_runtime.trace_type,
    node_name TEXT,
    reasoning_text TEXT,
    tool_name TEXT,
    confidence_score NUMERIC,
    governance_passed BOOLEAN,
    duration_ms INT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        rt.step_number,
        rt.trace_type,
        rt.node_name,
        rt.reasoning_text,
        rt.tool_name,
        rt.confidence_score,
        rt.governance_passed,
        rt.duration_ms
    FROM agent_runtime.reasoning_traces rt
    WHERE rt.thread_id = p_thread_id
      AND rt.checkpoint_id = p_checkpoint_id
    ORDER BY rt.step_number ASC;
END;
$$;

-- =============================================================================
-- 12. SEED DEFAULT GOVERNANCE CONSTRAINTS
-- =============================================================================

INSERT INTO agent_runtime.governance_constraints (
    constraint_code, constraint_name, constraint_version, severity,
    regulatory_reference, rule_description, rule_implementation,
    applicable_agent_types, applicable_domains, effective_from
) VALUES 
    ('GXP_SOURCE_CITATION', 'Source Citation Required', '1.0', 'MANDATORY',
     '21 CFR 11.10(b)', 
     'All generated content must cite source documents or data',
     'When generating text that makes factual claims about the product or regulatory requirements, you MUST include a citation to the source document, database record, or regulatory reference that supports the claim.',
     ARRAY['CMC_AUTHOR', 'CLINICAL_AUTHOR', 'NONCLINICAL_AUTHOR']::agent_runtime.agent_type[],
     ARRAY['CMC', 'CLINICAL', 'NONCLINICAL'], CURRENT_DATE),
    
    ('GXP_NO_HALLUCINATION', 'No Fabricated Data', '1.0', 'MANDATORY',
     '21 CFR 211.186',
     'Never fabricate data, results, or references',
     'You MUST NOT invent or fabricate any data points, study results, batch numbers, or regulatory references. If information is not available, state "Information not available" rather than creating plausible-sounding content.',
     NULL, -- Applies to all agents
     NULL, CURRENT_DATE),
    
    ('GXP_CONFIDENCE_DISCLOSURE', 'Confidence Disclosure', '1.0', 'WARNING',
     'ICH E9(R1)',
     'Disclose confidence levels for AI-generated conclusions',
     'When generating conclusions, assessments, or recommendations, include a confidence score and explain the basis for that confidence level. Flag any areas of uncertainty.',
     ARRAY['REGULATORY_STRATEGIST', 'PHARMACOVIGILANCE_AGENT', 'SIGNAL_DETECTOR']::agent_runtime.agent_type[],
     ARRAY['REGULATORY', 'SAFETY'], CURRENT_DATE),
    
    ('GXP_CHANGE_JUSTIFICATION', 'Change Justification Required', '1.0', 'MANDATORY',
     '21 CFR 11.10(e)',
     'All changes must include justification',
     'When modifying existing content, you MUST provide a clear justification explaining WHY the change is being made, referencing the triggering event or data.',
     NULL,
     NULL, CURRENT_DATE),
    
    ('GXP_CONTROLLED_VOCABULARY', 'Use Controlled Vocabulary', '1.0', 'WARNING',
     'ICH M8',
     'Use ICH/regulatory controlled vocabulary where applicable',
     'When referring to dosage forms, routes of administration, therapeutic areas, or regulatory terms, use the standard controlled vocabulary defined by ICH, FDA, or EMA. Avoid creating non-standard abbreviations.',
     ARRAY['CMC_AUTHOR', 'LABELING_AUTHOR']::agent_runtime.agent_type[],
     ARRAY['CMC', 'LABELING'], CURRENT_DATE),
    
    ('GXP_AUDIT_TRAIL', 'Reasoning Must Be Auditable', '1.0', 'MANDATORY',
     '21 CFR 11.10(e)',
     'All reasoning steps must be logged for audit',
     'Every significant decision point, tool invocation, and conclusion must be logged to the reasoning trace. Do not make "silent" decisions.',
     NULL,
     NULL, CURRENT_DATE)
ON CONFLICT (constraint_code) DO NOTHING;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

/*
-- Check schema created
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'agent_runtime';

-- Check tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'agent_runtime';

-- Check governance constraints seeded
SELECT constraint_code, severity, rule_description FROM agent_runtime.governance_constraints;

-- Test branch creation (requires a thread)
-- SELECT agent_runtime.create_branch('thread-uuid', 'Test Branch', 'Testing branch creation');
*/
