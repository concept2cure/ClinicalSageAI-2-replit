-- =============================================================================
-- Phase 6.6.A — Predicate Risk Rollups: Pre-aggregated toxicity + family
--               scores for fast UI queries and deterministic scoring.
--
-- System: Lumen Cortex — Predicate Intelligence Layer
-- Compliance: 21 CFR Part 11 (traceability), ALCOA+ principles
--
-- Table:
--   predicate.predicate_risk_rollups — Toxicity + family + MDR aggregates
--
-- Depends on: 20260207_phase6_6a_fda_clearance_universe.sql
-- =============================================================================

BEGIN;

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLE: predicate.predicate_risk_rollups
-- Pre-computed risk aggregates per K-number for instant UI/scoring queries.
-- Refreshed by ingest_safety_signals job.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS predicate.predicate_risk_rollups (
    k_number                TEXT PRIMARY KEY
                            REFERENCES predicate.fda_510k_clearances(k_number),
    toxicity_score          FLOAT NOT NULL DEFAULT 0.0
                            CHECK (toxicity_score BETWEEN 0.0 AND 1.0),
    family_toxicity_score   FLOAT NOT NULL DEFAULT 0.0
                            CHECK (family_toxicity_score BETWEEN 0.0 AND 1.0),
    mdr_rate_bucket         TEXT CHECK (mdr_rate_bucket IN (
                                'NONE', 'LOW', 'MODERATE', 'HIGH', 'CRITICAL'
                            )) DEFAULT 'NONE',
    signal_count            INT NOT NULL DEFAULT 0,
    family_signal_count     INT NOT NULL DEFAULT 0,
    last_signal_date        DATE,
    worst_signal_type       TEXT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rollups_toxicity
    ON predicate.predicate_risk_rollups(toxicity_score DESC);
CREATE INDEX IF NOT EXISTS idx_rollups_family_toxicity
    ON predicate.predicate_risk_rollups(family_toxicity_score DESC);
CREATE INDEX IF NOT EXISTS idx_rollups_mdr_bucket
    ON predicate.predicate_risk_rollups(mdr_rate_bucket);

-- ─────────────────────────────────────────────────────────────────────────────
-- Function: Refresh rollups for a single K-number
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION predicate.refresh_risk_rollup(target_k TEXT)
RETURNS VOID AS $$
DECLARE
    v_toxicity       FLOAT := 0.0;
    v_family_tox     FLOAT := 0.0;
    v_signal_count   INT := 0;
    v_family_sigs    INT := 0;
    v_last_date      DATE;
    v_worst_type     TEXT;
    v_mdr_bucket     TEXT := 'NONE';
BEGIN
    -- Direct toxicity: max severity from signals
    SELECT COALESCE(MAX(severity_score), 0.0),
           COUNT(*),
           MAX(signal_date),
           (SELECT signal_type FROM predicate.predicate_safety_signals
            WHERE k_number = target_k ORDER BY severity_score DESC LIMIT 1)
    INTO v_toxicity, v_signal_count, v_last_date, v_worst_type
    FROM predicate.predicate_safety_signals
    WHERE k_number = target_k;

    -- Family toxicity via lineage (recursive up to depth 5)
    WITH RECURSIVE family AS (
        SELECT parent_k_number AS k, 1 AS depth
        FROM predicate.predicate_lineage WHERE child_k_number = target_k
        UNION ALL
        SELECT pl.parent_k_number, f.depth + 1
        FROM predicate.predicate_lineage pl
        JOIN family f ON f.k = pl.child_k_number
        WHERE f.depth < 5
    )
    SELECT COALESCE(MAX(s.severity_score), 0.0), COUNT(DISTINCT s.id)
    INTO v_family_tox, v_family_sigs
    FROM family f
    JOIN predicate.predicate_safety_signals s ON s.k_number = f.k;

    -- MDR bucket (based on signal count)
    v_mdr_bucket := CASE
        WHEN v_signal_count = 0 THEN 'NONE'
        WHEN v_signal_count <= 2 THEN 'LOW'
        WHEN v_signal_count <= 5 THEN 'MODERATE'
        WHEN v_signal_count <= 10 THEN 'HIGH'
        ELSE 'CRITICAL'
    END;

    INSERT INTO predicate.predicate_risk_rollups
        (k_number, toxicity_score, family_toxicity_score, mdr_rate_bucket,
         signal_count, family_signal_count, last_signal_date, worst_signal_type, updated_at)
    VALUES
        (target_k, v_toxicity, v_family_tox, v_mdr_bucket,
         v_signal_count, v_family_sigs, v_last_date, v_worst_type, now())
    ON CONFLICT (k_number) DO UPDATE SET
        toxicity_score       = EXCLUDED.toxicity_score,
        family_toxicity_score = EXCLUDED.family_toxicity_score,
        mdr_rate_bucket      = EXCLUDED.mdr_rate_bucket,
        signal_count         = EXCLUDED.signal_count,
        family_signal_count  = EXCLUDED.family_signal_count,
        last_signal_date     = EXCLUDED.last_signal_date,
        worst_signal_type    = EXCLUDED.worst_signal_type,
        updated_at           = now();
END;
$$ LANGUAGE plpgsql;

-- ─────────────────────────────────────────────────────────────────────────────
-- Function: Refresh all rollups (batch, called by ingest job)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION predicate.refresh_all_risk_rollups()
RETURNS INT AS $$
DECLARE
    rec RECORD;
    cnt INT := 0;
BEGIN
    FOR rec IN
        SELECT DISTINCT k_number FROM predicate.fda_510k_clearances
    LOOP
        PERFORM predicate.refresh_risk_rollup(rec.k_number);
        cnt := cnt + 1;
    END LOOP;
    RETURN cnt;
END;
$$ LANGUAGE plpgsql;

COMMIT;
