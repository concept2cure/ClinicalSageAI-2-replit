-- A7-6: Batch Runner Hardening Migration
-- Adds heartbeat, progress counters, worker tracking, and stall detection support
-- Author: concept2cure
-- Date: 2026-02-03

BEGIN;

-- ============================================================================
-- Add runner columns to vault.review_batches
-- ============================================================================

-- Timing columns
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS queued_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS started_at timestamptz;

ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS completed_at timestamptz;

ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS heartbeat_at timestamptz;

-- Attempt tracking
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS attempt_count int NOT NULL DEFAULT 0;

-- Worker identification
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS worker_id text;

-- Error tracking
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS last_error text;

-- Progress counters (docs_total may already exist as documents_total)
ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS docs_total int NOT NULL DEFAULT 0;

ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS docs_processed int NOT NULL DEFAULT 0;

ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS docs_succeeded int NOT NULL DEFAULT 0;

ALTER TABLE vault.review_batches
ADD COLUMN IF NOT EXISTS docs_failed int NOT NULL DEFAULT 0;

-- ============================================================================
-- Indexes for efficient queries
-- ============================================================================

-- Index for filtering by program and status (common query pattern)
CREATE INDEX IF NOT EXISTS idx_review_batches_program_status
ON vault.review_batches (program_id, status);

-- Index for sweeper: find stalled jobs by status and heartbeat
CREATE INDEX IF NOT EXISTS idx_review_batches_status_heartbeat
ON vault.review_batches (status, heartbeat_at)
WHERE status = 'running';

-- Unique index for idempotency: (program_id, idempotency_key)
-- This ensures no duplicate batches for same program + idempotency key
CREATE UNIQUE INDEX IF NOT EXISTS idx_review_batches_program_idempotency
ON vault.review_batches (program_id, idempotency_key)
WHERE idempotency_key IS NOT NULL;

-- ============================================================================
-- Migrate existing data
-- ============================================================================

-- Set queued_at from created_at for existing rows if created_at exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'vault'
        AND table_name = 'review_batches'
        AND column_name = 'created_at'
    ) THEN
        UPDATE vault.review_batches
        SET queued_at = created_at
        WHERE queued_at IS NULL OR queued_at = now();
    END IF;
END $$;

-- Sync docs_total with documents_total if it exists
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'vault'
        AND table_name = 'review_batches'
        AND column_name = 'documents_total'
    ) THEN
        UPDATE vault.review_batches
        SET docs_total = documents_total
        WHERE docs_total = 0 AND documents_total > 0;
    END IF;
END $$;

COMMIT;
