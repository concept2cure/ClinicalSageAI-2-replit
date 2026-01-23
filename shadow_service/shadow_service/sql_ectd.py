"""
SQL queries for eCTD submission package operations.
"""

# =============================================================================
# Submission Packages
# =============================================================================

SQL_LIST_PACKAGES = """
SELECT 
    pkg.id, pkg.package_code, pkg.package_name,
    pkg.submission_id, s.submission_code,
    pkg.sequence_number, pkg.agency_code, pkg.package_type,
    pkg.status, pkg.is_validated,
    pkg.snapshot_id, pkg.export_id,
    pkg.manifest_sha256, pkg.delivered_at,
    pkg.program_id, p.program_code,
    pkg.created_at, pkg.created_by, pkg.updated_at,
    (SELECT COUNT(*) FROM ectd.package_documents d WHERE d.package_id = pkg.id) AS document_count,
    (SELECT COUNT(*) FROM ectd.validation_results v WHERE v.package_id = pkg.id AND v.passed = FALSE AND v.severity = 'ERROR') AS error_count
FROM ectd.submission_packages pkg
LEFT JOIN regulatory.submissions s ON s.id = pkg.submission_id
LEFT JOIN core.programs p ON p.id = pkg.program_id
WHERE ($1::uuid IS NULL OR pkg.program_id = $1)
  AND ($2::text IS NULL OR pkg.status::text = $2)
ORDER BY pkg.created_at DESC;
"""

SQL_GET_PACKAGE = """
SELECT pkg.*, s.submission_code, p.program_code
FROM ectd.submission_packages pkg
LEFT JOIN regulatory.submissions s ON s.id = pkg.submission_id
LEFT JOIN core.programs p ON p.id = pkg.program_id
WHERE pkg.id = $1;
"""

SQL_CREATE_PACKAGE = """
INSERT INTO ectd.submission_packages (
    package_code, package_name, submission_id,
    sequence_number, agency_code, package_type,
    status, snapshot_id, program_id, created_by
)
VALUES ($1, $2, $3, 
        COALESCE($4, (SELECT COALESCE(MAX(sequence_number), -1) + 1 FROM ectd.submission_packages WHERE submission_id = $3)),
        $5, COALESCE($6, 'ORIGINAL'), 'DRAFT', $7, $8,
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_PACKAGE_STATUS = """
UPDATE ectd.submission_packages
SET status = $2::ectd.package_status,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

SQL_SET_PACKAGE_VALIDATED = """
UPDATE ectd.submission_packages
SET is_validated = TRUE,
    validated_at = NOW(),
    validated_by = COALESCE(current_setting('app.user', true), 'unknown'),
    status = CASE WHEN $2 = TRUE THEN 'READY' ELSE status END,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

SQL_SET_PACKAGE_MANIFEST = """
UPDATE ectd.submission_packages
SET manifest_xml = $2,
    manifest_sha256 = $3,
    updated_at = NOW()
WHERE id = $1
RETURNING id, manifest_sha256;
"""

SQL_MARK_PACKAGE_DELIVERED = """
UPDATE ectd.submission_packages
SET status = 'DELIVERED',
    delivered_at = NOW(),
    delivered_by = COALESCE(current_setting('app.user', true), 'unknown'),
    delivery_method = $2,
    delivery_confirmation = $3,
    updated_at = NOW()
WHERE id = $1
RETURNING *;
"""

# =============================================================================
# Package Documents
# =============================================================================

SQL_LIST_PACKAGE_DOCUMENTS = """
SELECT 
    d.id, d.package_id, d.module_code,
    ms.module_name, ms.module_level,
    d.document_title, d.file_name, d.file_type,
    d.source_type, d.source_fragment_id, d.source_snapshot_id,
    d.content_sha256, d.file_size_bytes, d.page_count,
    d.ectd_operation, d.ectd_leaf_id,
    d.status, d.sequence_order,
    d.created_at, d.created_by
FROM ectd.package_documents d
JOIN ectd.module_structure ms ON ms.module_code = d.module_code
WHERE d.package_id = $1
ORDER BY ms.module_code, d.sequence_order;
"""

SQL_GET_PACKAGE_DOCUMENT = """
SELECT d.*, ms.module_name
FROM ectd.package_documents d
JOIN ectd.module_structure ms ON ms.module_code = d.module_code
WHERE d.id = $1;
"""

SQL_ADD_PACKAGE_DOCUMENT = """
INSERT INTO ectd.package_documents (
    package_id, module_code, document_title, file_name, file_type,
    source_type, source_fragment_id, source_version_id, source_snapshot_id, source_export_id,
    content_sha256, file_size_bytes, page_count,
    ectd_operation, ectd_leaf_id, status, sequence_order,
    metadata, created_by
)
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        COALESCE($14, 'new'), $15, COALESCE($16::ectd.document_status, 'PENDING'),
        COALESCE($17, (SELECT COALESCE(MAX(sequence_order), 0) + 1 FROM ectd.package_documents WHERE package_id = $1 AND module_code = $2)),
        COALESCE($18::jsonb, '{}'::jsonb),
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_DOCUMENT_STATUS = """
UPDATE ectd.package_documents
SET status = $2::ectd.document_status
WHERE id = $1
RETURNING *;
"""

