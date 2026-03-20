-- Migration 0007: Tenant Isolation Fixes
-- Fix organizationId type mismatch in unified_workflow tables (text -> integer)
-- This ensures JOIN compatibility with organizations.id (integer) across the platform.

-- Step 1: Drop dependent indexes that reference organization_id
DROP INDEX IF EXISTS idx_unified_docs_org_status;
DROP INDEX IF EXISTS idx_doc_workflows_org_status;

-- Step 2: Alter column type from text to integer
-- USING clause casts existing text values to integer
ALTER TABLE unified_documents
  ALTER COLUMN organization_id TYPE integer USING organization_id::integer;

ALTER TABLE module_documents
  ALTER COLUMN organization_id TYPE integer USING organization_id::integer;

ALTER TABLE workflow_templates
  ALTER COLUMN organization_id TYPE integer USING organization_id::integer;

ALTER TABLE document_workflows
  ALTER COLUMN organization_id TYPE integer USING organization_id::integer;

-- Step 3: Add foreign key constraints to organizations table
ALTER TABLE unified_documents
  ADD CONSTRAINT fk_unified_docs_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE module_documents
  ADD CONSTRAINT fk_module_docs_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE workflow_templates
  ADD CONSTRAINT fk_workflow_templates_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

ALTER TABLE document_workflows
  ADD CONSTRAINT fk_doc_workflows_org
  FOREIGN KEY (organization_id) REFERENCES organizations(id);

-- Step 4: Recreate indexes
CREATE INDEX idx_unified_docs_org_status ON unified_documents(organization_id, status);
CREATE INDEX idx_doc_workflows_org_status ON document_workflows(organization_id, status);

-- Step 5: Fix audit_logs tenant_id to match standard naming (add alias index)
-- The audit_logs table uses tenant_id (integer) which is semantically the same as organization_id.
-- Adding a comment for documentation rather than renaming (to avoid breaking existing queries).
COMMENT ON COLUMN audit_logs.tenant_id IS 'Organization ID (same as organization_id in other tables). Legacy naming retained for backward compatibility.';
