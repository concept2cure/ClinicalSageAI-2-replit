"""
SQL queries for drift monitoring operations.
"""

# =============================================================================
# Drift Jobs
# =============================================================================

SQL_LIST_DRIFT_JOBS = """
SELECT 
    j.id, j.job_number, j.job_type, j.job_name, j.description,
    j.program_id, p.program_code,
    j.section_filter, j.jurisdiction_filter,
    j.schedule_cron, j.next_run_at,
    j.drift_threshold_red, j.drift_threshold_amber,
    j.config_bundle_id,
    j.is_active, j.created_at, j.created_by,
    j.last_run_at, j.last_run_status
FROM monitoring.drift_jobs j
LEFT JOIN core.programs p ON p.id = j.program_id
WHERE ($1::boolean IS NULL OR j.is_active = $1)
  AND ($2::uuid IS NULL OR j.program_id = $2)
ORDER BY j.next_run_at NULLS LAST;
"""

SQL_GET_DRIFT_JOB = """
SELECT j.*, p.program_code
FROM monitoring.drift_jobs j
LEFT JOIN core.programs p ON p.id = j.program_id
WHERE j.id = $1;
"""

SQL_CREATE_DRIFT_JOB = """
INSERT INTO monitoring.drift_jobs (
    job_type, job_name, description,
    program_id, section_filter, jurisdiction_filter,
    schedule_cron, next_run_at,
    drift_threshold_red, drift_threshold_amber,
    config_bundle_id, is_active, created_by
)
VALUES ($1::monitoring.job_type, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, TRUE,
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_DRIFT_JOB_STATUS = """
UPDATE monitoring.drift_jobs
SET last_run_at = $2,
    last_run_status = $3::monitoring.job_status,
    next_run_at = $4
WHERE id = $1
RETURNING *;
"""

# =============================================================================
# Drift Runs
# =============================================================================

SQL_CREATE_DRIFT_RUN = """
INSERT INTO monitoring.drift_runs (
    job_id, run_number, status, config_bundle_id, triggered_by
)
VALUES ($1, 
        (SELECT COALESCE(MAX(run_number), 0) + 1 FROM monitoring.drift_runs WHERE job_id = $1),
        'RUNNING'::monitoring.job_status,
        $2,
        COALESCE(current_setting('app.user', true), 'scheduler'))
RETURNING *;
"""

SQL_COMPLETE_DRIFT_RUN = """
UPDATE monitoring.drift_runs
SET status = $2::monitoring.job_status,
    completed_at = NOW(),
    duration_ms = EXTRACT(EPOCH FROM (NOW() - started_at)) * 1000,
    fragments_checked = $3,
    red_count = $4,
    amber_count = $5,
    green_count = $6,
    error_message = $7
WHERE id = $1
RETURNING *;
"""

SQL_LIST_DRIFT_RUNS = """
SELECT 
    r.id, r.job_id, r.run_number, r.status,
    r.started_at, r.completed_at, r.duration_ms,
    r.fragments_checked, r.red_count, r.amber_count, r.green_count,
    r.error_message, r.config_bundle_id, r.triggered_by
FROM monitoring.drift_runs r
WHERE r.job_id = $1
ORDER BY r.run_number DESC
LIMIT $2;
"""

# =============================================================================
# Drift Alerts
# =============================================================================

SQL_CREATE_DRIFT_ALERT = """
INSERT INTO monitoring.drift_alerts (
    run_id, fragment_id, fragment_version_id,
    severity, drift_score, similarity_score,
    alert_title, alert_message,
    affected_truth_ids, program_id,
    status
)
VALUES ($1, $2, $3, $4::monitoring.alert_severity, $5, $6, $7, $8, $9, $10, 'OPEN')
RETURNING *;
"""

SQL_LIST_DRIFT_ALERTS = """
SELECT 
    a.id, a.run_id, a.fragment_id, a.fragment_version_id,
    a.severity, a.drift_score, a.similarity_score,
    a.alert_title, a.alert_message,
    a.affected_truth_ids, a.program_id, p.program_code,
    a.status, a.acknowledged_at, a.acknowledged_by,
    a.resolved_at, a.resolved_by, a.resolution_notes,
    a.created_at,
    f.ectd_section_path, f.jurisdiction
FROM monitoring.drift_alerts a
LEFT JOIN core.programs p ON p.id = a.program_id
LEFT JOIN prose.smart_fragments f ON f.id = a.fragment_id
WHERE ($1::text IS NULL OR a.status::text = $1)
  AND ($2::uuid IS NULL OR a.program_id = $2)
  AND ($3::text IS NULL OR a.severity::text = $3)
ORDER BY 
    CASE a.severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END,
    a.created_at DESC
LIMIT $4;
"""

SQL_GET_DRIFT_ALERT = """
SELECT a.*, p.program_code, f.ectd_section_path, f.jurisdiction
FROM monitoring.drift_alerts a
LEFT JOIN core.programs p ON p.id = a.program_id
LEFT JOIN prose.smart_fragments f ON f.id = a.fragment_id
WHERE a.id = $1;
"""

SQL_ACKNOWLEDGE_DRIFT_ALERT = """
UPDATE monitoring.drift_alerts
SET status = 'ACKNOWLEDGED',
    acknowledged_at = NOW(),
    acknowledged_by = COALESCE(current_setting('app.user', true), 'unknown'),
    acknowledgment_notes = $2
WHERE id = $1
RETURNING *;
"""

SQL_RESOLVE_DRIFT_ALERT = """
UPDATE monitoring.drift_alerts
SET status = 'RESOLVED',
    resolved_at = NOW(),
    resolved_by = COALESCE(current_setting('app.user', true), 'unknown'),
    resolution_notes = $2
WHERE id = $1
RETURNING *;
"""

SQL_GET_OPEN_ALERTS_SUMMARY = """
SELECT 
    severity::text,
    COUNT(*) AS count,
    MIN(created_at) AS oldest
FROM monitoring.drift_alerts
WHERE status = 'OPEN'
GROUP BY severity
ORDER BY CASE severity WHEN 'RED' THEN 1 WHEN 'AMBER' THEN 2 ELSE 3 END;
"""

# =============================================================================
# Drift History / Trends
# =============================================================================

SQL_GET_FRAGMENT_DRIFT_HISTORY = """
SELECT 
    h.id, h.run_id, h.drift_score, h.similarity_score, h.risk_color,
    h.measured_at
FROM monitoring.drift_history h
WHERE h.fragment_id = $1
  AND h.measured_at >= NOW() - ($2 || ' days')::INTERVAL
ORDER BY h.measured_at;
"""

SQL_GET_SECTION_DRIFT_TREND = """
SELECT 
    DATE_TRUNC('day', h.measured_at) AS day,
    AVG(h.drift_score) AS avg_drift,
    MAX(h.drift_score) AS max_drift,
    COUNT(*) FILTER (WHERE h.risk_color = 'RED') AS red_count
FROM monitoring.drift_history h
JOIN prose.smart_fragments f ON f.id = h.fragment_id
WHERE f.ectd_section_path LIKE $1
  AND h.measured_at >= NOW() - ($2 || ' days')::INTERVAL
GROUP BY DATE_TRUNC('day', h.measured_at)
ORDER BY day;
"""
