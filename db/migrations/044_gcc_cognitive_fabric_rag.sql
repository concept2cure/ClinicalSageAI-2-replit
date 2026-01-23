-- =============================================================================
-- Migration 044: Cognitive Fabric - Vision-First RAG Infrastructure
-- =============================================================================
-- Upgrades the Evidence Vault to support:
-- 1. atom_type ENUM (TEXT, TABLE, FIGURE) for first-class table/figure support
-- 2. Enhanced metadata for structured content
-- 3. Entity extraction for hybrid search
-- =============================================================================

-- Create atom_type enum if not exists
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'chunk_content_type') THEN
        CREATE TYPE vault.chunk_content_type AS ENUM ('TEXT', 'TABLE', 'FIGURE');
    END IF;
EXCEPTION
    WHEN duplicate_object THEN NULL;
END $$;

-- Add content_type column to document_chunks if not exists (using existing chunk_type)
-- The existing chunk_type is TEXT, we'll add a structured type column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'vault' 
        AND table_name = 'document_chunks'
        AND column_name = 'content_type'
    ) THEN
        ALTER TABLE vault.document_chunks 
        ADD COLUMN content_type TEXT DEFAULT 'TEXT' 
        CHECK (content_type IN ('TEXT', 'TABLE', 'FIGURE'));
        
        COMMENT ON COLUMN vault.document_chunks.content_type IS 
            'Type of content: TEXT (body), TABLE (structured), FIGURE (visual)';
    END IF;
END $$;

-- Add structured_content column for tables/figures (JSON storage)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'vault' 
        AND table_name = 'document_chunks'
        AND column_name = 'structured_content'
    ) THEN
        ALTER TABLE vault.document_chunks 
        ADD COLUMN structured_content JSONB;
        
        COMMENT ON COLUMN vault.document_chunks.structured_content IS 
            'Structured representation for tables (headers, rows, markdown, json)';
    END IF;
END $$;

-- Add extraction_confidence column
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'vault' 
        AND table_name = 'document_chunks'
        AND column_name = 'extraction_confidence'
    ) THEN
        ALTER TABLE vault.document_chunks 
        ADD COLUMN extraction_confidence NUMERIC(3,2) DEFAULT 1.0;
        
        COMMENT ON COLUMN vault.document_chunks.extraction_confidence IS 
            'Confidence score from layout detection (0.0-1.0)';
    END IF;
END $$;

-- =============================================================================
-- Entity Extraction Table (for Hybrid Search)
-- =============================================================================
-- Stores extracted entities for keyword/entity-based search augmentation
-- Enables queries like "find all atoms mentioning Study 101"

CREATE TABLE IF NOT EXISTS vault.extracted_entities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chunk_id UUID NOT NULL REFERENCES vault.document_chunks(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,  -- 'STUDY_ID', 'DRUG_NAME', 'PATIENT_COUNT', 'P_VALUE', etc.
    entity_value TEXT NOT NULL,
    entity_normalized TEXT,     -- Normalized form for matching
    confidence NUMERIC(3,2) DEFAULT 1.0,
    position_start INT,
    position_end INT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_entity_type CHECK (entity_type IN (
        'STUDY_ID', 'PROTOCOL_NUMBER', 'DRUG_NAME', 'INDICATION',
        'PATIENT_COUNT', 'P_VALUE', 'CONFIDENCE_INTERVAL', 'HAZARD_RATIO',
        'ADVERSE_EVENT', 'ENDPOINT', 'DOSAGE', 'DURATION', 'DATE_REFERENCE',
        'REGULATORY_REFERENCE', 'CUSTOM'
    ))
);

-- Indexes for entity search
CREATE INDEX IF NOT EXISTS idx_entities_type_value 
    ON vault.extracted_entities(entity_type, entity_normalized);
CREATE INDEX IF NOT EXISTS idx_entities_chunk 
    ON vault.extracted_entities(chunk_id);

