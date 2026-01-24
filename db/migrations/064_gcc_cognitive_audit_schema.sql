-- =============================================================================
-- Migration 064: Cognitive Audit Schema
-- =============================================================================
-- Purpose: Enhanced semantic audit trails for 21 CFR Part 11 / EU Annex 11
-- Extends: Traditional audit → Reasoning-aware cognitive audit
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. CREATE COGNITIVE AUDIT SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS cognitive_audit;

COMMENT ON SCHEMA cognitive_audit IS 
'Semantic audit trails capturing WHY decisions were made, not just WHAT changed';

-- =============================================================================
-- 2. SEMANTIC AUDIT LOG (Enhanced Audit Trail)
-- =============================================================================
-- Table 1 from the roadmap: Traditional → Cognitive audit trail evolution

CREATE TYPE cognitive_audit.actor_type AS ENUM (
    'HUMAN_USER',
    'AUTONOMOUS_AGENT',
    'SYSTEM_PROCESS',
    'EXTERNAL_INTEGRATION',
    'FEDERATED_NODE'
);

CREATE TYPE cognitive_audit.action_category AS ENUM (
    'CREATE',
    'READ',
    'UPDATE',
    'DELETE',
    'APPROVE',
    'REJECT',
    'SUBMIT',
    'SIGN',
    'DELEGATE',
    'ESCALATE',
    'INFERENCE',                   -- AI-generated content
    'VALIDATION',                  -- Automated validation
    'INTEGRATION'                  -- External system sync
);

CREATE TABLE cognitive_audit.semantic_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- =========================================================================
    -- ACTOR IDENTIFICATION (Enhanced from traditional audit)
    -- =========================================================================
    -- Traditional: User ID (e.g., jsmith)
    -- Cognitive: Agent ID + Model Version + System Prompt Hash
    
    actor_type cognitive_audit.actor_type NOT NULL,
    
    -- Human Actor
    user_id UUID REFERENCES identity.users(id),
    user_name TEXT,                            -- Denormalized for query
    user_role TEXT,
    
    -- Agent Actor (when actor_type = 'AUTONOMOUS_AGENT')
    agent_definition_id UUID REFERENCES agent_runtime.agent_definitions(id),
    agent_code TEXT,                           -- 'CMC_AUTHOR_V3'
    agent_model_id TEXT,                       -- 'gpt-4-turbo-2024-04-09'
    agent_model_version TEXT,
    system_prompt_hash TEXT,                   -- SHA256 for prompt versioning
    
    -- =========================================================================
    -- ACTION RECORD (Enhanced with reasoning)
    -- =========================================================================
    -- Traditional: "Field 'pH Limit' changed from 6.0 to 6.5"
    -- Cognitive: "Field 'pH Limit' changed to 6.5 based on stability trend analysis"
    
    action_category cognitive_audit.action_category NOT NULL,
    action_description TEXT NOT NULL,          -- Human-readable description
    
    -- Target Entity
    target_schema TEXT NOT NULL,               -- 'product_master'
    target_table TEXT NOT NULL,                -- 'products'
    target_id UUID,                            -- Record ID
    target_field TEXT,                         -- Specific field if applicable
    
    -- Value Changes
    old_value JSONB,
    new_value JSONB,
    value_delta JSONB,                         -- Computed difference
    
    -- =========================================================================
    -- REASONING CONTEXT (The key cognitive enhancement)
    -- =========================================================================
    
    -- Trigger: What initiated this action
    trigger_type TEXT,                         -- 'API_CALL', 'AGENT_STEP', 'SCHEDULED_JOB'
    trigger_description TEXT,                  -- 'New stability data for Batch 102 received'
    trigger_data JSONB,                        -- Raw trigger payload
    
    -- Reasoning: Chain of thought
    reasoning_trace_id UUID REFERENCES agent_runtime.reasoning_traces(id),
    reasoning_summary TEXT,                    -- Human-readable reasoning
    confidence_score NUMERIC(5, 4),            -- Agent's confidence (0-1)
    confidence_basis TEXT,                     -- Why this confidence level
    
    -- Governance: Which rules were applied
    governance_constraint_ids UUID[],          -- References to constraint definitions
    governance_rules_version TEXT,             -- 'Rule Set v4.2'
    governance_check_passed BOOLEAN,
    governance_violations TEXT[],
    
    -- =========================================================================
    -- TIMESTAMP (Enhanced with processing duration)
    -- =========================================================================
    -- Traditional: Date/Time of commit
    -- Cognitive: Date/Time of inference + Processing Duration
    
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    inference_started_at TIMESTAMPTZ,
    inference_completed_at TIMESTAMPTZ,
    processing_duration_ms INT,
    
    -- =========================================================================
    -- INTEGRITY MECHANISM (Cryptographic chain)
    -- =========================================================================
    -- Traditional: Database transaction log
    -- Cognitive: Cryptographic Merkle Tree
    
    record_hash TEXT NOT NULL,                 -- SHA256 of this record
    previous_record_hash TEXT,                 -- Link to previous (chain)
    merkle_root TEXT,                          -- Batch merkle root
    
    -- Session Context
    session_id UUID,
    request_id UUID,
    ip_address INET,
    user_agent TEXT,
    
    -- Thread Context (for agent actions)
    thread_id UUID REFERENCES agent_runtime.agent_threads(thread_id),
    checkpoint_id TEXT,
    branch_namespace TEXT,
    
    -- Additional Context
    metadata JSONB DEFAULT '{}'
);

