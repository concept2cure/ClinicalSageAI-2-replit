-- Gap Analysis Results table for audit trail and trend tracking
-- Stores each gap analysis run with full snapshot for historical comparison

CREATE TABLE IF NOT EXISTS gap_analysis_results (
  id SERIAL PRIMARY KEY,
  organization_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  submission_type TEXT NOT NULL,
  project_id TEXT,
  overall_readiness INTEGER NOT NULL,
  total_required INTEGER NOT NULL,
  completed_count INTEGER NOT NULL,
  gaps_snapshot JSONB NOT NULL,
  recommendations JSONB NOT NULL,
  uploaded_documents JSONB,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Index for fast lookups by organization and time
CREATE INDEX IF NOT EXISTS idx_gap_analysis_org_created
  ON gap_analysis_results (organization_id, created_at DESC);

-- Index for project-level trend queries
CREATE INDEX IF NOT EXISTS idx_gap_analysis_project
  ON gap_analysis_results (project_id, created_at DESC)
  WHERE project_id IS NOT NULL;
