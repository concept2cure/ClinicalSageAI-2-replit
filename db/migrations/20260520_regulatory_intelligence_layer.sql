-- =============================================================================
-- Regulatory Intelligence Layer — AnA 1.0 RI
--
-- Closes the submission-outcome feedback loop and turns the federated-learning
-- coordinator on. Three loops the platform was missing:
--
--   1. Outcome → model: extracted features per outcome feed a logistic
--      regression that scores CRL/RTF risk for future drafts.
--   2. Outcome → precedent corpus: new CRLs/RTFs become retrievable precedents
--      for the next sponsor's submission.
--   3. Tenant A's outcome → Tenant B's prior: anonymized feature-bin aggregates
--      with Laplace noise expose cross-tenant rates without leaking rows.
--
-- Tables:
--   intelligence.risk_model_versions    — versioned logistic-regression weights
--   intelligence.outcome_feature_vectors — features extracted from each outcome
--   intelligence.risk_predictions        — every score we emit, for calibration
--   intelligence.network_risk_priors     — DP-anonymized cross-tenant rates
--   intelligence.outcome_precedent_links — outcome → precedent traceability
-- =============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS intelligence;

-- ─────────────────────────────────────────────────────────────────────────────
-- Risk model versions — each retrain writes a new row. `is_active` selects the
-- version used for serving. Weights are stored as a JSONB feature→coefficient
-- map so the feature set can evolve without DDL changes; serving code rejects
-- predictions when the live feature set drifts from the trained one.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.risk_model_versions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target              TEXT NOT NULL,           -- 'rtf' | 'crl' | 'first_cycle_approval'
    algorithm           TEXT NOT NULL DEFAULT 'logistic_regression',
    feature_names       TEXT[] NOT NULL,         -- ordered list, matches weights
    weights             JSONB NOT NULL,          -- { feature_name: coefficient, ...; 'intercept': float }
    sample_size         INTEGER NOT NULL,        -- number of outcomes used to train
    positive_rate       DOUBLE PRECISION,        -- base rate of the target in training set
    log_loss            DOUBLE PRECISION,        -- training log loss
    auc                 DOUBLE PRECISION,        -- training AUC (NULL when sample_size too small)
    calibration_brier   DOUBLE PRECISION,        -- Brier score on holdout
    trained_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    trained_by          TEXT NOT NULL DEFAULT 'system',
    is_active           BOOLEAN NOT NULL DEFAULT FALSE,
    notes               TEXT
);

