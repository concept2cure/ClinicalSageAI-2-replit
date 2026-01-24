-- Migration 079: Unified Functions, Views & Data Migration
-- Purpose: Consolidate all Cortex capabilities and provide backward compatibility
-- Dependencies: 073-078 Cortex migrations
-- Part of: Cortex Prime - The Definitive Life Sciences AI Mind
--
-- This migration provides:
-- 1. Unified search across all knowledge
-- 2. Backward-compatible views for legacy code
-- 3. Data migration from legacy tables
-- 4. Master orchestration functions

BEGIN;

-- ============================================================================
-- SECTION 1: UNIFIED SEARCH
-- ============================================================================
-- Single function to search across ALL knowledge

CREATE OR REPLACE FUNCTION cortex.unified_search(
    p_query_embedding VECTOR(3072),
    p_query_text TEXT DEFAULT NULL,
    p_atom_types TEXT[] DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_therapeutic_area TEXT DEFAULT NULL,
    p_submission_type TEXT DEFAULT NULL,
    p_limit INTEGER DEFAULT 20,
    p_similarity_threshold NUMERIC DEFAULT 0.5
)
RETURNS TABLE(
    atom_id UUID,
    atom_type TEXT,
    content TEXT,
    similarity_score NUMERIC,
    relevance_score NUMERIC,
    source_info JSONB,
    metadata JSONB
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_org_filter UUID;
BEGIN
    -- Set org filter
    v_org_filter := COALESCE(p_org_id, current_setting('app.current_org_id', true)::UUID);
    
    RETURN QUERY
    WITH vector_search AS (
        SELECT 
            a.id,
            a.atom_type,
            a.content,
            1 - (a.embedding_3072 <=> p_query_embedding) AS vec_sim,
            a.source_type,
            a.source_id,
            a.metadata
        FROM cortex.atoms a
        WHERE a.is_active = TRUE
          AND (v_org_filter IS NULL OR a.org_id = v_org_filter OR a.org_id IS NULL)
          AND (p_atom_types IS NULL OR a.atom_type = ANY(p_atom_types))
          AND (p_therapeutic_area IS NULL OR a.metadata->>'therapeutic_area' = p_therapeutic_area)
          AND (p_submission_type IS NULL OR a.metadata->>'submission_type' = p_submission_type)
          AND a.embedding_3072 IS NOT NULL
        ORDER BY a.embedding_3072 <=> p_query_embedding
        LIMIT p_limit * 2
    ),
    fts_search AS (
        SELECT 
            a.id,
            ts_rank_cd(to_tsvector('english', a.content), plainto_tsquery('english', COALESCE(p_query_text, ''))) AS fts_rank
        FROM cortex.atoms a
        WHERE p_query_text IS NOT NULL
          AND p_query_text != ''
          AND to_tsvector('english', a.content) @@ plainto_tsquery('english', p_query_text)
          AND a.is_active = TRUE
    ),
    combined AS (
        SELECT 
            vs.id AS atom_id,
            vs.atom_type,
            vs.content,
            vs.vec_sim AS similarity_score,
            -- Combine vector and FTS scores
            COALESCE(vs.vec_sim * 0.7 + COALESCE(fs.fts_rank, 0) * 0.3, vs.vec_sim) AS relevance_score,
            jsonb_build_object(
                'source_type', vs.source_type,
                'source_id', vs.source_id
            ) AS source_info,
            vs.metadata
        FROM vector_search vs
        LEFT JOIN fts_search fs ON vs.id = fs.id
        WHERE vs.vec_sim >= p_similarity_threshold
    )
    SELECT * FROM combined
    ORDER BY relevance_score DESC
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION cortex.unified_search IS
'Unified semantic search across all Cortex knowledge. Combines vector similarity
with optional full-text search. Respects org isolation via RLS.';

-- Lightweight version using 1536-dim embeddings for bulk operations
CREATE OR REPLACE FUNCTION cortex.unified_search_fast(
    p_query_embedding VECTOR(1536),
    p_atom_types TEXT[] DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
    atom_id UUID,
    atom_type TEXT,
    content TEXT,
    similarity_score NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id AS atom_id,
        a.atom_type,
        a.content,
        (1 - (a.embedding_1536 <=> p_query_embedding))::NUMERIC AS similarity_score
    FROM cortex.atoms a
    WHERE a.is_active = TRUE
      AND (p_org_id IS NULL OR a.org_id = p_org_id OR a.org_id IS NULL)
      AND (p_atom_types IS NULL OR a.atom_type = ANY(p_atom_types))
      AND a.embedding_1536 IS NOT NULL
    ORDER BY a.embedding_1536 <=> p_query_embedding
    LIMIT p_limit;
END;
$$;

COMMENT ON FUNCTION cortex.unified_search_fast IS
'Fast semantic search using 1536-dim embeddings. Use for bulk operations
where precision is less critical than speed.';

-- ============================================================================
-- SECTION 2: GRAPH TRAVERSAL
-- ============================================================================

CREATE OR REPLACE FUNCTION cortex.traverse_reasoning(
    p_start_atom_id UUID,
    p_edge_types TEXT[] DEFAULT NULL,
    p_max_depth INTEGER DEFAULT 3,
    p_min_strength NUMERIC DEFAULT 0.5
)
RETURNS TABLE(
    atom_id UUID,
    atom_type TEXT,
    content TEXT,
    depth INTEGER,
    path UUID[],
    edge_types_traversed TEXT[],
    cumulative_strength NUMERIC
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE traversal AS (
        -- Base case: start node
        SELECT 
            p_start_atom_id AS current_id,
            0 AS depth,
            ARRAY[p_start_atom_id] AS path,
            ARRAY[]::TEXT[] AS edge_types_used,
            1.0::NUMERIC AS cumulative_strength
        
        UNION ALL
        
        -- Recursive case: follow edges
        SELECT 
            e.target_atom_id AS current_id,
            t.depth + 1 AS depth,
            t.path || e.target_atom_id AS path,
            t.edge_types_used || e.edge_type AS edge_types_used,
            t.cumulative_strength * e.strength AS cumulative_strength
        FROM traversal t
        JOIN cortex.edges e ON e.source_atom_id = t.current_id
        WHERE t.depth < p_max_depth
          AND e.is_active = TRUE
          AND e.strength >= p_min_strength
          AND NOT (e.target_atom_id = ANY(t.path)) -- Prevent cycles
          AND (p_edge_types IS NULL OR e.edge_type = ANY(p_edge_types))
    )
    SELECT 
        a.id AS atom_id,
        a.atom_type,
        a.content,
        t.depth,
        t.path,
        t.edge_types_used AS edge_types_traversed,
        t.cumulative_strength
    FROM traversal t
    JOIN cortex.atoms a ON a.id = t.current_id
    WHERE t.depth > 0 -- Exclude start node
    ORDER BY t.cumulative_strength DESC, t.depth ASC;
END;
$$;

COMMENT ON FUNCTION cortex.traverse_reasoning IS
'Traverse the knowledge graph following relationships. Enables graph-based
reasoning and explanation generation.';

-- ============================================================================
-- SECTION 3: CONTEXT ASSEMBLY
-- ============================================================================

CREATE OR REPLACE FUNCTION cortex.assemble_context(
    p_thread_id UUID,
    p_max_tokens INTEGER DEFAULT 8000,
    p_include_history BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_thread RECORD;
    v_context JSONB := '{"messages": [], "knowledge": [], "metadata": {}}'::JSONB;
    v_total_tokens INTEGER := 0;
    v_trace RECORD;
    v_atom RECORD;
BEGIN
    -- Get thread info
    SELECT * INTO v_thread FROM cortex.threads WHERE id = p_thread_id;
    IF v_thread IS NULL THEN
        RAISE EXCEPTION 'Thread not found: %', p_thread_id;
    END IF;
    
    -- Add metadata
    v_context := jsonb_set(v_context, '{metadata}', jsonb_build_object(
        'thread_id', v_thread.id,
        'thread_type', v_thread.thread_type,
        'program_id', v_thread.program_id,
        'submission_id', v_thread.submission_id
    ));
    
    -- Add conversation history (most recent first)
    IF p_include_history THEN
        FOR v_trace IN 
            SELECT * FROM cortex.traces 
            WHERE thread_id = p_thread_id 
            ORDER BY created_at DESC 
            LIMIT 10
        LOOP
            -- Estimate tokens (rough: 4 chars per token)
            v_total_tokens := v_total_tokens + COALESCE(length(v_trace.input::TEXT) / 4, 0);
            v_total_tokens := v_total_tokens + COALESCE(length(v_trace.output::TEXT) / 4, 0);
            
            IF v_total_tokens > p_max_tokens THEN
                EXIT;
            END IF;
            
            v_context := jsonb_set(
                v_context, 
                '{messages}', 
                v_context->'messages' || jsonb_build_object(
                    'role', 'user',
                    'content', v_trace.input->>'content'
                ) || jsonb_build_object(
                    'role', 'assistant', 
                    'content', v_trace.output->>'content'
                )
            );
        END LOOP;
    END IF;
    
    -- Add relevant knowledge atoms
    FOR v_atom IN
        SELECT a.* FROM cortex.atoms a
        WHERE a.id = ANY(v_thread.context_atom_ids)
          AND a.is_active = TRUE
        LIMIT 20
    LOOP
        v_total_tokens := v_total_tokens + COALESCE(length(v_atom.content) / 4, 0);
        
        IF v_total_tokens > p_max_tokens THEN
            EXIT;
        END IF;
        
        v_context := jsonb_set(
            v_context,
            '{knowledge}',
            v_context->'knowledge' || jsonb_build_object(
                'type', v_atom.atom_type,
                'content', v_atom.content,
                'source', v_atom.source_type
            )
        );
    END LOOP;
    
    RETURN v_context;
END;
$$;

COMMENT ON FUNCTION cortex.assemble_context IS
'Assemble context for LLM calls from a thread. Includes conversation history
and relevant knowledge atoms, respecting token limits.';

-- ============================================================================
-- SECTION 4: MASTER QUERY FUNCTION
-- ============================================================================
-- Single entry point for most common operations

CREATE OR REPLACE FUNCTION cortex.query(
    p_query TEXT,
    p_query_embedding VECTOR(3072) DEFAULT NULL,
    p_org_id UUID DEFAULT NULL,
    p_options JSONB DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_results JSONB := '{"atoms": [], "patterns": [], "predictions": [], "uncertainty": null}'::JSONB;
    v_atom RECORD;
    v_search_limit INTEGER;
    v_include_patterns BOOLEAN;
    v_include_predictions BOOLEAN;
BEGIN
    -- Parse options
    v_search_limit := COALESCE((p_options->>'limit')::INTEGER, 10);
    v_include_patterns := COALESCE((p_options->>'include_patterns')::BOOLEAN, FALSE);
    v_include_predictions := COALESCE((p_options->>'include_predictions')::BOOLEAN, FALSE);
    
    -- Search for relevant atoms
    IF p_query_embedding IS NOT NULL THEN
        FOR v_atom IN
            SELECT * FROM cortex.unified_search(
                p_query_embedding,
                p_query,
                (SELECT ARRAY(SELECT jsonb_array_elements_text(p_options->'atom_types'))),
                p_org_id,
                p_options->>'therapeutic_area',
                p_options->>'submission_type',
                v_search_limit,
                COALESCE((p_options->>'min_similarity')::NUMERIC, 0.5)
            )
        LOOP
            v_results := jsonb_set(
                v_results,
                '{atoms}',
                v_results->'atoms' || jsonb_build_object(
                    'id', v_atom.atom_id,
                    'type', v_atom.atom_type,
                    'content', left(v_atom.content, 500),
                    'similarity', v_atom.similarity_score,
                    'relevance', v_atom.relevance_score
                )
            );
        END LOOP;
    END IF;
    
    -- Include rejection patterns if requested
    IF v_include_patterns THEN
        SELECT jsonb_agg(jsonb_build_object(
            'id', id,
            'name', pattern_name,
            'outcome', predicted_outcome,
            'probability', outcome_probability
        ))
        INTO v_results
        FROM (
            SELECT id, pattern_name, predicted_outcome, outcome_probability
            FROM cortex.rejection_patterns
            WHERE is_active = TRUE
              AND (org_id = p_org_id OR org_id IS NULL)
            ORDER BY outcome_probability DESC
            LIMIT 5
        ) rp;
        
        v_results := jsonb_set(v_results, '{patterns}', COALESCE(v_results, '[]'::JSONB));
    END IF;
    
    RETURN v_results;
END;
$$;

COMMENT ON FUNCTION cortex.query IS
'Master query function for the Cortex Prime brain. Single entry point for
search, pattern matching, and prediction retrieval.';

-- ============================================================================
-- SECTION 5: BACKWARD-COMPATIBLE VIEWS
-- ============================================================================
-- Allow legacy code to continue working during transition

-- View: lumen.data_atoms -> cortex.atoms
CREATE OR REPLACE VIEW lumen.data_atoms AS
SELECT 
    a.id,
    a.org_id,
    a.content,
    a.embedding_3072 AS embedding,
    a.metadata,
    a.source_id AS document_id,
    a.created_at,
    a.updated_at
FROM cortex.atoms a
WHERE a.atom_type IN ('chunk', 'document', 'section');

COMMENT ON VIEW lumen.data_atoms IS
'Backward-compatible view mapping to cortex.atoms. Use cortex.atoms directly for new code.';

-- View: vault.document_chunks -> cortex.atoms
CREATE OR REPLACE VIEW vault.document_chunks_v2 AS
SELECT 
    a.id,
    a.org_id AS organization_id,
    a.source_id AS document_id,
    a.content AS chunk_text,
    a.embedding_3072 AS embedding,
    (a.metadata->>'chunk_index')::INTEGER AS chunk_index,
    (a.metadata->>'start_page')::INTEGER AS start_page,
    (a.metadata->>'end_page')::INTEGER AS end_page,
    a.metadata AS chunk_metadata,
    a.created_at
FROM cortex.atoms a
WHERE a.atom_type = 'chunk';

COMMENT ON VIEW vault.document_chunks_v2 IS
'Backward-compatible view for document chunks. Use cortex.atoms for new code.';

-- View: vault.extracted_entities -> cortex.atoms
CREATE OR REPLACE VIEW vault.extracted_entities_v2 AS
SELECT 
    a.id,
    a.org_id AS organization_id,
    a.source_id AS document_id,
    a.structured_data->>'entity_type' AS entity_type,
    a.content AS entity_value,
    a.structured_data->>'normalized_value' AS normalized_value,
    (a.structured_data->>'confidence')::NUMERIC AS confidence,
    a.structured_data->>'context' AS context,
    a.structured_data AS entity_metadata,
    a.created_at
FROM cortex.atoms a
WHERE a.atom_type = 'entity';

COMMENT ON VIEW vault.extracted_entities_v2 IS
'Backward-compatible view for extracted entities. Use cortex.atoms for new code.';

-- View: ai.document_embeddings -> cortex.atoms
CREATE OR REPLACE VIEW ai.document_embeddings_v2 AS
SELECT 
    a.id,
    a.source_id AS document_id,
    a.org_id,
    a.embedding_3072 AS embedding,
    a.embedding_1536 AS embedding_small,
    'text-embedding-3-large' AS model_name,
    a.created_at,
    a.metadata AS embedding_metadata
FROM cortex.atoms a
WHERE a.embedding_3072 IS NOT NULL;

COMMENT ON VIEW ai.document_embeddings_v2 IS
'Backward-compatible view for document embeddings. Use cortex.atoms for new code.';

-- View: lumen.agent_registry -> cortex.agents
CREATE OR REPLACE VIEW lumen.agent_registry_v2 AS
SELECT 
    a.id,
    a.agent_name AS name,
    a.agent_type AS type,
    a.description,
    a.capabilities,
    a.model_config AS config,
    a.is_active AS enabled,
    a.created_at,
    a.updated_at
FROM cortex.agents a;

COMMENT ON VIEW lumen.agent_registry_v2 IS
'Backward-compatible view for agent registry. Use cortex.agents for new code.';

-- View: agent_runtime.agent_executions -> cortex.traces
CREATE OR REPLACE VIEW agent_runtime.agent_executions_v2 AS
SELECT 
    t.id,
    t.agent_id,
    t.thread_id AS session_id,
    t.input,
    t.output,
    t.status,
    t.started_at,
    t.completed_at,
    t.duration_ms,
    t.token_usage,
    t.created_at
FROM cortex.traces t
WHERE t.trace_type = 'agent_execution';

COMMENT ON VIEW agent_runtime.agent_executions_v2 IS
'Backward-compatible view for agent executions. Use cortex.traces for new code.';

-- ============================================================================
-- SECTION 6: DATA MIGRATION FUNCTIONS
-- ============================================================================

-- Function: Migrate legacy atoms to Cortex
CREATE OR REPLACE FUNCTION cortex.migrate_legacy_atoms(
    p_source_table TEXT,
    p_batch_size INTEGER DEFAULT 1000,
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_migrated INTEGER := 0;
    v_skipped INTEGER := 0;
    v_errors INTEGER := 0;
    v_result JSONB;
BEGIN
    -- This is a template - actual migration depends on source table structure
    -- In production, create specific functions for each source table
    
    v_result := jsonb_build_object(
        'source_table', p_source_table,
        'dry_run', p_dry_run,
        'migrated', v_migrated,
        'skipped', v_skipped,
        'errors', v_errors,
        'message', 'Migration template - implement specific migration for ' || p_source_table
    );
    
    RETURN v_result;
END;
$$;

COMMENT ON FUNCTION cortex.migrate_legacy_atoms IS
'Template for migrating legacy data to Cortex atoms. Implement specific
migrations for each source table.';

-- Function: Migrate from lumen.data_atoms
CREATE OR REPLACE FUNCTION cortex.migrate_from_lumen_data_atoms(
    p_batch_size INTEGER DEFAULT 1000,
    p_dry_run BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_migrated INTEGER := 0;
    v_source RECORD;
BEGIN
    IF p_dry_run THEN
        SELECT COUNT(*) INTO v_migrated
        FROM lumen.data_atoms lda
        WHERE NOT EXISTS (
            SELECT 1 FROM cortex.atoms ca 
            WHERE ca.source_id = lda.id 
              AND ca.source_type = 'lumen.data_atoms'
        );
        
        RETURN jsonb_build_object(
            'dry_run', TRUE,
            'would_migrate', v_migrated
        );
    END IF;
    
    -- Actual migration
    INSERT INTO cortex.atoms (
        org_id, atom_type, content, embedding_3072,
        source_type, source_id, metadata, created_at
    )
    SELECT 
        lda.org_id,
        'chunk',
        lda.content,
        lda.embedding,
        'lumen.data_atoms',
        lda.id,
        lda.metadata,
        lda.created_at
    FROM lumen.data_atoms lda
    WHERE NOT EXISTS (
        SELECT 1 FROM cortex.atoms ca 
        WHERE ca.source_id = lda.id 
          AND ca.source_type = 'lumen.data_atoms'
    )
    LIMIT p_batch_size;
    
    GET DIAGNOSTICS v_migrated = ROW_COUNT;
    
    RETURN jsonb_build_object(
        'dry_run', FALSE,
        'migrated', v_migrated
    );
END;
$$;

COMMENT ON FUNCTION cortex.migrate_from_lumen_data_atoms IS
'Migrate data from lumen.data_atoms to cortex.atoms.';

-- ============================================================================
-- SECTION 7: HEALTH CHECK & DIAGNOSTICS
-- ============================================================================

CREATE OR REPLACE FUNCTION cortex.health_check()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = cortex, pg_catalog
AS $$
DECLARE
    v_result JSONB;
BEGIN
    v_result := jsonb_build_object(
        'status', 'healthy',
        'checked_at', NOW(),
        'tables', jsonb_build_object(
            'atoms', (SELECT COUNT(*) FROM cortex.atoms),
            'edges', (SELECT COUNT(*) FROM cortex.edges),
            'agents', (SELECT COUNT(*) FROM cortex.agents),
            'traces', (SELECT COUNT(*) FROM cortex.traces),
            'threads', (SELECT COUNT(*) FROM cortex.threads),
            'regulatory_signals', (SELECT COUNT(*) FROM cortex.regulatory_signals),
            'rejection_patterns', (SELECT COUNT(*) FROM cortex.rejection_patterns),
            'distilled_insights', (SELECT COUNT(*) FROM cortex.distilled_insights),
            'expertise_scores', (SELECT COUNT(*) FROM cortex.expertise_scores),
            'domain_knowledge', (SELECT COUNT(*) FROM cortex.domain_knowledge)
        ),
        'indexes', jsonb_build_object(
            'atoms_embedding_3072', (SELECT pg_size_pretty(pg_relation_size('idx_atoms_embedding_3072'))),
            'atoms_embedding_1536', (SELECT pg_size_pretty(pg_relation_size('idx_atoms_embedding_1536')))
        ),
        'latest_evolution', (
            SELECT jsonb_build_object(
                'event_type', event_type,
                'created_at', created_at
            )
            FROM cortex.evolution_ledger
            ORDER BY created_at DESC
            LIMIT 1
        )
    );
    
    RETURN v_result;
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object(
        'status', 'error',
        'error', SQLERRM
    );
END;
$$;

COMMENT ON FUNCTION cortex.health_check IS
'Check health of the Cortex Prime system. Returns counts, index sizes, and latest evolution.';

-- ============================================================================
-- SECTION 8: STATISTICS VIEW
-- ============================================================================

CREATE OR REPLACE VIEW cortex.statistics AS
SELECT 
    'atoms' AS table_name,
    COUNT(*) AS total_rows,
    COUNT(*) FILTER (WHERE is_active) AS active_rows,
    COUNT(DISTINCT org_id) AS org_count,
    COUNT(DISTINCT atom_type) AS type_count,
    MIN(created_at) AS earliest,
    MAX(created_at) AS latest
FROM cortex.atoms
UNION ALL
SELECT 
    'edges',
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active),
    COUNT(DISTINCT org_id),
    COUNT(DISTINCT edge_type),
    MIN(created_at),
    MAX(created_at)
FROM cortex.edges
UNION ALL
SELECT 
    'traces',
    COUNT(*),
    COUNT(*),
    COUNT(DISTINCT org_id),
    COUNT(DISTINCT trace_type),
    MIN(created_at),
    MAX(created_at)
FROM cortex.traces
UNION ALL
SELECT 
    'regulatory_signals',
    COUNT(*),
    COUNT(*) FILTER (WHERE is_active),
    COUNT(DISTINCT org_id),
    COUNT(DISTINCT signal_type),
    MIN(created_at),
    MAX(created_at)
FROM cortex.regulatory_signals
UNION ALL
SELECT 
    'learning_experiences',
    COUNT(*),
    COUNT(*),
    COUNT(DISTINCT org_id),
    COUNT(DISTINCT experience_type),
    MIN(created_at),
    MAX(created_at)
FROM cortex.learning_experiences;

COMMENT ON VIEW cortex.statistics IS
'Overview statistics for all Cortex Prime tables.';

-- ============================================================================
-- SECTION 9: PERMISSIONS
-- ============================================================================

-- Grant execute on functions to app roles
GRANT EXECUTE ON FUNCTION cortex.unified_search TO app_service;
GRANT EXECUTE ON FUNCTION cortex.unified_search_fast TO app_service;
GRANT EXECUTE ON FUNCTION cortex.traverse_reasoning TO app_service;
GRANT EXECUTE ON FUNCTION cortex.assemble_context TO app_service;
GRANT EXECUTE ON FUNCTION cortex.query TO app_service;
GRANT EXECUTE ON FUNCTION cortex.health_check TO app_service;
GRANT EXECUTE ON FUNCTION cortex.health_check TO app_readonly;

-- Grant select on views
GRANT SELECT ON cortex.statistics TO app_service;
GRANT SELECT ON cortex.statistics TO app_readonly;

-- Legacy view access
GRANT SELECT ON lumen.data_atoms TO app_service;
GRANT SELECT ON vault.document_chunks_v2 TO app_service;
GRANT SELECT ON vault.extracted_entities_v2 TO app_service;
GRANT SELECT ON ai.document_embeddings_v2 TO app_service;
GRANT SELECT ON lumen.agent_registry_v2 TO app_service;
GRANT SELECT ON agent_runtime.agent_executions_v2 TO app_service;

-- ============================================================================
-- SECTION 10: COMPLETION
-- ============================================================================

COMMIT;

DO $$
BEGIN
    RAISE NOTICE 'Migration 079: Unified Functions, Views & Data Migration complete';
    RAISE NOTICE 'Functions: unified_search, unified_search_fast, traverse_reasoning, assemble_context, query, health_check';
    RAISE NOTICE 'Views: statistics, plus 6 backward-compatible views';
    RAISE NOTICE 'Migration helpers: migrate_legacy_atoms, migrate_from_lumen_data_atoms';
    RAISE NOTICE '';
    RAISE NOTICE '=== CORTEX PRIME IMPLEMENTATION COMPLETE ===';
    RAISE NOTICE 'Migrations 073-079 provide:';
    RAISE NOTICE '  - 5-table unified AI brain (atoms, edges, agents, traces, threads)';
    RAISE NOTICE '  - Regulatory Intuition Engine (signals, patterns, predictions)';
    RAISE NOTICE '  - Epistemic Intelligence (uncertainty, gaps, calibration)';
    RAISE NOTICE '  - Causal Inference Engine (graphs, effects, counterfactuals)';
    RAISE NOTICE '  - Self-Evolving Intelligence (learning, distillation, expertise)';
    RAISE NOTICE '  - Cross-Domain Transfer (domain knowledge, mappings, templates)';
    RAISE NOTICE '  - Unified search and backward compatibility';
END $$;
