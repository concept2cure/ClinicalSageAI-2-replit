-- Migration: 040_gcc_site_intelligence.sql
-- Purpose: Site Intelligence Scorecard - KPI amalgamator, risk scoring, enrollment prediction
-- Part of Phase 2 - 038+ Migrations

BEGIN;

-- =============================================================================
-- SITE INTELLIGENCE SCHEMA
-- =============================================================================

CREATE SCHEMA IF NOT EXISTS site_intel;

-- =============================================================================
-- INVESTIGATOR SITES
-- =============================================================================

CREATE TYPE site_intel.site_status AS ENUM (
    'PROSPECTIVE',      -- Under evaluation
    'SELECTED',         -- Selected for study
    'ACTIVATED',        -- Ready to enroll
    'ENROLLING',        -- Actively enrolling
    'CLOSED_COMPLETE',  -- Completed enrollment
    'CLOSED_EARLY',     -- Terminated early
    'SUSPENDED'         -- Temporarily suspended
);

CREATE TABLE site_intel.sites (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    program_id          UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
    
    -- Site Identification
    site_number         TEXT NOT NULL,
    site_name           TEXT NOT NULL,
    
    -- Location
    country_code        CHAR(2) NOT NULL,           -- ISO 3166-1 alpha-2
    region              TEXT,
    city                TEXT,
    address             TEXT,
    
    -- Principal Investigator
    pi_name             TEXT,
    pi_email            TEXT,
    pi_phone            TEXT,
    
    -- Status
    status              site_intel.site_status NOT NULL DEFAULT 'PROSPECTIVE',
    activation_date     DATE,
    close_date          DATE,
    
    -- Capacity
    enrollment_target   INTEGER,
    enrollment_actual   INTEGER DEFAULT 0,
    screen_failure_rate NUMERIC(5,2),
    
    -- Scores (0-100)
    overall_score       NUMERIC(5,2),
    enrollment_score    NUMERIC(5,2),
    quality_score       NUMERIC(5,2),
    compliance_score    NUMERIC(5,2),
    
    -- FDA/Regulatory
    fda_form_1572_date  DATE,
    irb_approval_date   DATE,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(program_id, site_number)
);

CREATE INDEX idx_sites_program ON site_intel.sites(program_id);
CREATE INDEX idx_sites_status ON site_intel.sites(status);
CREATE INDEX idx_sites_country ON site_intel.sites(country_code);
CREATE INDEX idx_sites_score ON site_intel.sites(overall_score DESC);

COMMENT ON TABLE site_intel.sites IS 
'Clinical trial sites with performance scoring and enrollment tracking.';

-- =============================================================================
-- SITE METRICS (Time-series KPIs)
-- =============================================================================

CREATE TABLE site_intel.site_metrics (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id             UUID NOT NULL REFERENCES site_intel.sites(id) ON DELETE CASCADE,
    
    -- Metric period
    metric_date         DATE NOT NULL,
    metric_period       TEXT NOT NULL DEFAULT 'DAILY',  -- DAILY, WEEKLY, MONTHLY
    
    -- Enrollment metrics
    subjects_screened   INTEGER DEFAULT 0,
    subjects_enrolled   INTEGER DEFAULT 0,
    subjects_randomized INTEGER DEFAULT 0,
    screen_failures     INTEGER DEFAULT 0,
    withdrawals         INTEGER DEFAULT 0,
    
    -- Quality metrics
    protocol_deviations INTEGER DEFAULT 0,
    major_deviations    INTEGER DEFAULT 0,
    queries_open        INTEGER DEFAULT 0,
    queries_resolved    INTEGER DEFAULT 0,
    data_entry_backlog  INTEGER DEFAULT 0,
    
    -- Timing metrics
    avg_screening_days  NUMERIC(5,1),
    avg_enrollment_days NUMERIC(5,1),
    
    -- Safety metrics
    aes_reported        INTEGER DEFAULT 0,
    saes_reported       INTEGER DEFAULT 0,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    
    UNIQUE(site_id, metric_date, metric_period)
);

CREATE INDEX idx_site_metrics_site ON site_intel.site_metrics(site_id);
CREATE INDEX idx_site_metrics_date ON site_intel.site_metrics(metric_date DESC);

COMMENT ON TABLE site_intel.site_metrics IS 
'Time-series performance metrics for clinical trial sites.';

-- =============================================================================
-- SITE RISK FACTORS
-- =============================================================================

CREATE TYPE site_intel.risk_level AS ENUM (
    'LOW',
    'MEDIUM',
    'HIGH',
    'CRITICAL'
);

CREATE TYPE site_intel.risk_category AS ENUM (
    'ENROLLMENT',       -- Enrollment performance issues
    'QUALITY',          -- Data quality concerns
    'COMPLIANCE',       -- Protocol/regulatory compliance
    'SAFETY',           -- Safety reporting issues
    'OPERATIONAL'       -- General operational risks
);

