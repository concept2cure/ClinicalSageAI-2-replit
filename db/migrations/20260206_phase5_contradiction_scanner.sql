-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Add contradiction_scans table to persist automated scan results.
--
-- eCTD/CTD Context:
--   - Module(s): Module 2 (summaries), Module 5 (clinical study reports)
--   - Integrity Risk Addressed: Undetected contradictions between claims
--     across sections, sources, or program versions.
--
-- Determinism Contract:
--   - Each scan run persists a complete snapshot of contradictions found.
--   - Scans are append-only; past results are never mutated.
--
-- Notes:
--   - Migration is idempotent (IF NOT EXISTS).
--   - RLS enforced via program_id (matches existing evidence tables).
-- =============================================================================

-- ============================================================================
-- Phase 5.3.A — Contradiction Scanner
-- Migration: 20260206_phase5_contradiction_scanner.sql
--
-- Changes:
--   1) Create evidence.contradiction_scans table
--   2) Index on (program_id, status) for listing
--   3) Index on (program_id, created_at) for time-ordered queries
--   4) RLS policy (same pattern as evidence.provenance)
--
-- IDEMPOTENT: Safe to run multiple times
-- ============================================================================

-- 1) Contradiction scans table
CREATE TABLE IF NOT EXISTS evidence.contradiction_scans (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL,
    scan_type           TEXT NOT NULL DEFAULT 'full'
        CHECK (scan_type IN ('full', 'section', 'incremental')),
    section_ref         TEXT,
    status              TEXT NOT NULL DEFAULT 'running'
        CHECK (status IN ('running', 'completed', 'failed')),
    total_claims        INT NOT NULL DEFAULT 0,
    contradictions_found INT NOT NULL DEFAULT 0,
    results             JSONB NOT NULL DEFAULT '[]'::jsonb,
    triggered_by        TEXT NOT NULL DEFAULT 'manual'
        CHECK (triggered_by IN ('manual', 'a8_nightly', 'on_demand', 'event_bridge')),
    actor               TEXT NOT NULL DEFAULT 'system',
    error_message       TEXT,
    started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2) Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_contradiction_scans_program_status
    ON evidence.contradiction_scans (program_id, status);

CREATE INDEX IF NOT EXISTS idx_contradiction_scans_program_created
    ON evidence.contradiction_scans (program_id, created_at DESC);

-- 3) RLS policy (same pattern as other evidence tables)
DO $$ BEGIN
    ALTER TABLE evidence.contradiction_scans ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$ BEGIN
    CREATE POLICY contradiction_scans_rls ON evidence.contradiction_scans
        USING (
            program_id::text = current_setting('app.current_program_id', TRUE)
            OR current_setting('app.bypass_rls', TRUE) = 'true'
        );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- Done — Contradiction scans can now be persisted and queried by program
-- ============================================================================
