-- ============================================================================
-- AnA Document Formatting — template document-type tags
-- Adds c2c_template_specs.doc_types: the regulatory document types a template
-- applies to (e.g. ["CTD","eCTD","NDA"], ["510(k)","eSTAR"], ["CSR"]). Surfaced
-- by GET /api/c2c/templates and rendered as chips on the template library.
--
-- Self-contained and idempotent: recreates c2c_template_specs IF NOT EXISTS
-- (mirrors 20260531_template_specs.sql, a no-op where the table already exists)
-- before adding the column, so it applies cleanly on prod, a Neon preview
-- branch that predates the base table, or a bare CI DB. Additive/non-destructive.
-- ============================================================================

BEGIN;

-- Base table (no-op where 20260531_template_specs.sql already created it).
CREATE TABLE IF NOT EXISTS c2c_template_specs (
  id                    text        PRIMARY KEY,                 -- tpl_<uuid>
  org_id                integer     NOT NULL,
  project_id            text,                                    -- NULL = org-wide
  name                  text        NOT NULL,
  description           text,
  source_file_name      text,
  source_file_type      text,
  spec                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence numeric(4,3),
  extraction_warnings   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  verified              boolean     NOT NULL DEFAULT false,
  is_active             boolean     NOT NULL DEFAULT true,
  created_by            integer,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT c2c_template_specs_source_type_check
    CHECK (source_file_type IS NULL OR source_file_type IN ('docx', 'pdf'))
);

CREATE INDEX IF NOT EXISTS c2c_template_specs_org_idx     ON c2c_template_specs (org_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS c2c_template_specs_project_idx ON c2c_template_specs (project_id) WHERE project_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS c2c_template_specs_created_idx ON c2c_template_specs (created_at DESC);

-- The new column.
ALTER TABLE c2c_template_specs
  ADD COLUMN IF NOT EXISTS doc_types jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
