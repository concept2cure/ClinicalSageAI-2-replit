"""
SQL queries for purge workflow and governance operations.
Part 11 compliant data lifecycle management with approval workflow.
"""

# =============================================================================
# Purge Request Queries
# =============================================================================

SQL_CREATE_PURGE_REQUEST = """
INSERT INTO audit.purge_requests (
    program_id, object_type, object_id, object_label,
    requested_action, reason, requested_by,
    required_approvals, scheduled_execution_at,
    retention_until_at_request, legal_hold_state_at_request,
    request_id
)
VALUES (
    $1, $2::audit.purge_object_type, $3, $4,
    $5::audit.purge_action_type, $6, COALESCE(current_setting('app.user', true), $7),
    $8, $9,
    -- Capture current retention/hold state for audit
    (SELECT retention_until FROM 
        CASE 
            WHEN $2 = 'SNAPSHOT' THEN (SELECT retention_until FROM prose.submission_snapshots WHERE id = $3)
            WHEN $2 = 'FRAGMENT' THEN (SELECT retention_until FROM prose.smart_fragments WHERE id = $3)
            ELSE NULL
        END
    ),
    retention.is_under_legal_hold(
        CASE $2 
            WHEN 'SNAPSHOT' THEN 'prose'
            WHEN 'FRAGMENT' THEN 'prose'
            WHEN 'TRUTH_DATAPOINT' THEN 'truth'
            ELSE 'audit'
        END,
        CASE $2
            WHEN 'SNAPSHOT' THEN 'submission_snapshots'
            WHEN 'FRAGMENT' THEN 'smart_fragments'
            WHEN 'TRUTH_DATAPOINT' THEN 'clinical_truth_store'
            ELSE 'config_bundles'
        END,
        $3,
        $1
    ),
    current_setting('app.request_id', true)
)
RETURNING *;
"""

# Simplified version that doesn't try to capture state
SQL_CREATE_PURGE_REQUEST_SIMPLE = """
INSERT INTO audit.purge_requests (
    program_id, object_type, object_id, object_label,
    requested_action, reason, requested_by,
    required_approvals, scheduled_execution_at,
    request_id
)
VALUES (
    $1, $2::audit.purge_object_type, $3, $4,
    $5::audit.purge_action_type, $6, COALESCE(current_setting('app.user', true), $7),
    $8, $9,
    current_setting('app.request_id', true)
)
RETURNING *;
"""

SQL_GET_PURGE_REQUEST = """
SELECT 
    pr.*,
    p.program_code
FROM audit.purge_requests pr
LEFT JOIN core.programs p ON p.id = pr.program_id
WHERE pr.id = $1;
"""

SQL_LIST_PURGE_REQUESTS = """
SELECT 
    pr.id,
    pr.request_number,
    p.program_code,
    pr.object_type,
    pr.object_id,
    pr.object_label,
    pr.requested_action,
    pr.status,
    pr.requested_by,
    pr.requested_at,
    (SELECT COUNT(*) FROM audit.purge_approvals pa 
     WHERE pa.purge_request_id = pr.id AND pa.decision = 'APPROVE') AS approval_count,
    (SELECT COUNT(*) FROM audit.purge_approvals pa 
     WHERE pa.purge_request_id = pr.id AND pa.decision = 'REJECT') AS rejection_count,
    array_length(pr.required_approvals, 1) AS required_count
FROM audit.purge_requests pr
LEFT JOIN core.programs p ON p.id = pr.program_id
WHERE ($1::uuid IS NULL OR pr.program_id = $1)
  AND ($2::text IS NULL OR pr.status::text = $2)
  AND ($3::text IS NULL OR pr.object_type::text = $3)
ORDER BY pr.requested_at DESC
LIMIT $4 OFFSET $5;
"""

SQL_COUNT_PURGE_REQUESTS = """
SELECT COUNT(*)
FROM audit.purge_requests pr
WHERE ($1::uuid IS NULL OR pr.program_id = $1)
  AND ($2::text IS NULL OR pr.status::text = $2)
  AND ($3::text IS NULL OR pr.object_type::text = $3);
"""

SQL_UPDATE_PURGE_REQUEST_STATUS = """
UPDATE audit.purge_requests
SET status = $2::audit.purge_request_status
WHERE id = $1
  AND status NOT IN ('COMPLETED', 'CANCELED')
RETURNING *;
"""

