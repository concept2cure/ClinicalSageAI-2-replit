-- Migration: 20260608_submission_leaf_document_type
-- Purpose: Add document_type to submission_leaves so leaf→slot matching in the
--          pathway engines (CTIS/MDR/IVDR/eSTAR/PMDA) and ingestion is sharp
--          (the flagged follow-up). Additive, nullable — no backfill required.

-- Up:
ALTER TABLE public.submission_leaves
  ADD COLUMN IF NOT EXISTS document_type TEXT;

-- Down:
-- ALTER TABLE public.submission_leaves DROP COLUMN IF EXISTS document_type;
