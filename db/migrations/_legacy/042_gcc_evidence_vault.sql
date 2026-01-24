-- Migration: 042_gcc_evidence_vault.sql
-- Purpose: Evidence Vault - S3 integration, vectorization pipeline, semantic search
-- Part of Phase 3 - Evidence Vault with S3 + Vectorization

BEGIN;

-- =============================================================================
-- EVIDENCE VAULT SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS vault;

-- Ensure pgvector extension is available
CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================================
-- DOCUMENT STORAGE (S3-backed with metadata)
-- =============================================================================

CREATE TYPE vault.storage_class AS ENUM (
    'STANDARD',         -- Frequently accessed
    'INTELLIGENT',      -- Auto-tiering
    'ARCHIVE',          -- Infrequently accessed
    'DEEP_ARCHIVE'      -- Rarely accessed, long retention
);

CREATE TYPE vault.document_classification AS ENUM (
    'CONFIDENTIAL',     -- Restricted access
    'INTERNAL',         -- Internal use only
    'CONTROLLED',       -- Controlled distribution
    'PUBLIC'            -- Publicly available
);

CREATE TYPE vault.processing_status AS ENUM (
    'PENDING',          -- Awaiting processing
    'EXTRACTING',       -- Text extraction in progress
    'VECTORIZING',      -- Embedding generation
    'INDEXED',          -- Fully processed and searchable
    'FAILED',           -- Processing failed
    'ARCHIVED'          -- Archived, not actively indexed
);

CREATE TABLE vault.documents (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
    
    -- Document identification
    document_code       TEXT NOT NULL,
    document_title      TEXT NOT NULL,
    document_type       TEXT NOT NULL,              -- 'CSR', 'PROTOCOL', 'CER', 'IB', etc.
    version             TEXT DEFAULT '1.0',
    
    -- S3 storage
    s3_bucket           TEXT NOT NULL,
    s3_key              TEXT NOT NULL,
    s3_version_id       TEXT,
    storage_class       vault.storage_class NOT NULL DEFAULT 'STANDARD',
    
    -- File metadata
    file_name           TEXT NOT NULL,
    file_size           BIGINT NOT NULL,
    mime_type           TEXT NOT NULL,
    content_hash        TEXT NOT NULL,              -- SHA256
    
    -- Classification
    classification      vault.document_classification NOT NULL DEFAULT 'INTERNAL',
    retention_policy    TEXT,
    retention_until     DATE,
    
    -- Processing status
    processing_status   vault.processing_status NOT NULL DEFAULT 'PENDING',
    processed_at        TIMESTAMPTZ,
    processing_error    TEXT,
    
    -- Extracted content
    extracted_text      TEXT,                       -- Full extracted text
    page_count          INTEGER,
    word_count          INTEGER,
    language            TEXT DEFAULT 'en',
    
    -- Relationships
    parent_document_id  UUID REFERENCES vault.documents(id),
    supersedes_id       UUID REFERENCES vault.documents(id),
    
    -- Audit
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    deleted_at          TIMESTAMPTZ,                -- Soft delete
    
    UNIQUE(program_id, document_code, version)
);

CREATE INDEX idx_vault_docs_program ON vault.documents(program_id);
CREATE INDEX idx_vault_docs_type ON vault.documents(document_type);
CREATE INDEX idx_vault_docs_status ON vault.documents(processing_status);
CREATE INDEX idx_vault_docs_s3 ON vault.documents(s3_bucket, s3_key);
CREATE INDEX idx_vault_docs_hash ON vault.documents(content_hash);
CREATE INDEX idx_vault_docs_classification ON vault.documents(classification);

-- GIN index for full-text search on extracted text
CREATE INDEX idx_vault_docs_text_search ON vault.documents 
    USING GIN (to_tsvector('english', COALESCE(document_title, '') || ' ' || COALESCE(extracted_text, '')));

COMMENT ON TABLE vault.documents IS 
'Primary document storage with S3 backend and full metadata tracking.';

-- =============================================================================
-- DOCUMENT CHUNKS (For vectorization)
-- =============================================================================

CREATE TABLE vault.document_chunks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    
    -- Chunk identification
    chunk_index         INTEGER NOT NULL,           -- Sequential index within document
    chunk_type          TEXT NOT NULL DEFAULT 'TEXT', -- TEXT, TABLE, FIGURE, HEADING
    
    -- Content
    chunk_text          TEXT NOT NULL,
    char_start          INTEGER,                    -- Character offset in original
    char_end            INTEGER,
    page_number         INTEGER,
    
    -- Metadata
    section_title       TEXT,
    section_hierarchy   TEXT[],                     -- e.g., ['Chapter 1', 'Section 1.2', 'Subsection 1.2.1']
    
    -- Vector embedding (pgvector)
    embedding           VECTOR(1536),               -- OpenAI ada-002 dimension
    embedding_model     TEXT DEFAULT 'text-embedding-ada-002',
    
    -- Token counts (for context window management)
    token_count         INTEGER,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    vectorized_at       TIMESTAMPTZ,
    
    UNIQUE(document_id, chunk_index)
);

