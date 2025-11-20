-- Unified Documents Table
-- Central storage for all ingested documents across all modules

CREATE TABLE IF NOT EXISTS unified_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_id UUID NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  file_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  module VARCHAR(50) NOT NULL DEFAULT 'general',
  context VARCHAR(100) DEFAULT 'unknown',
  text_content TEXT,
  processed_text JSONB,
  ai_analysis JSONB,
  module_specific_data JSONB,
  content_hash VARCHAR(64) NOT NULL,
  processing_time INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_unified_documents_module ON unified_documents(module);
CREATE INDEX IF NOT EXISTS idx_unified_documents_created_at ON unified_documents(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_unified_documents_content_hash ON unified_documents(content_hash);
CREATE INDEX IF NOT EXISTS idx_unified_documents_processing_id ON unified_documents(processing_id);

-- Full text search index
CREATE INDEX IF NOT EXISTS idx_unified_documents_text_search ON unified_documents USING gin(to_tsvector('english', text_content));

-- Module context composite index
CREATE INDEX IF NOT EXISTS idx_unified_documents_module_context ON unified_documents(module, context);

-- AI Analysis GIN index for JSON queries
CREATE INDEX IF NOT EXISTS idx_unified_documents_ai_analysis ON unified_documents USING gin(ai_analysis);

-- Comments
COMMENT ON TABLE unified_documents IS 'Central storage for all document ingestion across all platform modules';
COMMENT ON COLUMN unified_documents.module IS 'Source module: lumen-ai, coauthor, cer-v2, ind-wizard, vault, etc.';
COMMENT ON COLUMN unified_documents.context IS 'Processing context within the module';
COMMENT ON COLUMN unified_documents.processed_text IS 'Output from TextProcessor with entities and statistics';
COMMENT ON COLUMN unified_documents.ai_analysis IS 'AI-powered document analysis and classification';
COMMENT ON COLUMN unified_documents.module_specific_data IS 'Module-specific processing results';