-- Migration: A8-6 Ops Control Plane
-- Adds cancel columns for batch operations control
-- Date: 2026-02-06

-- =============================================================================
-- Add cancel columns to vault.review_batches
-- =============================================================================

-- Cancel requested timestamp (NULL = not cancelled)
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS cancel_requested_at TIMESTAMPTZ NULL;

-- Cancel reason (user/admin provided)
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS cancel_reason TEXT NULL;

-- Who requested the cancel (user/worker/admin)
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS cancel_requested_by TEXT NULL;

-- =============================================================================
-- Indexes for cancel operations
-- =============================================================================

-- Index for finding batches with pending cancellation
CREATE INDEX IF NOT EXISTS idx_review_batches_cancel_requested_at
ON vault.review_batches (program_id, cancel_requested_at)
WHERE cancel_requested_at IS NOT NULL;

-- Index for listing batches by status (dashboard/triage)
CREATE INDEX IF NOT EXISTS idx_review_batches_program_status_created
ON vault.review_batches (program_id, status, created_at DESC);

-- =============================================================================
-- Comments
-- =============================================================================

COMMENT ON COLUMN vault.review_batches.cancel_requested_at IS 'Timestamp when cancellation was requested (NULL = not cancelled)';
COMMENT ON COLUMN vault.review_batches.cancel_reason IS 'User/admin provided reason for cancellation';
COMMENT ON COLUMN vault.review_batches.cancel_requested_by IS 'Identity of who requested the cancellation (user email, admin, worker_id)';

-- Note: status column already supports text values including 'cancelled'
-- No enum changes needed
