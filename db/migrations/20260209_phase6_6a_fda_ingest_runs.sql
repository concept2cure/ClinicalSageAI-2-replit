-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Add immutable ingestion-run provenance for FDA predicate universe freshness.
--
-- eCTD/CTD Context:
--   - Module(s): Module 5 (clinical evidence provenance)
--   - Integrity Risk Addressed: stale external evidence and unverifiable ingest history
--
-- Determinism Contract:
--   - Ingestion run metadata must preserve reproducible evidence lineage.
--   - Any hash-impacting ingest contract change requires spec/version bump.
--
-- Notes:
--   - Migration must remain idempotent and append-only where feasible.
-- =============================================================================

-- Migration: Phase 6.6.A — fda_ingest_runs table
-- Tracks every ingestion job execution for audit + freshness proof.
-- Depends on: 20260207_phase6_6a_fda_clearance_universe.sql (predicate schema)

-- ─────────────────────────────────────────────────────────────────────────────
-- Ingestion Run Log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS predicate.fda_ingest_runs (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name            VARCHAR(100) NOT NULL DEFAULT 'ingest_fda_510k',
    status              VARCHAR(30)  NOT NULL DEFAULT 'running'
                        CHECK (status IN ('running', 'completed', 'failed', 'partial')),
    started_at          TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    completed_at        TIMESTAMP WITH TIME ZONE,
    duration_seconds    DECIMAL(10, 2),

    -- Counters
    clearances_processed  INT NOT NULL DEFAULT 0,
    clearances_upserted   INT NOT NULL DEFAULT 0,
    signals_processed     INT NOT NULL DEFAULT 0,
    signals_upserted      INT NOT NULL DEFAULT 0,
    errors_count          INT NOT NULL DEFAULT 0,
    errors_detail         JSONB DEFAULT '[]'::jsonb,

    -- Provenance
    product_codes_filter  TEXT[],          -- NULL = all codes
    max_clearances_limit  INT,
    triggered_by          VARCHAR(100) DEFAULT 'manual',  -- 'manual', 'cron', 'api'
    run_fingerprint       VARCHAR(64),    -- SHA-256 of params for dedup

    -- Audit
    created_at            TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ingest_runs_status  ON predicate.fda_ingest_runs(status);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_started ON predicate.fda_ingest_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_ingest_runs_job     ON predicate.fda_ingest_runs(job_name, started_at DESC);

COMMENT ON TABLE predicate.fda_ingest_runs IS
    'Audit log for FDA data ingestion jobs. Every run creates a row so we can prove data freshness and catch silent failures.';
