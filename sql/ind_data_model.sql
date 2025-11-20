-- IND Wizard - Data-First Architecture Schema
-- This schema supports structured content storage with versioning and rendering pipelines

-- 1. Core IND Submission tables
CREATE TABLE IF NOT EXISTS ind_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  created_by UUID NOT NULL,
  title TEXT NOT NULL,
  ind_number TEXT,
  sponsor_name TEXT NOT NULL,
  submission_type TEXT NOT NULL, -- 'original', 'amendment', 'response'
  submission_status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'in_review', 'submitted', 'approved'
  target_authority TEXT NOT NULL DEFAULT 'FDA', -- 'FDA', 'EMA', 'Health Canada', etc.
  sequence_number INTEGER,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. IND Section Definitions (template)
CREATE TABLE IF NOT EXISTS ind_section_definitions (
  id TEXT PRIMARY KEY, -- e.g., 'm2.2', 'm3.2.p.1'
  parent_id TEXT REFERENCES ind_section_definitions(id),
  name TEXT NOT NULL,
  display_order INTEGER NOT NULL,
  level INTEGER NOT NULL, -- hierarchy level (1, 2, 3...)
  section_type TEXT NOT NULL, -- 'module', 'section', 'subsection'
  is_required BOOLEAN NOT NULL DEFAULT FALSE,
  description TEXT,
  guidance TEXT,
  region_specific BOOLEAN NOT NULL DEFAULT FALSE,
  applicable_regions TEXT[], -- ['US', 'EU', 'CA', 'JP']
  max_page_limit INTEGER,
  content_template JSONB, -- Default content template in JSON format
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. IND Sections (actual content, data-first approach)
CREATE TABLE IF NOT EXISTS ind_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES ind_submissions(id) ON DELETE CASCADE,
  definition_id TEXT NOT NULL REFERENCES ind_section_definitions(id),
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft', -- 'draft', 'in_review', 'approved', 'final'
  locked BOOLEAN NOT NULL DEFAULT FALSE,
  content JSONB NOT NULL, -- Structured content in JSON format with Markdown, tables, and data references
  metadata JSONB, -- Additional metadata like review status, citations, cross-references
  last_edited_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, definition_id, version)
);

-- 4. Section History (for versioning and audit)
CREATE TABLE IF NOT EXISTS ind_section_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES ind_sections(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content JSONB NOT NULL,
  metadata JSONB,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  change_reason TEXT
);

-- 5. Section Comments
CREATE TABLE IF NOT EXISTS ind_section_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES ind_sections(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES ind_section_comments(id),
  created_by UUID NOT NULL,
  content TEXT NOT NULL,
  position_path TEXT, -- JSON path to the commented element
  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'resolved', 'won't fix'
  resolved_by UUID,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. Citations/References
CREATE TABLE IF NOT EXISTS ind_citations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES ind_submissions(id) ON DELETE CASCADE,
  reference_type TEXT NOT NULL, -- 'document', 'section', 'url', 'pubmed'
  reference_id TEXT, -- document ID, PubMed ID, etc.
  title TEXT NOT NULL,
  authors TEXT[],
  publication TEXT,
  publication_date DATE,
  url TEXT,
  document_path TEXT, -- Path to the document in Vault
  citation_text TEXT NOT NULL, -- Formatted citation text
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 7. Cross-references (for section linking)
CREATE TABLE IF NOT EXISTS ind_cross_references (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_section_id UUID NOT NULL REFERENCES ind_sections(id) ON DELETE CASCADE,
  target_section_id UUID NOT NULL REFERENCES ind_sections(id) ON DELETE CASCADE,
  source_position_path TEXT, -- JSON path to the source element
  reference_type TEXT NOT NULL, -- 'see', 'refer', 'copy', etc.
  description TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source_section_id, target_section_id, source_position_path)
);

-- 8. Document Renderings
CREATE TABLE IF NOT EXISTS ind_renderings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES ind_submissions(id) ON DELETE CASCADE,
  format TEXT NOT NULL, -- 'pdf', 'docx', 'html', 'ectd'
  file_path TEXT NOT NULL, -- Path to the generated file
  version INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'in_progress', -- 'in_progress', 'completed', 'failed'
  error_message TEXT,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 9. Audit Trail
