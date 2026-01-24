-- Enable pg_trgm + GIN index for full-text search on summary
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_documents_summary_trgm ON documents USING gin (summary gin_trgm_ops);