CREATE INDEX IF NOT EXISTS idx_risk_model_target_active
    ON intelligence.risk_model_versions(target, is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_risk_model_trained_at
    ON intelligence.risk_model_versions(trained_at DESC);

-- Only one active version per target.
CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_model_one_active_per_target
    ON intelligence.risk_model_versions(target) WHERE is_active;

-- ─────────────────────────────────────────────────────────────────────────────
-- Outcome feature vectors — denormalized snapshot of each submission_outcome's
-- features at the time it was processed. Kept separately from the source row
-- so feature engineering can evolve without backfilling the source.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.outcome_feature_vectors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_id          UUID NOT NULL UNIQUE,    -- innovation.submission_outcomes(id)
    organization_id     BIGINT,                  -- tenant scope for filtering/training
    submission_type     TEXT NOT NULL,
    agency              TEXT NOT NULL,
    therapeutic_area    TEXT,                    -- coarse bin: oncology / cns / cardio / metabolic / other
    features            JSONB NOT NULL,          -- { feature_name: numeric_value, ... }
    label_rtf           BOOLEAN NOT NULL,
    label_crl           BOOLEAN NOT NULL,
    label_first_cycle   BOOLEAN NOT NULL,
    extracted_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ofv_submission_type ON intelligence.outcome_feature_vectors(submission_type);
CREATE INDEX IF NOT EXISTS idx_ofv_agency ON intelligence.outcome_feature_vectors(agency);
CREATE INDEX IF NOT EXISTS idx_ofv_therapeutic_area ON intelligence.outcome_feature_vectors(therapeutic_area);
CREATE INDEX IF NOT EXISTS idx_ofv_org ON intelligence.outcome_feature_vectors(organization_id);
CREATE INDEX IF NOT EXISTS idx_ofv_extracted_at ON intelligence.outcome_feature_vectors(extracted_at DESC);

-- ─────────────────────────────────────────────────────────────────────────────
-- Risk predictions — every score we emit. Joins back to the outcome (when one
-- eventually arrives) so we can measure calibration over time. The `observed`
-- columns are NULL until the corresponding submission gets an outcome.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.risk_predictions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id     BIGINT NOT NULL,
    project_id          BIGINT,
    submission_id       UUID,
    model_version_id    UUID REFERENCES intelligence.risk_model_versions(id),
    target              TEXT NOT NULL,
    features            JSONB NOT NULL,
    predicted_prob      DOUBLE PRECISION NOT NULL,
    network_prior_prob  DOUBLE PRECISION,        -- cross-tenant base rate at prediction time
    blend_weight        DOUBLE PRECISION,        -- weight given to local model vs network prior
    rule_based_score    DOUBLE PRECISION,        -- legacy validate-completeness rtfScore
    blended_score       DOUBLE PRECISION,        -- final 0..100 surfaced to UI
    observed_outcome    BOOLEAN,                 -- filled when outcome arrives
    observed_at         TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_risk_pred_org ON intelligence.risk_predictions(organization_id);
CREATE INDEX IF NOT EXISTS idx_risk_pred_project ON intelligence.risk_predictions(project_id);
CREATE INDEX IF NOT EXISTS idx_risk_pred_submission ON intelligence.risk_predictions(submission_id);
CREATE INDEX IF NOT EXISTS idx_risk_pred_unobserved
    ON intelligence.risk_predictions(created_at DESC) WHERE observed_outcome IS NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Network risk priors — DP-anonymized cross-tenant aggregates. A row covers
-- one (target, submission_type, agency, therapeutic_area, completeness_bin)
-- combination and exposes a noised positive rate. `tenant_count` ensures we
-- never publish a row that's effectively a single tenant's data.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.network_risk_priors (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    target              TEXT NOT NULL,           -- 'rtf' | 'crl' | 'first_cycle_approval'
    submission_type     TEXT NOT NULL,
    agency              TEXT NOT NULL,
    therapeutic_area    TEXT,
    completeness_bin    TEXT,                    -- 'low' | 'medium' | 'high' | NULL when unknown
    sample_size         INTEGER NOT NULL,
    tenant_count        INTEGER NOT NULL,        -- distinct tenants contributing (k-anonymity gate)
    raw_positive_count  INTEGER NOT NULL,        -- never returned to clients; kept for audit
    noised_rate         DOUBLE PRECISION NOT NULL, -- positive rate in [0,1] with Laplace noise
    epsilon             DOUBLE PRECISION NOT NULL, -- DP budget consumed for this row
    computed_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (target, submission_type, agency, therapeutic_area, completeness_bin)
);

CREATE INDEX IF NOT EXISTS idx_nrp_lookup
    ON intelligence.network_risk_priors(target, submission_type, agency, therapeutic_area);

-- ─────────────────────────────────────────────────────────────────────────────
-- Outcome → precedent links. When an outcome lands we mint a precedent row in
-- precedent.regulatory_precedents and record the link here so the audit trail
-- stays intact (which outcome generated which precedent, when, by which run).
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS intelligence.outcome_precedent_links (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    outcome_id          UUID NOT NULL,
    precedent_id        UUID NOT NULL,           -- precedent.regulatory_precedents(id)
    ingestor_version    TEXT NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (outcome_id, precedent_id)
);

CREATE INDEX IF NOT EXISTS idx_opl_outcome ON intelligence.outcome_precedent_links(outcome_id);
CREATE INDEX IF NOT EXISTS idx_opl_precedent ON intelligence.outcome_precedent_links(precedent_id);

COMMIT;
