-- =============================================================================
-- Migration 059: GCC Vector Embeddings for Regulatory AI/RAG
-- =============================================================================
-- Purpose: pgvector foundation for semantic search and RAG on regulatory content
-- Compliance: Prepared for FDA AI/ML guidance, EU AI Act considerations
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ENABLE PGVECTOR EXTENSION
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS vector;

COMMENT ON EXTENSION vector IS 
'pgvector: Open-source vector similarity search for PostgreSQL';

-- =============================================================================
-- 2. CREATE AI SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS ai;

COMMENT ON SCHEMA ai IS 
'AI/ML infrastructure for regulatory RAG, semantic search, and embeddings';

-- =============================================================================
-- 3. EMBEDDING MODEL REGISTRY
-- =============================================================================

CREATE TYPE ai.embedding_model AS ENUM (
    'OPENAI_ADA_002',           -- OpenAI text-embedding-ada-002 (1536 dim)
    'OPENAI_3_SMALL',           -- OpenAI text-embedding-3-small (1536 dim)
    'OPENAI_3_LARGE',           -- OpenAI text-embedding-3-large (3072 dim)
    'COHERE_EMBED_V3',          -- Cohere embed-english-v3.0 (1024 dim)
    'VOYAGE_2',                 -- Voyage AI voyage-2 (1024 dim)
    'BGE_LARGE',                -- BAAI/bge-large-en-v1.5 (1024 dim)
    'E5_LARGE',                 -- intfloat/e5-large-v2 (1024 dim)
    'INSTRUCTOR_XL',            -- hkunlp/instructor-xl (768 dim)
    'KIMI_EMBEDDING',           -- Moonshot AI embedding (custom dim)
    'CUSTOM'                    -- Custom/fine-tuned model
);

CREATE TABLE ai.embedding_models (
    id TEXT PRIMARY KEY,
    model_type ai.embedding_model NOT NULL,
    display_name TEXT NOT NULL,
    provider TEXT NOT NULL,                      -- 'openai', 'cohere', 'self-hosted'
    dimensions INT NOT NULL,                     -- Vector dimensions
    max_tokens INT,                              -- Max input tokens
    api_endpoint TEXT,                           -- For self-hosted models
    is_active BOOLEAN DEFAULT TRUE,
    is_default BOOLEAN DEFAULT FALSE,
    cost_per_1k_tokens NUMERIC(10, 6),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default models
INSERT INTO ai.embedding_models (id, model_type, display_name, provider, dimensions, max_tokens, is_active, is_default, cost_per_1k_tokens)
VALUES 
    ('openai-ada-002', 'OPENAI_ADA_002', 'OpenAI Ada 002', 'openai', 1536, 8191, TRUE, FALSE, 0.0001),
    ('openai-3-small', 'OPENAI_3_SMALL', 'OpenAI Embedding 3 Small', 'openai', 1536, 8191, TRUE, TRUE, 0.00002),
    ('openai-3-large', 'OPENAI_3_LARGE', 'OpenAI Embedding 3 Large', 'openai', 3072, 8191, TRUE, FALSE, 0.00013),
    ('voyage-2', 'VOYAGE_2', 'Voyage AI v2', 'voyage', 1024, 4000, TRUE, FALSE, 0.0001),
    ('bge-large', 'BGE_LARGE', 'BGE Large EN v1.5', 'self-hosted', 1024, 512, TRUE, FALSE, 0.0),
    ('kimi-embed', 'KIMI_EMBEDDING', 'Kimi AI Embedding', 'moonshot', 1024, 8192, TRUE, FALSE, 0.00005)
ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- 4. DOCUMENT EMBEDDINGS (Core Vector Store)
-- =============================================================================

CREATE TABLE ai.document_embeddings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source Reference (polymorphic)
    source_type TEXT NOT NULL,                   -- 'ECTD_DOCUMENT', 'FHIR_RESOURCE', 'REGULATION', 'GUIDANCE'
    source_id UUID,                              -- FK to source table (resolved by source_type)
    source_url TEXT,                             -- For external regulations
    
    -- Ownership
    org_id UUID REFERENCES identity.organizations(id),  -- NULL for global/public content
    
    -- Content
    chunk_index INT NOT NULL DEFAULT 0,          -- For chunked documents
    chunk_text TEXT NOT NULL,                    -- The actual text that was embedded
    chunk_tokens INT,                            -- Token count
    
    -- Embedding
    model_id TEXT REFERENCES ai.embedding_models(id),
    embedding_1536 vector(1536),                 -- OpenAI Ada/3-small dimension
    embedding_1024 vector(1024),                 -- Cohere/Voyage/BGE dimension
    embedding_3072 vector(3072),                 -- OpenAI 3-large dimension
    
    -- Metadata for filtering
    document_type TEXT,                          -- 'PDF', 'XML', 'JSON', 'MARKDOWN'
    ectd_module TEXT,                            -- 'M1', 'M2', 'M3', 'M4', 'M5'
    regulatory_authority TEXT,                   -- 'US_FDA', 'EU_EMA', 'JP_PMDA'
    therapeutic_area TEXT,
    
    -- Quality Metrics
    embedding_quality_score NUMERIC(5, 4),       -- 0-1 confidence score
    
    -- Timestamps
    embedded_at TIMESTAMPTZ DEFAULT NOW(),
    source_modified_at TIMESTAMPTZ,
    
    -- Prevent duplicate embeddings
    content_hash TEXT NOT NULL,                  -- MD5 of chunk_text for dedup
    
    CONSTRAINT unique_embedding UNIQUE (source_type, source_id, chunk_index, model_id)
);