SQL_GET_MODULE_COMPLETION = """
SELECT 
    ms.module_code,
    ms.module_name,
    ms.module_level,
    ms.is_required,
    COALESCE(COUNT(d.id), 0) AS document_count,
    CASE 
        WHEN COUNT(d.id) > 0 THEN 'POPULATED'
        WHEN ms.is_required THEN 'MISSING'
        ELSE 'OPTIONAL'
    END AS completion_status
FROM ectd.module_structure ms
LEFT JOIN ectd.package_documents d ON d.package_id = $1 AND d.module_code = ms.module_code
WHERE ms.module_level <= 3
  AND ($2::text IS NULL OR ms.module_code LIKE $2 || '%')
GROUP BY ms.module_code, ms.module_name, ms.module_level, ms.is_required
ORDER BY ms.module_code;
"""

# =============================================================================
# Module Structure
# =============================================================================

SQL_LIST_MODULE_STRUCTURE = """
SELECT 
    id, module_code, module_name, parent_module_code,
    module_level, is_regional, content_type, is_required,
    allowed_file_types,
    fda_specific, ema_specific, pmda_specific,
    description, guidance_reference
FROM ectd.module_structure
WHERE ($1::int IS NULL OR module_level <= $1)
  AND ($2::text IS NULL OR module_code LIKE $2 || '%')
ORDER BY module_code;
"""

SQL_GET_MODULE = """
SELECT * FROM ectd.module_structure WHERE module_code = $1;
"""

# =============================================================================
# Validation
# =============================================================================

SQL_LIST_VALIDATION_RULES = """
SELECT 
    id, rule_code, rule_name,
    agency_code, module_code,
    rule_type, severity,
    rule_expression, error_message,
    guidance_reference, is_active
FROM ectd.validation_rules
WHERE ($1::text IS NULL OR agency_code IS NULL OR agency_code = $1)
  AND ($2::text IS NULL OR module_code IS NULL OR module_code = $2)
  AND is_active = TRUE
ORDER BY rule_code;
"""

SQL_ADD_VALIDATION_RESULT = """
INSERT INTO ectd.validation_results (
    package_id, document_id, rule_id,
    passed, severity, message, details
)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)
RETURNING *;
"""

SQL_GET_VALIDATION_RESULTS = """
SELECT 
    vr.id, vr.package_id, vr.document_id,
    vr.rule_id, r.rule_code, r.rule_name,
    vr.passed, vr.severity, vr.message, vr.details,
    vr.validated_at,
    d.document_title, d.module_code
FROM ectd.validation_results vr
JOIN ectd.validation_rules r ON r.id = vr.rule_id
LEFT JOIN ectd.package_documents d ON d.id = vr.document_id
WHERE vr.package_id = $1
  AND ($2::boolean IS NULL OR vr.passed = $2)
ORDER BY 
    CASE vr.severity WHEN 'ERROR' THEN 1 WHEN 'WARNING' THEN 2 ELSE 3 END,
    vr.validated_at;
"""

SQL_CLEAR_VALIDATION_RESULTS = """
DELETE FROM ectd.validation_results WHERE package_id = $1;
"""

# =============================================================================
# Delivery
# =============================================================================

SQL_CREATE_DELIVERY_RECORD = """
INSERT INTO ectd.delivery_records (
    package_id, delivery_method, delivery_destination,
    status, delivered_by
)
VALUES ($1, $2, $3, 'INITIATED',
        COALESCE(current_setting('app.user', true), 'unknown'))
RETURNING *;
"""

SQL_UPDATE_DELIVERY_STATUS = """
UPDATE ectd.delivery_records
SET status = $2,
    completed_at = CASE WHEN $2 IN ('COMPLETED', 'FAILED') THEN NOW() ELSE completed_at END,
    confirmation_number = COALESCE($3, confirmation_number),
    agency_receipt_number = COALESCE($4, agency_receipt_number),
    error_message = $5,
    transfer_size_bytes = $6,
    transfer_duration_seconds = $7
WHERE id = $1
RETURNING *;
"""

SQL_SET_DELIVERY_ACKNOWLEDGED = """
UPDATE ectd.delivery_records
SET acknowledgment_received = TRUE,
    acknowledgment_at = NOW()
WHERE id = $1
RETURNING *;
"""

SQL_LIST_DELIVERY_RECORDS = """
SELECT 
    dr.id, dr.package_id, dr.delivery_method, dr.delivery_destination,
    dr.status, dr.initiated_at, dr.completed_at,
    dr.confirmation_number, dr.agency_receipt_number,
    dr.acknowledgment_received, dr.acknowledgment_at,
    dr.error_message, dr.retry_count,
    dr.transfer_size_bytes, dr.transfer_duration_seconds,
    dr.delivered_by,
    pkg.package_code
FROM ectd.delivery_records dr
JOIN ectd.submission_packages pkg ON pkg.id = dr.package_id
WHERE dr.package_id = $1
ORDER BY dr.initiated_at DESC;
"""
