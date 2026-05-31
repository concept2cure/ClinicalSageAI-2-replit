-- ============================================================================
-- AnA Document Formatting — client template specs
-- Creates c2c_template_specs: the durable home for renderer-neutral
-- formatting templates AnA extracts from uploads and applies on export.
-- Idempotent; safe on any schema state (Neon preview or bare CI DB).
-- ============================================================================

BEGIN;

-- ── c2c_template_specs ─────────────────────────────────────────────────────
--
-- One row per client formatting template. `spec` is the canonical
-- TemplateSpec jsonb (page geometry, typography, colours, brand/logo,
-- header/footer, table style, detected form fields). A template is org-scoped
-- and optionally project-scoped; when project_id is NULL it applies org-wide.
--
-- Type conventions (match mutation_primitives):
--   id          : text PK, prefix tpl_
--   org_id      : integer, no FK (organizations use integer PKs)
--   created_by  : integer, no FK (users.id is serial; relationship app-enforced)
--   spec        : jsonb (normalized server-side on read AND write)

CREATE TABLE IF NOT EXISTS c2c_template_specs (
  id                    text        PRIMARY KEY,                 -- tpl_<uuid>
  org_id                integer     NOT NULL,
  project_id            text,                                    -- NULL = org-wide
  name                  text        NOT NULL,
  description           text,
  source_file_name      text,                                    -- the upload it was extracted from
  source_file_type      text,                                    -- 'docx' | 'pdf' | NULL (hand-built)
  spec                  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  extraction_confidence numeric(4,3),                            -- 0.000–1.000, NULL if hand-built
  extraction_warnings   jsonb       NOT NULL DEFAULT '[]'::jsonb,
  verified              boolean     NOT NULL DEFAULT false,      -- a human confirmed the extraction
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

COMMIT;
