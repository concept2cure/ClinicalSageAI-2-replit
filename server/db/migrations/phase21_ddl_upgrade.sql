-- ═══════════════════════════════════════════════════════════════
-- LUMEN DEEP INTELLIGENCE™ PRODUCTION SCHEMA ENHANCEMENTS
-- ═══════════════════════════════════════════════════════════════

-- Ensure extensions required for indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Add missing columns from production spec
ALTER TABLE csr_deep_vault
    ADD COLUMN IF NOT EXISTS indication VARCHAR(500),
    ADD COLUMN IF NOT EXISTS phase VARCHAR(50),
    ADD COLUMN IF NOT EXISTS extraction_date TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS extractor_version VARCHAR(50) DEFAULT 'lumen-v21.0',
    ADD COLUMN IF NOT EXISTS pdf_page_count INTEGER,
    ADD COLUMN IF NOT EXISTS pdf_file_size_bytes BIGINT,
    ADD COLUMN IF NOT EXISTS has_protocol_deviations BOOLEAN GENERATED ALWAYS AS (
        (deep_data -> 'data_quality' -> 'protocol_deviations' ->> 'major_deviations')::jsonb IS NOT NULL
    ) STORED,
    ADD COLUMN IF NOT EXISTS has_sae_data BOOLEAN GENERATED ALWAYS AS (
        (deep_data -> 'safety' ->> 'serious_adverse_events') IS NOT NULL
    ) STORED,
    ADD COLUMN IF NOT EXISTS has_pk_data BOOLEAN GENERATED ALWAYS AS (
        (deep_data ->> 'pharmacokinetics') IS NOT NULL
    ) STORED;

-- Helper function for generated missing_sections column
CREATE OR REPLACE FUNCTION calc_missing_sections(data jsonb)
RETURNS TEXT[] AS $$
  SELECT array_remove(ARRAY[
    CASE WHEN data ? 'regulatory' THEN NULL ELSE 'regulatory' END,
    CASE WHEN data ? 'protocol' THEN NULL ELSE 'protocol' END,
    CASE WHEN data ? 'population' THEN NULL ELSE 'population' END,
    CASE WHEN data ? 'safety' THEN NULL ELSE 'safety' END,
    CASE WHEN data ? 'efficacy' THEN NULL ELSE 'efficacy' END,
    CASE WHEN data ? 'sites' THEN NULL ELSE 'sites' END,
    CASE WHEN data ? 'data_quality' THEN NULL ELSE 'data_quality' END
  ], NULL);
$$ LANGUAGE SQL IMMUTABLE;

ALTER TABLE csr_deep_vault
    ADD COLUMN IF NOT EXISTS missing_sections TEXT[] GENERATED ALWAYS AS (
      CASE
        WHEN deep_data IS NULL THEN ARRAY[]::TEXT[]
        ELSE calc_missing_sections(deep_data)
      END
    ) STORED;

-- 1. ADD CONSTRAINTS (Data Integrity)
ALTER TABLE csr_deep_vault
    ADD CONSTRAINT chk_regulatory_agency 
        CHECK (regulatory_agency IN ('FDA', 'EMA', 'Health Canada', 'PMDA', 'NMPA')),
    
    ADD CONSTRAINT chk_confidence_range 
        CHECK (extraction_confidence_score BETWEEN 0 AND 1),
    
    ADD CONSTRAINT chk_phase_format 
        CHECK (phase ~* '^Phase [1234](/[1234])?$'),
    
    ADD CONSTRAINT chk_pdf_hash_unique 
        UNIQUE (pdf_sha256_hash),

    ADD CONSTRAINT chk_submission_id_format 
        CHECK (submission_id ~* '^(NDA|BLA|sNDA|sBLA|MAA)\s*\d+$');

