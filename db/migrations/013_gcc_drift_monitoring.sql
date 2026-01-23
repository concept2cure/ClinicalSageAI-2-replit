-- Migration 013: Drift Monitoring + Batch QC Infrastructure
-- Purpose: Scheduled drift detection, alerting, and quality control
--
-- This migration provides:
--   1. Drift detection job scheduling and tracking
--   2. Alert thresholds and notification registry
--   3. Batch QC run tracking with pass/fail metrics
--   4. Drift trend analysis views
--   5. Integration with config bundles for reproducibility
--
-- Part 11 alignment: Continuous monitoring ensures data integrity
-- and provides early warning of regulatory risk issues.

BEGIN;

CREATE SCHEMA IF NOT EXISTS monitoring;

-- =============================================================================
-- A) Drift Detection Jobs
-- =============================================================================

CREATE TYPE monitoring.job_status AS ENUM (
  'SCHEDULED',
  'RUNNING',
  'COMPLETED',
  'FAILED',
  'CANCELLED'
);

CREATE TYPE monitoring.job_type AS ENUM (
  'FULL_DRIFT_SCAN',        -- Complete drift analysis across all fragments
  'INCREMENTAL_DRIFT',      -- Only changed fragments since last run
  'SECTION_DRIFT',          -- Single eCTD section
  'TRUTH_RECONCILIATION',   -- Verify truth store consistency
  'EMBEDDING_REFRESH',      -- Refresh embeddings with new model
  'PRECEDENT_SYNC'          -- Sync adversarial precedents
);

CREATE TABLE IF NOT EXISTS monitoring.drift_jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_number SERIAL,
  
  -- Job specification
  job_type monitoring.job_type NOT NULL,
  job_name TEXT,
  description TEXT,
  
  -- Scope
  program_id UUID REFERENCES core.programs(id),  -- NULL = all programs
  section_filter TEXT,                            -- eCTD section pattern (e.g., 'm2.7%')
  jurisdiction_filter TEXT,                       -- 'FDA', 'EMA', etc.
  
  -- Schedule
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  
  -- Status
  status monitoring.job_status NOT NULL DEFAULT 'SCHEDULED',
  progress_pct INT DEFAULT 0,
  current_step TEXT,
  
  -- Configuration (links to config bundle for reproducibility)
  config_bundle_id UUID REFERENCES audit.config_bundles(id),
  parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  -- Results summary
  fragments_scanned INT DEFAULT 0,
  fragments_with_drift INT DEFAULT 0,
  red_alerts INT DEFAULT 0,
  amber_alerts INT DEFAULT 0,
  green_count INT DEFAULT 0,
  
  -- Execution details
  executor_id TEXT,                              -- Which worker ran this
  error_message TEXT,
  error_details JSONB,
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

COMMENT ON TABLE monitoring.drift_jobs IS 
  'Drift detection job tracking - scheduled and ad-hoc drift analysis runs';

CREATE INDEX IF NOT EXISTS drift_jobs_status_idx 
  ON monitoring.drift_jobs (status, scheduled_at);

CREATE INDEX IF NOT EXISTS drift_jobs_program_idx 
  ON monitoring.drift_jobs (program_id, created_at DESC);

-- Attribution trigger
CREATE OR REPLACE FUNCTION monitoring.tg_drift_jobs_attrib()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(current_setting('app.user', true), NEW.created_by, 'unknown');
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_drift_jobs_attrib ON monitoring.drift_jobs;
CREATE TRIGGER trg_drift_jobs_attrib
  BEFORE INSERT ON monitoring.drift_jobs
  FOR EACH ROW
  EXECUTE FUNCTION monitoring.tg_drift_jobs_attrib();

-- =============================================================================
-- B) Drift Results (per-fragment detail)
-- =============================================================================

CREATE TABLE IF NOT EXISTS monitoring.drift_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  job_id UUID NOT NULL REFERENCES monitoring.drift_jobs(id) ON DELETE CASCADE,
  
  -- Fragment reference
  fragment_id UUID NOT NULL,
  fragment_version_id UUID,
  section_path TEXT NOT NULL,
  
  -- Drift analysis
  drift_score FLOAT,                             -- 0.0 to 1.0
  risk_color TEXT NOT NULL,                      -- RED, AMBER, GREEN
  previous_drift_score FLOAT,                    -- For trend analysis
  score_delta FLOAT,                             -- Change from previous
  
  -- Analysis details
  truth_ids_checked UUID[],
  truth_ids_mismatched UUID[],
  precedent_ids_matched UUID[],
  
  -- AI reasoning
  drift_explanation TEXT,
  recommended_action TEXT,
  confidence FLOAT,
  
  -- Metadata
  analyzed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  analysis_duration_ms INT
);

COMMENT ON TABLE monitoring.drift_results IS 
  'Per-fragment drift analysis results from drift jobs';

CREATE INDEX IF NOT EXISTS drift_results_job_idx 
  ON monitoring.drift_results (job_id);

CREATE INDEX IF NOT EXISTS drift_results_fragment_idx 
  ON monitoring.drift_results (fragment_id, analyzed_at DESC);

