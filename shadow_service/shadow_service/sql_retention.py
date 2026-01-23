"""
SQL queries for data retention, legal holds, and archive management.
Part 11 compliant data lifecycle management.
"""

# =============================================================================
# Retention Policies
# =============================================================================

SQL_LIST_RETENTION_POLICIES = """
SELECT 
    id, policy_code, policy_name, description,
    target_schema, target_table,
    retention_years, retention_basis,
    archive_eligible, archive_destination,
    destruction_allowed, destruction_approval_required,
    is_active, created_at, created_by, updated_at
FROM retention.policies
WHERE is_active = COALESCE($1, is_active)
ORDER BY target_schema, target_table;
"""

SQL_GET_RETENTION_POLICY = """
SELECT 
    id, policy_code, policy_name, description,
    target_schema, target_table,
    retention_years, retention_basis,
    archive_eligible, archive_destination,
    destruction_allowed, destruction_approval_required,
    is_active, created_at, created_by, updated_at
FROM retention.policies
WHERE id = $1;
"""

SQL_GET_POLICY_BY_TABLE = """
SELECT 
    id, policy_code, policy_name, retention_years, retention_basis,
    archive_eligible, destruction_allowed
FROM retention.policies
WHERE target_schema = $1 AND target_table = $2 AND is_active = TRUE
LIMIT 1;
"""

# =============================================================================
# Legal Holds
# =============================================================================

SQL_CREATE_LEGAL_HOLD = """
INSERT INTO retention.legal_holds (
    hold_code, hold_name, hold_type, description,
    program_id, target_schema, target_table,
    records_from, records_to,
    hold_start, hold_end,
    matter_reference, custodian_email, legal_counsel,
    created_by
)
VALUES (
    $1, $2, $3::retention.hold_type, $4,
    $5, $6, $7,
    $8, $9,
    COALESCE($10, NOW()), $11,
    $12, $13, $14,
    COALESCE(current_setting('app.user', true), 'unknown')
)
RETURNING *;
"""

SQL_GET_LEGAL_HOLD = """
SELECT 
    lh.*,
    p.program_code,
    p.program_name
FROM retention.legal_holds lh
LEFT JOIN core.programs p ON p.id = lh.program_id
WHERE lh.id = $1;
"""

SQL_LIST_LEGAL_HOLDS = """
SELECT 
    lh.id, lh.hold_code, lh.hold_name, lh.hold_type, lh.description,
    lh.program_id, lh.target_schema, lh.target_table,
    lh.records_from, lh.records_to,
    lh.hold_start, lh.hold_end, lh.is_active,
    lh.matter_reference, lh.custodian_email, lh.legal_counsel,
    lh.created_at, lh.created_by,
    lh.released_at, lh.released_by, lh.release_reason,
    p.program_code
FROM retention.legal_holds lh
LEFT JOIN core.programs p ON p.id = lh.program_id
WHERE lh.is_active = COALESCE($1, lh.is_active)
ORDER BY lh.created_at DESC;
"""

SQL_RELEASE_LEGAL_HOLD = """
UPDATE retention.legal_holds
SET 
    is_active = FALSE,
    release_reason = $2
WHERE id = $1
RETURNING *;
"""

SQL_CHECK_RECORD_HOLD = """
SELECT retention.is_under_legal_hold($1, $2, $3, $4) AS is_held;
"""

# =============================================================================
# Archive Manifests
# =============================================================================

SQL_CREATE_ARCHIVE_MANIFEST = """
INSERT INTO retention.archive_manifests (
    previous_manifest_id, previous_manifest_hash, manifest_hash,
    source_schema, source_table, record_count,
    date_range_from, date_range_to,
    archive_status, archive_location, archive_format, archive_size_bytes,
    content_sha256, record_ids_sha256,
    retention_policy_id, retention_until,
    created_by
)
VALUES (
    $1, $2, $3,
    $4, $5, $6,
    $7, $8,
    'PENDING'::retention.archive_status, $9, $10, $11,
    $12, $13,
    $14, $15,
    COALESCE(current_setting('app.user', true), 'unknown')
)
RETURNING *;
"""

SQL_GET_ARCHIVE_MANIFEST = """
SELECT 
    am.*,
    rp.policy_code,
    rp.policy_name
FROM retention.archive_manifests am
LEFT JOIN retention.policies rp ON rp.id = am.retention_policy_id
WHERE am.id = $1;
"""

SQL_LIST_ARCHIVE_MANIFESTS = """
SELECT 
    am.id, am.manifest_number, am.manifest_hash,
    am.source_schema, am.source_table, am.record_count,
    am.date_range_from, am.date_range_to,
    am.archive_status, am.archive_location,
    am.content_sha256, am.retention_until,
    am.created_at, am.archived_at, am.verified_at
FROM retention.archive_manifests am
WHERE am.source_schema = COALESCE($1, am.source_schema)
  AND am.source_table = COALESCE($2, am.source_table)
  AND am.archive_status = COALESCE($3::retention.archive_status, am.archive_status)
ORDER BY am.manifest_number DESC
LIMIT $4;
"""

SQL_UPDATE_ARCHIVE_STATUS = """
UPDATE retention.archive_manifests
SET 
    archive_status = $2::retention.archive_status,
    archived_at = CASE WHEN $2 = 'ARCHIVED' THEN NOW() ELSE archived_at END,
    verified_at = CASE WHEN $3 THEN NOW() ELSE verified_at END,
    verified_by = CASE WHEN $3 THEN current_setting('app.user', true) ELSE verified_by END
WHERE id = $1
RETURNING *;
"""

SQL_GET_LATEST_MANIFEST = """
SELECT *
FROM retention.archive_manifests
WHERE source_schema = $1 AND source_table = $2
ORDER BY manifest_number DESC
LIMIT 1;
"""

# =============================================================================
# Archive Eligibility
# =============================================================================

SQL_GET_ARCHIVE_ELIGIBLE = """
SELECT * FROM retention.v_archive_eligible
WHERE eligibility = 'ELIGIBLE'
  AND schema_name = COALESCE($1, schema_name)
  AND table_name = COALESCE($2, table_name)
LIMIT $3;
"""

SQL_COUNT_ARCHIVE_ELIGIBLE = """
SELECT 
    schema_name,
    table_name,
    eligibility,
    COUNT(*) as record_count
FROM retention.v_archive_eligible
GROUP BY schema_name, table_name, eligibility
ORDER BY schema_name, table_name;
"""

# =============================================================================
# Record Holds
# =============================================================================

SQL_APPLY_RECORD_HOLD = """
INSERT INTO retention.record_holds (
    legal_hold_id, record_schema, record_table, record_id, applied_by
)
VALUES ($1, $2, $3, $4, COALESCE(current_setting('app.user', true), 'unknown'))
ON CONFLICT (legal_hold_id, record_schema, record_table, record_id) DO NOTHING
RETURNING *;
"""

SQL_RELEASE_RECORD_HOLD = """
UPDATE retention.record_holds
SET released_at = NOW()
WHERE legal_hold_id = $1 AND record_schema = $2 AND record_table = $3 AND record_id = $4
RETURNING *;
"""

SQL_GET_HOLDS_FOR_RECORD = """
SELECT 
    rh.*,
    lh.hold_code,
    lh.hold_name,
    lh.hold_type,
    lh.custodian_email
FROM retention.record_holds rh
JOIN retention.legal_holds lh ON lh.id = rh.legal_hold_id
WHERE rh.record_schema = $1
  AND rh.record_table = $2
  AND rh.record_id = $3
  AND rh.released_at IS NULL
  AND lh.is_active = TRUE;
"""
