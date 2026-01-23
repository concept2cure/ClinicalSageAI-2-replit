"""SQL queries for Shadow Interrogation Service.

All queries use parameterized statements to prevent SQL injection.
Parameters are positional ($1, $2, etc.) for asyncpg.
"""

# =============================================================================
# Truth Store Queries
# =============================================================================

INSERT_TRUTH = """
INSERT INTO truth.clinical_truth_store (
    nct_id,
    substance_id,
    metric_name,
    metric_value_float,
    metric_value_text,
    is_primary_endpoint,
    source_document_ref,
    source_document_hash
) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
RETURNING id, nct_id, substance_id, metric_name, metric_value_float, metric_value_text,
          is_primary_endpoint, source_document_ref, source_document_hash, created_at, updated_at
"""

SELECT_TRUTH_BY_ID = """
SELECT id, nct_id, substance_id, metric_name, metric_value_float, metric_value_text,
       is_primary_endpoint, source_document_ref, source_document_hash, created_at, updated_at
FROM truth.clinical_truth_store
WHERE id = $1
"""

SELECT_TRUTHS_BY_IDS = """
SELECT id, nct_id, substance_id, metric_name, metric_value_float, metric_value_text,
       is_primary_endpoint, source_document_ref, source_document_hash, created_at, updated_at
FROM truth.clinical_truth_store
WHERE id = ANY($1::uuid[])
"""

# =============================================================================
# Fragment Queries
# =============================================================================

INSERT_FRAGMENT = """
INSERT INTO prose.smart_fragments (
    ectd_section_path,
    jurisdiction,
    content_prose,
    embedding,
    objectivity_score,
    confidence_rating,
    burden_of_proof_justification,
    version_id
) VALUES ($1, $2, $3, $4, $5, $6, $7, 1)
RETURNING id, ectd_section_path, jurisdiction, content_prose, 
          (embedding IS NOT NULL) AS has_embedding,
          objectivity_score, confidence_rating, is_verified_against_truth,
          regulatory_precedent_id, burden_of_proof_justification,
          version_id, created_at, updated_at
"""

SELECT_FRAGMENT_BY_ID = """
SELECT id, ectd_section_path, jurisdiction, content_prose,
       (embedding IS NOT NULL) AS has_embedding,
       objectivity_score, confidence_rating, is_verified_against_truth,
       regulatory_precedent_id, burden_of_proof_justification,
       version_id, created_at, updated_at
FROM prose.smart_fragments
WHERE id = $1
"""

SELECT_FRAGMENT_WITH_EMBEDDING = """
SELECT id, ectd_section_path, jurisdiction, content_prose, embedding,
       objectivity_score, confidence_rating, is_verified_against_truth,
       regulatory_precedent_id, burden_of_proof_justification,
       version_id, created_at, updated_at
FROM prose.smart_fragments
WHERE id = $1
"""

UPDATE_FRAGMENT_VERIFIED = """
UPDATE prose.smart_fragments
SET is_verified_against_truth = $2,
    updated_at = NOW()
WHERE id = $1
"""

# =============================================================================
# Fragment-Truth Link Queries
# =============================================================================

INSERT_FRAGMENT_TRUTH_LINK = """
INSERT INTO prose.fragment_truth_links (
    fragment_id,
    truth_id,
    claim_kind,
    claim_span,
    extracted_claim_value
) VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (fragment_id, truth_id, claim_kind) DO UPDATE
SET claim_span = EXCLUDED.claim_span,
    extracted_claim_value = EXCLUDED.extracted_claim_value
RETURNING id, fragment_id, truth_id, claim_kind, claim_span, extracted_claim_value, created_at
"""

SELECT_LINKS_BY_FRAGMENT = """
SELECT ftl.id, ftl.fragment_id, ftl.truth_id, ftl.claim_kind, 
       ftl.claim_span, ftl.extracted_claim_value, ftl.created_at,
       cts.metric_name, cts.metric_value_float, cts.metric_value_text,
       cts.nct_id, cts.is_primary_endpoint
FROM prose.fragment_truth_links ftl
JOIN truth.clinical_truth_store cts ON ftl.truth_id = cts.id
WHERE ftl.fragment_id = $1
"""

COUNT_LINKS_BY_FRAGMENT = """
SELECT COUNT(*) FROM prose.fragment_truth_links WHERE fragment_id = $1
"""

# =============================================================================
# Adversarial Precedent Queries
# =============================================================================

INSERT_PRECEDENT = """
INSERT INTO adversarial.regulatory_adversarial_precedents (
    agency_code,
    failure_mode,
    historical_question,
    precedent_vector,
    source_ref,
    therapeutic_area,
    submission_type
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, agency_code, failure_mode, historical_question, source_ref,
          therapeutic_area, submission_type, (precedent_vector IS NOT NULL) AS has_vector, created_at
"""