CREATE INDEX IF NOT EXISTS drift_results_risk_idx 
  ON monitoring.drift_results (job_id, risk_color);

-- =============================================================================
-- C) Alert Thresholds Configuration
-- =============================================================================

CREATE TABLE IF NOT EXISTS monitoring.alert_thresholds (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  threshold_code TEXT NOT NULL UNIQUE,
  threshold_name TEXT NOT NULL,
  description TEXT,
  
  -- Threshold values
  metric_name TEXT NOT NULL,                     -- 'drift_score', 'red_count', 'amber_pct', etc.
  red_threshold FLOAT NOT NULL,                  -- >= this = RED alert
  amber_threshold FLOAT NOT NULL,                -- >= this = AMBER alert
  
  -- Scope
  program_id UUID REFERENCES core.programs(id),  -- NULL = global default
  section_pattern TEXT,                          -- eCTD section pattern
  
  -- Notification
  notify_on_red BOOLEAN NOT NULL DEFAULT TRUE,
  notify_on_amber BOOLEAN NOT NULL DEFAULT FALSE,
  notification_channels TEXT[] DEFAULT ARRAY['email'],
  
  -- Status
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown'
);

COMMENT ON TABLE monitoring.alert_thresholds IS 
  'Configurable thresholds for drift alerts';

-- Insert defaults
INSERT INTO monitoring.alert_thresholds (
  threshold_code, threshold_name, metric_name,
  red_threshold, amber_threshold, notify_on_red, created_by
) VALUES
  ('DEFAULT_DRIFT', 'Default Drift Score', 'drift_score', 0.18, 0.10, TRUE, 'migration-013'),
  ('DEFAULT_RED_COUNT', 'Red Alert Count', 'red_count', 5, 2, TRUE, 'migration-013'),
  ('DEFAULT_AMBER_PCT', 'Amber Percentage', 'amber_pct', 0.25, 0.15, FALSE, 'migration-013')
ON CONFLICT (threshold_code) DO NOTHING;

-- =============================================================================
-- D) Alerts Registry
-- =============================================================================

CREATE TYPE monitoring.alert_severity AS ENUM ('RED', 'AMBER', 'INFO');
CREATE TYPE monitoring.alert_status AS ENUM ('OPEN', 'ACKNOWLEDGED', 'RESOLVED', 'SUPPRESSED');

CREATE TABLE IF NOT EXISTS monitoring.alerts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  alert_number SERIAL,
  
  -- Source
  job_id UUID REFERENCES monitoring.drift_jobs(id),
  threshold_id UUID REFERENCES monitoring.alert_thresholds(id),
  
  -- Alert details
  severity monitoring.alert_severity NOT NULL,
  status monitoring.alert_status NOT NULL DEFAULT 'OPEN',
  title TEXT NOT NULL,
  description TEXT,
  
  -- Scope
  program_id UUID REFERENCES core.programs(id),
  fragment_id UUID,
  section_path TEXT,
  
  -- Metrics that triggered alert
  metric_name TEXT NOT NULL,
  metric_value FLOAT NOT NULL,
  threshold_value FLOAT NOT NULL,
  
  -- Lifecycle
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by TEXT,
  resolution_notes TEXT,
  
  -- Notification tracking
  notifications_sent JSONB DEFAULT '[]'::jsonb
);

COMMENT ON TABLE monitoring.alerts IS 
  'Drift and QC alerts requiring attention';

CREATE INDEX IF NOT EXISTS alerts_status_idx 
  ON monitoring.alerts (status, severity, created_at DESC);

CREATE INDEX IF NOT EXISTS alerts_program_idx 
  ON monitoring.alerts (program_id, status);

-- =============================================================================
-- E) Batch QC Runs
-- =============================================================================

CREATE TYPE monitoring.qc_result AS ENUM ('PASS', 'FAIL', 'WARNING', 'SKIPPED');

CREATE TABLE IF NOT EXISTS monitoring.batch_qc_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_number SERIAL,
  
  -- Trigger
  trigger_type TEXT NOT NULL,                    -- 'SCHEDULED', 'PRE_SUBMISSION', 'MANUAL', 'CI'
  trigger_reference TEXT,                        -- PR number, snapshot ID, etc.
  
  -- Scope
  program_id UUID REFERENCES core.programs(id),
  snapshot_id UUID,                              -- If QC for specific snapshot
  
  -- Configuration
  config_bundle_id UUID REFERENCES audit.config_bundles(id),
  qc_checks_enabled TEXT[] NOT NULL,            -- Which checks to run
  
  -- Execution
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  status monitoring.job_status NOT NULL DEFAULT 'RUNNING',
  
  -- Results
  overall_result monitoring.qc_result,
  checks_passed INT DEFAULT 0,
  checks_failed INT DEFAULT 0,
  checks_warned INT DEFAULT 0,
  checks_skipped INT DEFAULT 0,
  
  -- Details
  results_json JSONB NOT NULL DEFAULT '[]'::jsonb,
  error_message TEXT,
  
  -- Audit
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

COMMENT ON TABLE monitoring.batch_qc_runs IS 
  'Batch quality control run tracking';

