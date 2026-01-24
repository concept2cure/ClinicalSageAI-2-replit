-- Protocol Builder Schema
-- This schema defines the tables needed for the Protocol Builder component

-- Protocol Table - Stores the core protocol data
CREATE TABLE IF NOT EXISTS ind_protocols (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  protocol_data JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
  version INT NOT NULL DEFAULT 1,
  UNIQUE(project_id)
);

-- Protocol History Table - Stores historical versions for audit purposes
CREATE TABLE IF NOT EXISTS ind_protocol_history (
  id SERIAL PRIMARY KEY,
  protocol_id INT NOT NULL REFERENCES ind_protocols(id),
  protocol_data JSONB NOT NULL,
  version INT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  created_by VARCHAR(255),
  UNIQUE(protocol_id, version)
);

-- Generated Documents Table - Tracks documents generated from protocols
CREATE TABLE IF NOT EXISTS generated_documents (
  id SERIAL PRIMARY KEY,
  project_id VARCHAR(255) NOT NULL,
  document_type VARCHAR(50) NOT NULL,
  document_name VARCHAR(255) NOT NULL,
  document_path VARCHAR(500),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  downloaded_at TIMESTAMP WITH TIME ZONE,
  download_count INT NOT NULL DEFAULT 0
);

-- Protocol Templates Table - Stores reusable protocol templates
CREATE TABLE IF NOT EXISTS protocol_templates (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  template_data JSONB NOT NULL,
  is_public BOOLEAN NOT NULL DEFAULT false,
  created_by VARCHAR(255),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Protocol Review Table - Tracks review status for protocols
CREATE TABLE IF NOT EXISTS protocol_reviews (
  id SERIAL PRIMARY KEY,
  protocol_id INT NOT NULL REFERENCES ind_protocols(id),
  reviewer VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  comments TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_protocols_project_id ON ind_protocols(project_id);
CREATE INDEX IF NOT EXISTS idx_protocol_history_protocol_id ON ind_protocol_history(protocol_id);
CREATE INDEX IF NOT EXISTS idx_generated_documents_project_id ON generated_documents(project_id);
CREATE INDEX IF NOT EXISTS idx_protocol_reviews_protocol_id ON protocol_reviews(protocol_id);