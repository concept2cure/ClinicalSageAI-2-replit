"""
SQL queries for drift monitoring, batch QC, and alerting.
Continuous quality monitoring infrastructure.
"""

# =============================================================================
# Drift Jobs
# =============================================================================

SQL_CREATE_DRIFT_JOB = """
INSERT INTO monitoring.drift_jobs (
    job_type, job_name, description,
    program_id, section_filter, jurisdiction_filter,
    scheduled_at, config_bundle_id, parameters,
    created_by
)
VALUES (
    $1::monitoring.job_type, $2, $3,
    $4, $5, $6,
    COALESCE($7, NOW()), $8, COALESCE($9, '{}'::jsonb),
    COALESCE(current_setting('app.user', true), 'unknown')
)
RETURNING *;
"""

SQL_GET_DRIFT_JOB = """
SELECT 
    dj.*,
    p.program_code,
    cb.bundle_name AS config_bundle_name
FROM monitoring.drift_jobs dj
LEFT JOIN core.programs p ON p.id = dj.program_id
LEFT JOIN audit.config_bundles cb ON cb.id = dj.config_bundle_id
WHERE dj.id = $1;
"""

SQL_LIST_DRIFT_JOBS = """
SELECT 
    dj.id, dj.job_number, dj.job_type, dj.job_name,
    dj.program_id, dj.status, dj.progress_pct,
    dj.scheduled_at, dj.started_at, dj.completed_at,
    dj.fragments_scanned, dj.fragments_with_drift,
    dj.red_alerts, dj.amber_alerts, dj.green_count,
    p.program_code
FROM monitoring.drift_jobs dj
LEFT JOIN core.programs p ON p.id = dj.program_id
WHERE dj.program_id = COALESCE($1, dj.program_id)
  AND dj.status = COALESCE($2::monitoring.job_status, dj.status)
ORDER BY dj.scheduled_at DESC
LIMIT $3;
"""

SQL_UPDATE_DRIFT_JOB_STATUS = """
UPDATE monitoring.drift_jobs
SET 
    status = $2::monitoring.job_status,
    progress_pct = COALESCE($3, progress_pct),
    current_step = COALESCE($4, current_step),
    started_at = CASE WHEN $2 = 'RUNNING' AND started_at IS NULL THEN NOW() ELSE started_at END,
    completed_at = CASE WHEN $2 IN ('COMPLETED', 'FAILED', 'CANCELLED') THEN NOW() ELSE completed_at END,
    error_message = $5,
    error_details = $6
WHERE id = $1
RETURNING *;
"""

SQL_UPDATE_DRIFT_JOB_RESULTS = """
UPDATE monitoring.drift_jobs
SET 
    fragments_scanned = $2,
    fragments_with_drift = $3,
    red_alerts = $4,
    amber_alerts = $5,
    green_count = $6
WHERE id = $1
RETURNING *;
"""

SQL_GET_PENDING_DRIFT_JOBS = """
SELECT *
FROM monitoring.drift_jobs
WHERE status = 'SCHEDULED'
  AND scheduled_at <= NOW()
ORDER BY scheduled_at ASC
LIMIT $1;
"""

# =============================================================================
# Drift Results
# =============================================================================

SQL_INSERT_DRIFT_RESULT = """
INSERT INTO monitoring.drift_results (
    job_id, fragment_id, fragment_version_id, section_path,
    drift_score, risk_color, previous_drift_score, score_delta,
    truth_ids_checked, truth_ids_mismatched, precedent_ids_matched,
    drift_explanation, recommended_action, confidence,
    analysis_duration_ms
)
VALUES (
    $1, $2, $3, $4,
    $5, $6, $7, $8,
    $9, $10, $11,
    $12, $13, $14,
    $15
)
RETURNING *;
"""

SQL_GET_DRIFT_RESULTS_FOR_JOB = """
SELECT *
FROM monitoring.drift_results
WHERE job_id = $1
ORDER BY 
    CASE risk_color WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END,
    drift_score DESC;
"""

SQL_GET_FRAGMENT_DRIFT_HISTORY = """
SELECT *
FROM monitoring.v_fragment_drift_history
WHERE fragment_id = $1
ORDER BY completed_at DESC
LIMIT $2;
"""

SQL_GET_DRIFT_TREND_BY_SECTION = """
SELECT *
FROM monitoring.v_drift_trend_by_section
WHERE program_id = COALESCE($1, program_id)
  AND analysis_date >= COALESCE($2, analysis_date)
ORDER BY analysis_date DESC, section_path;
"""

# =============================================================================
# Alerts
# =============================================================================

SQL_CREATE_ALERT = """
INSERT INTO monitoring.alerts (
    job_id, threshold_id, severity, title, description,
    program_id, fragment_id, section_path,
    metric_name, metric_value, threshold_value
)
VALUES (
    $1, $2, $3::monitoring.alert_severity, $4, $5,
    $6, $7, $8,
    $9, $10, $11
)
RETURNING *;
"""

SQL_GET_ALERT = """
SELECT 
    a.*,
    p.program_code,
    dj.job_number
FROM monitoring.alerts a
LEFT JOIN core.programs p ON p.id = a.program_id
LEFT JOIN monitoring.drift_jobs dj ON dj.id = a.job_id
WHERE a.id = $1;
"""