CREATE INDEX IF NOT EXISTS batch_qc_runs_program_idx 
  ON monitoring.batch_qc_runs (program_id, started_at DESC);

CREATE INDEX IF NOT EXISTS batch_qc_runs_snapshot_idx 
  ON monitoring.batch_qc_runs (snapshot_id) WHERE snapshot_id IS NOT NULL;

-- =============================================================================
-- F) QC Check Results (individual checks within a run)
-- =============================================================================

CREATE TABLE IF NOT EXISTS monitoring.qc_check_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  qc_run_id UUID NOT NULL REFERENCES monitoring.batch_qc_runs(id) ON DELETE CASCADE,
  
  -- Check specification
  check_code TEXT NOT NULL,                      -- 'TRUTH_COVERAGE', 'DRIFT_THRESHOLD', etc.
  check_name TEXT NOT NULL,
  check_category TEXT,                           -- 'DATA_INTEGRITY', 'COMPLIANCE', 'QUALITY'
  
  -- Target
  target_type TEXT,                              -- 'FRAGMENT', 'SECTION', 'SNAPSHOT', 'GLOBAL'
  target_id UUID,
  target_reference TEXT,
  
  -- Result
  result monitoring.qc_result NOT NULL,
  score FLOAT,                                   -- Numeric score if applicable
  threshold FLOAT,                               -- Pass/fail threshold
  
  -- Details
  message TEXT,
  details JSONB,
  remediation_hint TEXT,
  
  -- Timing
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  duration_ms INT
);

COMMENT ON TABLE monitoring.qc_check_results IS 
  'Individual QC check results within a batch run';

CREATE INDEX IF NOT EXISTS qc_check_results_run_idx 
  ON monitoring.qc_check_results (qc_run_id);

CREATE INDEX IF NOT EXISTS qc_check_results_code_idx 
  ON monitoring.qc_check_results (check_code, result);

-- =============================================================================
-- G) Drift Trend Views
-- =============================================================================

-- View: Drift trend by section over time
CREATE OR REPLACE VIEW monitoring.v_drift_trend_by_section AS
SELECT
  dr.section_path,
  dj.program_id,
  DATE_TRUNC('day', dj.completed_at) AS analysis_date,
  COUNT(*) AS fragments_analyzed,
  AVG(dr.drift_score) AS avg_drift_score,
  COUNT(*) FILTER (WHERE dr.risk_color = 'RED') AS red_count,
  COUNT(*) FILTER (WHERE dr.risk_color = 'AMBER') AS amber_count,
  COUNT(*) FILTER (WHERE dr.risk_color = 'GREEN') AS green_count,
  MAX(dr.drift_score) AS max_drift_score
FROM monitoring.drift_results dr
JOIN monitoring.drift_jobs dj ON dj.id = dr.job_id
WHERE dj.status = 'COMPLETED'
GROUP BY dr.section_path, dj.program_id, DATE_TRUNC('day', dj.completed_at)
ORDER BY analysis_date DESC, dr.section_path;

-- View: Fragment drift history
CREATE OR REPLACE VIEW monitoring.v_fragment_drift_history AS
SELECT
  dr.fragment_id,
  dr.section_path,
  dj.program_id,
  dj.completed_at,
  dr.drift_score,
  dr.risk_color,
  dr.previous_drift_score,
  dr.score_delta,
  dr.drift_explanation,
  dj.job_type,
  dj.config_bundle_id
FROM monitoring.drift_results dr
JOIN monitoring.drift_jobs dj ON dj.id = dr.job_id
WHERE dj.status = 'COMPLETED'
ORDER BY dr.fragment_id, dj.completed_at DESC;

-- View: Open alerts summary
CREATE OR REPLACE VIEW monitoring.v_open_alerts_summary AS
SELECT
  p.program_code,
  a.severity,
  COUNT(*) AS alert_count,
  MIN(a.created_at) AS oldest_alert,
  MAX(a.created_at) AS newest_alert
FROM monitoring.alerts a
LEFT JOIN core.programs p ON p.id = a.program_id
WHERE a.status = 'OPEN'
GROUP BY p.program_code, a.severity
ORDER BY 
  CASE a.severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END,
  alert_count DESC;

-- View: QC run pass rate
CREATE OR REPLACE VIEW monitoring.v_qc_pass_rate AS
SELECT
  p.program_code,
  qr.trigger_type,
  DATE_TRUNC('week', qr.started_at) AS week,
  COUNT(*) AS total_runs,
  COUNT(*) FILTER (WHERE qr.overall_result = 'PASS') AS passed,
  COUNT(*) FILTER (WHERE qr.overall_result = 'FAIL') AS failed,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE qr.overall_result = 'PASS') / NULLIF(COUNT(*), 0),
    1
  ) AS pass_rate_pct
FROM monitoring.batch_qc_runs qr
LEFT JOIN core.programs p ON p.id = qr.program_id
WHERE qr.status = 'COMPLETED'
GROUP BY p.program_code, qr.trigger_type, DATE_TRUNC('week', qr.started_at)
ORDER BY week DESC, p.program_code;

COMMIT;