-- =============================================================================
-- 5. REGULATORY KNOWLEDGE BASE
-- =============================================================================
-- Pre-embedded FDA/EMA/ICH guidelines for RAG

CREATE TABLE ai.regulatory_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Document Identity
    document_code TEXT NOT NULL,                 -- 'ICH_Q1A_R2', 'FDA_21CFR11', 'EU_ANNEX_1'
    document_title TEXT NOT NULL,
    document_version TEXT,
    publication_date DATE,
    
    -- Authority
    issuing_authority TEXT NOT NULL,             -- 'ICH', 'FDA', 'EMA', 'PMDA'
    document_type TEXT NOT NULL,                 -- 'GUIDANCE', 'REGULATION', 'Q&A', 'MANUAL'
    
    -- Classification
    applicable_domains TEXT[],                   -- ['PHARMA', 'DEVICE', 'IVD']
    applicable_modules TEXT[],                   -- ['M3', 'M5'] for eCTD
    keywords TEXT[],
    
    -- Source
    source_url TEXT,
    source_pdf_url TEXT,
    
    -- Full Text (for chunking)
    full_text TEXT,
    
    -- Status
    is_current BOOLEAN DEFAULT TRUE,
    superseded_by TEXT,                          -- document_code of replacement
    
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 6. SEARCH QUERIES LOG (For Analytics & Fine-tuning)
-- =============================================================================

CREATE TABLE ai.search_queries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Query
    query_text TEXT NOT NULL,
    query_embedding vector(1536),                -- Store for analysis
    model_id TEXT REFERENCES ai.embedding_models(id),
    
    -- Context
    user_id UUID REFERENCES identity.users(id),
    org_id UUID REFERENCES identity.organizations(id),
    session_id TEXT,
    
    -- Search Parameters
    search_type TEXT DEFAULT 'SEMANTIC',         -- 'SEMANTIC', 'HYBRID', 'KEYWORD'
    top_k INT DEFAULT 10,
    similarity_threshold NUMERIC(5, 4),
    filters_applied JSONB,
    
    -- Results
    result_count INT,
    result_ids UUID[],                           -- IDs of returned embeddings
    result_scores NUMERIC[],                     -- Similarity scores
    
    -- Performance
    execution_time_ms INT,
    
    -- Feedback
    user_rating INT,                             -- 1-5 stars
    user_feedback TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 7. RAG CONVERSATIONS (Chat History for Context)
-- =============================================================================

