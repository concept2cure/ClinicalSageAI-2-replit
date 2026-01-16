-- Migration 22: CSR Ingestion Log Table
-- This migration creates the csr_ingestion_log table for tracking CSR harvest jobs

CREATE TABLE IF NOT EXISTS csr_ingestion_log (
  id SERIAL PRIMARY KEY,
  job_id VARCHAR(255) UNIQUE NOT NULL,
  submission_id VARCHAR(255) NOT NULL,
  source_url TEXT,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  error_message TEXT,
  pdf_checksum VARCHAR(64),
  pdf_size_bytes BIGINT,
  extraction_metadata JSONB,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_ingestion_log_job_id ON csr_ingestion_log(job_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_submission_id ON csr_ingestion_log(submission_id);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_status ON csr_ingestion_log(status);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_started_at ON csr_ingestion_log(started_at);
CREATE INDEX IF NOT EXISTS idx_ingestion_log_created_at ON csr_ingestion_log(created_at);

-- Composite index for common queries
CREATE INDEX IF NOT EXISTS idx_ingestion_log_status_started ON csr_ingestion_log(status, started_at);

-- Ensure update_updated_at_column() function exists (from migration 001)
-- If it doesn't exist, create it now
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column'
  ) THEN
    CREATE FUNCTION update_updated_at_column()
    RETURNS TRIGGER AS $func$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $func$ LANGUAGE 'plpgsql';
  END IF;
END $$;

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE TRIGGER update_csr_ingestion_log_updated_at 
BEFORE UPDATE ON csr_ingestion_log 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE csr_ingestion_log IS 'Tracks CSR harvest job status and metadata for the ingestion pipeline';
COMMENT ON COLUMN csr_ingestion_log.job_id IS 'Unique BullMQ job identifier';
COMMENT ON COLUMN csr_ingestion_log.submission_id IS 'Unique submission identifier for deduplication';
COMMENT ON COLUMN csr_ingestion_log.status IS 'Job status: pending, processing, completed, failed';
COMMENT ON COLUMN csr_ingestion_log.pdf_checksum IS 'SHA256 checksum of the downloaded PDF';
COMMENT ON COLUMN csr_ingestion_log.extraction_metadata IS 'JSON metadata from PDF extraction and LLM processing';
