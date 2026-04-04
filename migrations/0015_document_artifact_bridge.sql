-- Migration: 0015_document_artifact_bridge
-- Purpose: Add optional artifact_id cross-reference to documents table.
-- This creates a durable structural bridge between the two document identity models:
--   - concept2cure_artifacts (canonical for regulatory content)
--   - documents (compliance-scoped records)
-- The column is nullable because not all documents originate from artifacts.

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS artifact_id TEXT;

-- Index for lookups by artifact_id
CREATE INDEX IF NOT EXISTS idx_documents_artifact_id
  ON documents (artifact_id)
  WHERE artifact_id IS NOT NULL;

-- Also add a revoked_tokens table for durable session revocation
CREATE TABLE IF NOT EXISTS revoked_tokens (
  token_hash TEXT PRIMARY KEY,
  revoked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  reason TEXT DEFAULT 'logout'
);

-- TTL cleanup index
CREATE INDEX IF NOT EXISTS idx_revoked_tokens_expires_at
  ON revoked_tokens (expires_at);

-- Comment on purpose
COMMENT ON TABLE revoked_tokens IS 'Durable token revocation for auth session invalidation. Survives server restarts. Redis is primary; this is the persistence fallback.';
COMMENT ON COLUMN documents.artifact_id IS 'Optional cross-reference to concept2cure_artifacts.artifact_id. Null for compliance-only documents.';