CREATE INDEX idx_chunks_document ON vault.document_chunks(document_id);
CREATE INDEX idx_chunks_embedding ON vault.document_chunks USING ivfflat (embedding vector_cosine_ops)
    WITH (lists = 100);

COMMENT ON TABLE vault.document_chunks IS 
'Document chunks with vector embeddings for semantic search.';

-- =============================================================================
-- SEARCH QUERIES LOG (For analytics and improvement)
-- =============================================================================

CREATE TABLE vault.search_queries (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID REFERENCES core.programs(id),
    
    -- Query details
    query_text          TEXT NOT NULL,
    query_embedding     VECTOR(1536),
    
    -- Filters applied
    document_types      TEXT[],
    classification      vault.document_classification[],
    date_range_start    DATE,
    date_range_end      DATE,
    
    -- Results
    result_count        INTEGER,
    top_result_ids      UUID[],
    top_result_scores   NUMERIC[],
    
    -- Performance
    execution_ms        INTEGER,
    
    -- User context
    user_id             UUID,
    session_id          TEXT,
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_search_queries_program ON vault.search_queries(program_id);
CREATE INDEX idx_search_queries_date ON vault.search_queries(created_at DESC);

COMMENT ON TABLE vault.search_queries IS 
'Search query log for analytics and search quality improvement.';

-- =============================================================================
-- DOCUMENT RELATIONSHIPS
-- =============================================================================

CREATE TYPE vault.relationship_type AS ENUM (
    'REFERENCES',       -- Document A references Document B
    'SUPERSEDES',       -- Document A supersedes Document B
    'DERIVED_FROM',     -- Document A is derived from Document B
    'RELATED_TO',       -- General relationship
    'PART_OF',          -- Document A is part of Document B
    'CITES',            -- Document A cites Document B
    'CONTRADICTS'       -- Document A contradicts Document B
);

CREATE TABLE vault.document_relationships (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    source_document_id  UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    target_document_id  UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    
    relationship_type   vault.relationship_type NOT NULL,
    relationship_strength NUMERIC(3,2),             -- 0.00 - 1.00
    
    -- Details
    context             TEXT,                       -- Context for the relationship
    page_reference      TEXT,                       -- Specific page/section reference
    
    -- Auto-detected vs manual
    auto_detected       BOOLEAN DEFAULT FALSE,
    confidence_score    NUMERIC(3,2),
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    
    UNIQUE(source_document_id, target_document_id, relationship_type)
);

CREATE INDEX idx_doc_rels_source ON vault.document_relationships(source_document_id);
CREATE INDEX idx_doc_rels_target ON vault.document_relationships(target_document_id);
CREATE INDEX idx_doc_rels_type ON vault.document_relationships(relationship_type);

COMMENT ON TABLE vault.document_relationships IS 
'Relationships between documents for knowledge graph navigation.';

-- =============================================================================
-- EVIDENCE CITATIONS
-- =============================================================================

CREATE TABLE vault.evidence_citations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Source (the document containing the claim)
    source_document_id  UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    source_chunk_id     UUID REFERENCES vault.document_chunks(id) ON DELETE SET NULL,
    claim_text          TEXT NOT NULL,
    
    -- Evidence (supporting document)
    evidence_document_id UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    evidence_chunk_id   UUID REFERENCES vault.document_chunks(id) ON DELETE SET NULL,
    evidence_text       TEXT,
    
    -- Citation quality
    relevance_score     NUMERIC(3,2),               -- Semantic similarity
    support_type        TEXT,                       -- 'STRONG', 'MODERATE', 'WEAK', 'CONTRADICTS'
    
    -- Context
    citation_context    TEXT,
    regulatory_relevance TEXT[],                    -- e.g., ['FDA', 'GxP', '21CFR11']
    
    -- Timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    verified            BOOLEAN DEFAULT FALSE,
    verified_at         TIMESTAMPTZ,
    verified_by         UUID
);

CREATE INDEX idx_citations_source ON vault.evidence_citations(source_document_id);
CREATE INDEX idx_citations_evidence ON vault.evidence_citations(evidence_document_id);
CREATE INDEX idx_citations_verified ON vault.evidence_citations(verified);

COMMENT ON TABLE vault.evidence_citations IS 
'Evidence citations linking claims to supporting documentation.';

