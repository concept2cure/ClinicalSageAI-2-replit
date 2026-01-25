-- ═══════════════════════════════════════════════════════════════════════════════
--                    LUMEN CORTEX ENTERPRISE - AUDIT TABLES
-- ═══════════════════════════════════════════════════════════════════════════════
--
-- 21 CFR Part 11 Compliant Audit Trail Tables
--
-- Tables:
--   1. enterprise_audit_log - Master audit trail
--   2. table_extraction_audit - Table extraction events
--   3. citation_validation_audit - Citation validation events
--   4. graphrag_query_audit - GraphRAG query events
--   5. compliance_signatures - Digital signature records
--   6. merkle_audit_roots - Merkle tree root hashes
--   7. llm_interaction_audit - LLM API call records
--   8. embedding_audit - Embedding generation records
--
-- @version 2.0.0
-- @compliance 21 CFR Part 11, ICH E6(R2)
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ═══════════════════════════════════════════════════════════════════════════════
--                          MASTER AUDIT LOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS enterprise_audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Event identification
    event_id VARCHAR(64) NOT NULL UNIQUE,
    event_type VARCHAR(100) NOT NULL,
    event_category VARCHAR(50) NOT NULL,

    -- Actor information (Part 11 §11.10(e))
    user_id VARCHAR(100) NOT NULL,
    user_email VARCHAR(255),
    user_role VARCHAR(100),
    organization_id VARCHAR(100),

    -- Event details
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100),
    resource_id VARCHAR(255),

    -- Data payload (encrypted for sensitive data)
    payload JSONB,
    payload_hash VARCHAR(64),  -- SHA-256 of payload

    -- Request context
    ip_address INET,
    user_agent TEXT,
    session_id VARCHAR(255),
    correlation_id VARCHAR(64),

    -- Timing (Part 11 §11.10(e))
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    server_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Integrity
    record_hash VARCHAR(64) NOT NULL,
    previous_hash VARCHAR(64),  -- Chain link
    merkle_root_id UUID,

    -- Classification
    sensitivity_level VARCHAR(20) DEFAULT 'standard',
    retention_years INTEGER DEFAULT 10,

    -- Indexes
    CONSTRAINT valid_event_category CHECK (
        event_category IN (
            'extraction', 'citation', 'graphrag', 'compliance',
            'authentication', 'authorization', 'system', 'api'
        )
    ),
    CONSTRAINT valid_sensitivity CHECK (
        sensitivity_level IN ('public', 'standard', 'confidential', 'restricted')
    )
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON enterprise_audit_log(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user ON enterprise_audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_type ON enterprise_audit_log(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_category ON enterprise_audit_log(event_category);
CREATE INDEX IF NOT EXISTS idx_audit_resource ON enterprise_audit_log(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_audit_correlation ON enterprise_audit_log(correlation_id);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          TABLE EXTRACTION AUDIT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS table_extraction_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id UUID REFERENCES enterprise_audit_log(id),

    -- Document identification
    document_id VARCHAR(255) NOT NULL,
    document_name VARCHAR(500),
    document_hash VARCHAR(64),
    page_number INTEGER,

    -- Extraction details
    extraction_id VARCHAR(64) NOT NULL UNIQUE,
    extraction_strategy VARCHAR(50) NOT NULL,  -- camelot, vision, llm

    -- Table identification
    table_index INTEGER,
    table_schema_type VARCHAR(100),

    -- Results
    rows_extracted INTEGER,
    columns_extracted INTEGER,
    confidence_score DECIMAL(5, 4),

    -- Ensemble weights (if applicable)
    ensemble_weights JSONB,
    model_contributions JSONB,

    -- Validation
    validation_status VARCHAR(20),
    validation_errors JSONB,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    -- Artifacts
    artifact_paths JSONB,  -- Intermediate files
    output_path TEXT,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_strategy CHECK (
        extraction_strategy IN ('camelot', 'vision_transformer', 'multimodal_llm', 'ensemble')
    )
);

CREATE INDEX IF NOT EXISTS idx_extraction_document ON table_extraction_audit(document_id);
CREATE INDEX IF NOT EXISTS idx_extraction_strategy ON table_extraction_audit(extraction_strategy);
CREATE INDEX IF NOT EXISTS idx_extraction_time ON table_extraction_audit(started_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          CITATION VALIDATION AUDIT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS citation_validation_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id UUID REFERENCES enterprise_audit_log(id),

    -- Request identification
    validation_id VARCHAR(64) NOT NULL UNIQUE,

    -- Input
    query_text TEXT NOT NULL,
    query_hash VARCHAR(64),
    response_text TEXT,

    -- Citations found
    citations_extracted INTEGER,
    citations_validated INTEGER,
    citations_failed INTEGER,

    -- Validation layers
    mechanistic_checks JSONB,
    nli_results JSONB,
    knowledge_graph_results JSONB,

    -- Scores
    overall_confidence DECIMAL(5, 4),
    factual_score DECIMAL(5, 4),
    hallucination_detected BOOLEAN DEFAULT FALSE,
    hallucination_severity VARCHAR(20),

    -- Source tracking
    sources_consulted JSONB,
    source_coverage_score DECIMAL(5, 4),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_citation_validation_id ON citation_validation_audit(validation_id);
CREATE INDEX IF NOT EXISTS idx_citation_hallucination ON citation_validation_audit(hallucination_detected);
CREATE INDEX IF NOT EXISTS idx_citation_time ON citation_validation_audit(started_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          GRAPHRAG QUERY AUDIT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS graphrag_query_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id UUID REFERENCES enterprise_audit_log(id),

    -- Query identification
    query_id VARCHAR(64) NOT NULL UNIQUE,

    -- Query details
    query_text TEXT NOT NULL,
    query_hash VARCHAR(64),
    query_embedding_model VARCHAR(100),

    -- Search parameters
    search_type VARCHAR(50),  -- vector, graph, hybrid
    top_k INTEGER,
    similarity_threshold DECIMAL(5, 4),

    -- Graph traversal
    max_hops INTEGER,
    relationship_types JSONB,
    entity_types JSONB,

    -- Results
    entities_retrieved INTEGER,
    communities_retrieved INTEGER,
    chunks_retrieved INTEGER,

    -- Hierarchical context
    level0_context TEXT,  -- Chunk level
    level1_context TEXT,  -- Entity level
    level2_context TEXT,  -- Community level
    level3_context TEXT,  -- Global level

    -- Quality metrics
    relevance_scores JSONB,
    diversity_score DECIMAL(5, 4),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    vector_search_ms INTEGER,
    graph_traversal_ms INTEGER,
    total_duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_graphrag_query_id ON graphrag_query_audit(query_id);
CREATE INDEX IF NOT EXISTS idx_graphrag_search_type ON graphrag_query_audit(search_type);
CREATE INDEX IF NOT EXISTS idx_graphrag_time ON graphrag_query_audit(started_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          COMPLIANCE SIGNATURES
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS compliance_signatures (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Signature identification
    signature_id VARCHAR(64) NOT NULL UNIQUE,

    -- Document being signed
    document_id VARCHAR(255) NOT NULL,
    document_type VARCHAR(100),
    document_hash VARCHAR(64) NOT NULL,  -- SHA-256

    -- Signer information (Part 11 §11.50)
    signer_id VARCHAR(100) NOT NULL,
    signer_name VARCHAR(255),
    signer_email VARCHAR(255),
    signer_title VARCHAR(255),
    signer_organization VARCHAR(255),

    -- Signature details
    signature_data TEXT NOT NULL,  -- Base64 encoded
    signature_algorithm VARCHAR(50) NOT NULL,  -- RSA-PSS-SHA256
    public_key_fingerprint VARCHAR(64),

    -- Meaning of signature (Part 11 §11.50)
    signature_meaning VARCHAR(50) NOT NULL,
    signature_meaning_text TEXT,

    -- Timestamp
    signed_at TIMESTAMPTZ NOT NULL,
    server_timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Verification
    verified BOOLEAN DEFAULT FALSE,
    verified_at TIMESTAMPTZ,
    verified_by VARCHAR(100),

    -- Chain
    previous_signature_id VARCHAR(64),
    merkle_proof JSONB,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_signature_meaning CHECK (
        signature_meaning IN (
            'authored', 'reviewed', 'approved', 'rejected',
            'submitted', 'witnessed', 'certified'
        )
    ),
    CONSTRAINT valid_algorithm CHECK (
        signature_algorithm IN (
            'RSA-PSS-SHA256', 'RSA-PKCS1-SHA256', 'ECDSA-P256-SHA256'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_signature_document ON compliance_signatures(document_id);
CREATE INDEX IF NOT EXISTS idx_signature_signer ON compliance_signatures(signer_id);
CREATE INDEX IF NOT EXISTS idx_signature_time ON compliance_signatures(signed_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          MERKLE AUDIT ROOTS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS merkle_audit_roots (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Root identification
    root_hash VARCHAR(64) NOT NULL UNIQUE,
    tree_depth INTEGER NOT NULL,
    leaf_count INTEGER NOT NULL,

    -- Time range covered
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,

    -- Anchor (for external verification)
    anchor_type VARCHAR(50),  -- database, blockchain, timestamp_authority
    anchor_reference TEXT,
    anchored_at TIMESTAMPTZ,

    -- Verification
    last_verified_at TIMESTAMPTZ,
    verification_status VARCHAR(20) DEFAULT 'pending',

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT valid_anchor_type CHECK (
        anchor_type IS NULL OR anchor_type IN (
            'database', 'blockchain', 'timestamp_authority', 'external_log'
        )
    )
);

CREATE INDEX IF NOT EXISTS idx_merkle_period ON merkle_audit_roots(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_merkle_hash ON merkle_audit_roots(root_hash);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          LLM INTERACTION AUDIT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS llm_interaction_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id UUID REFERENCES enterprise_audit_log(id),

    -- Request identification
    interaction_id VARCHAR(64) NOT NULL UNIQUE,

    -- Provider details
    provider VARCHAR(50) NOT NULL,  -- openai, anthropic, etc.
    model VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),

    -- Request
    prompt_hash VARCHAR(64),  -- Don't store full prompt for privacy
    prompt_tokens INTEGER,
    system_prompt_hash VARCHAR(64),

    -- Response
    response_hash VARCHAR(64),
    completion_tokens INTEGER,
    total_tokens INTEGER,

    -- Quality
    temperature DECIMAL(3, 2),
    top_p DECIMAL(3, 2),
    finish_reason VARCHAR(50),

    -- Cost tracking
    cost_usd DECIMAL(10, 6),

    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    latency_ms INTEGER,

    -- Circuit breaker status
    circuit_state VARCHAR(20),
    retry_count INTEGER DEFAULT 0,

    -- Rate limiting
    rate_limit_remaining INTEGER,
    rate_limit_reset TIMESTAMPTZ,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_llm_provider ON llm_interaction_audit(provider, model);
CREATE INDEX IF NOT EXISTS idx_llm_time ON llm_interaction_audit(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_llm_cost ON llm_interaction_audit(cost_usd);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          EMBEDDING AUDIT
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS embedding_audit (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_log_id UUID REFERENCES enterprise_audit_log(id),

    -- Request identification
    embedding_id VARCHAR(64) NOT NULL UNIQUE,

    -- Provider details
    provider VARCHAR(50) NOT NULL,
    model VARCHAR(100) NOT NULL,
    dimensions INTEGER NOT NULL,

    -- Input
    input_count INTEGER NOT NULL,  -- Number of texts
    total_characters INTEGER,
    input_hash VARCHAR(64),

    -- Output
    embeddings_generated INTEGER,

    -- Performance
    cache_hit BOOLEAN DEFAULT FALSE,
    batch_size INTEGER,

    -- Timing
    started_at TIMESTAMPTZ NOT NULL,
    completed_at TIMESTAMPTZ,
    duration_ms INTEGER,

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_embedding_provider ON embedding_audit(provider, model);
CREATE INDEX IF NOT EXISTS idx_embedding_cache ON embedding_audit(cache_hit);
CREATE INDEX IF NOT EXISTS idx_embedding_time ON embedding_audit(started_at DESC);


-- ═══════════════════════════════════════════════════════════════════════════════
--                          IMMUTABILITY TRIGGERS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Prevent updates to audit records (Part 11 requirement)
CREATE OR REPLACE FUNCTION prevent_audit_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
        RAISE EXCEPTION 'Audit records are immutable and cannot be modified or deleted';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply immutability to all audit tables
DROP TRIGGER IF EXISTS immutable_enterprise_audit ON enterprise_audit_log;
CREATE TRIGGER immutable_enterprise_audit
    BEFORE UPDATE OR DELETE ON enterprise_audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_extraction_audit ON table_extraction_audit;
CREATE TRIGGER immutable_extraction_audit
    BEFORE UPDATE OR DELETE ON table_extraction_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_citation_audit ON citation_validation_audit;
CREATE TRIGGER immutable_citation_audit
    BEFORE UPDATE OR DELETE ON citation_validation_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_graphrag_audit ON graphrag_query_audit;
CREATE TRIGGER immutable_graphrag_audit
    BEFORE UPDATE OR DELETE ON graphrag_query_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_signatures ON compliance_signatures;
CREATE TRIGGER immutable_signatures
    BEFORE UPDATE OR DELETE ON compliance_signatures
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_merkle ON merkle_audit_roots;
CREATE TRIGGER immutable_merkle
    BEFORE UPDATE OR DELETE ON merkle_audit_roots
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_llm_audit ON llm_interaction_audit;
CREATE TRIGGER immutable_llm_audit
    BEFORE UPDATE OR DELETE ON llm_interaction_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();

DROP TRIGGER IF EXISTS immutable_embedding_audit ON embedding_audit;
CREATE TRIGGER immutable_embedding_audit
    BEFORE UPDATE OR DELETE ON embedding_audit
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();


-- ═══════════════════════════════════════════════════════════════════════════════
--                          HASH CHAIN TRIGGER
-- ═══════════════════════════════════════════════════════════════════════════════

-- Auto-compute record hash linking to previous
CREATE OR REPLACE FUNCTION compute_audit_hash()
RETURNS TRIGGER AS $$
DECLARE
    prev_hash VARCHAR(64);
BEGIN
    -- Get previous hash
    SELECT record_hash INTO prev_hash
    FROM enterprise_audit_log
    ORDER BY timestamp DESC
    LIMIT 1;

    NEW.previous_hash := prev_hash;

    -- Compute record hash
    NEW.record_hash := encode(
        digest(
            COALESCE(prev_hash, '') ||
            NEW.event_id ||
            NEW.event_type ||
            NEW.user_id ||
            NEW.timestamp::text ||
            COALESCE(NEW.payload::text, ''),
            'sha256'
        ),
        'hex'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS compute_hash_trigger ON enterprise_audit_log;
CREATE TRIGGER compute_hash_trigger
    BEFORE INSERT ON enterprise_audit_log
    FOR EACH ROW EXECUTE FUNCTION compute_audit_hash();


-- ═══════════════════════════════════════════════════════════════════════════════
--                          UTILITY FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Verify audit chain integrity
CREATE OR REPLACE FUNCTION verify_audit_chain(
    start_time TIMESTAMPTZ DEFAULT NULL,
    end_time TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE (
    verified_count INTEGER,
    broken_links INTEGER,
    first_broken_id UUID
) AS $$
DECLARE
    rec RECORD;
    prev_hash VARCHAR(64) := NULL;
    expected_hash VARCHAR(64);
    verified INTEGER := 0;
    broken INTEGER := 0;
    first_broken UUID := NULL;
BEGIN
    FOR rec IN
        SELECT * FROM enterprise_audit_log
        WHERE (start_time IS NULL OR timestamp >= start_time)
          AND (end_time IS NULL OR timestamp <= end_time)
        ORDER BY timestamp ASC
    LOOP
        IF rec.previous_hash IS DISTINCT FROM prev_hash THEN
            broken := broken + 1;
            IF first_broken IS NULL THEN
                first_broken := rec.id;
            END IF;
        ELSE
            verified := verified + 1;
        END IF;
        prev_hash := rec.record_hash;
    END LOOP;

    RETURN QUERY SELECT verified, broken, first_broken;
END;
$$ LANGUAGE plpgsql;


-- Get audit trail for a resource
CREATE OR REPLACE FUNCTION get_resource_audit_trail(
    p_resource_type VARCHAR,
    p_resource_id VARCHAR
)
RETURNS SETOF enterprise_audit_log AS $$
BEGIN
    RETURN QUERY
    SELECT * FROM enterprise_audit_log
    WHERE resource_type = p_resource_type
      AND resource_id = p_resource_id
    ORDER BY timestamp ASC;
END;
$$ LANGUAGE plpgsql;


-- ═══════════════════════════════════════════════════════════════════════════════
--                          COMMENTS
-- ═══════════════════════════════════════════════════════════════════════════════

COMMENT ON TABLE enterprise_audit_log IS
'Master audit trail for 21 CFR Part 11 compliance. All records are immutable.';

COMMENT ON TABLE table_extraction_audit IS
'Audit trail for multi-modal table extraction operations.';

COMMENT ON TABLE citation_validation_audit IS
'Audit trail for citation validation and hallucination detection.';

COMMENT ON TABLE graphrag_query_audit IS
'Audit trail for hierarchical GraphRAG queries.';

COMMENT ON TABLE compliance_signatures IS
'Digital signature records per 21 CFR Part 11 §11.50.';

COMMENT ON TABLE merkle_audit_roots IS
'Merkle tree roots for tamper-evident audit verification.';

COMMENT ON TABLE llm_interaction_audit IS
'Audit trail for LLM API interactions with cost tracking.';

COMMENT ON TABLE embedding_audit IS
'Audit trail for embedding generation with cache metrics.';