-- Performance Indexes
CREATE INDEX idx_semantic_audit_timestamp ON cognitive_audit.semantic_audit_log(timestamp DESC);
CREATE INDEX idx_semantic_audit_actor ON cognitive_audit.semantic_audit_log(actor_type, user_id);
CREATE INDEX idx_semantic_audit_agent ON cognitive_audit.semantic_audit_log(agent_definition_id) 
    WHERE agent_definition_id IS NOT NULL;
CREATE INDEX idx_semantic_audit_target ON cognitive_audit.semantic_audit_log(target_schema, target_table, target_id);
CREATE INDEX idx_semantic_audit_action ON cognitive_audit.semantic_audit_log(action_category);
CREATE INDEX idx_semantic_audit_session ON cognitive_audit.semantic_audit_log(session_id);
CREATE INDEX idx_semantic_audit_thread ON cognitive_audit.semantic_audit_log(thread_id);

-- Full-text search on reasoning
CREATE INDEX idx_semantic_audit_reasoning_fts ON cognitive_audit.semantic_audit_log 
    USING GIN (to_tsvector('english', COALESCE(reasoning_summary, '') || ' ' || COALESCE(action_description, '')));

-- Integrity verification index
CREATE INDEX idx_semantic_audit_hash_chain ON cognitive_audit.semantic_audit_log(previous_record_hash);

-- =============================================================================
-- 3. AUDIT REPLAY SESSIONS ("Instant Replay" for Auditors)
-- =============================================================================

CREATE TYPE cognitive_audit.replay_status AS ENUM (
    'PREPARING',
    'READY',
    'IN_PROGRESS',
    'COMPLETED',
    'FAILED'
);

CREATE TABLE cognitive_audit.audit_replay_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scope
    thread_id UUID REFERENCES agent_runtime.agent_threads(thread_id),
    start_checkpoint_id TEXT,
    end_checkpoint_id TEXT,
    time_range_start TIMESTAMPTZ,
    time_range_end TIMESTAMPTZ,
    
    -- Replay Configuration
    replay_speed NUMERIC(5, 2) DEFAULT 1.0,    -- 1.0 = real-time, 0.5 = half speed
    include_reasoning_traces BOOLEAN DEFAULT TRUE,
    include_tool_calls BOOLEAN DEFAULT TRUE,
    
    -- Status
    status cognitive_audit.replay_status DEFAULT 'PREPARING',
    current_step INT DEFAULT 0,
    total_steps INT,
    
    -- Output
    replay_data JSONB,                         -- Serialized replay state
    
    -- Auditor Info
    initiated_by UUID REFERENCES identity.users(id),
    audit_purpose TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ
);

