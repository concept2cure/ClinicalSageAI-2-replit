"""
SQL queries for e-signatures and submission gate workflow.

Part 11-supporting electronic signature operations:
- Insert signatures (append-only)
- Check signature requirements
- Query signature status
- Submission gate enforcement
"""

# =============================================================================
# E-Signature Operations
# =============================================================================

SQL_INSERT_E_SIGNATURE = """
INSERT INTO audit.e_signatures (
    signed_object_type,
    signed_object_id,
    signer_identity,
    signer_role,
    meaning,
    signature_method,
    signature_statement,
    signature_hash,
    signature_payload
)
VALUES ($1::audit.signed_object_type, $2, $3, $4, $5::audit.signature_meaning, $6, $7, $8, $9::jsonb)
RETURNING id, signed_at, request_id;
"""

SQL_GET_SIGNATURE_BY_ID = """
SELECT
    id,
    signed_object_type,
    signed_object_id,
    signer_identity,
    signer_role,
    meaning,
    signature_method,
    signature_statement,
    signature_hash,
    signature_payload,
    signed_at,
    request_id
FROM audit.e_signatures
WHERE id = $1;
"""

SQL_GET_SIGNATURES_FOR_EXPORT = """
SELECT
    id,
    signed_object_type,
    signed_object_id,
    signer_identity,
    signer_role,
    meaning,
    signature_method,
    signature_statement,
    signature_hash,
    signature_payload,
    signed_at,
    request_id
FROM audit.e_signatures
WHERE signed_object_type = 'SNAPSHOT_EXPORT'
  AND signed_object_id = $1
ORDER BY signed_at;
"""

SQL_GET_SIGNATURES_BY_SIGNER = """
SELECT
    id,
    signed_object_type,
    signed_object_id,
    signer_identity,
    signer_role,
    meaning,
    signature_method,
    signed_at
FROM audit.e_signatures
WHERE signer_identity = $1
ORDER BY signed_at DESC
LIMIT $2 OFFSET $3;
"""

# =============================================================================
# Signature Requirement Checking
# =============================================================================

SQL_CHECK_EXPORT_SIGNATURES = """
SELECT * FROM prose.fn_check_export_signatures($1, $2, $3);
"""

SQL_GET_EXPORT_SIGNOFF_STATUS = """
SELECT
    export_id,
    snapshot_id,
    manifest_sha256,
    export_format,
    export_created_at,
    export_created_by,
    signatures,
    approve_count,
    review_count,
    author_count
FROM prose.v_export_signoff_status
WHERE export_id = $1;
"""

SQL_GET_SNAPSHOT_SUBMISSION_READINESS = """
SELECT
    snapshot_id,
    snapshot_label,
    status,
    jurisdiction,
    required_approver_roles,
    required_approval_meaning,
    submitted_export_id,
    latest_export_id,
    latest_export_sha256,
    latest_export_at,
    signed_roles,
    missing_roles,
    ready_to_submit
FROM prose.v_snapshot_submission_readiness
WHERE snapshot_id = $1;
"""

# =============================================================================
# Submission Operations
# =============================================================================

SQL_SUBMIT_SNAPSHOT = """
UPDATE prose.submission_snapshots
SET 
    status = 'SUBMITTED',
    submitted_export_id = $2,
    updated_at = NOW()
WHERE id = $1
  AND status = 'FROZEN'
RETURNING id, label, status, submitted_export_id, updated_at;
"""

SQL_GET_SNAPSHOT_FOR_SUBMISSION = """
SELECT
    id,
    label,
    status,
    jurisdiction,
    agency_code,
    frozen_at,
    frozen_by,
    required_approver_roles,
    required_approval_meaning,
    submitted_export_id
FROM prose.submission_snapshots
WHERE id = $1;
"""

# =============================================================================
# Submission Events Logging
# =============================================================================

SQL_INSERT_SUBMISSION_EVENT = """
INSERT INTO audit.submission_events (
    snapshot_id,
    export_id,
    event_type,
    event_details
)
VALUES ($1, $2, $3, $4::jsonb)
RETURNING id, created_at, actor, request_id;
"""

SQL_GET_SUBMISSION_EVENTS = """
SELECT
    id,
    snapshot_id,
    export_id,
    event_type,
    event_details,
    actor,
    created_at,
    request_id
FROM audit.submission_events
WHERE snapshot_id = $1
ORDER BY created_at DESC
LIMIT $2;
"""

# =============================================================================
# Export Operations (extended from sql_exports.py)
# =============================================================================

SQL_GET_EXPORT_WITH_SNAPSHOT = """
SELECT
    e.id AS export_id,
    e.snapshot_id,
    e.export_format,
    e.manifest_sha256,
    e.manifest_json,
    e.export_purpose,
    e.export_destination,
    e.created_at AS export_created_at,
    e.created_by AS export_created_by,
    s.label AS snapshot_label,
    s.status AS snapshot_status,
    s.jurisdiction,
    s.required_approver_roles,
    s.required_approval_meaning
FROM prose.submission_snapshot_exports e
JOIN prose.submission_snapshots s ON s.id = e.snapshot_id
WHERE e.id = $1;
"""

SQL_LIST_EXPORTS_FOR_SNAPSHOT = """
SELECT
    e.id AS export_id,
    e.snapshot_id,
    e.export_format,
    e.manifest_sha256,
    e.created_at,
    e.created_by,
    (
        SELECT COUNT(*)
        FROM audit.e_signatures sig
        WHERE sig.signed_object_type = 'SNAPSHOT_EXPORT'
          AND sig.signed_object_id = e.id
    )::INT AS signature_count
FROM prose.submission_snapshot_exports e
WHERE e.snapshot_id = $1
ORDER BY e.created_at DESC;
"""

# =============================================================================
# Workflow Summary Queries
# =============================================================================

SQL_GET_PENDING_SUBMISSIONS = """
SELECT
    s.id AS snapshot_id,
    s.label,
    s.status,
    s.jurisdiction,
    s.frozen_at,
    s.required_approver_roles,
    sr.latest_export_id,
    sr.signed_roles,
    sr.missing_roles,
    sr.ready_to_submit
FROM prose.submission_snapshots s
JOIN prose.v_snapshot_submission_readiness sr ON sr.snapshot_id = s.id
WHERE s.status = 'FROZEN'
  AND sr.latest_export_id IS NOT NULL
ORDER BY s.frozen_at DESC;
"""

SQL_GET_RECENT_SUBMISSIONS = """
SELECT
    s.id AS snapshot_id,
    s.label,
    s.status,
    s.jurisdiction,
    s.submitted_export_id,
    s.updated_at AS submitted_at,
    e.manifest_sha256,
    (
        SELECT jsonb_agg(jsonb_build_object(
            'role', sig.signer_role,
            'signer', sig.signer_identity,
            'signed_at', sig.signed_at
        ) ORDER BY sig.signed_at)
        FROM audit.e_signatures sig
        WHERE sig.signed_object_type = 'SNAPSHOT_EXPORT'
          AND sig.signed_object_id = s.submitted_export_id
          AND sig.meaning = 'APPROVE'
    ) AS approvers
FROM prose.submission_snapshots s
LEFT JOIN prose.submission_snapshot_exports e ON e.id = s.submitted_export_id
WHERE s.status = 'SUBMITTED'
ORDER BY s.updated_at DESC
LIMIT $1;
"""
