/**
 * Migration: Document Workflow System
 *
 * This migration creates the tables for the unified document workflow system.
 */

import { sql } from 'drizzle-orm';

export async function up(db) {
  // Create enums
  await db.execute(sql`
    CREATE TYPE document_status AS ENUM (
      'draft',
      'in_review',
      'approved',
      'published',
      'archived',
      'rejected'
    );
    
    CREATE TYPE workflow_status AS ENUM (
      'active',
      'completed',
      'rejected',
      'cancelled'
    );
    
    CREATE TYPE approval_status AS ENUM (
      'pending',
      'approved',
      'rejected'
    );
    
    CREATE TYPE approval_type AS ENUM (
      'user',
      'role',
      'group'
    );
    
    CREATE TYPE module_type AS ENUM (
      'cmc',
      'cer',
      'study',
      'ectd',
      '510k',
      'vault'
    );
  `);

  // Create unified_documents table
  await db.execute(sql`
    CREATE TABLE unified_documents (
      id SERIAL PRIMARY KEY,
      title TEXT NOT NULL,
      document_type TEXT NOT NULL,
      status document_status NOT NULL DEFAULT 'draft',
      created_by TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_by TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      organization_id TEXT NOT NULL,
      latest_version INTEGER NOT NULL DEFAULT 1,
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `);

  // Create document_versions table
  await db.execute(sql`
    CREATE TABLE document_versions (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      version INTEGER NOT NULL,
      content JSONB,
      created_by TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      comments TEXT,
      UNIQUE(document_id, version)
    );
  `);

  // Create module_documents table
  await db.execute(sql`
    CREATE TABLE module_documents (
      id SERIAL PRIMARY KEY,
      unified_document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      module_type module_type NOT NULL,
      original_id TEXT NOT NULL,
      organization_id TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb,
      UNIQUE(module_type, original_id, organization_id)
    );
  `);

  // Create document_audit_logs table
  await db.execute(sql`
    CREATE TABLE document_audit_logs (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      performed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      details JSONB DEFAULT '{}'::jsonb
    );
  `);

  // Create workflow_templates table
  await db.execute(sql`
    CREATE TABLE workflow_templates (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      module_type module_type NOT NULL,
      organization_id TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_by TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      document_types TEXT[] NOT NULL DEFAULT '{}',
      default_for_types TEXT[] NOT NULL DEFAULT '{}'
    );
  `);

  // Create workflow_steps table
  await db.execute(sql`
    CREATE TABLE workflow_steps (
      id SERIAL PRIMARY KEY,
      template_id INTEGER NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      description TEXT,
      "order" INTEGER NOT NULL,
      approver_type approval_type NOT NULL,
      approver_ids TEXT[] NOT NULL,
      required_actions TEXT[] NOT NULL DEFAULT '{"review", "comment"}'
    );
  `);

  // Create document_workflows table
  await db.execute(sql`
    CREATE TABLE document_workflows (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      template_id INTEGER NOT NULL REFERENCES workflow_templates(id),
      status workflow_status NOT NULL DEFAULT 'active',
      current_step INTEGER NOT NULL DEFAULT 1,
      started_by TEXT NOT NULL,
      started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      completed_by TEXT,
      completed_at TIMESTAMP WITH TIME ZONE,
      rejected_by TEXT,
      rejected_at TIMESTAMP WITH TIME ZONE,
      organization_id TEXT NOT NULL,
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `);

  // Create workflow_approvals table
  await db.execute(sql`
    CREATE TABLE workflow_approvals (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
      step_id INTEGER NOT NULL REFERENCES workflow_steps(id),
      step_order INTEGER NOT NULL,
      status approval_status NOT NULL DEFAULT 'pending',
      assigned_to TEXT[] NOT NULL,
      assignment_type approval_type NOT NULL,
      required_actions TEXT[] NOT NULL DEFAULT '{"review"}',
      completed_by TEXT,
      completed_at TIMESTAMP WITH TIME ZONE,
      comments TEXT
    );
  `);

  // Create workflow_history table
  await db.execute(sql`
    CREATE TABLE workflow_history (
      id SERIAL PRIMARY KEY,
      workflow_id INTEGER NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
      action TEXT NOT NULL,
      performed_by TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      details JSONB DEFAULT '{}'::jsonb
    );
  `);

  // Create document_attachments table
  await db.execute(sql`
    CREATE TABLE document_attachments (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      file_name TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      file_path TEXT NOT NULL,
      uploaded_by TEXT NOT NULL,
      uploaded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      description TEXT,
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `);

  // Create document_comments table
  await db.execute(sql`
    CREATE TABLE document_comments (
      id SERIAL PRIMARY KEY,
      document_id INTEGER NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
      version_id INTEGER REFERENCES document_versions(id),
      content TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMP WITH TIME ZONE,
      is_resolved BOOLEAN NOT NULL DEFAULT FALSE,
      resolved_by TEXT,
      resolved_at TIMESTAMP WITH TIME ZONE,
      parent_id INTEGER REFERENCES document_comments(id),
      metadata JSONB DEFAULT '{}'::jsonb
    );
  `);

  // Create indexes
  await db.execute(sql`
    CREATE INDEX idx_unified_docs_org ON unified_documents(organization_id);
    CREATE INDEX idx_unified_docs_status ON unified_documents(status);
    CREATE INDEX idx_unified_docs_type ON unified_documents(document_type);
    
    CREATE INDEX idx_module_docs_module ON module_documents(module_type);
    CREATE INDEX idx_module_docs_org ON module_documents(organization_id);
    
    CREATE INDEX idx_workflow_templates_module ON workflow_templates(module_type);
    CREATE INDEX idx_workflow_templates_org ON workflow_templates(organization_id);
    CREATE INDEX idx_workflow_templates_active ON workflow_templates(is_active);
    
    CREATE INDEX idx_document_workflows_doc ON document_workflows(document_id);
    CREATE INDEX idx_document_workflows_status ON document_workflows(status);
    CREATE INDEX idx_document_workflows_org ON document_workflows(organization_id);
    
    CREATE INDEX idx_workflow_approvals_workflow ON workflow_approvals(workflow_id);
    CREATE INDEX idx_workflow_approvals_status ON workflow_approvals(status);
    
    CREATE INDEX idx_workflow_history_workflow ON workflow_history(workflow_id);
    CREATE INDEX idx_document_comments_doc ON document_comments(document_id);
    CREATE INDEX idx_document_comments_version ON document_comments(version_id);
    CREATE INDEX idx_document_comments_parent ON document_comments(parent_id);
  `);
}

export async function down(db) {
  // Drop tables in reverse order of creation
  await db.execute(sql`
    DROP TABLE IF EXISTS document_comments;
    DROP TABLE IF EXISTS document_attachments;
    DROP TABLE IF EXISTS workflow_history;
    DROP TABLE IF EXISTS workflow_approvals;
    DROP TABLE IF EXISTS document_workflows;
    DROP TABLE IF EXISTS workflow_steps;
    DROP TABLE IF EXISTS workflow_templates;
    DROP TABLE IF EXISTS document_audit_logs;
    DROP TABLE IF EXISTS module_documents;
    DROP TABLE IF EXISTS document_versions;
    DROP TABLE IF EXISTS unified_documents;
    
    DROP TYPE IF EXISTS module_type;
    DROP TYPE IF EXISTS approval_type;
    DROP TYPE IF EXISTS approval_status;
    DROP TYPE IF EXISTS workflow_status;
    DROP TYPE IF EXISTS document_status;
  `);
}