CREATE INDEX idx_audit_replay_thread ON cognitive_audit.audit_replay_sessions(thread_id);
CREATE INDEX idx_audit_replay_status ON cognitive_audit.audit_replay_sessions(status);

-- =============================================================================
-- 4. ELECTRONIC SIGNATURES (21 CFR Part 11 Compliant)
-- =============================================================================

CREATE TYPE cognitive_audit.signature_type AS ENUM (
    'AUTHOR',                      -- Created the content
    'REVIEWER',                    -- Reviewed the content
    'APPROVER',                    -- Approved the content
    'WITNESS',                     -- Witnessed the action
    'SUBMITTER'                    -- Submitted to authority
);

CREATE TYPE cognitive_audit.signature_method AS ENUM (
    'PASSWORD',                    -- Username + password
    'MFA',                         -- Multi-factor authentication
    'BIOMETRIC',                   -- Fingerprint, etc.
    'PKI',                         -- Digital certificate
    'SSO_TOKEN'                    -- Enterprise SSO
);

CREATE TABLE cognitive_audit.electronic_signatures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- What is being signed
    audit_record_id UUID NOT NULL REFERENCES cognitive_audit.semantic_audit_log(id),
    signed_data_hash TEXT NOT NULL,            -- Hash of signed content
    
    -- Signer Identity
    signer_id UUID NOT NULL REFERENCES identity.users(id),
    signer_name TEXT NOT NULL,                 -- Full legal name
    signer_title TEXT,                         -- Job title at time of signing
    signer_organization TEXT,
    
    -- Signature Details
    signature_type cognitive_audit.signature_type NOT NULL,
    signature_method cognitive_audit.signature_method NOT NULL,
    signature_meaning TEXT NOT NULL,           -- "I approve this for submission"
    
    -- Timestamp
    signed_at TIMESTAMPTZ DEFAULT NOW(),
    timestamp_authority TEXT,                  -- TSA used for timestamping
    
    -- Verification
    signature_valid BOOLEAN DEFAULT TRUE,
    verification_failures TEXT[],
    
    -- Legal
    legal_jurisdiction TEXT,
    compliance_framework TEXT,                 -- '21 CFR Part 11', 'eIDAS'
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_esignatures_audit ON cognitive_audit.electronic_signatures(audit_record_id);
CREATE INDEX idx_esignatures_signer ON cognitive_audit.electronic_signatures(signer_id);
CREATE INDEX idx_esignatures_type ON cognitive_audit.electronic_signatures(signature_type);

-- =============================================================================
-- 5. COMPLIANCE ATTESTATIONS
-- =============================================================================

CREATE TABLE cognitive_audit.compliance_attestations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Scope
    attestation_type TEXT NOT NULL,            -- 'SYSTEM_VALIDATION', 'AGENT_QUALIFICATION'
    target_entity_type TEXT NOT NULL,          -- 'agent_definition', 'system_module'
    target_entity_id UUID NOT NULL,
    
    -- Attestation Content
    attestation_statement TEXT NOT NULL,
    compliance_standards TEXT[] NOT NULL,      -- ['21 CFR Part 11', 'ICH E6(R3)']
    
    -- Evidence
    evidence_documents JSONB,                  -- Links to validation protocols
    test_results JSONB,                        -- IQ/OQ/PQ results
    
    -- Authority
    attested_by UUID NOT NULL REFERENCES identity.users(id),
    attester_title TEXT NOT NULL,
    attester_qualifications TEXT[],
    
    -- Validity
    attested_at TIMESTAMPTZ DEFAULT NOW(),
    valid_from DATE NOT NULL,
    valid_until DATE,
    
    -- Signatures (requires multiple for validation)
    signature_ids UUID[],
    
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_compliance_attestations_type ON cognitive_audit.compliance_attestations(attestation_type);
CREATE INDEX idx_compliance_attestations_target ON cognitive_audit.compliance_attestations(target_entity_type, target_entity_id);