SELECT_PRECEDENT_BY_ID = """
SELECT id, agency_code, failure_mode, historical_question, source_ref,
       therapeutic_area, submission_type, (precedent_vector IS NOT NULL) AS has_vector, created_at
FROM adversarial.regulatory_adversarial_precedents
WHERE id = $1
"""

# Vector similarity search using cosine distance
# ORDER BY <=> returns nearest neighbors (smallest distance first)
SEARCH_PRECEDENTS_BY_VECTOR = """
SELECT id, agency_code, failure_mode, historical_question, source_ref,
       1 - (precedent_vector <=> $1::vector) AS similarity
FROM adversarial.regulatory_adversarial_precedents
WHERE precedent_vector IS NOT NULL
ORDER BY precedent_vector <=> $1::vector
LIMIT $2
"""

# =============================================================================
# Section-Level Queries
# =============================================================================

SELECT_FRAGMENTS_BY_SECTION = """
SELECT id, ectd_section_path, jurisdiction, content_prose, embedding,
       objectivity_score, confidence_rating, is_verified_against_truth,
       regulatory_precedent_id, burden_of_proof_justification,
       version_id, created_at, updated_at
FROM prose.smart_fragments
WHERE ectd_section_path LIKE $1
  AND ($2::text IS NULL OR jurisdiction = $2)
ORDER BY ectd_section_path, created_at DESC
"""

SELECT_FRAGMENT_IDS_BY_SECTION = """
SELECT id
FROM prose.smart_fragments
WHERE ectd_section_path LIKE $1
  AND ($2::text IS NULL OR jurisdiction = $2)
"""

# Get latest risk assessment for each fragment in a section
SELECT_LATEST_RISK_BY_SECTION = """
SELECT DISTINCT ON (cal.fragment_id)
    cal.fragment_id,
    sf.ectd_section_path,
    cal.risk_status,
    cal.drift_magnitude,
    cal.created_at as assessed_at
FROM audit.concomitant_audit_logs cal
JOIN prose.smart_fragments sf ON cal.fragment_id = sf.id
WHERE sf.ectd_section_path LIKE $1
  AND ($2::text IS NULL OR sf.jurisdiction = $2)
ORDER BY cal.fragment_id, cal.created_at DESC
"""

# =============================================================================
# Submission Gate Check Queries (use dashboard views if applied)
# =============================================================================

# Basic gate check without views
SELECT_GATE_CHECK_BASIC = """
WITH fragment_counts AS (
    SELECT 
        COUNT(*) AS total_fragments,
        COUNT(*) FILTER (WHERE ectd_section_path LIKE 'm2.%') AS module2_fragments
    FROM prose.smart_fragments
    WHERE ($1::text IS NULL OR jurisdiction = $1)
),
risk_counts AS (
    SELECT 
        COUNT(*) FILTER (WHERE risk_status = 'IR_PREDICTED') AS ir_predicted_count,
        COUNT(*) FILTER (WHERE drift_magnitude > 0.5) AS high_drift_count
    FROM audit.concomitant_audit_logs cal
    JOIN prose.smart_fragments sf ON cal.fragment_id = sf.id
    WHERE ($1::text IS NULL OR sf.jurisdiction = $1)
      AND cal.created_at = (
          SELECT MAX(created_at) FROM audit.concomitant_audit_logs 
          WHERE fragment_id = cal.fragment_id
      )
),
unlinked_counts AS (
    SELECT COUNT(*) AS unlinked_efficacy_count
    FROM prose.smart_fragments sf
    WHERE ($1::text IS NULL OR sf.jurisdiction = $1)
      AND sf.ectd_section_path LIKE 'm2.7%'
      AND sf.is_verified_against_truth = FALSE
),
unassessed AS (
    SELECT COUNT(*) AS unassessed_count
    FROM prose.smart_fragments sf
    WHERE ($1::text IS NULL OR sf.jurisdiction = $1)
      AND NOT EXISTS (
          SELECT 1 FROM audit.concomitant_audit_logs cal 
          WHERE cal.fragment_id = sf.id
      )
)
SELECT 
    fc.total_fragments,
    fc.module2_fragments,
    rc.ir_predicted_count,
    rc.high_drift_count,
    uc.unlinked_efficacy_count,
    ua.unassessed_count
FROM fragment_counts fc
CROSS JOIN risk_counts rc
CROSS JOIN unlinked_counts uc
CROSS JOIN unassessed ua
"""

