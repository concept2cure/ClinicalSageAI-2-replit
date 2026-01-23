"""
SQL queries for snapshot export manifest operations.

Supports:
- Generating canonical manifests
- Persisting export records
- Querying export history
"""

# =============================================================================
# Manifest Generation
# =============================================================================

SQL_GENERATE_MANIFEST = """
SELECT prose.fn_generate_snapshot_manifest($1) AS manifest;
"""

SQL_EXPORT_SNAPSHOT = """
SELECT * FROM prose.fn_export_snapshot($1, $2, $3, $4, $5);
"""

# =============================================================================
# Export Record Operations
# =============================================================================

SQL_INSERT_EXPORT_RECORD = """
INSERT INTO prose.submission_snapshot_exports (
    snapshot_id, 
    export_format, 
    manifest_sha256, 
    manifest_json,
    export_purpose,
    export_destination
)
VALUES ($1, $2, $3, $4::jsonb, $5, $6)
RETURNING id, created_at, created_by;
"""

SQL_GET_EXPORT_BY_ID = """
SELECT 
    id AS export_id,
    snapshot_id,
    export_format,
    manifest_sha256,
    manifest_json,
    export_purpose,
    export_destination,
    created_at,
    created_by,
    request_id
FROM prose.submission_snapshot_exports
WHERE id = $1;
"""

SQL_GET_EXPORT_BY_SHA256 = """
SELECT 
    id AS export_id,
    snapshot_id,
    export_format,
    manifest_sha256,
    manifest_json,
    export_purpose,
    export_destination,
    created_at,
    created_by
FROM prose.submission_snapshot_exports
WHERE manifest_sha256 = $1;
"""

# =============================================================================
# Export History Queries
# =============================================================================

SQL_GET_EXPORT_HISTORY = """
SELECT
    export_id,
    snapshot_id,
    snapshot_label,
    snapshot_status,
    jurisdiction,
    export_format,
    manifest_sha256,
    export_purpose,
    export_destination,
    exported_at,
    exported_by,
    manifest_summary
FROM prose.v_snapshot_export_history
ORDER BY exported_at DESC
LIMIT $1 OFFSET $2;
"""

SQL_GET_EXPORTS_FOR_SNAPSHOT = """
SELECT
    export_id,
    snapshot_id,
    snapshot_label,
    snapshot_status,
    jurisdiction,
    export_format,
    manifest_sha256,
    export_purpose,
    export_destination,
    exported_at,
    exported_by,
    manifest_summary
FROM prose.v_snapshot_export_history
WHERE snapshot_id = $1
ORDER BY exported_at DESC;
"""

# =============================================================================
# Manifest Verification
# =============================================================================

SQL_VERIFY_MANIFEST_INTEGRITY = """
SELECT
    e.id AS export_id,
    e.manifest_sha256,
    encode(sha256(e.manifest_json::TEXT::BYTEA), 'hex') AS computed_sha256,
    CASE 
        WHEN e.manifest_sha256 = encode(sha256(e.manifest_json::TEXT::BYTEA), 'hex')
        THEN 'VALID'
        ELSE 'TAMPERED'
    END AS integrity_status
FROM prose.submission_snapshot_exports e
WHERE e.id = $1;
"""

SQL_BATCH_VERIFY_INTEGRITY = """
SELECT
    e.id AS export_id,
    e.snapshot_id,
    e.manifest_sha256,
    encode(sha256(e.manifest_json::TEXT::BYTEA), 'hex') AS computed_sha256,
    CASE 
        WHEN e.manifest_sha256 = encode(sha256(e.manifest_json::TEXT::BYTEA), 'hex')
        THEN 'VALID'
        ELSE 'TAMPERED'
    END AS integrity_status,
    e.created_at
FROM prose.submission_snapshot_exports e
WHERE e.created_at >= $1
ORDER BY e.created_at DESC;
"""

# =============================================================================
# Snapshot Content Queries (for building manifest in Python)
# =============================================================================

SQL_GET_SNAPSHOT_HEADER = """
SELECT 
    id,
    label,
    status,
    jurisdiction,
    agency_code,
    frozen_at,
    created_by,
    created_at
FROM prose.submission_snapshots
WHERE id = $1;
"""

SQL_GET_SNAPSHOT_GATE_METRICS = """
SELECT *
FROM prose.v_snapshot_gate_metrics
WHERE snapshot_id = $1;
"""

SQL_GET_SNAPSHOT_FRAGMENTS_WITH_CONTENT = """
SELECT
    sf.fragment_id,
    sf.version_id,
    sf.audit_log_id,
    fv.ectd_section_path,
    fv.jurisdiction,
    fv.content_prose,
    al.risk_status,
    al.drift_magnitude,
    al.agent_persona,
    al.feedback_payload
FROM prose.submission_snapshot_fragments sf
LEFT JOIN prose.smart_fragment_versions fv 
    ON fv.fragment_id = sf.fragment_id AND fv.version_id = sf.version_id
LEFT JOIN audit.concomitant_audit_logs al 
    ON al.id = sf.audit_log_id
WHERE sf.snapshot_id = $1
ORDER BY fv.ectd_section_path;
"""

SQL_GET_FRAGMENT_TRUTH_CITATIONS = """
SELECT
    tl.fragment_id,
    tl.truth_id,
    tl.link_type,
    ts.truth_type,
    ts.source_reference,
    ts.numeric_value,
    ts.confidence_score,
    ts.provenance_hash
FROM prose.fragment_truth_links tl
JOIN truth.clinical_truth_store ts ON ts.id = tl.truth_id
WHERE tl.fragment_id = ANY($1::int[]);
"""
