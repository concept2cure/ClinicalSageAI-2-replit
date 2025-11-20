-- eCTD Document Management Schema
-- Tables for enhanced document management system with SharePoint-like features

-- Main eCTD documents table
CREATE TABLE IF NOT EXISTS ectd_documents (
  id SERIAL PRIMARY KEY,
  node_id VARCHAR(100) NOT NULL,
  project_id VARCHAR(100) NOT NULL,
  file_name VARCHAR(255),
  file_size VARCHAR(50),
  file_type VARCHAR(20),
  file_path TEXT,
  content TEXT,
  status VARCHAR(50) DEFAULT 'template',
  version VARCHAR(20) DEFAULT '1.0',
  is_locked BOOLEAN DEFAULT FALSE,
  checked_out_by VARCHAR(100),
  checked_out_at TIMESTAMP,
  last_modified_by VARCHAR(100),
  template_id INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(node_id, project_id)
);

-- Document metadata table
CREATE TABLE IF NOT EXISTS ectd_document_metadata (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES ectd_documents(id) ON DELETE CASCADE,
  guidance TEXT,
  requirements TEXT[],
  max_size VARCHAR(20),
  allowed_file_types TEXT[],
  regulatory_reference TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Version history table
CREATE TABLE IF NOT EXISTS ectd_document_versions (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES ectd_documents(id) ON DELETE CASCADE,
  version VARCHAR(20) NOT NULL,
  content TEXT,
  file_path TEXT,
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  change_summary TEXT,
  is_major_version BOOLEAN DEFAULT FALSE
);

-- Comments and annotations table
CREATE TABLE IF NOT EXISTS ectd_document_comments (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES ectd_documents(id) ON DELETE CASCADE,
  node_id VARCHAR(100),
  comment_text TEXT NOT NULL,
  comment_type VARCHAR(50) DEFAULT 'regulatory',
  author VARCHAR(100),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved BOOLEAN DEFAULT FALSE,
  resolved_by VARCHAR(100),
  resolved_at TIMESTAMP
);

-- Document locks table
CREATE TABLE IF NOT EXISTS ectd_document_locks (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES ectd_documents(id) ON DELETE CASCADE,
  locked_by VARCHAR(100) NOT NULL,
  locked_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  lock_reason TEXT,
  expected_release TIMESTAMP
);

-- Audit trail table for document actions
CREATE TABLE IF NOT EXISTS ectd_audit_trail (
  id SERIAL PRIMARY KEY,
  document_id INTEGER REFERENCES ectd_documents(id) ON DELETE SET NULL,
  node_id VARCHAR(100),
  action VARCHAR(50) NOT NULL,
  performed_by VARCHAR(100),
  performed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  ip_address VARCHAR(50),
  user_agent TEXT,
  details JSONB
);

-- Auto-save table
CREATE TABLE IF NOT EXISTS ectd_autosave (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(100) NOT NULL UNIQUE,
  document_status JSONB,
  comments JSONB,
  saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Templates table
CREATE TABLE IF NOT EXISTS ectd_templates (
  id SERIAL PRIMARY KEY,
  section_id VARCHAR(100) NOT NULL UNIQUE,
  title VARCHAR(255),
  template_content TEXT,
  guidance TEXT,
  requirements TEXT[],
  metadata JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_ectd_documents_node_id ON ectd_documents(node_id);
CREATE INDEX IF NOT EXISTS idx_ectd_documents_project_id ON ectd_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_ectd_documents_status ON ectd_documents(status);
CREATE INDEX IF NOT EXISTS idx_ectd_document_versions_document_id ON ectd_document_versions(document_id);
CREATE INDEX IF NOT EXISTS idx_ectd_document_comments_document_id ON ectd_document_comments(document_id);
CREATE INDEX IF NOT EXISTS idx_ectd_audit_trail_document_id ON ectd_audit_trail(document_id);
CREATE INDEX IF NOT EXISTS idx_ectd_audit_trail_node_id ON ectd_audit_trail(node_id);

-- Insert sample data for testing
INSERT INTO ectd_documents (node_id, project_id, file_name, file_type, status, version) VALUES
  ('module1.1.0', 'IND-2024-001', 'Cover_Letter_v2.pdf', 'PDF', 'approved', '2.0'),
  ('module1.1.2', 'IND-2024-001', 'FDA_Form_1571.pdf', 'PDF', 'approved', '1.0'),
  ('module2.2.3.S.1', 'IND-2024-001', 'Drug_Substance_General_Info.docx', 'DOCX', 'in_review', '1.5'),
  ('module5.5.3.5', 'IND-2024-001', NULL, NULL, 'template', '1.0')
ON CONFLICT (node_id, project_id) DO NOTHING;