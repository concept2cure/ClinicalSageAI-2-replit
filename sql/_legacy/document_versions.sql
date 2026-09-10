-- TrialSage Vault - Document Version Control Schema

-- Document Versions Table
CREATE TABLE IF NOT EXISTS document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id INTEGER NOT NULL REFERENCES documents(id),
  version_number INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  created_by UUID NOT NULL,
  comments TEXT,
  change_summary TEXT,
  change_type VARCHAR(20) CHECK (change_type IN ('MINOR', 'MAJOR', 'REVISION')),
  status VARCHAR(20) DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'REJECTED', 'SUPERSEDED')),
  reviewed_by UUID,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  review_comments TEXT,
  metadata JSONB
);

-- Document Version Tags
CREATE TABLE IF NOT EXISTS document_version_tags (
  version_id UUID REFERENCES document_versions(id),
  tag TEXT NOT NULL,
  PRIMARY KEY (version_id, tag)
);

-- Document Diffs Table
CREATE TABLE IF NOT EXISTS document_diffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_version_id UUID NOT NULL REFERENCES document_versions(id),
  compare_version_id UUID NOT NULL REFERENCES document_versions(id),
  diff_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT diff_versions_different CHECK (base_version_id != compare_version_id)
);

-- Document Version View History
CREATE TABLE IF NOT EXISTS document_version_views (
  id BIGSERIAL PRIMARY KEY,
  version_id UUID NOT NULL REFERENCES document_versions(id),
  user_id UUID NOT NULL,
  viewed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  ip_address TEXT,
  user_agent TEXT,
  context VARCHAR(100)
);

-- Document Approval Workflow
CREATE TABLE IF NOT EXISTS document_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version_id UUID NOT NULL REFERENCES document_versions(id),
  approver_id UUID NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
  approval_date TIMESTAMP WITH TIME ZONE,
  comments TEXT,
  order_index INTEGER,
  required BOOLEAN DEFAULT TRUE,
  notification_sent BOOLEAN DEFAULT FALSE,
  notification_date TIMESTAMP WITH TIME ZONE
);

-- Document Version Locks
CREATE TABLE IF NOT EXISTS document_version_locks (
  document_id INTEGER PRIMARY KEY REFERENCES documents(id),
  locked_by UUID NOT NULL,
  locked_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP WITH TIME ZONE,
  reason TEXT
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_versions_document_id ON document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_document_versions_created_by ON document_versions(created_by);
CREATE INDEX IF NOT EXISTS idx_document_versions_status ON document_versions(status);
CREATE INDEX IF NOT EXISTS idx_document_diffs_base_version ON document_diffs(base_version_id);
CREATE INDEX IF NOT EXISTS idx_document_diffs_compare_version ON document_diffs(compare_version_id);
CREATE INDEX IF NOT EXISTS idx_document_version_views_version ON document_version_views(version_id);
CREATE INDEX IF NOT EXISTS idx_document_version_views_user ON document_version_views(user_id);
CREATE INDEX IF NOT EXISTS idx_document_approvals_version ON document_approvals(version_id);
CREATE INDEX IF NOT EXISTS idx_document_approvals_approver ON document_approvals(approver_id);
CREATE INDEX IF NOT EXISTS idx_document_approvals_status ON document_approvals(status);

-- Create composite index for quick version lookups
CREATE INDEX IF NOT EXISTS idx_document_versions_composite 
ON document_versions(document_id, version_number);

-- Create view for latest versions
CREATE OR REPLACE VIEW vw_latest_document_versions AS
SELECT 
  d.id AS document_id,
  d.name AS document_name,
  d.document_subtype_id,
  d.status AS document_status,
  v.id AS version_id,
  v.version_number,
  v.file_path,
  v.file_size,
  v.created_at,
  v.created_by,
  v.status AS version_status,
  v.change_type,
  v.change_summary
FROM 
  documents d
JOIN 
  (
    SELECT 
      document_id, 
      MAX(version_number) AS max_version
    FROM 
      document_versions
    GROUP BY 
      document_id
  ) mv ON d.id = mv.document_id
JOIN 
  document_versions v ON v.document_id = mv.document_id AND v.version_number = mv.max_version
ORDER BY 
  d.name, v.version_number DESC;

-- Create a function to generate the next version number
CREATE OR REPLACE FUNCTION next_document_version(doc_id INTEGER)
RETURNS INTEGER AS $$
DECLARE
  next_version INTEGER;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
  FROM document_versions
  WHERE document_id = doc_id;
  
  RETURN next_version;
END;
$$ LANGUAGE plpgsql;

-- Create a trigger function to update documents table when versions change
CREATE OR REPLACE FUNCTION update_document_on_version_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Update the document's last_modified timestamp and latest_version
  UPDATE documents
  SET 
    updated_at = NEW.created_at,
    latest_version_id = NEW.id,
    latest_version_number = NEW.version_number
  WHERE 
    id = NEW.document_id;
    
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger on the document_versions table
CREATE TRIGGER trg_update_document_on_version
AFTER INSERT ON document_versions
FOR EACH ROW
EXECUTE FUNCTION update_document_on_version_change();

-- Add version-related columns to documents table
ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS latest_version_id UUID,
  ADD COLUMN IF NOT EXISTS latest_version_number INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS version_count INTEGER DEFAULT 0;

-- Create a trigger to increment version_count
CREATE OR REPLACE FUNCTION increment_document_version_count()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE documents
  SET version_count = version_count + 1
  WHERE id = NEW.document_id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger for version counting
CREATE TRIGGER trg_increment_version_count
AFTER INSERT ON document_versions
FOR EACH ROW
EXECUTE FUNCTION increment_document_version_count();