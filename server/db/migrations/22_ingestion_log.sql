-- Phase 22: CSR Ingestion Log Table

-- Ingestion Log for CSR Harvesting Pipeline
-- Tracks download, extraction, and ingestion status with timestamps and metrics
CREATE TABLE IF NOT EXISTS csr_ingestion_log (
    log_id BIGSERIAL PRIMARY KEY,
    submission_id VARCHAR(100) NOT NULL,
    pdf_url TEXT NOT NULL,
    pdf_sha256_hash VARCHAR(64),
    
    -- Status tracking
    status VARCHAR(50) NOT NULL DEFAULT 'pending', -- pending, downloading, processing, completed, failed
    started_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    
    -- Processing metrics
    file_size_bytes BIGINT,
    download_duration_ms INTEGER,
    extraction_duration_ms INTEGER,
    total_duration_ms INTEGER,
    
    -- Quality metrics
    extraction_confidence_score FLOAT,
    completeness_score FLOAT,
    
    -- Error tracking
    error_message TEXT,
    error_stack TEXT,
    retry_count INTEGER DEFAULT 0,
    
    -- Result
    csr_id BIGINT REFERENCES csr_deep_vault(csr_id) ON DELETE SET NULL,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for status queries (monitoring dashboard)
CREATE INDEX IF NOT EXISTS idx_csr_ingestion_status 
    ON csr_ingestion_log (status);

-- Index for time-based queries (performance monitoring)
CREATE INDEX IF NOT EXISTS idx_csr_ingestion_started_at 
    ON csr_ingestion_log (started_at DESC);

-- Index for submission lookup
CREATE INDEX IF NOT EXISTS idx_csr_ingestion_submission_id 
    ON csr_ingestion_log (submission_id);

-- Index for duplicate detection via hash
CREATE INDEX IF NOT EXISTS idx_csr_ingestion_sha256 
    ON csr_ingestion_log (pdf_sha256_hash) WHERE pdf_sha256_hash IS NOT NULL;

-- Add a compound index for filtering by status and time
CREATE INDEX IF NOT EXISTS idx_csr_ingestion_status_time 
    ON csr_ingestion_log (status, started_at DESC);

COMMENT ON TABLE csr_ingestion_log IS 'Phase 22: CSR Harvest Pipeline - Tracks ingestion job status, metrics, and quality scores';
COMMENT ON COLUMN csr_ingestion_log.status IS 'Job status: pending, downloading, processing, completed, failed';
COMMENT ON COLUMN csr_ingestion_log.pdf_sha256_hash IS 'SHA256 hash for duplicate detection';
COMMENT ON COLUMN csr_ingestion_log.extraction_confidence_score IS 'ML confidence score from LLM extraction (0-1)';
COMMENT ON COLUMN csr_ingestion_log.completeness_score IS 'Percentage of required ICH E3 sections present (0-1)';
