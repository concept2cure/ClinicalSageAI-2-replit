-- =============================================================================
-- AnA Growth Mindset extensions — calibration, replay, decay
--
-- Three enhancements to the regulatory-intelligence layer that close gaps
-- the v1 build deliberately left to v2:
--
--   1. Confidence calibration.  Per-(agency × doc_type × intent) buckets
--      that compute Brier / Platt-scaling parameters from observed AnA
--      confidence vs actual outcomes. Lets us re-report a calibrated
--      probability instead of the raw model output.
--
--   2. Counterfactual replay.   When a failure_pattern is promoted, replay
--      it against in-flight drafts and persist proactive warnings so users
--      see a known-bad pattern *before* the user notices the mistake.
--
--   3. Pattern decay + contradictions.  Failure patterns lose confidence
--      over time (regulatory guidance changes); when a new pattern
--      reverses an existing one, the older row is marked superseded with
--      an audit trail.
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS intelligence;

-- ─────────────────────────────────────────────────────────────────────────────
-- Calibration buckets — running statistics over (agency, doc_type, intent)
-- tuples. We use Platt scaling: fit a logistic curve (a, b) to map raw
-- ana_confidence → calibrated probability. Brier + log-loss are stored for
-- audit and for the model-info surface.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.calibration_buckets (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agency               TEXT NOT NULL,
    document_type        TEXT NOT NULL,
    intent_class         TEXT NOT NULL,

    sample_size          INTEGER NOT NULL,
    positive_count       INTEGER NOT NULL,        -- failures (anything not accepted)
    mean_raw_confidence  DOUBLE PRECISION,        -- average AnA-reported confidence
    mean_observed        DOUBLE PRECISION,        -- average failure rate (0..1)

    -- Platt scaling: calibrated = sigmoid(a + b * raw)
    platt_a              DOUBLE PRECISION NOT NULL DEFAULT 0,
    platt_b              DOUBLE PRECISION NOT NULL DEFAULT 1,

    brier                DOUBLE PRECISION,
    log_loss             DOUBLE PRECISION,

    recomputed_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (agency, document_type, intent_class)
);

CREATE INDEX IF NOT EXISTS idx_calib_lookup
    ON intelligence.calibration_buckets(agency, document_type, intent_class);

-- ─────────────────────────────────────────────────────────────────────────────
-- Pattern warnings — proactive flags surfaced on in-flight drafts.
--
-- Written by the counterfactual-replay job when a freshly-promoted pattern
-- matches an existing draft's (agency × doc_type × intent) tuple. Cleared
-- when the user resolves the warning (accept, dismiss, fixed). The
-- `resolution` column doubles as a feedback signal: dismissed warnings
-- demote their underlying pattern.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.pattern_warnings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     BIGINT NOT NULL,
    project_id          BIGINT,
    artifact_id         TEXT,
    pattern_id          UUID NOT NULL,            -- intelligence.failure_patterns(id)
    pattern_fingerprint TEXT NOT NULL,
    severity            TEXT NOT NULL DEFAULT 'medium', -- 'low' | 'medium' | 'high' (derived from pattern confidence)
    status              TEXT NOT NULL DEFAULT 'open',   -- 'open' | 'fixed' | 'dismissed' | 'expired'

    -- Snapshot of the suggestion at warning time so changes to the pattern
    -- don't silently mutate the warning message.
    suggested_correction TEXT NOT NULL,
    confidence_at_warning DOUBLE PRECISION NOT NULL,

    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at         TIMESTAMPTZ,
    resolution          TEXT                      -- free text on resolution
);

-- Expression-based unique index so re-running replay against the same
-- (org, project, artifact, pattern) tuple is a no-op even when project_id
-- or artifact_id is NULL. Postgres NULLs do not equal each other in a
-- plain UNIQUE; the COALESCE keys make NULL behave as a sentinel.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pattern_warnings_dedup
    ON intelligence.pattern_warnings
        (organization_id, COALESCE(project_id, -1), COALESCE(artifact_id, ''), pattern_id);

CREATE INDEX IF NOT EXISTS idx_pw_org_status ON intelligence.pattern_warnings(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_pw_project    ON intelligence.pattern_warnings(project_id) WHERE status = 'open';
CREATE INDEX IF NOT EXISTS idx_pw_pattern    ON intelligence.pattern_warnings(pattern_id);

-- ─────────────────────────────────────────────────────────────────────────────
-- Failure-pattern decay metadata. Added as new columns rather than a sidecar
-- table so the existing read path keeps working unchanged.
--
-- `decayed_confidence` is a derived view: confidence × decay_factor where
-- decay_factor falls toward zero as time since `last_seen_at` grows.
-- Computed by the decay job and rewritten in place.
--
-- `superseded_by` links to the newer pattern that reversed this one. The
-- read path filters on `status = 'active'`; superseded rows stay queryable
-- for audit but never serve corrections.
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE intelligence.failure_patterns
    ADD COLUMN IF NOT EXISTS decay_factor       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    ADD COLUMN IF NOT EXISTS decayed_confidence DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS last_decay_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS superseded_by      UUID,
    ADD COLUMN IF NOT EXISTS superseded_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS superseded_reason  TEXT;

-- Allow `superseded` as a status; legacy rows stay 'active' or 'curator_disabled'.
-- (The CHECK constraint is intentionally absent on the existing table so we
-- don't have to migrate legacy values — service code is the source of truth
-- for the enum.)

CREATE INDEX IF NOT EXISTS idx_fp_decayed
    ON intelligence.failure_patterns(decayed_confidence DESC) WHERE status = 'active';

-- ─────────────────────────────────────────────────────────────────────────────
-- Pattern contradictions — audit trail of supersession events.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.pattern_contradictions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    older_pattern_id     UUID NOT NULL,
    newer_pattern_id     UUID NOT NULL,
    fingerprint          TEXT NOT NULL,
    older_correction     TEXT NOT NULL,
    newer_correction     TEXT NOT NULL,
    older_last_seen      TIMESTAMPTZ NOT NULL,
    newer_last_seen      TIMESTAMPTZ NOT NULL,
    detected_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    detector_version     TEXT NOT NULL,
    UNIQUE (older_pattern_id, newer_pattern_id)
);

CREATE INDEX IF NOT EXISTS idx_pc_fingerprint ON intelligence.pattern_contradictions(fingerprint);
CREATE INDEX IF NOT EXISTS idx_pc_detected    ON intelligence.pattern_contradictions(detected_at DESC);

COMMIT;
