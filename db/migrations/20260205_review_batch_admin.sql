-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure / Lumen Cortex — A8-5 Multi-Worker Safety
-- Purpose: Add claimed_by for worker attribution + failed_reason for final status
-- Compliance: 21 CFR Part 11 (traceability), operational visibility
-- =============================================================================

BEGIN;

-- 1) Track which worker claimed the batch (for debugging multi-worker)
ALTER TABLE IF EXISTS vault.review_batches
  ADD COLUMN IF NOT EXISTS claimed_by TEXT;

-- 2) Separate field for final failure reason (distinct from transient last_error)
ALTER TABLE IF EXISTS vault.review_batches
  ADD COLUMN IF NOT EXISTS failed_reason TEXT;

-- 3) Index for admin queries by claimed_by (optional, helps debugging)
CREATE INDEX IF NOT EXISTS idx_review_batches_claimed_by
  ON vault.review_batches (claimed_by)
  WHERE claimed_by IS NOT NULL;

-- 4) Partial index for finding failed batches (admin retry workflow)
CREATE INDEX IF NOT EXISTS idx_review_batches_failed
  ON vault.review_batches (program_id, created_at DESC)
  WHERE status = 'failed';

COMMIT;
