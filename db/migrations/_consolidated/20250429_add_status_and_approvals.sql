-- Add status column to cer_jobs table
ALTER TABLE cer_jobs
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';

-- Create approvals table for tracking reviews
CREATE TABLE IF NOT EXISTS cer_approvals (
  id SERIAL PRIMARY KEY,
  job_id TEXT REFERENCES cer_jobs(job_id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved','rejected','changes_requested')),
  comments TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for filtering by status
CREATE INDEX IF NOT EXISTS idx_cer_jobs_status ON cer_jobs(status);

-- Index for joining approvals with jobs
CREATE INDEX IF NOT EXISTS idx_cer_approvals_job_id ON cer_approvals(job_id);

-- Index for filtering approvals by reviewer
CREATE INDEX IF NOT EXISTS idx_cer_approvals_reviewer_id ON cer_approvals(reviewer_id);