CREATE TABLE site_intel.site_risks (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id             UUID NOT NULL REFERENCES site_intel.sites(id) ON DELETE CASCADE,
    
    -- Risk identification
    risk_category       site_intel.risk_category NOT NULL,
    risk_level          site_intel.risk_level NOT NULL,
    risk_title          TEXT NOT NULL,
    risk_description    TEXT,
    
    -- Impact assessment
    impact_score        NUMERIC(5,2),               -- 0-100
    likelihood_score    NUMERIC(5,2),               -- 0-100
    combined_score      NUMERIC(5,2),               -- impact * likelihood / 100
    
    -- Mitigation
    mitigation_plan     TEXT,
    mitigation_owner    TEXT,
    mitigation_due_date DATE,
    
    -- Status
    status              TEXT NOT NULL DEFAULT 'OPEN',  -- OPEN, MITIGATED, CLOSED, ACCEPTED
    identified_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    resolved_date       DATE,
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_site_risks_site ON site_intel.site_risks(site_id);
CREATE INDEX idx_site_risks_level ON site_intel.site_risks(risk_level);
CREATE INDEX idx_site_risks_category ON site_intel.site_risks(risk_category);
CREATE INDEX idx_site_risks_status ON site_intel.site_risks(status);

COMMENT ON TABLE site_intel.site_risks IS 
'Identified risks for clinical trial sites with impact assessment and mitigation tracking.';

-- =============================================================================
-- ENROLLMENT PREDICTIONS
-- =============================================================================

CREATE TABLE site_intel.enrollment_predictions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id             UUID NOT NULL REFERENCES site_intel.sites(id) ON DELETE CASCADE,
    
    -- Prediction details
    prediction_date     DATE NOT NULL DEFAULT CURRENT_DATE,
    prediction_horizon  INTEGER NOT NULL,           -- Days into future
    
    -- Predicted values
    predicted_enrolled  INTEGER NOT NULL,
    confidence_lower    INTEGER,
    confidence_upper    INTEGER,
    confidence_level    NUMERIC(3,2),               -- e.g., 0.95 for 95% CI
    
    -- Model info
    model_name          TEXT,
    model_version       TEXT,
    input_features      JSONB,
    
    -- Actuals (filled in when actual data available)
    actual_enrolled     INTEGER,
    prediction_error    NUMERIC(5,2),
    
    -- Metadata
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_enrollment_pred_site ON site_intel.enrollment_predictions(site_id);
CREATE INDEX idx_enrollment_pred_date ON site_intel.enrollment_predictions(prediction_date);

COMMENT ON TABLE site_intel.enrollment_predictions IS 
'Enrollment predictions for clinical trial sites with confidence intervals.';

-- =============================================================================
-- SITE SCORECARD CALCULATION
-- =============================================================================

CREATE OR REPLACE FUNCTION site_intel.calculate_site_scores(p_site_id UUID)
RETURNS TABLE (
    enrollment_score NUMERIC,
    quality_score NUMERIC,
    compliance_score NUMERIC,
    overall_score NUMERIC
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_enrollment_score NUMERIC := 50;
    v_quality_score NUMERIC := 50;
    v_compliance_score NUMERIC := 50;
    v_site RECORD;
    v_metrics RECORD;
BEGIN
    -- Get site data
    SELECT * INTO v_site FROM site_intel.sites WHERE id = p_site_id;
    
    IF NOT FOUND THEN
        RETURN QUERY SELECT 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC;
        RETURN;
    END IF;
    
    -- Get latest metrics (last 30 days aggregate)
    SELECT 
        COALESCE(SUM(subjects_enrolled), 0) AS enrolled,
        COALESCE(SUM(subjects_screened), 0) AS screened,
        COALESCE(SUM(screen_failures), 0) AS failures,
        COALESCE(SUM(protocol_deviations), 0) AS deviations,
        COALESCE(SUM(queries_open), 0) AS open_queries,
        COALESCE(AVG(avg_enrollment_days), 0) AS avg_days
    INTO v_metrics
    FROM site_intel.site_metrics
    WHERE site_id = p_site_id
      AND metric_date >= CURRENT_DATE - INTERVAL '30 days';
    
    -- Enrollment score (based on target achievement and screen failure rate)
    IF v_site.enrollment_target > 0 THEN
        v_enrollment_score := LEAST(100, 
            (v_site.enrollment_actual::NUMERIC / v_site.enrollment_target * 80) +
            (CASE WHEN v_metrics.screened > 0 
                  THEN (1 - v_metrics.failures::NUMERIC / v_metrics.screened) * 20
                  ELSE 10 END)
        );
    END IF;
    
    -- Quality score (based on deviations and query management)
    v_quality_score := GREATEST(0, 100 - 
        (v_metrics.deviations * 5) - 
        (v_metrics.open_queries * 2)
    );
    
    -- Compliance score (based on protocol adherence)
    v_compliance_score := GREATEST(0, 100 - (v_metrics.deviations * 10));
    
    -- Overall score (weighted average)
    v_enrollment_score := ROUND(v_enrollment_score, 2);
    v_quality_score := ROUND(v_quality_score, 2);
    v_compliance_score := ROUND(v_compliance_score, 2);
    
    -- Update site record
    UPDATE site_intel.sites
    SET 
        enrollment_score = v_enrollment_score,
        quality_score = v_quality_score,
        compliance_score = v_compliance_score,
        overall_score = ROUND((v_enrollment_score * 0.4 + v_quality_score * 0.35 + v_compliance_score * 0.25), 2),
        updated_at = now()
    WHERE id = p_site_id;
    
    RETURN QUERY SELECT 
        v_enrollment_score,
        v_quality_score,
        v_compliance_score,
        ROUND((v_enrollment_score * 0.4 + v_quality_score * 0.35 + v_compliance_score * 0.25), 2);
END;
$$;

COMMENT ON FUNCTION site_intel.calculate_site_scores IS 
'Calculate and update site performance scores based on enrollment, quality, and compliance metrics.';

-- =============================================================================
-- BATCH SCORE UPDATE
-- =============================================================================

CREATE OR REPLACE FUNCTION site_intel.update_all_site_scores(p_program_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_site RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_site IN 
        SELECT id FROM site_intel.sites 
        WHERE (p_program_id IS NULL OR program_id = p_program_id)
          AND status NOT IN ('CLOSED_COMPLETE', 'CLOSED_EARLY')
    LOOP
        PERFORM site_intel.calculate_site_scores(v_site.id);
        v_count := v_count + 1;
    END LOOP;
    
    RETURN v_count;
END;
$$;

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Site Scorecard Dashboard
CREATE OR REPLACE VIEW site_intel.v_site_scorecard AS
SELECT 
    s.id AS site_id,
    s.program_id,
    p.code AS program_code,
    s.site_number,
    s.site_name,
    s.country_code,
    s.status,
    s.enrollment_target,
    s.enrollment_actual,
    CASE WHEN s.enrollment_target > 0 
         THEN ROUND(s.enrollment_actual::NUMERIC / s.enrollment_target * 100, 1)
         ELSE 0 
    END AS enrollment_pct,
    s.overall_score,
    s.enrollment_score,
    s.quality_score,
    s.compliance_score,
    CASE 
        WHEN s.overall_score >= 80 THEN 'EXCELLENT'
        WHEN s.overall_score >= 60 THEN 'GOOD'
        WHEN s.overall_score >= 40 THEN 'NEEDS_ATTENTION'
        ELSE 'AT_RISK'
    END AS performance_tier,
    s.activation_date,
    s.updated_at AS scores_updated_at
FROM site_intel.sites s
JOIN core.programs p ON p.id = s.program_id
ORDER BY s.overall_score DESC NULLS LAST;

COMMENT ON VIEW site_intel.v_site_scorecard IS 
'Site performance scorecard with tier classification.';

-- Risk Summary by Site
CREATE OR REPLACE VIEW site_intel.v_site_risk_summary AS
SELECT 
    s.id AS site_id,
    s.site_number,
    s.site_name,
    COUNT(*) FILTER (WHERE sr.status = 'OPEN') AS open_risks,
    COUNT(*) FILTER (WHERE sr.risk_level = 'CRITICAL' AND sr.status = 'OPEN') AS critical_risks,
    COUNT(*) FILTER (WHERE sr.risk_level = 'HIGH' AND sr.status = 'OPEN') AS high_risks,
    MAX(sr.combined_score) AS max_risk_score,
    AVG(sr.combined_score) FILTER (WHERE sr.status = 'OPEN') AS avg_risk_score
FROM site_intel.sites s
LEFT JOIN site_intel.site_risks sr ON sr.site_id = s.id
GROUP BY s.id, s.site_number, s.site_name
ORDER BY critical_risks DESC, high_risks DESC;

COMMENT ON VIEW site_intel.v_site_risk_summary IS 
'Risk summary by clinical trial site.';

-- Enrollment Trends
CREATE OR REPLACE VIEW site_intel.v_enrollment_trends AS
SELECT 
    s.program_id,
    p.code AS program_code,
    sm.metric_date,
    SUM(sm.subjects_screened) AS total_screened,
    SUM(sm.subjects_enrolled) AS total_enrolled,
    SUM(sm.subjects_randomized) AS total_randomized,
    SUM(sm.screen_failures) AS total_failures,
    CASE WHEN SUM(sm.subjects_screened) > 0 
         THEN ROUND(SUM(sm.screen_failures)::NUMERIC / SUM(sm.subjects_screened) * 100, 1)
         ELSE 0 
    END AS screen_failure_rate
FROM site_intel.site_metrics sm
JOIN site_intel.sites s ON s.id = sm.site_id
JOIN core.programs p ON p.id = s.program_id
GROUP BY s.program_id, p.code, sm.metric_date
ORDER BY s.program_id, sm.metric_date DESC;

COMMENT ON VIEW site_intel.v_enrollment_trends IS 
'Enrollment trends aggregated by program and date.';

COMMIT;
