-- Phase 20: Deep Genome Vault

-- 1. MASTER DEEP VAULT (Hybrid JSONB)
CREATE TABLE IF NOT EXISTS csr_deep_vault (
    csr_id BIGSERIAL PRIMARY KEY,
    regulatory_agency VARCHAR(50) NOT NULL,
    submission_id VARCHAR(100) NOT NULL,
    study_id VARCHAR(100) NOT NULL,
    drug_name VARCHAR(500),

    -- THE DEEP GENOME PAYLOAD
    deep_data JSONB NOT NULL DEFAULT '{}',

    -- METADATA
    extraction_method VARCHAR(100) DEFAULT 'gpt-4-structured',
    extraction_confidence_score FLOAT,

    -- SOURCE TRACKING
    pdf_url TEXT,
    pdf_sha256_hash VARCHAR(64),

    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. GIN INDEXING
CREATE INDEX IF NOT EXISTS idx_csr_deep_data ON csr_deep_vault USING GIN (deep_data);

-- 3. NORMALIZED PERFORMANCE TABLES
CREATE TABLE IF NOT EXISTS csr_safety_signals (
    signal_id SERIAL PRIMARY KEY,
    csr_id BIGINT REFERENCES csr_deep_vault(csr_id) ON DELETE CASCADE,
    system_organ_class VARCHAR(200),
    preferred_term VARCHAR(200),
    grade_3_4_count INTEGER,
    grade_3_4_percentage FLOAT,
    treatment_arm VARCHAR(100)
);
