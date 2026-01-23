"""
SQL queries for run groups and enhanced audit logging with version pinning.

Supports:
- Creating run groups for batch operations
- Inserting audit logs with version pinning and persona tracking
- Querying run group summaries
"""

# =============================================================================
# Run Group Operations
# =============================================================================

SQL_INSERT_RUN_GROUP = """
INSERT INTO audit.shadow_run_groups (
    run_name, run_type, jurisdiction, agency_code, persona_set, config
)
VALUES ($1, $2, $3, $4, $5, $6::jsonb)
RETURNING id, created_at, created_by;
"""

SQL_GET_RUN_GROUP = """
SELECT 
    id, run_name, run_type, jurisdiction, agency_code, 
    persona_set, config, created_at, created_by, request_id
FROM audit.shadow_run_groups
WHERE id = $1;
"""

SQL_LIST_RUN_GROUPS = """
SELECT 
    id, run_name, run_type, jurisdiction, agency_code,
    persona_set, config, created_at, created_by
FROM audit.shadow_run_groups
ORDER BY created_at DESC
LIMIT $1 OFFSET $2;
"""

# =============================================================================
# Enhanced Audit Log Insert (with version pinning + persona)
# =============================================================================

SQL_INSERT_AUDIT_LOG_ENHANCED = """
INSERT INTO audit.concomitant_audit_logs (
    fragment_id, 
    fragment_version_id, 
    run_group_id,
    agent_identity, 
    agent_persona,
    risk_status, 
    feedback_payload, 
    drift_magnitude
)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
RETURNING id, created_at;
"""

# =============================================================================
# Run Group Summary Queries
# =============================================================================

SQL_GET_RUN_GROUP_SUMMARY = """
SELECT
    run_group_id,
    run_name,
    run_type,
    jurisdiction,
    agency_code,
    persona_set,
    started_at,
    created_by,
    agent_persona,
    logs_count,
    red_count,
    amber_count,
    green_count,
    finished_at,
    avg_drift
FROM audit.v_run_group_summary
WHERE run_group_id = $1;
"""

SQL_GET_RUN_GROUP_DETAILS = """
SELECT
    l.id AS audit_log_id,
    l.fragment_id,
    l.fragment_version_id,
    l.agent_persona,
    l.risk_status,
    l.drift_magnitude,
    l.feedback_payload,
    l.created_at,
    fv.ectd_section_path,
    fv.jurisdiction AS fragment_jurisdiction
FROM audit.concomitant_audit_logs l
LEFT JOIN prose.smart_fragment_versions fv 
    ON fv.fragment_id = l.fragment_id AND fv.version_id = l.fragment_version_id
WHERE l.run_group_id = $1
ORDER BY l.created_at;
"""

# =============================================================================
# Precedent Retrieval with Persona Filtering
# =============================================================================

SQL_RETRIEVE_PRECEDENTS_WITH_PERSONA = """
SELECT
    id,
    agency_code,
    failure_mode,
    historical_question,
    (1 - (precedent_vector <=> $1::vector)) AS similarity
FROM adversarial.regulatory_adversarial_precedents
WHERE precedent_vector IS NOT NULL
  AND ($2::text IS NULL OR agency_code = $2)
  AND ($3::text[] IS NULL OR failure_mode = ANY($3))
ORDER BY precedent_vector <=> $1::vector
LIMIT $4;
"""

# =============================================================================
# Fragment Version Queries (for version pinning)
# =============================================================================

SQL_GET_CURRENT_FRAGMENT_VERSION = """
SELECT 
    fragment_id, 
    version_id,
    content_prose,
    ectd_section_path,
    jurisdiction
FROM prose.smart_fragment_versions
WHERE fragment_id = $1
ORDER BY version_id DESC
LIMIT 1;
"""

SQL_GET_FRAGMENTS_BY_SECTION = """
SELECT DISTINCT ON (fv.fragment_id)
    fv.fragment_id,
    fv.version_id,
    fv.content_prose,
    fv.ectd_section_path,
    fv.jurisdiction
FROM prose.smart_fragment_versions fv
WHERE fv.ectd_section_path LIKE $1
  AND ($2::text IS NULL OR fv.jurisdiction = $2)
ORDER BY fv.fragment_id, fv.version_id DESC;
"""

# =============================================================================
# Cross-Persona Analysis
# =============================================================================

SQL_GET_LATEST_RISK_BY_PERSONA = """
SELECT
    fragment_id,
    agent_persona,
    audit_log_id,
    fragment_version_id,
    risk_status,
    drift_magnitude,
    feedback_payload,
    last_interrogated_at,
    run_group_id
FROM audit.v_fragment_latest_risk_by_persona
WHERE fragment_id = $1;
"""

SQL_GET_CROSS_PERSONA_DISAGREEMENTS = """
SELECT
    fragment_id,
    persona_1,
    persona_2,
    risk_1,
    risk_2,
    alignment_status,
    drift_delta
FROM audit.v_cross_persona_risk_matrix
WHERE alignment_status = 'DISAGREEMENT'
ORDER BY drift_delta DESC
LIMIT $1;
"""

# =============================================================================
# Batch Statistics
# =============================================================================

SQL_GET_PERSONA_PERFORMANCE_STATS = """
SELECT
    agent_persona,
    COUNT(*) AS total_evaluations,
    COUNT(*) FILTER (WHERE risk_status = 'DATA_DRIFT') AS red_count,
    COUNT(*) FILTER (WHERE risk_status = 'IR_PREDICTED') AS amber_count,
    COUNT(*) FILTER (WHERE risk_status = 'ALIGNED') AS green_count,
    ROUND(AVG(drift_magnitude)::NUMERIC, 4) AS avg_drift,
    ROUND(STDDEV(drift_magnitude)::NUMERIC, 4) AS stddev_drift
FROM audit.concomitant_audit_logs
WHERE agent_persona IS NOT NULL
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY agent_persona
ORDER BY total_evaluations DESC;
"""
