-- Enable pgvector extension and add embedding column to csr_deep_vault

-- 1. Enable the extension
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Add the embedding column (1536 dimensions for OpenAI text-embedding-3-small)
ALTER TABLE csr_deep_vault
ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- 3. Optional IVFFlat index for cosine similarity (enable after enough rows exist)
-- CREATE INDEX IF NOT EXISTS csr_deep_vault_embedding_ivfflat
--   ON csr_deep_vault USING ivfflat (embedding vector_cosine_ops)
--   WITH (lists = 100);