-- 2. CREATE GENERATED COLUMNS (Performance Optimization)
ALTER TABLE csr_deep_vault
    ADD COLUMN completeness_score FLOAT GENERATED ALWAYS AS (
        CASE 
            WHEN deep_data IS NULL THEN 0.0
            ELSE (
                (CASE WHEN deep_data ? 'regulatory' THEN 1 ELSE 0 END +
                 CASE WHEN deep_data ? 'protocol' THEN 1 ELSE 0 END +
                 CASE WHEN deep_data ? 'population' THEN 1 ELSE 0 END +
                 CASE WHEN deep_data ? 'safety' THEN 1 ELSE 0 END +
                 CASE WHEN deep_data ? 'efficacy' THEN 1 ELSE 0 END +
                 CASE WHEN deep_data ? 'sites' THEN 1 ELSE 0 END +
                 CASE WHEN deep_data ? 'data_quality' THEN 1 ELSE 0 END
                )::float / 7.0
            )
        END
    ) STORED;

-- 3. ADD PERFORMANCE INDEXES (Critical for Viewer Queries)
CREATE INDEX IF NOT EXISTS idx_csr_completeness_score 
    ON csr_deep_vault (completeness_score DESC);

CREATE INDEX IF NOT EXISTS idx_csr_missing_sections_gin 
    ON csr_deep_vault USING GIN (missing_sections);

CREATE INDEX IF NOT EXISTS idx_csr_drug_name_trgm 
    ON csr_deep_vault USING GIN (drug_name gin_trgm_ops);

-- Partial index for high-quality extractions only
CREATE INDEX IF NOT EXISTS idx_csr_gold_standard 
    ON csr_deep_vault (csr_id, submission_id)
    WHERE extraction_confidence_score > 0.9 
      AND completeness_score > 0.85;

-- 4. CREATE HELPER FUNCTIONS (JSONB Path Navigation)
CREATE OR REPLACE FUNCTION get_protocol_arm_count(submission_id TEXT)
RETURNS INTEGER AS $$
    SELECT jsonb_array_length(deep_data -> 'protocol' -> 'randomization' -> 'treatment_arms')
    FROM csr_deep_vault
    WHERE submission_id = $1;
$$ LANGUAGE SQL IMMUTABLE;

CREATE OR REPLACE FUNCTION get_sae_count(submission_id TEXT)
RETURNS INTEGER AS $$
    SELECT jsonb_array_length(deep_data -> 'safety' -> 'serious_adverse_events_detail')
    FROM csr_deep_vault
    WHERE submission_id = $1;
$$ LANGUAGE SQL IMMUTABLE;

-- 5. CREATE MATERIALIZED VIEW (Pre-aggregated Dashboard Data)
CREATE MATERIALIZED VIEW IF NOT EXISTS mv_deep_intelligence_summary AS
SELECT 
    regulatory_agency,
    phase,
    COUNT(*) as total_csrs,
    AVG(extraction_confidence_score) as avg_confidence,
    AVG(completeness_score) as avg_completeness,
    SUM(CASE WHEN has_sae_data THEN 1 ELSE 0 END) as csrs_with_sae,
    SUM(CASE WHEN has_pk_data THEN 1 ELSE 0 END) as csrs_with_pk,
    COUNT(DISTINCT drug_name) as unique_drugs
FROM csr_deep_vault
GROUP BY regulatory_agency, phase;

CREATE UNIQUE INDEX ON mv_deep_intelligence_summary (regulatory_agency, phase);

-- 6. SECURITY: Row-Level Security (Enable if multi-tenant)
ALTER TABLE csr_deep_vault ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'admin_user') THEN
        CREATE ROLE admin_user;
    END IF;
EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'Skipping admin_user role creation (insufficient privileges).';
END $$;

DO $$
BEGIN
    CREATE POLICY admin_full_access ON csr_deep_vault
        FOR ALL
        TO admin_user
        USING (true);
EXCEPTION WHEN undefined_object OR insufficient_privilege THEN
    RAISE NOTICE 'Skipping admin_full_access policy creation.';
END $$;

-- 7. COMMENTS (Documentation in Schema)
COMMENT ON TABLE csr_deep_vault IS 'Lumen Deep Intelligence™: Atomized CSR storage with confidence scoring and completeness metrics';
COMMENT ON COLUMN csr_deep_vault.deep_data IS 'JSONB payload containing ICH E3 structured data: regulatory, protocol, population, safety, efficacy, sites, PK';
COMMENT ON COLUMN csr_deep_vault.completeness_score IS 'Automatically computed percentage of core sections present (0-1 scale)';