CREATE TABLE ai.rag_conversations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Ownership
    user_id UUID REFERENCES identity.users(id),
    org_id UUID REFERENCES identity.organizations(id),
    
    -- Conversation Meta
    title TEXT,
    context_type TEXT,                           -- 'SUBMISSION', 'PRODUCT', 'GENERAL'
    context_id UUID,                             -- FK to submission/product if applicable
    
    -- State
    is_active BOOLEAN DEFAULT TRUE,
    message_count INT DEFAULT 0,
    
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_message_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE ai.rag_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID NOT NULL REFERENCES ai.rag_conversations(id) ON DELETE CASCADE,
    
    -- Message
    role TEXT NOT NULL,                          -- 'user', 'assistant', 'system'
    content TEXT NOT NULL,
    
    -- RAG Context (for assistant messages)
    retrieved_chunks UUID[],                     -- IDs from document_embeddings
    retrieval_scores NUMERIC[],
    
    -- Generation Meta
    model_used TEXT,                             -- 'gpt-4', 'kimi', 'claude'
    prompt_tokens INT,
    completion_tokens INT,
    
    -- Feedback
    is_helpful BOOLEAN,
    user_correction TEXT,
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- 8. INDEXES FOR VECTOR SEARCH
-- =============================================================================

-- HNSW indexes for fast approximate nearest neighbor search
-- Using cosine distance (most common for text embeddings)

CREATE INDEX idx_embeddings_1536_hnsw ON ai.document_embeddings 
    USING hnsw (embedding_1536 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding_1536 IS NOT NULL;

CREATE INDEX idx_embeddings_1024_hnsw ON ai.document_embeddings 
    USING hnsw (embedding_1024 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding_1024 IS NOT NULL;

CREATE INDEX idx_embeddings_3072_hnsw ON ai.document_embeddings 
    USING hnsw (embedding_3072 vector_cosine_ops)
    WITH (m = 16, ef_construction = 64)
    WHERE embedding_3072 IS NOT NULL;

-- Filtering indexes
CREATE INDEX idx_embeddings_source ON ai.document_embeddings(source_type, source_id);
CREATE INDEX idx_embeddings_org ON ai.document_embeddings(org_id) WHERE org_id IS NOT NULL;
CREATE INDEX idx_embeddings_module ON ai.document_embeddings(ectd_module) WHERE ectd_module IS NOT NULL;
CREATE INDEX idx_embeddings_authority ON ai.document_embeddings(regulatory_authority) WHERE regulatory_authority IS NOT NULL;
CREATE INDEX idx_embeddings_content_hash ON ai.document_embeddings(content_hash);

-- Knowledge base indexes
CREATE INDEX idx_knowledge_code ON ai.regulatory_knowledge(document_code);
CREATE INDEX idx_knowledge_authority ON ai.regulatory_knowledge(issuing_authority);
CREATE INDEX idx_knowledge_domains ON ai.regulatory_knowledge USING GIN(applicable_domains);
CREATE INDEX idx_knowledge_keywords ON ai.regulatory_knowledge USING GIN(keywords);

-- Query log indexes
CREATE INDEX idx_queries_user ON ai.search_queries(user_id);
CREATE INDEX idx_queries_org ON ai.search_queries(org_id);
CREATE INDEX idx_queries_created ON ai.search_queries(created_at DESC);

-- Conversation indexes
CREATE INDEX idx_conversations_user ON ai.rag_conversations(user_id);
CREATE INDEX idx_conversations_org ON ai.rag_conversations(org_id);
CREATE INDEX idx_messages_conversation ON ai.rag_messages(conversation_id);

-- =============================================================================
-- 9. RLS POLICIES
-- =============================================================================

ALTER TABLE ai.document_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.search_queries ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.rag_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai.rag_messages ENABLE ROW LEVEL SECURITY;

-- Document Embeddings: Org-scoped OR public (org_id IS NULL)
CREATE POLICY embeddings_access ON ai.document_embeddings
    FOR SELECT
    USING (
        org_id IS NULL  -- Public/regulatory content
        OR identity.can_access_org(org_id)
    );

CREATE POLICY embeddings_write ON ai.document_embeddings
    FOR INSERT
    WITH CHECK (
        org_id IS NULL  -- System can insert public content
        OR identity.can_write_org(org_id)
    );

-- Search Queries: User's own queries or org admin
CREATE POLICY queries_access ON ai.search_queries
    FOR SELECT
    USING (
        user_id::TEXT = current_setting('app.current_user_id', TRUE)
        OR identity.can_access_org(org_id)
    );

CREATE POLICY queries_write ON ai.search_queries
    FOR INSERT
    WITH CHECK (TRUE);  -- Anyone can log queries

-- Conversations: User's own or org-shared
CREATE POLICY conversations_access ON ai.rag_conversations
    FOR ALL
    USING (
        user_id::TEXT = current_setting('app.current_user_id', TRUE)
        OR identity.can_access_org(org_id)
    );

-- Messages: Inherit from conversation
CREATE POLICY messages_access ON ai.rag_messages
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM ai.rag_conversations c
            WHERE c.id = conversation_id
            AND (
                c.user_id::TEXT = current_setting('app.current_user_id', TRUE)
                OR identity.can_access_org(c.org_id)
            )
        )
    );

