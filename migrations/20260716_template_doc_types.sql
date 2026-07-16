-- ============================================================================
-- AnA Document Formatting — template document-type tags
-- Adds c2c_template_specs.doc_types: the regulatory document types a template
-- applies to (e.g. ["CTD","eCTD","NDA"], ["510(k)","eSTAR"], ["CSR"]). Surfaced
-- by GET /api/c2c/templates and rendered as chips on the template library.
-- Additive, idempotent, non-destructive; safe on any schema state.
-- ============================================================================

BEGIN;

ALTER TABLE c2c_template_specs
  ADD COLUMN IF NOT EXISTS doc_types jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMIT;
