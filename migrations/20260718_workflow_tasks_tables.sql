-- Unified document-workflow store — backs the Tasks / Approvals surface.
--
-- Full Drizzle schema for these tables exists in shared/schema/unified_workflow.ts
-- and is used via the ORM (approval-workflows routes) + the demo seed
-- (scripts/seed/ga-demo.d/20-tasks-approvals.mjs), but the module is not in the
-- drizzle-kit push barrel, so `push` never created the tables and the surface
-- fell back to fixtures. This migration transcribes that Drizzle schema exactly
-- (columns, enums, FKs, indexes) so the ORM + seed + routes work unchanged.

-- Enums (guarded — tolerate pre-existing types from other schema modules).
DO $$ BEGIN CREATE TYPE document_status AS ENUM ('draft','in_review','approved','published','archived','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE workflow_status AS ENUM ('active','completed','rejected','cancelled'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE approval_status AS ENUM ('pending','approved','rejected'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE approval_type AS ENUM ('user','role','group'); EXCEPTION WHEN duplicate_object THEN null; END $$;
DO $$ BEGIN CREATE TYPE module_type AS ENUM ('cmc','cer','study','ectd','510k','vault'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS unified_documents (
  id              serial PRIMARY KEY,
  title           text NOT NULL,
  document_type   text NOT NULL,
  status          document_status NOT NULL DEFAULT 'draft',
  created_by      text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_by      text,
  updated_at      timestamptz DEFAULT now(),
  organization_id integer NOT NULL,
  latest_version  integer NOT NULL DEFAULT 1,
  metadata        json DEFAULT '{}'::json
);
CREATE INDEX IF NOT EXISTS idx_unified_docs_org_status ON unified_documents (organization_id, status);

CREATE TABLE IF NOT EXISTS workflow_document_versions (
  id          serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  version     integer NOT NULL,
  content     json,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  comments    text
);
CREATE UNIQUE INDEX IF NOT EXISTS wf_doc_version_idx ON workflow_document_versions (document_id, version);

CREATE TABLE IF NOT EXISTS module_documents (
  id                  serial PRIMARY KEY,
  unified_document_id integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  module_type         module_type NOT NULL,
  original_id         text NOT NULL,
  organization_id     integer NOT NULL,
  metadata            json DEFAULT '{}'::json
);
CREATE UNIQUE INDEX IF NOT EXISTS module_doc_idx ON module_documents (module_type, original_id, organization_id);

CREATE TABLE IF NOT EXISTS document_audit_logs (
  id           serial PRIMARY KEY,
  document_id  integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  action       text NOT NULL,
  performed_by text NOT NULL,
  performed_at timestamptz NOT NULL DEFAULT now(),
  details      json DEFAULT '{}'::json
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_doc_time ON document_audit_logs (document_id, performed_at);

CREATE TABLE IF NOT EXISTS workflow_templates (
  id                serial PRIMARY KEY,
  name              text NOT NULL,
  description       text,
  module_type       module_type NOT NULL,
  organization_id   integer NOT NULL,
  created_by        text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_by        text,
  updated_at        timestamptz DEFAULT now(),
  is_active         boolean NOT NULL DEFAULT true,
  document_types    text[] NOT NULL DEFAULT '{}',
  default_for_types text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS workflow_steps (
  id               serial PRIMARY KEY,
  template_id      integer NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  name             text NOT NULL,
  description      text,
  "order"          integer NOT NULL,
  approver_type    approval_type NOT NULL,
  approver_ids     text[] NOT NULL,
  required_actions text[] NOT NULL DEFAULT '{review,comment}'
);

CREATE TABLE IF NOT EXISTS document_workflows (
  id              serial PRIMARY KEY,
  document_id     integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  template_id     integer NOT NULL REFERENCES workflow_templates(id),
  status          workflow_status NOT NULL DEFAULT 'active',
  current_step    integer NOT NULL DEFAULT 1,
  started_by      text NOT NULL,
  started_at      timestamptz NOT NULL DEFAULT now(),
  completed_by    text,
  completed_at    timestamptz,
  rejected_by     text,
  rejected_at     timestamptz,
  organization_id integer NOT NULL,
  metadata        json DEFAULT '{}'::json
);
CREATE INDEX IF NOT EXISTS idx_doc_workflows_org_status ON document_workflows (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_doc_workflows_document_id ON document_workflows (document_id);

CREATE TABLE IF NOT EXISTS workflow_approvals (
  id               serial PRIMARY KEY,
  workflow_id      integer NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
  step_id          integer NOT NULL REFERENCES workflow_steps(id),
  step_order       integer NOT NULL,
  status           approval_status NOT NULL DEFAULT 'pending',
  assigned_to      text[] NOT NULL,
  assignment_type  approval_type NOT NULL,
  required_actions text[] NOT NULL DEFAULT '{review}',
  completed_by     text,
  completed_at     timestamptz,
  comments         text
);
CREATE INDEX IF NOT EXISTS idx_wf_approvals_workflow_status ON workflow_approvals (workflow_id, status);

CREATE TABLE IF NOT EXISTS workflow_history (
  id           serial PRIMARY KEY,
  workflow_id  integer NOT NULL REFERENCES document_workflows(id) ON DELETE CASCADE,
  action       text NOT NULL,
  performed_by text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  details      json DEFAULT '{}'::json
);

CREATE TABLE IF NOT EXISTS document_attachments (
  id          serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  file_name   text NOT NULL,
  file_type   text NOT NULL,
  file_size   integer NOT NULL,
  file_path   text NOT NULL,
  uploaded_by text NOT NULL,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  description text,
  metadata    json DEFAULT '{}'::json
);

CREATE TABLE IF NOT EXISTS document_comments (
  id          serial PRIMARY KEY,
  document_id integer NOT NULL REFERENCES unified_documents(id) ON DELETE CASCADE,
  version_id  integer REFERENCES workflow_document_versions(id),
  content     text NOT NULL,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_by text,
  resolved_at timestamptz,
  parent_id   integer REFERENCES document_comments(id),
  metadata    json DEFAULT '{}'::json
);
