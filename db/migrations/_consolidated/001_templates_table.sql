
-- Migration: Create document templates table
-- This migration creates the templates table with proper indexes for performance

CREATE TABLE IF NOT EXISTS document_templates (
  id VARCHAR(255) PRIMARY KEY,
  name VARCHAR(500) NOT NULL,
  category VARCHAR(100) NOT NULL,
  module VARCHAR(50),
  region VARCHAR(50),
  type VARCHAR(100),
  description TEXT,
  content JSONB,
  metadata JSONB,
  status VARCHAR(50) DEFAULT 'active',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  created_by VARCHAR(255),
  tenant_id VARCHAR(255)
);

-- Indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_templates_category ON document_templates(category);
CREATE INDEX IF NOT EXISTS idx_templates_module ON document_templates(module);
CREATE INDEX IF NOT EXISTS idx_templates_region ON document_templates(region);
CREATE INDEX IF NOT EXISTS idx_templates_status ON document_templates(status);
CREATE INDEX IF NOT EXISTS idx_templates_tenant ON document_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_templates_name ON document_templates USING GIN (to_tsvector('english', name));
CREATE INDEX IF NOT EXISTS idx_templates_content ON document_templates USING GIN (content);

-- Full text search index for template search
CREATE INDEX IF NOT EXISTS idx_templates_search ON document_templates USING GIN (
  to_tsvector('english', name || ' ' || COALESCE(description, ''))
);

-- Trigger to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_templates_updated_at 
BEFORE UPDATE ON document_templates 
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