-- =============================================================================
-- SEMANTIC SEARCH FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION vault.semantic_search(
    p_query_embedding VECTOR(1536),
    p_program_id UUID DEFAULT NULL,
    p_document_types TEXT[] DEFAULT NULL,
    p_classification vault.document_classification[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_similarity_threshold NUMERIC DEFAULT 0.7
)
RETURNS TABLE (
    document_id UUID,
    chunk_id UUID,
    document_title TEXT,
    document_type TEXT,
    chunk_text TEXT,
    section_title TEXT,
    similarity NUMERIC,
    page_number INTEGER
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        d.id AS document_id,
        c.id AS chunk_id,
        d.document_title,
        d.document_type,
        c.chunk_text,
        c.section_title,
        (1 - (c.embedding <=> p_query_embedding))::NUMERIC AS similarity,
        c.page_number
    FROM vault.document_chunks c
    JOIN vault.documents d ON d.id = c.document_id
    WHERE c.embedding IS NOT NULL
      AND d.processing_status = 'INDEXED'
      AND d.deleted_at IS NULL
      AND (p_program_id IS NULL OR d.program_id = p_program_id)
      AND (p_document_types IS NULL OR d.document_type = ANY(p_document_types))
      AND (p_classification IS NULL OR d.classification = ANY(p_classification))
      AND (1 - (c.embedding <=> p_query_embedding)) >= p_similarity_threshold
    ORDER BY c.embedding <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION vault.semantic_search IS 
'Perform semantic search across document chunks using vector similarity.';

-- =============================================================================
-- FULL-TEXT SEARCH FUNCTION
-- =============================================================================

CREATE OR REPLACE FUNCTION vault.full_text_search(
    p_query TEXT,
    p_program_id UUID DEFAULT NULL,
    p_document_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE (
    document_id UUID,
    document_title TEXT,
    document_type TEXT,
    excerpt TEXT,
    rank NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
    v_tsquery TSQUERY;
BEGIN
    v_tsquery := plainto_tsquery('english', p_query);
    
    RETURN QUERY
    SELECT 
        d.id AS document_id,
        d.document_title,
        d.document_type,
        ts_headline('english', COALESCE(d.extracted_text, ''), v_tsquery, 
                    'MaxWords=50, MinWords=25, StartSel=<mark>, StopSel=</mark>') AS excerpt,
        ts_rank(to_tsvector('english', COALESCE(d.document_title, '') || ' ' || COALESCE(d.extracted_text, '')), v_tsquery)::NUMERIC AS rank
    FROM vault.documents d
    WHERE d.processing_status = 'INDEXED'
      AND d.deleted_at IS NULL
      AND (p_program_id IS NULL OR d.program_id = p_program_id)
      AND (p_document_types IS NULL OR d.document_type = ANY(p_document_types))
      AND to_tsvector('english', COALESCE(d.document_title, '') || ' ' || COALESCE(d.extracted_text, '')) @@ v_tsquery
    ORDER BY rank DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION vault.full_text_search IS 
'Perform full-text search across indexed documents.';

-- =============================================================================
-- HYBRID SEARCH FUNCTION (combines semantic + full-text)
-- =============================================================================

CREATE OR REPLACE FUNCTION vault.hybrid_search(
    p_query TEXT,
    p_query_embedding VECTOR(1536),
    p_program_id UUID DEFAULT NULL,
    p_document_types TEXT[] DEFAULT NULL,
    p_limit INTEGER DEFAULT 10,
    p_semantic_weight NUMERIC DEFAULT 0.7,
    p_fulltext_weight NUMERIC DEFAULT 0.3
)
RETURNS TABLE (
    document_id UUID,
    chunk_id UUID,
    document_title TEXT,
    document_type TEXT,
    chunk_text TEXT,
    combined_score NUMERIC,
    semantic_score NUMERIC,
    fulltext_score NUMERIC
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
    RETURN QUERY
    WITH semantic_results AS (
        SELECT 
            c.document_id,
            c.id AS chunk_id,
            (1 - (c.embedding <=> p_query_embedding))::NUMERIC AS score
        FROM vault.document_chunks c
        JOIN vault.documents d ON d.id = c.document_id
        WHERE c.embedding IS NOT NULL
          AND d.processing_status = 'INDEXED'
          AND d.deleted_at IS NULL
          AND (p_program_id IS NULL OR d.program_id = p_program_id)
          AND (p_document_types IS NULL OR d.document_type = ANY(p_document_types))
        ORDER BY c.embedding <=> p_query_embedding
        LIMIT p_limit * 3
    ),
    fulltext_results AS (
        SELECT 
            d.id AS document_id,
            NULL::UUID AS chunk_id,
            ts_rank(
                to_tsvector('english', COALESCE(d.document_title, '') || ' ' || COALESCE(d.extracted_text, '')), 
                plainto_tsquery('english', p_query)
            )::NUMERIC AS score
        FROM vault.documents d
        WHERE d.processing_status = 'INDEXED'
          AND d.deleted_at IS NULL
          AND (p_program_id IS NULL OR d.program_id = p_program_id)
          AND (p_document_types IS NULL OR d.document_type = ANY(p_document_types))
        LIMIT p_limit * 3
    ),
    combined AS (
        SELECT 
            COALESCE(s.document_id, f.document_id) AS document_id,
            s.chunk_id,
            COALESCE(s.score, 0) AS semantic_score,
            COALESCE(f.score, 0) AS fulltext_score,
            (COALESCE(s.score, 0) * p_semantic_weight + COALESCE(f.score, 0) * p_fulltext_weight) AS combined_score
        FROM semantic_results s
        FULL OUTER JOIN fulltext_results f ON s.document_id = f.document_id
    )
    SELECT 
        c.document_id,
        c.chunk_id,
        d.document_title,
        d.document_type,
        ch.chunk_text,
        c.combined_score,
        c.semantic_score,
        c.fulltext_score
    FROM combined c
    JOIN vault.documents d ON d.id = c.document_id
    LEFT JOIN vault.document_chunks ch ON ch.id = c.chunk_id
    ORDER BY c.combined_score DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION vault.hybrid_search IS 
'Perform hybrid search combining semantic and full-text approaches.';

-- =============================================================================
-- DOCUMENT PROCESSING QUEUE
-- =============================================================================

CREATE TABLE vault.processing_queue (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id         UUID NOT NULL REFERENCES vault.documents(id) ON DELETE CASCADE,
    
    -- Task details
    task_type           TEXT NOT NULL,              -- 'EXTRACT', 'CHUNK', 'VECTORIZE'
    priority            INTEGER DEFAULT 5,          -- 1-10, lower is higher priority
    
    -- Status
    status              TEXT NOT NULL DEFAULT 'PENDING', -- PENDING, PROCESSING, COMPLETED, FAILED
    attempts            INTEGER DEFAULT 0,
    max_attempts        INTEGER DEFAULT 3,
    last_error          TEXT,
    
    -- Processing timestamps
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    started_at          TIMESTAMPTZ,
    completed_at        TIMESTAMPTZ,
    
    -- Worker info
    worker_id           TEXT,
    
    UNIQUE(document_id, task_type, status)
);

CREATE INDEX idx_processing_queue_status ON vault.processing_queue(status, priority, created_at);
CREATE INDEX idx_processing_queue_document ON vault.processing_queue(document_id);

COMMENT ON TABLE vault.processing_queue IS 
'Document processing job queue for extraction, chunking, and vectorization.';

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Document Overview
CREATE OR REPLACE VIEW vault.v_document_overview AS
SELECT 
    d.id,
    d.program_id,
    p.code AS program_code,
    d.document_code,
    d.document_title,
    d.document_type,
    d.version,
    d.classification,
    d.processing_status,
    d.file_size,
    d.page_count,
    d.word_count,
    COUNT(c.id) AS chunk_count,
    COUNT(c.id) FILTER (WHERE c.embedding IS NOT NULL) AS vectorized_chunks,
    d.created_at,
    d.processed_at
FROM vault.documents d
JOIN core.programs p ON p.id = d.program_id
LEFT JOIN vault.document_chunks c ON c.document_id = d.id
WHERE d.deleted_at IS NULL
GROUP BY d.id, p.code
ORDER BY d.created_at DESC;

COMMENT ON VIEW vault.v_document_overview IS 
'Document overview with chunk and vectorization statistics.';

-- Processing Status Dashboard
CREATE OR REPLACE VIEW vault.v_processing_status AS
SELECT 
    d.processing_status,
    COUNT(*) AS document_count,
    SUM(d.file_size) AS total_size_bytes,
    AVG(d.page_count) AS avg_pages,
    AVG(d.word_count) AS avg_words
FROM vault.documents d
WHERE d.deleted_at IS NULL
GROUP BY d.processing_status
ORDER BY 
    CASE d.processing_status
        WHEN 'PENDING' THEN 1
        WHEN 'EXTRACTING' THEN 2
        WHEN 'VECTORIZING' THEN 3
        WHEN 'INDEXED' THEN 4
        WHEN 'FAILED' THEN 5
        WHEN 'ARCHIVED' THEN 6
    END;

COMMENT ON VIEW vault.v_processing_status IS 
'Document processing status summary.';

-- Search Analytics
CREATE OR REPLACE VIEW vault.v_search_analytics AS
SELECT 
    DATE(created_at) AS search_date,
    COUNT(*) AS total_queries,
    AVG(result_count) AS avg_results,
    AVG(execution_ms) AS avg_execution_ms,
    COUNT(DISTINCT user_id) AS unique_users
FROM vault.search_queries
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY DATE(created_at)
ORDER BY search_date DESC;

COMMENT ON VIEW vault.v_search_analytics IS 
'Search query analytics for the past 30 days.';

COMMIT;