# =============================================================================
# Dashboard View Queries (use after migrations 003-006 applied)
# =============================================================================

# Section risk rollup from view
SELECT_SECTION_RISK_ROLLUP = """
SELECT section_prefix, jurisdiction, total_fragments, 
       red_fragments, amber_fragments, green_fragments,
       avg_drift, max_drift, section_status
FROM prose.v_section_risk_rollup
WHERE ($1::text IS NULL OR section_prefix LIKE $1)
  AND ($2::text IS NULL OR jurisdiction = $2)
ORDER BY section_prefix
"""

# Agency risk summary from view
SELECT_AGENCY_RISK_SUMMARY = """
SELECT agency, total_precedents, avg_similarity, max_similarity
FROM prose.v_agency_risk_summary
ORDER BY avg_similarity DESC
"""

# Predicted IR hotspots from view
SELECT_IR_HOTSPOTS = """
SELECT fragment_id, ectd_section_path, jurisdiction, risk_status,
       drift_magnitude, question_count, top_question
FROM prose.v_predicted_ir_hotspots
WHERE ($1::text IS NULL OR jurisdiction = $1)
ORDER BY drift_magnitude DESC, question_count DESC
LIMIT $2
"""

# Submission gate check from view
SELECT_SUBMISSION_GATE = """
SELECT jurisdiction, total_fragments, module2_fragments,
       ir_predicted_count, high_drift_count, unlinked_efficacy_count,
       unassessed_count, gate_recommendation
FROM prose.v_submission_gate_check
WHERE ($1::text IS NULL OR jurisdiction = $1)
"""

# =============================================================================
# Audit Log Queries
# =============================================================================

INSERT_AUDIT_LOG = """
INSERT INTO audit.concomitant_audit_logs (
    fragment_id,
    agent_identity,
    risk_status,
    feedback_payload,
    drift_magnitude,
    request_id,
    interrogated_version_id
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING id, fragment_id, agent_identity, risk_status, feedback_payload,
          drift_magnitude, request_id, interrogated_version_id, created_at
"""

SELECT_AUDIT_LOGS_BY_FRAGMENT = """
SELECT id, fragment_id, agent_identity, risk_status, feedback_payload,
       drift_magnitude, request_id, interrogated_version_id, created_at
FROM audit.concomitant_audit_logs
WHERE fragment_id = $1
ORDER BY created_at DESC
LIMIT $2
"""

SELECT_RECENT_AUDIT_LOGS = """
SELECT id, fragment_id, agent_identity, risk_status, feedback_payload,
       drift_magnitude, request_id, interrogated_version_id, created_at
FROM audit.concomitant_audit_logs
ORDER BY created_at DESC
LIMIT $1
"""

# Batch audit log insert for section interrogation
INSERT_BATCH_AUDIT_LOGS = """
INSERT INTO audit.concomitant_audit_logs (
    fragment_id,
    agent_identity,
    risk_status,
    feedback_payload,
    drift_magnitude,
    request_id,
    interrogated_version_id
)
SELECT * FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::jsonb[], $5::float[], $6::text[], $7::int[])
RETURNING id, fragment_id, agent_identity, risk_status, drift_magnitude, request_id, interrogated_version_id, created_at
"""

# Get audit summary for a batch request
SELECT_BATCH_AUDIT_SUMMARY = """
SELECT 
    request_id,
    COUNT(*) AS total_logged,
    COUNT(*) FILTER (WHERE risk_status = 'ALIGNED') AS aligned_count,
    COUNT(*) FILTER (WHERE risk_status = 'DATA_DRIFT') AS drift_count,
    COUNT(*) FILTER (WHERE risk_status = 'IR_PREDICTED') AS ir_predicted_count,
    AVG(drift_magnitude) AS avg_drift,
    MAX(drift_magnitude) AS max_drift,
    MIN(created_at) AS started_at,
    MAX(created_at) AS completed_at
FROM audit.concomitant_audit_logs
WHERE request_id = $1
GROUP BY request_id
"""

# =============================================================================
# Snapshot Workflow Queries (Enhanced for RegOps/RA)
# =============================================================================

# Create snapshot with audit context
SQL_INSERT_SNAPSHOT = """
INSERT INTO prose.submission_snapshots (
    snapshot_name, 
    jurisdiction, 
    target_agency, 
    dossier_type, 
    notes,
    created_by
)
VALUES ($1, $2, $3, $4, $5, current_setting('app.user', true))
RETURNING id, snapshot_name, jurisdiction, target_agency, dossier_type, 
          status::text AS status, created_at, created_by
"""

