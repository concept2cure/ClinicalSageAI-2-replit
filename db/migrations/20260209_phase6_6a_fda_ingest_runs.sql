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

CREATE INDEX idx_ingest_runs_status    ON predicate.fda_ingest_runs(status);
CREATE INDEX idx_ingest_runs_started   ON predicate.fda_ingest_runs(started_at DESC);
CREATE INDEX idx_ingest_runs_job       ON predicate.fda_ingest_runs(job_name, started_at DESC);

COMMENT ON TABLE predicate.fda_ingest_runs IS
    'Audit log for FDA data ingestion jobs. Every run creates a row so we can prove data freshness and catch silent failures.';
