-- Deep Research Intelligence Layer - Database Optimization
-- Created: 2025-07-09
-- Purpose: Optimize CSR database queries for Deep Research performance

-- Index for unified_documents CSR module queries
CREATE INDEX IF NOT EXISTS idx_unified_documents_csr_module 
ON unified_documents(tenant_id, module, created_at DESC) 
WHERE module = 'csr';

-- Index for full-text search on processed_text
CREATE INDEX IF NOT EXISTS idx_unified_documents_processed_text_gin 
ON unified_documents USING gin(to_tsvector('english', processed_text));

-- Index for AI analysis JSON queries
CREATE INDEX IF NOT EXISTS idx_unified_documents_ai_analysis_gin 
ON unified_documents USING gin(ai_analysis);

-- Index for module-specific data queries
CREATE INDEX IF NOT EXISTS idx_unified_documents_module_data 
ON unified_documents(tenant_id, module, id) 
WHERE module_specific_data IS NOT NULL;

-- Performance monitoring view
CREATE OR REPLACE VIEW deep_research_performance AS
SELECT 
    COUNT(*) as total_csr_documents,
    COUNT(CASE WHEN module = 'csr' THEN 1 END) as csr_module_count,
    COUNT(CASE WHEN processed_text IS NOT NULL THEN 1 END) as processed_documents,
    COUNT(CASE WHEN ai_analysis IS NOT NULL THEN 1 END) as ai_analyzed_documents,
    AVG(LENGTH(processed_text::text)) as avg_text_length,
    tenant_id
FROM unified_documents 
WHERE tenant_id IS NOT NULL
GROUP BY tenant_id;

-- Query performance statistics
COMMENT ON INDEX idx_unified_documents_csr_module IS 'Optimizes CSR module queries with tenant isolation';
COMMENT ON INDEX idx_unified_documents_processed_text_gin IS 'Full-text search optimization for Deep Research';
COMMENT ON INDEX idx_unified_documents_title_search IS 'Title-based search optimization';
COMMENT ON VIEW deep_research_performance IS 'Performance monitoring for Deep Research Intelligence Layer';