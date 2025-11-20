-- TrialSage Vault Reference Model
-- Based on Veeva Quality Content Reference Model structure
-- ENHANCED implementation with triggers for periodic reviews

-- 1. Create tables for document hierarchies and lifecycles

-- Document Lifecycles
CREATE TABLE IF NOT EXISTS lifecycles (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  start_state VARCHAR(50) NOT NULL,
  steady_state VARCHAR(50) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Document Types (4 master categories)
CREATE TABLE IF NOT EXISTS document_types (
  id VARCHAR(50) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  icon VARCHAR(50) DEFAULT 'file-text',
  color VARCHAR(20) DEFAULT '#e6007d',
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Document Subtypes (20+ specific document categories)
CREATE TABLE IF NOT EXISTS document_subtypes (
  id VARCHAR(50) PRIMARY KEY,
  type_id VARCHAR(50) NOT NULL REFERENCES document_types(id),
  name VARCHAR(100) NOT NULL,
  lifecycle_id VARCHAR(50) NOT NULL REFERENCES lifecycles(id),
  requires_training BOOLEAN DEFAULT false,
  review_interval INTEGER, -- Number of months between reviews (null = no periodic review)
  archive_after INTEGER, -- Number of months after effective to archive
  delete_after INTEGER, -- Number of months after effective to delete
  business_unit VARCHAR(100), -- Optional filter for business unit (Clinical, QA, CMC, etc.)
  icon VARCHAR(50),
  description TEXT,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Folder Templates for the document hierarchy
CREATE TABLE IF NOT EXISTS folder_templates (
  id SERIAL PRIMARY KEY,
  parent_id INTEGER REFERENCES folder_templates(id),
  name VARCHAR(255) NOT NULL,
  document_type_id VARCHAR(50) REFERENCES document_types(id),
  description TEXT,
  default_for_tenants BOOLEAN DEFAULT false,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add metadata fields to existing documents table
-- Note: This assumes 'documents' table already exists
ALTER TABLE documents 
  ADD COLUMN IF NOT EXISTS document_subtype_id VARCHAR(50) REFERENCES document_subtypes(id),
  ADD COLUMN IF NOT EXISTS business_unit VARCHAR(100),
  ADD COLUMN IF NOT EXISTS periodic_review_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS archive_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS delete_date TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS status VARCHAR(50) DEFAULT 'Draft';

-- Create periodic review tasks table
CREATE TABLE IF NOT EXISTS periodic_review_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id INTEGER REFERENCES documents(id),
  tenant_id UUID,
  owner_id INTEGER,
  due_date DATE,
  status VARCHAR(50) DEFAULT 'Open',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Retention rules table
CREATE TABLE IF NOT EXISTS retention_rules (
  tenant_id UUID,
  document_subtype_id VARCHAR(50) REFERENCES document_subtypes(id),
  archive_after INTEGER,
  delete_after INTEGER,
  PRIMARY KEY (tenant_id, document_subtype_id)
);

-- Trigger to schedule periodic review on document status change to Effective
CREATE OR REPLACE FUNCTION schedule_periodic_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Effective' AND (OLD.status IS NULL OR OLD.status != 'Effective') THEN
    -- Find review interval for the document's subtype
    INSERT INTO periodic_review_tasks (document_id, tenant_id, owner_id, due_date, status)
    SELECT 
      NEW.id, 
      NEW.tenant_id, 
      NEW.created_by, 
      (CURRENT_DATE + (ds.review_interval || ' months')::INTERVAL)::DATE,
      'Open'
    FROM document_subtypes ds 
    WHERE ds.id = NEW.document_subtype_id 
    AND ds.review_interval IS NOT NULL;
    
    -- Update the document's periodic review date
    UPDATE documents 
    SET periodic_review_date = (CURRENT_DATE + ((SELECT review_interval FROM document_subtypes WHERE id = NEW.document_subtype_id) || ' months')::INTERVAL)
    WHERE id = NEW.id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_schedule_periodic_review
AFTER UPDATE ON documents
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE PROCEDURE schedule_periodic_review();

-- 2. Seed with standard Veeva-like model data

-- Lifecycle states
INSERT INTO lifecycles (id, name, start_state, steady_state, description) 
VALUES 
  ('draft_eff', 'Draft→Effective', 'Draft', 'Effective', 'Standard lifecycle for SOPs and most controlled documents'),
  ('draft_appr', 'Draft→Approved', 'Draft', 'Approved', 'Standard lifecycle for documents that need approval but not effectiveness dates'),
  ('init_final', 'Initial→Final', 'Initial', 'Final', 'Simple lifecycle for executed records and certificates')
ON CONFLICT (id) DO NOTHING;

-- Document Types (the 4 main categories)
INSERT INTO document_types (id, name, description, icon, display_order) 
VALUES 
  ('gov', 'Governance & Procedures', 'Company policies, SOPs, working instructions, and guidance documents', 'book', 1),
  ('ops', 'Operations', 'Protocols, specifications, master batch records, and working documents', 'clipboard', 2),
  ('forms', 'Forms', 'Templates, master forms, and fillable documents', 'file-text', 3),
  ('records', 'Executed Records', 'Completed evidence of activities and processes', 'file-check', 4)
ON CONFLICT (id) DO NOTHING;

-- Document Subtypes (a subset of the 20+ from Veeva - expand as needed)
INSERT INTO document_subtypes (id, type_id, name, lifecycle_id, requires_training, review_interval, archive_after, delete_after, business_unit, icon) 
VALUES 
  -- Governance & Procedures
  ('sop', 'gov', 'Standard Operating Procedure', 'draft_eff', true, 24, 60, 120, NULL, 'book-open'),
  ('policy', 'gov', 'Policy', 'draft_eff', true, 24, 60, 120, NULL, 'shield'),
  ('wi', 'gov', 'Work Instruction', 'draft_eff', true, 24, 60, 120, NULL, 'list'),
  ('guideline', 'gov', 'Guideline', 'draft_eff', false, 24, 48, 120, NULL, 'compass'),
  
  -- Operations
  ('protocol', 'ops', 'Protocol', 'draft_appr', false, 12, 36, 120, 'Clinical', 'clipboard'),
  ('spec', 'ops', 'Specification', 'draft_appr', false, 12, 36, 120, 'QA', 'sliders'),
  ('mbr', 'ops', 'Master Batch Record', 'draft_appr', false, 12, 36, 120, 'Manufacturing', 'layers'),
  ('method', 'ops', 'Analytical Method', 'draft_appr', false, 12, 36, 120, 'Laboratory', 'flask'),
  
  -- Forms
  ('master_form', 'forms', 'Master Form', 'draft_appr', false, 24, 48, 120, NULL, 'file'),
  ('template', 'forms', 'Template', 'draft_appr', false, 24, 48, 120, NULL, 'copy'),
  ('checklist', 'forms', 'Checklist', 'draft_appr', false, 24, 48, 120, NULL, 'check-square'),
  
  -- Executed Records
  ('executed_mbr', 'records', 'Executed Batch Record', 'init_final', false, NULL, 120, 180, 'Manufacturing', 'clipboard-check'),
  ('certificate', 'records', 'Certificate', 'init_final', false, NULL, 120, 180, 'QA', 'award'),
  ('report', 'records', 'Report', 'init_final', false, NULL, 60, 120, NULL, 'file-text'),
  ('log', 'records', 'Log', 'init_final', false, NULL, 60, 120, NULL, 'list-check')
ON CONFLICT (id) DO NOTHING;

-- Folder Templates for the document hierarchy
INSERT INTO folder_templates (parent_id, name, document_type_id, description, default_for_tenants)
VALUES 
  (NULL, 'Governance & Procedures', 'gov', 'Top-level folder for all governance documents', true),
  (NULL, 'Operations', 'ops', 'Top-level folder for all operational documents', true),
  (NULL, 'Forms', 'forms', 'Top-level folder for all templates and master forms', true),
  (NULL, 'Executed Records', 'records', 'Top-level folder for all completed records and evidence', true)
ON CONFLICT DO NOTHING;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_document_subtypes_type_id ON document_subtypes(type_id);
CREATE INDEX IF NOT EXISTS idx_documents_subtype_id ON documents(document_subtype_id);
CREATE INDEX IF NOT EXISTS idx_folder_templates_parent_id ON folder_templates(parent_id);