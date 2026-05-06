-- Document Authoring System Schema Migration
-- This migration creates a comprehensive schema for document authoring
-- with support for versioning, track changes, comments, citations, and guidance caching
-- All tables include tenant_id for multi-tenant support

-- 1. Core Documents Table
-- Stores main document information
CREATE TABLE IF NOT EXISTS doc_documents (
  doc_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  module TEXT NOT NULL, -- e.g., "M3", "M2.3", etc.
  product_code TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT', -- DRAFT, IN_REVIEW, APPROVED, PUBLISHED
  locale TEXT NOT NULL DEFAULT 'en-US',
  created_by TEXT NOT NULL,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  metadata JSONB DEFAULT '{}', -- Additional flexible metadata
  CONSTRAINT doc_status_check CHECK (status IN ('DRAFT', 'IN_REVIEW', 'APPROVED', 'PUBLISHED'))
);

-- 2. Document Sections Table
-- Stores individual sections of documents with content
CREATE TABLE IF NOT EXISTS doc_sections (
  section_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES doc_documents(doc_id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  code TEXT NOT NULL, -- e.g., "3.2.S.1", "3.2.P.1.1"
  title TEXT NOT NULL,
  order_idx INTEGER NOT NULL DEFAULT 0,
  content JSONB DEFAULT '{}', -- Editor JSON content (e.g., Slate, Lexical, or TipTap format)
  track_changes BOOLEAN NOT NULL DEFAULT FALSE,
  updated_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  parent_section_id UUID, -- For hierarchical sections
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  locked_by TEXT,
  locked_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(doc_id, code)
);

-- 3. Revision History Table
-- Tracks all changes to document sections
CREATE TABLE IF NOT EXISTS doc_revisions (
  rev_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES doc_sections(section_id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  snapshot JSONB NOT NULL, -- Complete content snapshot at this revision
  diff JSONB, -- Differences from previous revision
  author TEXT NOT NULL,
  comment TEXT,
  version_number INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  change_type TEXT DEFAULT 'UPDATE', -- CREATE, UPDATE, DELETE
  metadata JSONB DEFAULT '{}' -- Additional metadata like IP, user agent, etc.
);

-- 4. Comments Table
-- Stores review comments on document sections
CREATE TABLE IF NOT EXISTS doc_comments (
  comment_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES doc_sections(section_id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  author TEXT NOT NULL,
  body TEXT NOT NULL,
  anchor JSONB, -- Position/selection information for inline comments
  status TEXT NOT NULL DEFAULT 'OPEN', -- OPEN, RESOLVED, DEFERRED
  parent_comment_id UUID, -- For threaded discussions
  resolved_by TEXT,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT comment_status_check CHECK (status IN ('OPEN', 'RESOLVED', 'DEFERRED'))
);

-- 5. Citations Table
-- Stores citations and data tokens within documents
CREATE TABLE IF NOT EXISTS doc_citations (
  cite_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id UUID NOT NULL REFERENCES doc_sections(section_id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  anchor JSONB NOT NULL, -- Position/location in document
  source TEXT NOT NULL, -- Source reference (e.g., study ID, protocol number)
  source_type TEXT, -- STUDY, PROTOCOL, LITERATURE, GUIDANCE, etc.
  payload JSONB, -- Resolved citation data
  is_valid BOOLEAN DEFAULT TRUE,
  validation_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 6. Guidance Cache Table
-- Caches regulatory guidance for sections by region
CREATE TABLE IF NOT EXISTS doc_guidance_cache (
  guide_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL,
  section_code TEXT NOT NULL, -- e.g., "3.2.S.1"
  region TEXT NOT NULL, -- FDA, EMA, PMDA, etc.
  guidance_md TEXT, -- Markdown formatted guidance
  deficiencies JSONB DEFAULT '[]', -- Array of common deficiency objects
  source_documents JSONB DEFAULT '[]', -- References to source guidance documents
  confidence_score NUMERIC(3,2), -- AI confidence score if applicable
  expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(tenant_id, section_code, region)
);

-- Additional Supporting Tables

-- 7. Document Templates Table
-- Stores reusable document templates
CREATE TABLE IF NOT EXISTS doc_templates (
  template_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  module TEXT NOT NULL,
  structure JSONB NOT NULL, -- Template structure definition
  is_default BOOLEAN DEFAULT FALSE,
  created_by TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- 8. Document Collaborators Table
-- Tracks who has access to documents
CREATE TABLE IF NOT EXISTS doc_collaborators (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES doc_documents(doc_id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'VIEWER', -- VIEWER, EDITOR, REVIEWER, OWNER
  permissions JSONB DEFAULT '{}', -- Fine-grained permissions
  invited_by TEXT,
  joined_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  last_accessed_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(doc_id, user_id),
  CONSTRAINT collaborator_role_check CHECK (role IN ('VIEWER', 'EDITOR', 'REVIEWER', 'OWNER'))
);

-- 9. Document Activity Log
-- Audit trail for all document activities
CREATE TABLE IF NOT EXISTS doc_activity_log (
  activity_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_id UUID NOT NULL REFERENCES doc_documents(doc_id) ON DELETE CASCADE,
  tenant_id INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  action TEXT NOT NULL, -- VIEW, EDIT, COMMENT, APPROVE, etc.
  target_type TEXT, -- DOCUMENT, SECTION, COMMENT, etc.
  target_id UUID,
  details JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- INDEXES FOR PERFORMANCE

-- Indexes for doc_documents
CREATE INDEX IF NOT EXISTS idx_doc_documents_tenant ON doc_documents(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_documents_status ON doc_documents(status);
CREATE INDEX IF NOT EXISTS idx_doc_documents_module ON doc_documents(module);
CREATE INDEX IF NOT EXISTS idx_doc_documents_created_at ON doc_documents(created_at DESC);

-- Indexes for doc_sections
CREATE INDEX IF NOT EXISTS idx_doc_sections_doc ON doc_sections(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_sections_tenant ON doc_sections(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_sections_code ON doc_sections(code);
CREATE INDEX IF NOT EXISTS idx_doc_sections_parent ON doc_sections(parent_section_id);
CREATE INDEX IF NOT EXISTS idx_doc_sections_order ON doc_sections(doc_id, order_idx);

-- Indexes for doc_revisions
CREATE INDEX IF NOT EXISTS idx_doc_revisions_section ON doc_revisions(section_id);
CREATE INDEX IF NOT EXISTS idx_doc_revisions_tenant ON doc_revisions(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_revisions_author ON doc_revisions(author);
CREATE INDEX IF NOT EXISTS idx_doc_revisions_created ON doc_revisions(created_at DESC);

-- Indexes for doc_comments
CREATE INDEX IF NOT EXISTS idx_doc_comments_section ON doc_comments(section_id);
CREATE INDEX IF NOT EXISTS idx_doc_comments_tenant ON doc_comments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_comments_status ON doc_comments(status);
CREATE INDEX IF NOT EXISTS idx_doc_comments_author ON doc_comments(author);
CREATE INDEX IF NOT EXISTS idx_doc_comments_parent ON doc_comments(parent_comment_id);

-- Indexes for doc_citations
CREATE INDEX IF NOT EXISTS idx_doc_citations_section ON doc_citations(section_id);
CREATE INDEX IF NOT EXISTS idx_doc_citations_tenant ON doc_citations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_citations_source ON doc_citations(source);
CREATE INDEX IF NOT EXISTS idx_doc_citations_type ON doc_citations(source_type);

-- Indexes for doc_guidance_cache
CREATE INDEX IF NOT EXISTS idx_doc_guidance_cache_tenant ON doc_guidance_cache(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_guidance_cache_code ON doc_guidance_cache(section_code);
CREATE INDEX IF NOT EXISTS idx_doc_guidance_cache_region ON doc_guidance_cache(region);
CREATE INDEX IF NOT EXISTS idx_doc_guidance_cache_expires ON doc_guidance_cache(expires_at);

-- Indexes for doc_templates
CREATE INDEX IF NOT EXISTS idx_doc_templates_tenant ON doc_templates(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_templates_module ON doc_templates(module);

-- Indexes for doc_collaborators
CREATE INDEX IF NOT EXISTS idx_doc_collaborators_doc ON doc_collaborators(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_collaborators_tenant ON doc_collaborators(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_collaborators_user ON doc_collaborators(user_id);

-- Indexes for doc_activity_log
CREATE INDEX IF NOT EXISTS idx_doc_activity_log_doc ON doc_activity_log(doc_id);
CREATE INDEX IF NOT EXISTS idx_doc_activity_log_tenant ON doc_activity_log(tenant_id);
CREATE INDEX IF NOT EXISTS idx_doc_activity_log_user ON doc_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_doc_activity_log_created ON doc_activity_log(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_activity_log_action ON doc_activity_log(action);

-- Full-text search indexes for content searching
CREATE INDEX IF NOT EXISTS idx_doc_sections_content_search ON doc_sections USING GIN (content);
CREATE INDEX IF NOT EXISTS idx_doc_documents_title_search ON doc_documents USING GIN (to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_doc_sections_title_search ON doc_sections USING GIN (to_tsvector('english', title));

-- Composite indexes for common queries
CREATE INDEX IF NOT EXISTS idx_doc_sections_composite ON doc_sections(doc_id, code, order_idx);
CREATE INDEX IF NOT EXISTS idx_doc_comments_composite ON doc_comments(section_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_doc_revisions_composite ON doc_revisions(section_id, version_number DESC);

-- TRIGGERS FOR AUTOMATIC TIMESTAMP UPDATES

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for doc_documents
CREATE TRIGGER update_doc_documents_updated_at BEFORE UPDATE ON doc_documents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for doc_sections
CREATE TRIGGER update_doc_sections_updated_at BEFORE UPDATE ON doc_sections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for doc_comments
CREATE TRIGGER update_doc_comments_updated_at BEFORE UPDATE ON doc_comments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for doc_citations
CREATE TRIGGER update_doc_citations_updated_at BEFORE UPDATE ON doc_citations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for doc_guidance_cache
CREATE TRIGGER update_doc_guidance_cache_updated_at BEFORE UPDATE ON doc_guidance_cache
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger for doc_templates
CREATE TRIGGER update_doc_templates_updated_at BEFORE UPDATE ON doc_templates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- FUNCTION TO AUTOMATICALLY INCREMENT VERSION NUMBER
CREATE OR REPLACE FUNCTION increment_revision_version()
RETURNS TRIGGER AS $$
DECLARE
    max_version INTEGER;
BEGIN
    SELECT COALESCE(MAX(version_number), 0) INTO max_version
    FROM doc_revisions
    WHERE section_id = NEW.section_id;
    
    NEW.version_number = max_version + 1;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-increment version number
CREATE TRIGGER set_revision_version BEFORE INSERT ON doc_revisions
    FOR EACH ROW EXECUTE FUNCTION increment_revision_version();

-- FUNCTION TO CREATE REVISION ON SECTION UPDATE
CREATE OR REPLACE FUNCTION create_section_revision()
RETURNS TRIGGER AS $$
BEGIN
    -- Only create revision if content actually changed
    IF OLD.content IS DISTINCT FROM NEW.content THEN
        INSERT INTO doc_revisions (
            section_id,
            tenant_id,
            snapshot,
            diff,
            author,
            change_type
        ) VALUES (
            NEW.section_id,
            NEW.tenant_id,
            NEW.content,
            jsonb_build_object(
                'old', OLD.content,
                'new', NEW.content
            ),
            NEW.updated_by,
            'UPDATE'
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically create revisions
CREATE TRIGGER track_section_changes AFTER UPDATE ON doc_sections
    FOR EACH ROW 
    WHEN (OLD.content IS DISTINCT FROM NEW.content)
    EXECUTE FUNCTION create_section_revision();

-- SAMPLE DATA FOR TESTING (Optional - Comment out in production)
/*
-- Insert sample tenant documents
INSERT INTO doc_documents (tenant_id, title, module, product_code, status, created_by)
VALUES 
    (1, 'Drug Substance Manufacturing Process', 'M3.2.S', 'DRUG001', 'DRAFT', 'system'),
    (1, 'Clinical Study Report - Phase III', 'M5.3.5', 'DRUG001', 'IN_REVIEW', 'system');

-- Insert sample sections
INSERT INTO doc_sections (doc_id, tenant_id, code, title, order_idx, content, updated_by)
SELECT 
    doc_id,
    tenant_id,
    '3.2.S.1',
    'General Information',
    1,
    '{"type": "doc", "content": [{"type": "paragraph", "content": [{"type": "text", "text": "Sample content"}]}]}'::jsonb,
    'system'
FROM doc_documents
WHERE title = 'Drug Substance Manufacturing Process'
LIMIT 1;
*/

-- Add comments to explain the schema
COMMENT ON TABLE doc_documents IS 'Core table storing document metadata and high-level information';
COMMENT ON TABLE doc_sections IS 'Stores individual sections of documents with their content in JSON format';
COMMENT ON TABLE doc_revisions IS 'Comprehensive revision history tracking all changes to document sections';
COMMENT ON TABLE doc_comments IS 'Review comments and discussions on document sections';
COMMENT ON TABLE doc_citations IS 'Citations and data tokens referenced within documents';
COMMENT ON TABLE doc_guidance_cache IS 'Cached regulatory guidance by region and section code';
COMMENT ON TABLE doc_templates IS 'Reusable document templates for different modules';
COMMENT ON TABLE doc_collaborators IS 'Tracks document access and permissions for users';
COMMENT ON TABLE doc_activity_log IS 'Audit trail for all document-related activities';

COMMENT ON COLUMN doc_sections.content IS 'JSON content from rich text editors like Slate, Lexical, or TipTap';
COMMENT ON COLUMN doc_sections.track_changes IS 'Flag to enable track changes mode for this section';
COMMENT ON COLUMN doc_revisions.diff IS 'JSON diff between this revision and the previous one';
COMMENT ON COLUMN doc_comments.anchor IS 'JSON object defining the position/selection for inline comments';
COMMENT ON COLUMN doc_citations.anchor IS 'JSON object defining where in the document this citation appears';
COMMENT ON COLUMN doc_guidance_cache.deficiencies IS 'JSON array of common regulatory deficiencies for this section';