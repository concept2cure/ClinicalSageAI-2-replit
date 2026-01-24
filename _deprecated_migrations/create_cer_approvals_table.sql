-- Migration to create the cer_approvals table
-- This table tracks approval workflow for CER documents and sections.

CREATE TABLE IF NOT EXISTS cer_approvals (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  project_id INTEGER NOT NULL REFERENCES cer_projects(id),
  document_id INTEGER REFERENCES project_documents(id),
  section_key TEXT,
  approval_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by_id INTEGER REFERENCES users(id),
  requested_at TIMESTAMP NOT NULL DEFAULT NOW(),
  approved_by_id INTEGER REFERENCES users(id),
  approved_at TIMESTAMP,
  rejected_by_id INTEGER REFERENCES users(id),
  rejected_at TIMESTAMP,
  comments TEXT,
  metadata JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for tenant isolation
CREATE INDEX IF NOT EXISTS idx_cer_approvals_org_id ON cer_approvals(organization_id);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_cer_approvals_project_id ON cer_approvals(project_id);
CREATE INDEX IF NOT EXISTS idx_cer_approvals_document_id ON cer_approvals(document_id);
CREATE INDEX IF NOT EXISTS idx_cer_approvals_status ON cer_approvals(status);

-- Create composite indexes for frequent query patterns
CREATE INDEX IF NOT EXISTS idx_cer_approvals_org_proj_status ON cer_approvals(organization_id, project_id, status);
CREATE INDEX IF NOT EXISTS idx_cer_approvals_org_section_status ON cer_approvals(organization_id, section_key, status);