SQL_LIST_ALERTS = """
SELECT 
    a.id, a.alert_number, a.severity, a.status, a.title, a.description,
    a.program_id, a.fragment_id, a.section_path,
    a.metric_name, a.metric_value, a.threshold_value,
    a.created_at, a.acknowledged_at, a.resolved_at,
    p.program_code
FROM monitoring.alerts a
LEFT JOIN core.programs p ON p.id = a.program_id
WHERE a.status = COALESCE($1::monitoring.alert_status, a.status)
  AND a.severity = COALESCE($2::monitoring.alert_severity, a.severity)
  AND a.program_id = COALESCE($3, a.program_id)
ORDER BY 
    CASE a.status WHEN 'OPEN' THEN 1 WHEN 'ACKNOWLEDGED' THEN 2 ELSE 3 END,
    CASE a.severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END,
    a.created_at DESC
LIMIT $4;
"""

SQL_ACKNOWLEDGE_ALERT = """
UPDATE monitoring.alerts
SET 
    status = 'ACKNOWLEDGED',
    acknowledged_at = NOW(),
    acknowledged_by = COALESCE(current_setting('app.user', true), 'unknown')
WHERE id = $1
RETURNING *;
"""

SQL_RESOLVE_ALERT = """
UPDATE monitoring.alerts
SET 
    status = 'RESOLVED',
    resolved_at = NOW(),
    resolved_by = COALESCE(current_setting('app.user', true), 'unknown'),
    resolution_notes = $2
WHERE id = $1
RETURNING *;
"""

SQL_GET_OPEN_ALERTS_SUMMARY = """
SELECT * FROM monitoring.v_open_alerts_summary;
"""

# =============================================================================
# Alert Thresholds
# =============================================================================

SQL_LIST_THRESHOLDS = """
SELECT 
    t.*,
    p.program_code
FROM monitoring.alert_thresholds t
LEFT JOIN core.programs p ON p.id = t.program_id
WHERE t.is_active = TRUE
ORDER BY t.program_id NULLS FIRST, t.metric_name;
"""

SQL_GET_THRESHOLD_FOR_METRIC = """
SELECT *
FROM monitoring.alert_thresholds
WHERE metric_name = $1
  AND (program_id = $2 OR program_id IS NULL)
  AND is_active = TRUE
ORDER BY program_id NULLS LAST
LIMIT 1;
"""

# =============================================================================
# Batch QC Runs
# =============================================================================

SQL_CREATE_QC_RUN = """
INSERT INTO monitoring.batch_qc_runs (
    trigger_type, trigger_reference,
    program_id, snapshot_id,
    config_bundle_id, qc_checks_enabled,
    created_by
)
VALUES (
    $1, $2,
    $3, $4,
    $5, $6,
    COALESCE(current_setting('app.user', true), 'unknown')
)
RETURNING *;
"""

SQL_GET_QC_RUN = """
SELECT 
    qr.*,
    p.program_code,
    cb.bundle_name AS config_bundle_name
FROM monitoring.batch_qc_runs qr
LEFT JOIN core.programs p ON p.id = qr.program_id
LEFT JOIN audit.config_bundles cb ON cb.id = qr.config_bundle_id
WHERE qr.id = $1;
"""

SQL_LIST_QC_RUNS = """
SELECT 
    qr.id, qr.run_number, qr.trigger_type, qr.trigger_reference,
    qr.program_id, qr.snapshot_id, qr.status, qr.overall_result,
    qr.checks_passed, qr.checks_failed, qr.checks_warned, qr.checks_skipped,
    qr.started_at, qr.completed_at,
    p.program_code
FROM monitoring.batch_qc_runs qr
LEFT JOIN core.programs p ON p.id = qr.program_id
WHERE qr.program_id = COALESCE($1, qr.program_id)
ORDER BY qr.started_at DESC
LIMIT $2;
"""

SQL_UPDATE_QC_RUN = """
UPDATE monitoring.batch_qc_runs
SET 
    status = $2::monitoring.job_status,
    overall_result = $3::monitoring.qc_result,
    checks_passed = $4,
    checks_failed = $5,
    checks_warned = $6,
    checks_skipped = $7,
    completed_at = CASE WHEN $2 IN ('COMPLETED', 'FAILED') THEN NOW() ELSE completed_at END,
    error_message = $8
WHERE id = $1
RETURNING *;
"""

SQL_GET_QC_PASS_RATE = """
SELECT * FROM monitoring.v_qc_pass_rate
WHERE program_code = COALESCE($1, program_code);
"""

# =============================================================================
# QC Check Results
# =============================================================================

SQL_INSERT_QC_CHECK_RESULT = """
INSERT INTO monitoring.qc_check_results (
    qc_run_id, check_code, check_name, check_category,
    target_type, target_id, target_reference,
    result, score, threshold,
    message, details, remediation_hint,
    duration_ms
)
VALUES (
    $1, $2, $3, $4,
    $5, $6, $7,
    $8::monitoring.qc_result, $9, $10,
    $11, $12, $13,
    $14
)
RETURNING *;
"""

SQL_GET_QC_CHECK_RESULTS = """
SELECT *
FROM monitoring.qc_check_results
WHERE qc_run_id = $1
ORDER BY 
    CASE result WHEN 'FAIL' THEN 1 WHEN 'WARNING' THEN 2 WHEN 'PASS' THEN 3 ELSE 4 END,
    check_category, check_code;
"""
