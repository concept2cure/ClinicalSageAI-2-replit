-- =============================================================================
-- Migration 062: Fix GLSOS Schema Inconsistencies
-- =============================================================================
-- Purpose: Correct schema mismatches identified during audit
-- - Add missing 'summary' column to ai.regulatory_knowledge
-- - Add 'embedding' column (or view) for direct vector search
-- - Fix compliance_search function to use correct column names
-- - Ensure Prisma schema alignment
-- =============================================================================
-- NO MOCKS. NO STUBS. PRODUCTION-GRADE ONLY.
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. ADD MISSING COLUMNS TO ai.regulatory_knowledge
-- =============================================================================

-- Add summary column (GLSOS spec requirement)
ALTER TABLE ai.regulatory_knowledge
    ADD COLUMN IF NOT EXISTS summary TEXT;

COMMENT ON COLUMN ai.regulatory_knowledge.summary IS 
'Executive summary or abstract of the regulatory document (max ~500 chars for display)';

-- Add embedding column directly on regulatory_knowledge for fast single-table queries
-- This is in addition to document_embeddings which stores chunked embeddings
ALTER TABLE ai.regulatory_knowledge
    ADD COLUMN IF NOT EXISTS embedding vector(1536);

COMMENT ON COLUMN ai.regulatory_knowledge.embedding IS 
'Document-level embedding for semantic search (embedded from title + summary)';

-- Create HNSW index on the new embedding column
CREATE INDEX IF NOT EXISTS idx_regulatory_knowledge_embedding
    ON ai.regulatory_knowledge 
    USING hnsw (embedding vector_cosine_ops)
    WITH (m = 16, ef_construction = 64);

-- =============================================================================
-- 2. FIX compliance_search FUNCTION
-- =============================================================================
-- Replace the broken function with one that uses correct column names

DROP FUNCTION IF EXISTS ai.compliance_search(TEXT, vector, TEXT, TEXT[], INT);

