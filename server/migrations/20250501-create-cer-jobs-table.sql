-- CER Jobs Table for TrialSage CER Generator
-- This table tracks Clinical Evaluation Report generation jobs
-- with detailed status information and metadata for observability

CREATE TABLE IF NOT EXISTS cer_jobs (
  id SERIAL PRIMARY KEY,
  job_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  progress INTEGER NOT NULL DEFAULT 0,
  step TEXT NOT NULL DEFAULT 'initializing',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  download_url TEXT,
  page_count INTEGER,
  word_count INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Index for faster lookups by job_id
CREATE INDEX IF NOT EXISTS idx_cer_jobs_job_id ON cer_jobs(job_id);

-- Index for filtering by user_id
CREATE INDEX IF NOT EXISTS idx_cer_jobs_user_id ON cer_jobs(user_id);

-- Index for sorting by creation date
CREATE INDEX IF NOT EXISTS idx_cer_jobs_created_at ON cer_jobs(created_at);

-- Add template table if not exists
CREATE TABLE IF NOT EXISTS templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_default BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Insert a default template
INSERT INTO templates (id, name, description, is_default)
VALUES ('default-template', 'Standard CER Template', 'Default template for Clinical Evaluation Reports', TRUE)
ON CONFLICT (id) DO NOTHING;