SQL_SCHEDULE_PURGE_REQUEST = """
UPDATE audit.purge_requests
SET 
    status = 'SCHEDULED',
    scheduled_execution_at = $2
WHERE id = $1
  AND status = 'APPROVED'
RETURNING *;
"""

SQL_CANCEL_PURGE_REQUEST = """
UPDATE audit.purge_requests
SET status = 'CANCELED'
WHERE id = $1
  AND status IN ('REQUESTED', 'PENDING_APPROVAL', 'APPROVED', 'SCHEDULED')
RETURNING *;
"""

# =============================================================================
# Approval Queries
# =============================================================================

SQL_CREATE_PURGE_APPROVAL = """
INSERT INTO audit.purge_approvals (
    purge_request_id, approver_role, approver_identity, approver_email,
    decision, decision_reason, request_id
)
VALUES (
    $1, $2::audit.purge_approver_role, 
    COALESCE(current_setting('app.user', true), $3),
    $4,
    $5, $6,
    current_setting('app.request_id', true)
)
RETURNING *;
"""

SQL_GET_PURGE_APPROVALS = """
SELECT *
FROM audit.purge_approvals
WHERE purge_request_id = $1
ORDER BY decided_at;
"""

SQL_GET_APPROVAL_STATUS = """
SELECT * FROM audit.get_purge_approval_status($1);
"""

SQL_CHECK_ALL_APPROVALS = """
SELECT audit.purge_request_has_all_approvals($1) AS all_approved;
"""

# =============================================================================
# Execution Queries
# =============================================================================

SQL_CHECK_CAN_EXECUTE = """
SELECT * FROM audit.can_execute_purge($1);
"""

SQL_START_EXECUTION = """
UPDATE audit.purge_requests
SET 
    status = 'EXECUTING',
    executed_by = COALESCE(current_setting('app.user', true), $2)
WHERE id = $1
  AND status IN ('APPROVED', 'SCHEDULED')
RETURNING *;
"""

SQL_COMPLETE_EXECUTION = """
UPDATE audit.purge_requests
SET 
    status = 'COMPLETED',
    executed_at = NOW(),
    execution_result = $2,
    tombstone_id = $3,
    content_hash_preserved = $4
WHERE id = $1
  AND status = 'EXECUTING'
RETURNING *;
"""

SQL_FAIL_EXECUTION = """
UPDATE audit.purge_requests
SET 
    status = 'FAILED',
    failure_reason = $2,
    retry_count = retry_count + 1,
    execution_result = $3
WHERE id = $1
  AND status = 'EXECUTING'
RETURNING *;
"""

# =============================================================================
# Tombstone Queries
# =============================================================================

SQL_CREATE_TOMBSTONE = """
INSERT INTO audit.tombstones (
    purge_request_id,
    original_schema, original_table, original_id,
    content_hash, metadata_hash,
    record_existed_from, record_existed_to,
    tombstoned_by, tombstone_reason,
    related_tombstone_ids, request_id
)
VALUES (
    $1,
    $2, $3, $4,
    $5, $6,
    $7, NOW(),
    COALESCE(current_setting('app.user', true), $8), $9,
    $10, current_setting('app.request_id', true)
)
RETURNING *;
"""

SQL_GET_TOMBSTONE = """
SELECT * FROM audit.tombstones WHERE id = $1;
"""

SQL_GET_TOMBSTONES_FOR_REQUEST = """
SELECT * FROM audit.tombstones WHERE purge_request_id = $1;
"""

SQL_FIND_TOMBSTONE_BY_ORIGINAL = """
SELECT * FROM audit.tombstones
WHERE original_schema = $1 AND original_table = $2 AND original_id = $3
ORDER BY tombstoned_at DESC
LIMIT 1;
"""

# =============================================================================
# Audit Trail Queries
# =============================================================================

SQL_GET_PURGE_AUDIT_TRAIL = """
SELECT * FROM audit.v_purge_audit_trail
WHERE ($1::uuid IS NULL OR request_id = $1)
  AND ($2::timestamptz IS NULL OR requested_at >= $2)
  AND ($3::timestamptz IS NULL OR requested_at <= $3)
ORDER BY requested_at DESC
LIMIT $4;
"""

SQL_GET_PENDING_PURGE_REQUESTS = """
SELECT * FROM audit.v_pending_purge_requests
WHERE ($1::uuid IS NULL OR program_id = $1)
ORDER BY requested_at DESC;
"""

