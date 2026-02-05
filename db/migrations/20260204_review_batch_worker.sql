-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure / Lumen Cortex — Shadow FDA Reviewer Batch Processing
-- Purpose: Add worker claim/heartbeat fields + persist batch inputs for async mode
-- Compliance: 21 CFR Part 11 (auditability), tenant isolation (program_id RLS)
-- Determinism Contract: Worker processing must be reproducible from persisted inputs
-- =============================================================================

BEGIN;

-- 0) Safety: ensure schema exists (idempotent)
CREATE SCHEMA IF NOT EXISTS vault;

-- 1) Worker fields on review_batches (idempotent)
ALTER TABLE IF EXISTS vault.review_batches
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'queued',
  ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS heartbeat_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

-- Optional: if you already have status/mode fields, this remains safe.

-- 2) Persisted inputs table (so async has something real to process)
CREATE TABLE IF NOT EXISTS vault.review_batch_inputs (
  program_id UUID NOT NULL,
  batch_id   UUID NOT NULL,
  seq        INTEGER NOT NULL,                 -- stable order within the batch
  filename   TEXT,
  source_type TEXT NOT NULL,                   -- 'docx'|'pdf'|'text'
  doc_id     UUID NOT NULL,
  content_hash CHAR(64) NOT NULL,              -- sha256 of normalized extracted text
  text_content TEXT NOT NULL,                  -- extracted/normalized text ONLY
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (program_id, batch_id, seq),
  FOREIGN KEY (batch_id) REFERENCES vault.review_batches(batch_id) ON DELETE CASCADE
);

-- 3) Indexes for worker claim + polling
-- Claim scans: queued first, then stale running
CREATE INDEX IF NOT EXISTS idx_review_batches_claim
  ON vault.review_batches (program_id, status, heartbeat_at, locked_at);

CREATE INDEX IF NOT EXISTS idx_review_batch_inputs_lookup
  ON vault.review_batch_inputs (program_id, batch_id, seq);

CREATE INDEX IF NOT EXISTS idx_review_batch_inputs_doc
  ON vault.review_batch_inputs (program_id, doc_id);

-- 4) RLS: copy the exact pattern used by review_batches/review_batch_docs
ALTER TABLE vault.review_batch_inputs ENABLE ROW LEVEL SECURITY;

-- IMPORTANT:
-- Use the SAME predicate/function that the existing batch tables use.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='vault' AND tablename='review_batch_inputs' AND policyname='p_review_batch_inputs_select'
  ) THEN
    EXECUTE 'CREATE POLICY p_review_batch_inputs_select ON vault.review_batch_inputs
             FOR SELECT USING (program_id = current_setting(''app.current_program_id'', true)::UUID)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='vault' AND tablename='review_batch_inputs' AND policyname='p_review_batch_inputs_insert'
  ) THEN
    EXECUTE 'CREATE POLICY p_review_batch_inputs_insert ON vault.review_batch_inputs
             FOR INSERT WITH CHECK (program_id = current_setting(''app.current_program_id'', true)::UUID)';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='vault' AND tablename='review_batch_inputs' AND policyname='p_review_batch_inputs_update'
  ) THEN
    EXECUTE 'CREATE POLICY p_review_batch_inputs_update ON vault.review_batch_inputs
             FOR UPDATE USING (program_id = current_setting(''app.current_program_id'', true)::UUID)
             WITH CHECK (program_id = current_setting(''app.current_program_id'', true)::UUID)';
  END IF;
END $$;

COMMIT;