-- =============================================================================
-- 10. SEMANTIC SEARCH FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION ai.semantic_search(
    p_query_embedding vector(1536),
    p_top_k INT DEFAULT 10,
    p_similarity_threshold NUMERIC DEFAULT 0.7,
    p_org_id UUID DEFAULT NULL,
    p_ectd_module TEXT DEFAULT NULL,
    p_regulatory_authority TEXT DEFAULT NULL,
    p_source_type TEXT DEFAULT NULL
)
RETURNS TABLE (
    embedding_id UUID,
    source_type TEXT,
    source_id UUID,
    chunk_text TEXT,
    chunk_index INT,
    similarity NUMERIC,
    ectd_module TEXT,
    regulatory_authority TEXT,
    document_type TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.id AS embedding_id,
        de.source_type,
        de.source_id,
        de.chunk_text,
        de.chunk_index,
        (1 - (de.embedding_1536 <=> p_query_embedding))::NUMERIC AS similarity,
        de.ectd_module,
        de.regulatory_authority,
        de.document_type
    FROM ai.document_embeddings de
    WHERE 
        de.embedding_1536 IS NOT NULL
        AND (1 - (de.embedding_1536 <=> p_query_embedding)) >= p_similarity_threshold
        -- Org filter: show public content OR org's content
        AND (de.org_id IS NULL OR de.org_id = p_org_id OR p_org_id IS NULL)
        -- Optional filters
        AND (p_ectd_module IS NULL OR de.ectd_module = p_ectd_module)
        AND (p_regulatory_authority IS NULL OR de.regulatory_authority = p_regulatory_authority)
        AND (p_source_type IS NULL OR de.source_type = p_source_type)
    ORDER BY de.embedding_1536 <=> p_query_embedding
    LIMIT p_top_k;
END;
$$;

-- =============================================================================
-- 11. HYBRID SEARCH FUNCTION (Vector + Full-Text)
-- =============================================================================

CREATE OR REPLACE FUNCTION ai.hybrid_search(
    p_query_text TEXT,
    p_query_embedding vector(1536),
    p_top_k INT DEFAULT 10,
    p_vector_weight NUMERIC DEFAULT 0.7,
    p_org_id UUID DEFAULT NULL
)
RETURNS TABLE (
    embedding_id UUID,
    source_type TEXT,
    source_id UUID,
    chunk_text TEXT,
    vector_score NUMERIC,
    text_score NUMERIC,
    combined_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    WITH vector_results AS (
        SELECT 
            de.id,
            de.source_type,
            de.source_id,
            de.chunk_text,
            (1 - (de.embedding_1536 <=> p_query_embedding))::NUMERIC AS v_score
        FROM ai.document_embeddings de
        WHERE de.embedding_1536 IS NOT NULL
          AND (de.org_id IS NULL OR de.org_id = p_org_id)
        ORDER BY de.embedding_1536 <=> p_query_embedding
        LIMIT p_top_k * 2
    ),
    text_results AS (
        SELECT 
            de.id,
            ts_rank(to_tsvector('english', de.chunk_text), plainto_tsquery('english', p_query_text))::NUMERIC AS t_score
        FROM ai.document_embeddings de
        WHERE to_tsvector('english', de.chunk_text) @@ plainto_tsquery('english', p_query_text)
          AND (de.org_id IS NULL OR de.org_id = p_org_id)
    )
    SELECT 
        vr.id AS embedding_id,
        vr.source_type,
        vr.source_id,
        vr.chunk_text,
        vr.v_score AS vector_score,
        COALESCE(tr.t_score, 0) AS text_score,
        (p_vector_weight * vr.v_score + (1 - p_vector_weight) * COALESCE(tr.t_score, 0))::NUMERIC AS combined_score
    FROM vector_results vr
    LEFT JOIN text_results tr ON tr.id = vr.id
    ORDER BY (p_vector_weight * vr.v_score + (1 - p_vector_weight) * COALESCE(tr.t_score, 0)) DESC
    LIMIT p_top_k;
END;
$$;

-- =============================================================================
-- 12. EMBEDDING INSERTION FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION ai.insert_embedding(
    p_source_type TEXT,
    p_source_id UUID,
    p_chunk_text TEXT,
    p_chunk_index INT,
    p_embedding vector(1536),
    p_model_id TEXT,
    p_org_id UUID DEFAULT NULL,
    p_ectd_module TEXT DEFAULT NULL,
    p_regulatory_authority TEXT DEFAULT NULL,
    p_document_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_content_hash TEXT;
    v_embedding_id UUID;
BEGIN
    -- Calculate content hash for deduplication
    v_content_hash := md5(p_chunk_text);
    
    -- Check for existing embedding
    SELECT id INTO v_embedding_id
    FROM ai.document_embeddings
    WHERE source_type = p_source_type 
      AND source_id = p_source_id 
      AND chunk_index = p_chunk_index
      AND model_id = p_model_id;
    
    IF v_embedding_id IS NOT NULL THEN
        -- Update existing
        UPDATE ai.document_embeddings
        SET chunk_text = p_chunk_text,
            embedding_1536 = p_embedding,
            content_hash = v_content_hash,
            embedded_at = NOW()
        WHERE id = v_embedding_id;
    ELSE
        -- Insert new
        INSERT INTO ai.document_embeddings (
            source_type, source_id, chunk_index, chunk_text,
            model_id, embedding_1536, content_hash,
            org_id, ectd_module, regulatory_authority, document_type
        ) VALUES (
            p_source_type, p_source_id, p_chunk_index, p_chunk_text,
            p_model_id, p_embedding, v_content_hash,
            p_org_id, p_ectd_module, p_regulatory_authority, p_document_type
        )
        RETURNING id INTO v_embedding_id;
    END IF;
    
    RETURN v_embedding_id;
END;
$$;

-- =============================================================================
-- 13. SEED REGULATORY KNOWLEDGE BASE
-- =============================================================================

INSERT INTO ai.regulatory_knowledge (
    document_code, document_title, document_version, issuing_authority,
    document_type, applicable_domains, applicable_modules, keywords
) VALUES 
    ('ICH_Q1A_R2', 'Stability Testing of New Drug Substances and Products', 'R2', 'ICH',
     'GUIDANCE', ARRAY['PHARMA'], ARRAY['M3'], ARRAY['stability', 'shelf life', 'storage conditions', 'CMC']),
    
    ('ICH_Q1B', 'Photostability Testing of New Drug Substances and Products', '1.0', 'ICH',
     'GUIDANCE', ARRAY['PHARMA'], ARRAY['M3'], ARRAY['photostability', 'light exposure', 'CMC']),
    
    ('ICH_Q3A_R2', 'Impurities in New Drug Substances', 'R2', 'ICH',
     'GUIDANCE', ARRAY['PHARMA'], ARRAY['M3'], ARRAY['impurities', 'degradation', 'CMC']),
    
    ('ICH_E6_R2', 'Good Clinical Practice', 'R2', 'ICH',
     'GUIDANCE', ARRAY['PHARMA', 'DEVICE'], ARRAY['M5'], ARRAY['GCP', 'clinical trials', 'informed consent']),
    
    ('FDA_21CFR11', '21 CFR Part 11 - Electronic Records', 'Current', 'FDA',
     'REGULATION', ARRAY['PHARMA', 'DEVICE', 'IVD'], NULL, ARRAY['electronic signatures', 'audit trail', 'Part 11']),
    
    ('FDA_21CFR820', '21 CFR Part 820 - Quality System Regulation', 'Current', 'FDA',
     'REGULATION', ARRAY['DEVICE', 'IVD'], NULL, ARRAY['QSR', 'design controls', 'CAPA', 'medical device']),
    
    ('FDA_510K_GUIDANCE', 'The 510(k) Program: Evaluating Substantial Equivalence', '2014', 'FDA',
     'GUIDANCE', ARRAY['DEVICE'], NULL, ARRAY['510k', 'substantial equivalence', 'predicate device']),
    
    ('EU_MDR_2017_745', 'Medical Device Regulation', '2017/745', 'EU',
     'REGULATION', ARRAY['DEVICE'], NULL, ARRAY['MDR', 'CE marking', 'notified body', 'UDI']),
    
    ('EU_IVDR_2017_746', 'In Vitro Diagnostic Regulation', '2017/746', 'EU',
     'REGULATION', ARRAY['IVD'], NULL, ARRAY['IVDR', 'CE marking', 'performance evaluation']),
    
    ('ICH_M4_CTD', 'The Common Technical Document', '4.0', 'ICH',
     'GUIDANCE', ARRAY['PHARMA'], ARRAY['M1', 'M2', 'M3', 'M4', 'M5'], ARRAY['eCTD', 'CTD', 'dossier', 'modules'])
ON CONFLICT DO NOTHING;

-- =============================================================================
-- 14. AUDIT LOGGING
-- =============================================================================

CREATE OR REPLACE FUNCTION ai.log_search_query(
    p_query_text TEXT,
    p_query_embedding vector(1536),
    p_user_id UUID,
    p_org_id UUID,
    p_search_type TEXT,
    p_result_count INT,
    p_result_ids UUID[],
    p_result_scores NUMERIC[],
    p_execution_time_ms INT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_query_id UUID;
BEGIN
    INSERT INTO ai.search_queries (
        query_text, query_embedding, user_id, org_id,
        search_type, result_count, result_ids, result_scores, execution_time_ms
    ) VALUES (
        p_query_text, p_query_embedding, p_user_id, p_org_id,
        p_search_type, p_result_count, p_result_ids, p_result_scores, p_execution_time_ms
    )
    RETURNING id INTO v_query_id;
    
    RETURN v_query_id;
END;
$$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

/*
-- Verify pgvector extension
SELECT * FROM pg_extension WHERE extname = 'vector';

-- Verify schema
SELECT schema_name FROM information_schema.schemata WHERE schema_name = 'ai';

-- Verify tables
SELECT table_name FROM information_schema.tables WHERE table_schema = 'ai';

-- Verify HNSW indexes
SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'ai' AND indexdef LIKE '%hnsw%';

-- Test embedding insertion (requires actual embedding vector)
-- SELECT ai.insert_embedding(
--     'TEST', gen_random_uuid(), 'Sample regulatory text about stability testing.',
--     0, array_fill(0.1, ARRAY[1536])::vector(1536), 'openai-3-small'
-- );

-- Test semantic search (requires embedding)
-- SELECT * FROM ai.semantic_search(
--     array_fill(0.1, ARRAY[1536])::vector(1536),
--     5, 0.5
-- );

-- Check regulatory knowledge base
SELECT document_code, document_title, issuing_authority FROM ai.regulatory_knowledge;
*/
