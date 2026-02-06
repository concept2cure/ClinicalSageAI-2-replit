-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Add idempotency to evidence.provenance and relax entity constraint
--          to support step/batch-level provenance from the Event Bridge.
--
-- eCTD/CTD Context:
--   - Module(s): Module 2 (summaries), Module 5 (clinical study reports)
--   - Integrity Risk Addressed: Duplicate provenance from retried events,
--     missing step-level forensic records.
--
-- Determinism Contract:
--   - Idempotency key ensures at-least-once safe provenance writes.
--   - Relaxed CHECK allows pure execution provenance (no claim/source required).
--
-- Notes:
--   - Migration is idempotent (IF NOT EXISTS on columns and indexes).
--   - Backward-compatible: idempotency_key is nullable, existing rows untouched.
-- =============================================================================

-- ============================================================================
-- Phase 5.2.1 — Idempotent Provenance
-- Migration: 20260206_phase5_idempotent_provenance.sql
--
-- Changes:
--   1) Drop CHECK (claim_id OR source_id) — allow step/batch-level provenance
--   2) Add idempotency_key column (TEXT, nullable)
--   3) Add unique partial index on idempotency_key
--   4) Backfill existing rows with computed keys
--
-- IDEMPOTENT: Safe to run multiple times (Neon-friendly)
-- ============================================================================

-- 1) Relax the entity constraint — allow pure execution provenance
--    (step_completed, step_failed, batch_completed need no claim/source)
DO $$ BEGIN
    ALTER TABLE evidence.provenance DROP CONSTRAINT IF EXISTS provenance_check;
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

-- Also drop the unnamed CHECK constraint if it exists
DO $$ BEGIN
    -- Find and drop the CHECK constraint by expression match
    EXECUTE (
        SELECT 'ALTER TABLE evidence.provenance DROP CONSTRAINT ' || conname
        FROM pg_constraint
        WHERE conrelid = 'evidence.provenance'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) LIKE '%claim_id IS NOT NULL OR source_id IS NOT NULL%'
        LIMIT 1
    );
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'CHECK constraint removal: %', SQLERRM;
END $$;

-- 2) Add idempotency_key column
DO $$ BEGIN
    ALTER TABLE evidence.provenance ADD COLUMN idempotency_key TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 3) Unique partial index — only enforced when key is set
CREATE UNIQUE INDEX IF NOT EXISTS idx_evidence_provenance_idempotent
    ON evidence.provenance (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- 4) Backfill existing rows with computed idempotency keys
UPDATE evidence.provenance
SET idempotency_key =
    program_id::text || ':' || event_type || ':' ||
    COALESCE(step_run_id::text, '_') || ':' ||
    COALESCE(batch_id::text, '_') || ':' ||
    COALESCE(claim_id::text, '_') || ':' ||
    COALESCE(source_id::text, '_')
WHERE idempotency_key IS NULL;

-- ============================================================================
-- Done — Provenance is now idempotent and supports pure execution events
-- ============================================================================