# =============================================================================
# Stats Queries
# =============================================================================

SQL_GET_PURGE_WORKFLOW_STATS = """
SELECT 
    COUNT(*) AS total_requests,
    COUNT(*) FILTER (WHERE status = 'PENDING_APPROVAL') AS pending_approval,
    COUNT(*) FILTER (WHERE status IN ('APPROVED', 'SCHEDULED')) AS approved_awaiting_execution,
    COUNT(*) FILTER (WHERE status = 'COMPLETED') AS completed,
    COUNT(*) FILTER (WHERE status = 'REJECTED') AS rejected,
    COUNT(*) FILTER (WHERE status = 'FAILED') AS failed,
    -- Average time from request to first approval (in hours)
    AVG(EXTRACT(EPOCH FROM (
        (SELECT MIN(decided_at) FROM audit.purge_approvals pa WHERE pa.purge_request_id = pr.id)
        - pr.requested_at
    )) / 3600) FILTER (WHERE status != 'REQUESTED') AS avg_approval_time_hours,
    -- Days since oldest pending request
    EXTRACT(DAY FROM NOW() - MIN(requested_at) FILTER (WHERE status IN ('REQUESTED', 'PENDING_APPROVAL'))) AS oldest_pending_days
FROM audit.purge_requests pr
WHERE ($1::uuid IS NULL OR pr.program_id = $1);
"""

# =============================================================================
# Retention Sweep Queries (for background job)
# =============================================================================

SQL_FIND_RETENTION_EXPIRED_RECORDS = """
SELECT 
    'SNAPSHOT' AS object_type,
    id AS object_id,
    snapshot_name AS object_label,
    program_id,
    retention_until,
    legal_hold
FROM prose.submission_snapshots
WHERE retention_until IS NOT NULL
  AND retention_until < NOW()
  AND legal_hold = FALSE
  AND archive_status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM audit.purge_requests pr
    WHERE pr.object_type = 'SNAPSHOT'
    AND pr.object_id = prose.submission_snapshots.id
    AND pr.status NOT IN ('COMPLETED', 'CANCELED', 'REJECTED')
  )

UNION ALL

SELECT 
    'FRAGMENT' AS object_type,
    id AS object_id,
    ectd_section_path AS object_label,
    program_id,
    retention_until,
    legal_hold
FROM prose.smart_fragments
WHERE retention_until IS NOT NULL
  AND retention_until < NOW()
  AND legal_hold = FALSE
  AND archive_status = 'ACTIVE'
  AND NOT EXISTS (
    SELECT 1 FROM audit.purge_requests pr
    WHERE pr.object_type = 'FRAGMENT'
    AND pr.object_id = prose.smart_fragments.id
    AND pr.status NOT IN ('COMPLETED', 'CANCELED', 'REJECTED')
  )

ORDER BY retention_until
LIMIT $1;
"""

SQL_COUNT_RETENTION_EXPIRED = """
SELECT 
    COUNT(*) FILTER (WHERE object_type = 'SNAPSHOT') AS expired_snapshots,
    COUNT(*) FILTER (WHERE object_type = 'FRAGMENT') AS expired_fragments,
    COUNT(*) AS total_expired
FROM (
    SELECT 'SNAPSHOT' AS object_type, id
    FROM prose.submission_snapshots
    WHERE retention_until < NOW() AND legal_hold = FALSE AND archive_status = 'ACTIVE'
    
    UNION ALL
    
    SELECT 'FRAGMENT' AS object_type, id
    FROM prose.smart_fragments
    WHERE retention_until < NOW() AND legal_hold = FALSE AND archive_status = 'ACTIVE'
) expired;
"""

# =============================================================================
# Idempotency Queries
# =============================================================================

SQL_CHECK_IDEMPOTENCY_KEY = """
SELECT * FROM audit.check_idempotency_key($1, $2, $3, $4);
"""

SQL_STORE_IDEMPOTENCY_KEY = """
SELECT audit.store_idempotency_key($1, $2, $3, $4, $5, $6, $7);
"""

SQL_CLEANUP_EXPIRED_IDEMPOTENCY = """
SELECT audit.cleanup_expired_idempotency_keys() AS deleted_count;
"""

# =============================================================================
# Rate Limiting Queries
# =============================================================================

SQL_CHECK_RATE_LIMIT = """
SELECT * FROM audit.check_rate_limit($1, $2, $3, $4, $5);
"""