CREATE TABLE IF NOT EXISTS ind_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL, -- 'submission', 'section', 'comment', etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL, -- 'create', 'update', 'delete', 'lock', 'unlock', 'approve', etc.
  performed_by UUID NOT NULL,
  details JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 10. Realtime Collaboration Cursors
CREATE TABLE IF NOT EXISTS ind_realtime_cursors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES ind_sections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  position INTEGER NOT NULL,
  color TEXT NOT NULL, -- CSS color for cursor
  user_role TEXT NOT NULL, -- 'CMC', 'Clinical', 'Regulatory', etc.
  last_updated TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(section_id, user_id)
);

-- 11. Data-driven placeholders
CREATE TABLE IF NOT EXISTS ind_placeholders (
  id TEXT PRIMARY KEY, -- e.g., 'DrugName', 'ExcipientRatio'
  display_name TEXT NOT NULL,
  description TEXT,
  data_type TEXT NOT NULL, -- 'text', 'number', 'date', 'boolean'
  validation_rule TEXT, -- Regular expression or validation rule
  example_value TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 12. Placeholder values for specific submissions
CREATE TABLE IF NOT EXISTS ind_placeholder_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES ind_submissions(id) ON DELETE CASCADE,
  placeholder_id TEXT NOT NULL REFERENCES ind_placeholders(id),
  value TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(submission_id, placeholder_id)
);

-- 13. Auto-population rules
CREATE TABLE IF NOT EXISTS ind_auto_population_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_name TEXT NOT NULL,
  section_definition_id TEXT NOT NULL REFERENCES ind_section_definitions(id),
  condition_type TEXT NOT NULL, -- 'exists', 'value_equals', 'value_greater_than', etc.
  condition_entity TEXT NOT NULL, -- The entity to check (e.g., 'stability_study')
  condition_entity_id TEXT, -- ID of the entity to check
  condition_value TEXT, -- Value to compare against
  target_path TEXT NOT NULL, -- JSON path within the section content to populate
  template_content JSONB NOT NULL, -- Content template to insert
  created_by UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_ind_sections_submission_id ON ind_sections(submission_id);
CREATE INDEX IF NOT EXISTS idx_ind_sections_definition_id ON ind_sections(definition_id);
CREATE INDEX IF NOT EXISTS idx_ind_section_history_section_id ON ind_section_history(section_id);
CREATE INDEX IF NOT EXISTS idx_ind_section_comments_section_id ON ind_section_comments(section_id);
CREATE INDEX IF NOT EXISTS idx_ind_placeholders_submission_id ON ind_placeholder_values(submission_id);
CREATE INDEX IF NOT EXISTS idx_ind_audit_log_entity_id ON ind_audit_log(entity_id);

-- Trigger for updating updated_at timestamp
CREATE OR REPLACE FUNCTION update_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply timestamp triggers
CREATE TRIGGER update_ind_submissions_timestamp
BEFORE UPDATE ON ind_submissions
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_ind_section_definitions_timestamp
BEFORE UPDATE ON ind_section_definitions
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_ind_sections_timestamp
BEFORE UPDATE ON ind_sections
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_ind_section_comments_timestamp
BEFORE UPDATE ON ind_section_comments
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_ind_citations_timestamp
BEFORE UPDATE ON ind_citations
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

CREATE TRIGGER update_ind_placeholder_values_timestamp
BEFORE UPDATE ON ind_placeholder_values
FOR EACH ROW EXECUTE PROCEDURE update_timestamp();

-- Trigger for section versioning
CREATE OR REPLACE FUNCTION archive_section_version()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO ind_section_history (
    section_id, 
    version, 
    content, 
    metadata, 
    created_by, 
    change_reason
  )
  VALUES (
    OLD.id,
    OLD.version,
    OLD.content,
    OLD.metadata,
    OLD.last_edited_by,
    'Version update'
  );
  
  -- Increment version
  NEW.version = OLD.version + 1;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER version_ind_sections
BEFORE UPDATE OF content ON ind_sections
FOR EACH ROW
WHEN (OLD.content != NEW.content)
EXECUTE PROCEDURE archive_section_version();