-- Enable trigram extension if not exists
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_entities_value_gin 
    ON vault.extracted_entities USING gin(entity_value gin_trgm_ops);

-- =============================================================================
-- Drafting Sessions Table (Chain of Verification Logging)
-- =============================================================================
-- Logs every AI generation for 21 CFR Part 11 compliance and auditability

CREATE TABLE IF NOT EXISTS vault.drafting_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id UUID,
    project_id UUID,
    user_id UUID,
    
    -- Request
    prompt_text TEXT NOT NULL,
    prompt_type TEXT NOT NULL,  -- 'section_draft', 'table_summary', 'safety_analysis', etc.
    context_chunks UUID[],       -- Array of chunk IDs used as context
    
    -- Response
    draft_text TEXT,
    reasoning_trace TEXT,       -- Chain of thought explanation
    citations JSONB,            -- Array of {source_id, page, confidence_score}
    
    -- Metadata
    model_used TEXT NOT NULL,
    temperature NUMERIC(3,2),
    token_count_prompt INT,
    token_count_completion INT,
    generation_time_ms INT,
    
    -- Quality metrics
    citation_count INT DEFAULT 0,
    table_references INT DEFAULT 0,
    confidence_score NUMERIC(3,2),
    
    -- Audit
    status TEXT DEFAULT 'completed',
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    CONSTRAINT valid_prompt_type CHECK (prompt_type IN (
        'section_draft', 'table_summary', 'safety_analysis', 'efficacy_summary',
        'pk_analysis', 'clinical_overview', 'nonclinical_summary', 'cmc_summary',
        'regulatory_response', 'label_update', 'custom'
    ))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drafting_program 
    ON vault.drafting_sessions(program_id);
CREATE INDEX IF NOT EXISTS idx_drafting_user 
    ON vault.drafting_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_drafting_created 
    ON vault.drafting_sessions(created_at DESC);

-- =============================================================================
-- Hybrid Search Function
-- =============================================================================
-- Combines vector similarity with entity matching for superior recall