# List snapshots with pagination
SQL_LIST_SNAPSHOTS = """
SELECT
    id, 
    snapshot_name, 
    jurisdiction, 
    target_agency, 
    dossier_type, 
    status::text AS status,
    created_at, 
    created_by, 
    frozen_at, 
    frozen_by, 
    submitted_at, 
    submitted_by, 
    archived_at, 
    archived_by,
    notes
FROM prose.submission_snapshots
ORDER BY created_at DESC
LIMIT $1
"""

# Get single snapshot
SQL_GET_SNAPSHOT = """
SELECT
    id, 
    snapshot_name, 
    jurisdiction, 
    target_agency, 
    dossier_type, 
    status::text AS status,
    created_at, 
    created_by, 
    frozen_at, 
    frozen_by, 
    submitted_at, 
    submitted_by, 
    archived_at, 
    archived_by,
    notes
FROM prose.submission_snapshots
WHERE id = $1
"""

# Count fragments matching filter (for preview)
SQL_COUNT_FRAGMENTS_BY_FILTER = """
SELECT COUNT(*)::int AS cnt
FROM prose.smart_fragments sf
WHERE ($1::text IS NULL OR sf.jurisdiction = $1)
  AND ($2::text IS NULL OR sf.ectd_section_path LIKE $2)
"""

# Add fragments by filter pattern (bulk add)
SQL_ADD_SNAPSHOT_FRAGMENTS_BY_FILTER = """
INSERT INTO prose.submission_snapshot_fragments (
    snapshot_id, 
    fragment_id, 
    version_id, 
    ectd_section_path, 
    jurisdiction,
    included_by
)
SELECT 
    $1, 
    sf.id, 
    sf.version_id, 
    sf.ectd_section_path, 
    sf.jurisdiction,
    current_setting('app.user', true)
FROM prose.smart_fragments sf
WHERE ($2::text IS NULL OR sf.jurisdiction = $2)
  AND ($3::text IS NULL OR sf.ectd_section_path LIKE $3)
ON CONFLICT (snapshot_id, fragment_id) DO NOTHING
RETURNING fragment_id
"""

# Add fragments by explicit IDs
SQL_ADD_SNAPSHOT_FRAGMENTS_BY_IDS = """
INSERT INTO prose.submission_snapshot_fragments (
    snapshot_id, 
    fragment_id, 
    version_id, 
    ectd_section_path, 
    jurisdiction,
    included_by
)
SELECT 
    $1, 
    sf.id, 
    sf.version_id, 
    sf.ectd_section_path, 
    sf.jurisdiction,
    current_setting('app.user', true)
FROM prose.smart_fragments sf
WHERE sf.id = ANY($2::uuid[])
ON CONFLICT (snapshot_id, fragment_id) DO NOTHING
RETURNING fragment_id
"""

# Freeze snapshot (triggers enforce state machine)
SQL_FREEZE_SNAPSHOT = """
UPDATE prose.submission_snapshots
SET status = 'FROZEN'
WHERE id = $1 AND status = 'DRAFT'
RETURNING id, status::text AS status, frozen_at, frozen_by
"""

# Get snapshot gate metrics from view
SQL_GET_SNAPSHOT_GATE = """
SELECT
    snapshot_id,
    snapshot_name,
    jurisdiction,
    target_agency,
    dossier_type,
    status::text AS status,
    fragments_total,
    unlinked_fragments,
    red_fragments,
    amber_fragments,
    green_fragments,
    never_interrogated_fragments,
    avg_drift,
    max_drift,
    gate_pass_recommended
FROM prose.v_snapshot_gate_metrics
WHERE snapshot_id = $1
"""

# List snapshot fragments with state at freeze time
SQL_LIST_SNAPSHOT_FRAGMENTS = """
SELECT
    snf.id,
    snf.fragment_id,
    snf.version_id,
    snf.ectd_section_path,
    snf.jurisdiction,
    snf.truth_link_count_at_freeze,
    snf.primary_endpoint_links_at_freeze,
    snf.risk_status_at_freeze,
    snf.drift_magnitude_at_freeze,
    snf.audit_log_id,
    snf.included_at,
    snf.included_by
FROM prose.submission_snapshot_fragments snf
WHERE snf.snapshot_id = $1
ORDER BY snf.ectd_section_path
"""

# Remove fragment from draft snapshot
SQL_REMOVE_SNAPSHOT_FRAGMENT = """
DELETE FROM prose.submission_snapshot_fragments
WHERE snapshot_id = $1 AND fragment_id = $2
RETURNING id
"""

# Get snapshot fragment count
SQL_COUNT_SNAPSHOT_FRAGMENTS = """
SELECT COUNT(*)::int AS cnt
FROM prose.submission_snapshot_fragments
WHERE snapshot_id = $1
"""