-- =============================================================================
-- 6. AUDIT HASH CHAIN FUNCTIONS
-- =============================================================================

-- Generate record hash
CREATE OR REPLACE FUNCTION cognitive_audit.generate_record_hash(
    p_actor_type cognitive_audit.actor_type,
    p_action_category cognitive_audit.action_category,
    p_action_description TEXT,
    p_target_schema TEXT,
    p_target_table TEXT,
    p_target_id UUID,
    p_old_value JSONB,
    p_new_value JSONB,
    p_timestamp TIMESTAMPTZ,
    p_previous_hash TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
    v_payload TEXT;
BEGIN
    v_payload := COALESCE(p_actor_type::TEXT, '') ||
                 COALESCE(p_action_category::TEXT, '') ||
                 COALESCE(p_action_description, '') ||
                 COALESCE(p_target_schema, '') ||
                 COALESCE(p_target_table, '') ||
                 COALESCE(p_target_id::TEXT, '') ||
                 COALESCE(p_old_value::TEXT, '') ||
                 COALESCE(p_new_value::TEXT, '') ||
                 COALESCE(p_timestamp::TEXT, '') ||
                 COALESCE(p_previous_hash, '');
    
    RETURN encode(sha256(v_payload::bytea), 'hex');
END;
$$;

-- Insert audit record with automatic hash chaining
CREATE OR REPLACE FUNCTION cognitive_audit.log_semantic_action(
    p_actor_type cognitive_audit.actor_type,
    p_user_id UUID DEFAULT NULL,
    p_agent_definition_id UUID DEFAULT NULL,
    p_action_category cognitive_audit.action_category DEFAULT 'UPDATE',
    p_action_description TEXT DEFAULT '',
    p_target_schema TEXT DEFAULT '',
    p_target_table TEXT DEFAULT '',
    p_target_id UUID DEFAULT NULL,
    p_target_field TEXT DEFAULT NULL,
    p_old_value JSONB DEFAULT NULL,
    p_new_value JSONB DEFAULT NULL,
    p_reasoning_summary TEXT DEFAULT NULL,
    p_confidence_score NUMERIC DEFAULT NULL,
    p_trigger_description TEXT DEFAULT NULL,
    p_thread_id UUID DEFAULT NULL,
    p_checkpoint_id TEXT DEFAULT NULL,
    p_metadata JSONB DEFAULT '{}'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_record_id UUID;
    v_previous_hash TEXT;
    v_record_hash TEXT;
    v_user_name TEXT;
    v_agent_code TEXT;
    v_agent_model TEXT;
    v_prompt_hash TEXT;
BEGIN
    -- Get previous record hash for chain
    SELECT record_hash INTO v_previous_hash
    FROM cognitive_audit.semantic_audit_log
    ORDER BY timestamp DESC
    LIMIT 1;
    
    -- Get user details if human actor
    IF p_user_id IS NOT NULL THEN
        SELECT name INTO v_user_name
        FROM identity.users
        WHERE id = p_user_id;
    END IF;
    
    -- Get agent details if agent actor
    IF p_agent_definition_id IS NOT NULL THEN
        SELECT agent_code, llm_model_id, system_prompt_hash
        INTO v_agent_code, v_agent_model, v_prompt_hash
        FROM agent_runtime.agent_definitions
        WHERE id = p_agent_definition_id;
    END IF;
    
    -- Generate record hash
    v_record_hash := cognitive_audit.generate_record_hash(
        p_actor_type, p_action_category, p_action_description,
        p_target_schema, p_target_table, p_target_id,
        p_old_value, p_new_value, NOW(), v_previous_hash
    );
    
    -- Insert the audit record
    INSERT INTO cognitive_audit.semantic_audit_log (
        actor_type, user_id, user_name, agent_definition_id, agent_code,
        agent_model_id, system_prompt_hash, action_category, action_description,
        target_schema, target_table, target_id, target_field,
        old_value, new_value,
        trigger_description, reasoning_summary, confidence_score,
        thread_id, checkpoint_id,
        record_hash, previous_record_hash,
        metadata
    ) VALUES (
        p_actor_type, p_user_id, v_user_name, p_agent_definition_id, v_agent_code,
        v_agent_model, v_prompt_hash, p_action_category, p_action_description,
        p_target_schema, p_target_table, p_target_id, p_target_field,
        p_old_value, p_new_value,
        p_trigger_description, p_reasoning_summary, p_confidence_score,
        p_thread_id, p_checkpoint_id,
        v_record_hash, v_previous_hash,
        p_metadata
    ) RETURNING id INTO v_record_id;
    
    RETURN v_record_id;
END;
$$;

-- Verify hash chain integrity
CREATE OR REPLACE FUNCTION cognitive_audit.verify_hash_chain(
    p_start_time TIMESTAMPTZ DEFAULT NULL,
    p_end_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    record_id UUID,
    timestamp TIMESTAMPTZ,
    expected_hash TEXT,
    actual_hash TEXT,
    chain_valid BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH ordered_records AS (
        SELECT 
            l.id,
            l.timestamp,
            l.actor_type,
            l.action_category,
            l.action_description,
            l.target_schema,
            l.target_table,
            l.target_id,
            l.old_value,
            l.new_value,
            l.record_hash,
            l.previous_record_hash,
            LAG(l.record_hash) OVER (ORDER BY l.timestamp) AS actual_previous_hash
        FROM cognitive_audit.semantic_audit_log l
        WHERE (p_start_time IS NULL OR l.timestamp >= p_start_time)
          AND (p_end_time IS NULL OR l.timestamp <= p_end_time)
    )
    SELECT 
        o.id AS record_id,
        o.timestamp,
        cognitive_audit.generate_record_hash(
            o.actor_type, o.action_category, o.action_description,
            o.target_schema, o.target_table, o.target_id,
            o.old_value, o.new_value, o.timestamp, o.actual_previous_hash
        ) AS expected_hash,
        o.record_hash AS actual_hash,
        (o.record_hash = cognitive_audit.generate_record_hash(
            o.actor_type, o.action_category, o.action_description,
            o.target_schema, o.target_table, o.target_id,
            o.old_value, o.new_value, o.timestamp, o.actual_previous_hash
        )) AS chain_valid
    FROM ordered_records o
    ORDER BY o.timestamp;
END;
$$;

-- =============================================================================
-- 7. AUDIT QUERY VIEWS
-- =============================================================================

-- Human-readable audit trail view
CREATE OR REPLACE VIEW cognitive_audit.audit_trail_readable AS
SELECT 
    sal.id,
    sal.timestamp,
    sal.actor_type,
    CASE 
        WHEN sal.actor_type = 'HUMAN_USER' THEN sal.user_name
        WHEN sal.actor_type = 'AUTONOMOUS_AGENT' THEN sal.agent_code || ' (' || sal.agent_model_id || ')'
        ELSE sal.actor_type::TEXT
    END AS actor_display,
    sal.action_category,
    sal.action_description,
    sal.target_schema || '.' || sal.target_table AS target_entity,
    sal.target_id,
    sal.target_field,
    sal.reasoning_summary,
    sal.confidence_score,
    sal.governance_check_passed,
    sal.processing_duration_ms,
    sal.record_hash
FROM cognitive_audit.semantic_audit_log sal
ORDER BY sal.timestamp DESC;

-- Agent activity summary
CREATE OR REPLACE VIEW cognitive_audit.agent_activity_summary AS
SELECT 
    ad.agent_code,
    ad.agent_type,
    COUNT(*) AS total_actions,
    COUNT(*) FILTER (WHERE sal.governance_check_passed = TRUE) AS compliant_actions,
    COUNT(*) FILTER (WHERE sal.governance_check_passed = FALSE) AS violation_actions,
    AVG(sal.confidence_score) AS avg_confidence,
    AVG(sal.processing_duration_ms) AS avg_processing_ms,
    MAX(sal.timestamp) AS last_activity
FROM cognitive_audit.semantic_audit_log sal
JOIN agent_runtime.agent_definitions ad ON sal.agent_definition_id = ad.id
GROUP BY ad.agent_code, ad.agent_type;

-- =============================================================================
-- 8. TRIGGERS FOR AUTOMATIC AUDIT LOGGING
-- =============================================================================

-- Generic audit trigger function
CREATE OR REPLACE FUNCTION cognitive_audit.audit_trigger_func()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_action cognitive_audit.action_category;
    v_old_value JSONB;
    v_new_value JSONB;
BEGIN
    -- Determine action type
    IF TG_OP = 'INSERT' THEN
        v_action := 'CREATE';
        v_old_value := NULL;
        v_new_value := to_jsonb(NEW);
    ELSIF TG_OP = 'UPDATE' THEN
        v_action := 'UPDATE';
        v_old_value := to_jsonb(OLD);
        v_new_value := to_jsonb(NEW);
    ELSIF TG_OP = 'DELETE' THEN
        v_action := 'DELETE';
        v_old_value := to_jsonb(OLD);
        v_new_value := NULL;
    END IF;
    
    -- Log the action
    PERFORM cognitive_audit.log_semantic_action(
        p_actor_type := 'SYSTEM_PROCESS'::cognitive_audit.actor_type,
        p_action_category := v_action,
        p_action_description := TG_OP || ' on ' || TG_TABLE_SCHEMA || '.' || TG_TABLE_NAME,
        p_target_schema := TG_TABLE_SCHEMA,
        p_target_table := TG_TABLE_NAME,
        p_target_id := CASE WHEN TG_OP = 'DELETE' THEN (OLD).id ELSE (NEW).id END,
        p_old_value := v_old_value,
        p_new_value := v_new_value
    );
    
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$;

-- Apply audit trigger to critical tables
DO $$
DECLARE
    v_tables TEXT[] := ARRAY[
        'product_master.products',
        'ectd_v4.regulatory_submissions',
        'agent_runtime.agent_definitions'
    ];
    v_table TEXT;
    v_schema TEXT;
    v_table_name TEXT;
BEGIN
    FOREACH v_table IN ARRAY v_tables
    LOOP
        v_schema := split_part(v_table, '.', 1);
        v_table_name := split_part(v_table, '.', 2);
        
        EXECUTE format(
            'DROP TRIGGER IF EXISTS audit_cognitive_%I ON %I.%I',
            v_table_name, v_schema, v_table_name
        );
        
        EXECUTE format(
            'CREATE TRIGGER audit_cognitive_%I
             AFTER INSERT OR UPDATE OR DELETE ON %I.%I
             FOR EACH ROW EXECUTE FUNCTION cognitive_audit.audit_trigger_func()',
            v_table_name, v_schema, v_table_name
        );
    END LOOP;
END;
$$;

COMMIT;

-- =============================================================================
-- VERIFICATION
-- =============================================================================

/*
-- Check schema and tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'cognitive_audit';

-- Test logging function
SELECT cognitive_audit.log_semantic_action(
    p_actor_type := 'HUMAN_USER',
    p_user_id := NULL,
    p_action_category := 'UPDATE',
    p_action_description := 'Test audit entry',
    p_target_schema := 'test',
    p_target_table := 'test_table',
    p_reasoning_summary := 'Testing the cognitive audit system'
);

-- Verify hash chain
SELECT * FROM cognitive_audit.verify_hash_chain() LIMIT 10;

-- View readable audit trail
SELECT * FROM cognitive_audit.audit_trail_readable LIMIT 10;
*/