CREATE OR REPLACE FUNCTION vault.hybrid_search(
    p_query_embedding VECTOR(1536),
    p_entity_filters JSONB DEFAULT NULL,  -- {"STUDY_ID": "101", "DRUG_NAME": "TestDrug"}
    p_document_id UUID DEFAULT NULL,
    p_content_types TEXT[] DEFAULT ARRAY['TEXT', 'TABLE', 'FIGURE'],
    p_limit INT DEFAULT 20,
    p_vector_weight NUMERIC DEFAULT 0.7,
    p_entity_weight NUMERIC DEFAULT 0.3
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    content_type TEXT,
    chunk_text TEXT,
    structured_content JSONB,
    page_number INT,
    vector_score NUMERIC,
    entity_score NUMERIC,
    combined_score NUMERIC,
    matched_entities JSONB
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    WITH 
    -- Vector similarity search
    vector_matches AS (
        SELECT 
            c.id,
            c.document_id,
            COALESCE(c.content_type, 'TEXT') as ctype,
            c.chunk_text,
            c.structured_content,
            c.page_number,
            1 - (c.embedding <=> p_query_embedding) AS v_score
        FROM vault.document_chunks c
        WHERE (p_document_id IS NULL OR c.document_id = p_document_id)
        AND COALESCE(c.content_type, 'TEXT') = ANY(p_content_types)
        ORDER BY c.embedding <=> p_query_embedding
        LIMIT p_limit * 2
    ),
    
    -- Entity-based matches (if filters provided)
    entity_matches AS (
        SELECT 
            e.chunk_id,
            COUNT(*) AS match_count,
            jsonb_agg(jsonb_build_object(
                'type', e.entity_type,
                'value', e.entity_value
            )) AS matches
        FROM vault.extracted_entities e
        WHERE p_entity_filters IS NOT NULL
        AND (
            (p_entity_filters->>'STUDY_ID' IS NOT NULL 
             AND e.entity_type = 'STUDY_ID' 
             AND e.entity_normalized ILIKE '%' || (p_entity_filters->>'STUDY_ID') || '%')
            OR
            (p_entity_filters->>'DRUG_NAME' IS NOT NULL 
             AND e.entity_type = 'DRUG_NAME' 
             AND e.entity_normalized ILIKE '%' || (p_entity_filters->>'DRUG_NAME') || '%')
            OR
            (p_entity_filters->>'PROTOCOL_NUMBER' IS NOT NULL 
             AND e.entity_type = 'PROTOCOL_NUMBER' 
             AND e.entity_normalized ILIKE '%' || (p_entity_filters->>'PROTOCOL_NUMBER') || '%')
        )
        GROUP BY e.chunk_id
    )
    
    SELECT 
        vm.id AS chunk_id,
        vm.document_id,
        vm.ctype AS content_type,
        vm.chunk_text,
        vm.structured_content,
        vm.page_number,
        vm.v_score::NUMERIC AS vector_score,
        COALESCE(em.match_count::NUMERIC / 3, 0)::NUMERIC AS entity_score,
        (vm.v_score * p_vector_weight + COALESCE(em.match_count::NUMERIC / 3, 0) * p_entity_weight)::NUMERIC AS combined_score,
        COALESCE(em.matches, '[]'::JSONB) AS matched_entities
    FROM vector_matches vm
    LEFT JOIN entity_matches em ON vm.id = em.chunk_id
    ORDER BY 
        -- Boost exact entity matches to the top
        CASE WHEN em.match_count > 0 THEN 0 ELSE 1 END,
        (vm.v_score * p_vector_weight + COALESCE(em.match_count::NUMERIC / 3, 0) * p_entity_weight) DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Table-Priority Search Function
-- =============================================================================
-- For queries that should prioritize tabular data (PK, AE tables, etc.)

CREATE OR REPLACE FUNCTION vault.table_priority_search(
    p_query_embedding VECTOR(1536),
    p_document_id UUID DEFAULT NULL,
    p_limit INT DEFAULT 10,
    p_table_boost NUMERIC DEFAULT 1.5
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    content_type TEXT,
    chunk_text TEXT,
    structured_content JSONB,
    page_number INT,
    similarity_score NUMERIC,
    boosted_score NUMERIC
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        c.id AS chunk_id,
        c.document_id,
        COALESCE(c.content_type, 'TEXT') as content_type,
        c.chunk_text,
        c.structured_content,
        c.page_number,
        (1 - (c.embedding <=> p_query_embedding))::NUMERIC AS similarity_score,
        ((1 - (c.embedding <=> p_query_embedding)) * 
            CASE WHEN c.content_type = 'TABLE' THEN p_table_boost ELSE 1.0 END
        )::NUMERIC AS boosted_score
    FROM vault.document_chunks c
    WHERE (p_document_id IS NULL OR c.document_id = p_document_id)
    ORDER BY boosted_score DESC
    LIMIT p_limit;
END;
$$;

-- =============================================================================
-- Update Statistics
-- =============================================================================

ANALYZE vault.document_chunks;
ANALYZE vault.extracted_entities;
ANALYZE vault.drafting_sessions;

-- =============================================================================
-- Summary
-- =============================================================================
DO $$
DECLARE
    v_chunk_count INT;
    v_entity_count INT;
    v_session_count INT;
BEGIN
    SELECT COUNT(*) INTO v_chunk_count FROM vault.document_chunks;
    SELECT COUNT(*) INTO v_entity_count FROM vault.extracted_entities;
    SELECT COUNT(*) INTO v_session_count FROM vault.drafting_sessions;
    
    RAISE NOTICE '=== Migration 044 Complete ===';
    RAISE NOTICE 'document_chunks: % rows (with content_type, structured_content columns)', v_chunk_count;
    RAISE NOTICE 'extracted_entities: % rows', v_entity_count;
    RAISE NOTICE 'drafting_sessions: % rows', v_session_count;
    RAISE NOTICE 'New functions: hybrid_search, table_priority_search';
END $$;