CREATE OR REPLACE FUNCTION ai.compliance_search(
    p_query_text TEXT,
    p_query_embedding vector(1536) DEFAULT NULL,
    p_agency TEXT DEFAULT NULL,
    p_domain TEXT[] DEFAULT NULL,
    p_limit INT DEFAULT 10
)
RETURNS TABLE (
    knowledge_id UUID,
    document_code TEXT,
    document_title TEXT,
    issuing_authority TEXT,
    document_type TEXT,
    content_summary TEXT,
    similarity_score FLOAT,
    applicable_modules TEXT[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    -- If embedding provided, do vector similarity search
    IF p_query_embedding IS NOT NULL THEN
        RETURN QUERY
        SELECT 
            rk.id AS knowledge_id,
            rk.document_code,
            rk.document_title,
            rk.issuing_authority,
            rk.document_type,
            COALESCE(LEFT(rk.summary, 500), LEFT(rk.full_text, 500)) AS content_summary,
            CASE 
                WHEN rk.embedding IS NOT NULL THEN 1 - (rk.embedding <=> p_query_embedding)
                ELSE 0
            END AS similarity_score,
            rk.applicable_modules
        FROM ai.regulatory_knowledge rk
        WHERE (p_agency IS NULL OR rk.issuing_authority = p_agency)
          AND (p_domain IS NULL OR rk.applicable_domains && p_domain)
          AND rk.embedding IS NOT NULL
        ORDER BY rk.embedding <=> p_query_embedding
        LIMIT p_limit;
    ELSE
        -- Fallback to keyword/trigram search
        RETURN QUERY
        SELECT 
            rk.id AS knowledge_id,
            rk.document_code,
            rk.document_title,
            rk.issuing_authority,
            rk.document_type,
            COALESCE(LEFT(rk.summary, 500), LEFT(rk.full_text, 500)) AS content_summary,
            similarity(rk.document_title, p_query_text)::FLOAT AS similarity_score,
            rk.applicable_modules
        FROM ai.regulatory_knowledge rk
        WHERE (p_agency IS NULL OR rk.issuing_authority = p_agency)
          AND (p_domain IS NULL OR rk.applicable_domains && p_domain)
          AND (
              rk.document_title ILIKE '%' || p_query_text || '%'
              OR rk.keywords && string_to_array(lower(p_query_text), ' ')
              OR rk.full_text ILIKE '%' || p_query_text || '%'
          )
        ORDER BY similarity(rk.document_title, p_query_text) DESC
        LIMIT p_limit;
    END IF;
END;
$$;

COMMENT ON FUNCTION ai.compliance_search IS 
'GLSOS Compliance Copilot: Searches regulatory knowledge base using vector similarity or keyword fallback. Fixed version using correct column names.';

-- =============================================================================
-- 3. CREATE CHUNKED SEARCH FUNCTION (Uses document_embeddings)
-- =============================================================================
-- For more granular search through document chunks

CREATE OR REPLACE FUNCTION ai.compliance_search_chunked(
    p_query_text TEXT,
    p_query_embedding vector(1536),
    p_agency TEXT DEFAULT NULL,
    p_limit INT DEFAULT 20
)
RETURNS TABLE (
    chunk_id UUID,
    document_code TEXT,
    document_title TEXT,
    issuing_authority TEXT,
    chunk_text TEXT,
    chunk_index INT,
    similarity_score FLOAT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        de.id AS chunk_id,
        rk.document_code,
        rk.document_title,
        rk.issuing_authority,
        de.chunk_text,
        de.chunk_index,
        1 - (de.embedding_1536 <=> p_query_embedding) AS similarity_score
    FROM ai.document_embeddings de
    JOIN ai.regulatory_knowledge rk 
        ON de.source_type = 'REGULATION' 
        AND de.source_id = rk.id
    WHERE de.embedding_1536 IS NOT NULL
      AND (p_agency IS NULL OR rk.issuing_authority = p_agency)
    ORDER BY de.embedding_1536 <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION ai.compliance_search_chunked IS 
'Search regulatory documents at chunk level for more granular results';

-- =============================================================================
-- 4. UPDATE SEEDED REGULATORY KNOWLEDGE WITH SUMMARIES
-- =============================================================================

UPDATE ai.regulatory_knowledge SET summary = 
    'Establishes guidelines for stability testing protocols of new drug substances and products.'
WHERE document_code = 'ICH_Q1A_R2';

UPDATE ai.regulatory_knowledge SET summary = 
    'Requirements for electronic records and electronic signatures in FDA-regulated industries.'
WHERE document_code = 'FDA_21CFR11';

UPDATE ai.regulatory_knowledge SET summary = 
    'Good Manufacturing Practice guidelines for medicinal products in the European Union.'
WHERE document_code = 'EU_ANNEX_1';

UPDATE ai.regulatory_knowledge SET summary = 
    'ICH guideline on pharmaceutical development methodology and best practices.'
WHERE document_code = 'ICH_Q8_R2';

UPDATE ai.regulatory_knowledge SET summary = 
    'Guidelines for clinical evaluation of medical device software including AI/ML systems.'
WHERE document_code = 'FDA_SAMD_2017';

UPDATE ai.regulatory_knowledge SET summary = 
    'FDA guidance on cybersecurity considerations for medical devices and quality systems.'
WHERE document_code = 'FDA_CYBERSECURITY_2023';

UPDATE ai.regulatory_knowledge SET summary = 
    'European Union regulation on artificial intelligence establishing risk-based requirements.'
WHERE document_code = 'EU_AI_ACT_2024';

UPDATE ai.regulatory_knowledge SET summary = 
    'FDA guidance on evaluating substantial equivalence in 510(k) submissions.'
WHERE document_code = 'FDA_510K_GUIDANCE';

UPDATE ai.regulatory_knowledge SET summary = 
    'FDA program for expedited development of breakthrough medical devices.'
WHERE document_code = 'FDA_BREAKTHROUGH_DEVICE';

UPDATE ai.regulatory_knowledge SET summary = 
    'ICH guideline on lifecycle management and post-approval changes for pharmaceutical products.'
WHERE document_code = 'ICH_Q12';

UPDATE ai.regulatory_knowledge SET summary = 
    'FDA guidance on regulatory pathways for combination drug-device products.'
WHERE document_code = 'FDA_COMBINATION_PRODUCT';

UPDATE ai.regulatory_knowledge SET summary = 
    'EU Medical Device Regulation establishing requirements for CE marking and market access.'
WHERE document_code = 'EU_MDR_2017_745';

UPDATE ai.regulatory_knowledge SET summary = 
    'EU In Vitro Diagnostic Regulation for diagnostic device requirements and classification.'
WHERE document_code = 'EU_IVDR_2017_746';

-- =============================================================================
-- 5. FIX PRISMA SCHEMA ALIGNMENT
-- =============================================================================
-- Ensure the Prisma model for RegulatoryKnowledge includes summary and embedding

-- Note: This is documented here for the Prisma schema update:
-- model RegulatoryKnowledge needs:
--   summary String?
--   embedding Unsupported("vector(1536)")?

-- =============================================================================
-- 6. ADD MISSING INDEXES FROM MIGRATION 061
-- =============================================================================
-- The pg_trgm extension is needed for similarity() function

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Ensure trigram index exists
CREATE INDEX IF NOT EXISTS idx_regulatory_knowledge_title_trgm
    ON ai.regulatory_knowledge 
    USING GIN (document_title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_regulatory_knowledge_fulltext_trgm
    ON ai.regulatory_knowledge 
    USING GIN (full_text gin_trgm_ops)
    WHERE full_text IS NOT NULL;

-- =============================================================================
-- 7. VERIFY FIX
-- =============================================================================

-- This should now work without errors
DO $$
DECLARE
    v_count INT;
BEGIN
    -- Test that the function compiles and runs
    SELECT COUNT(*) INTO v_count
    FROM ai.compliance_search('stability testing', NULL, NULL, NULL, 5);
    
    RAISE NOTICE 'compliance_search returned % results', v_count;
END;
$$;

COMMIT;

-- =============================================================================
-- VERIFICATION QUERIES
-- =============================================================================

/*
-- Test compliance_search (keyword mode)
SELECT * FROM ai.compliance_search('stability testing');

-- Test with agency filter
SELECT * FROM ai.compliance_search('medical device', NULL, 'FDA', NULL, 10);

-- Test with domain filter
SELECT * FROM ai.compliance_search('manufacturing', NULL, NULL, ARRAY['PHARMA'], 10);

-- Check that summaries were populated
SELECT document_code, LEFT(summary, 80) as summary_preview 
FROM ai.regulatory_knowledge 
WHERE summary IS NOT NULL;

-- Verify columns exist
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_schema = 'ai' AND table_name = 'regulatory_knowledge'
ORDER BY ordinal_position;
*/
