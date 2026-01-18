CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE IF NOT EXISTS smart_claims_matrices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  device_id TEXT NOT NULL,
  matrix_data JSONB NOT NULL,
  ai_metadata JSONB,
  embeddings VECTOR(3072),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS claim_embeddings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  matrix_id UUID REFERENCES smart_claims_matrices(id),
  claim_id TEXT NOT NULL,
  claim_text TEXT NOT NULL,
  embedding VECTOR(3072) NOT NULL,
  device_type TEXT NOT NULL,
  regulatory_pathway TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS regulatory_precedents (
  id TEXT PRIMARY KEY,
  device_name TEXT NOT NULL,
  predicate_names TEXT[],
  decision_summary TEXT,
  decision TEXT NOT NULL,
  embedding VECTOR(3072),
  metadata JSONB,
  ingested_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_smart_matrices_device_id ON smart_claims_matrices(device_id);
CREATE INDEX IF NOT EXISTS idx_smart_matrices_generated_at ON smart_claims_matrices(generated_at DESC);
CREATE INDEX IF NOT EXISTS idx_claim_embeddings_embedding ON claim_embeddings USING hnsw (embedding vector_ip_ops);
CREATE INDEX IF NOT EXISTS idx_regulatory_precedents_embedding ON regulatory_precedents USING hnsw (embedding vector_ip_ops);

ALTER TABLE smart_claims_matrices ENABLE ROW LEVEL SECURITY;
ALTER TABLE claim_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE regulatory_precedents ENABLE ROW LEVEL SECURITY;

CREATE POLICY IF NOT EXISTS "Users can view their device matrices"
  ON smart_claims_matrices FOR SELECT
  USING (true);

CREATE OR REPLACE FUNCTION ingest_regulatory_precedent(
  k_number TEXT,
  device_name TEXT,
  decision_summary TEXT,
  decision TEXT,
  metadata JSONB
) RETURNS VOID AS $$
BEGIN
  INSERT INTO regulatory_precedents (id, device_name, decision_summary, decision, metadata)
  VALUES (k_number, device_name, decision_summary, decision, metadata)
  ON CONFLICT (id) DO UPDATE SET
    decision_summary = EXCLUDED.decision_summary,
    decision = EXCLUDED.decision,
    metadata = EXCLUDED.metadata,
    ingested_at = NOW();
END;
$$ LANGUAGE plpgsql;
