"""SQL queries for Shadow Interrogation MVP.

These queries integrate with Migrations 003-008 for:
- Version-aware interrogation (uses prose.smart_fragment_versions)
- Heatmap-ready audit payloads (integrates with v_fragment_current)
- Batch interrogation with atomic audit logging
- Snapshot-aware risk capture
"""

# =============================================================================
# Version-Aware Fragment Queries
# =============================================================================

# Get fragment with specific version (for interrogating historical versions)
SELECT_FRAGMENT_VERSION = """
SELECT 
    sf.id AS fragment_id,
    sf.ectd_section_path,
    sf.jurisdiction,
    v.version_id,
    v.content_prose,
    v.embedding,
    v.objectivity_score,
    v.confidence_rating,
    v.is_verified_against_truth,
    v.burden_of_proof_justification,
    v.created_at AS version_created_at,
    v.created_by AS version_created_by,
    v.change_reason,
    sf.version_id AS current_version_id
FROM prose.smart_fragments sf
JOIN prose.smart_fragment_versions v 
    ON v.fragment_id = sf.id 
    AND v.version_id = $2
WHERE sf.id = $1
"""

# Get fragment current state (including truth coverage + risk from views)
SELECT_FRAGMENT_CURRENT_STATE = """
SELECT 
    fc.fragment_id,
    fc.ectd_section_path,
    fc.ectd_section_root,
    fc.jurisdiction,
    fc.current_version_id,
    fc.content_prose,
    fc.objectivity_score,
    fc.confidence_rating,
    fc.is_verified_against_truth,
    fc.created_at,
    fc.updated_at,
    fc.current_version_created_at,
    fc.current_version_created_by,
    fc.current_change_reason,
    fc.truth_link_count,
    fc.primary_endpoint_links,
    fc.latest_risk_status,
    fc.latest_drift_magnitude,
    fc.latest_audit_log_id,
    fc.last_interrogated_at
FROM prose.v_fragment_current fc
WHERE fc.fragment_id = $1
"""

# Get fragment with embedding for vector search (version-aware)
SELECT_FRAGMENT_EMBEDDING_VERSIONED = """
SELECT 
    sf.id AS fragment_id,
    v.version_id,
    v.content_prose,
    v.embedding,
    sf.ectd_section_path,
    sf.jurisdiction
FROM prose.smart_fragments sf
JOIN prose.smart_fragment_versions v 
    ON v.fragment_id = sf.id
WHERE sf.id = $1
  AND ($2::int IS NULL OR v.version_id = $2)
ORDER BY v.version_id DESC
LIMIT 1
"""

# =============================================================================
# Enhanced Truth Link Queries (with version tracking)
# =============================================================================

# Get truth links for a fragment (joins truth store for current values)
SELECT_TRUTH_LINKS_DETAILED = """
SELECT 
    ftl.id AS link_id,
    ftl.fragment_id,
    ftl.truth_id,
    ftl.claim_kind,
    ftl.claim_span,
    ftl.extracted_claim_value,
    ftl.linked_at_version_id,
    ftl.created_at AS linked_at,
    
    -- Truth datapoint details
    cts.nct_id,
    cts.substance_id,
    cts.metric_name,
    cts.metric_value_float,
    cts.metric_value_text,
    cts.is_primary_endpoint,
    cts.source_document_ref,
    cts.source_document_hash
FROM prose.fragment_truth_links ftl
JOIN truth.clinical_truth_store cts ON cts.id = ftl.truth_id
WHERE ftl.fragment_id = $1
ORDER BY cts.is_primary_endpoint DESC, cts.metric_name
"""

# Get truth links snapshot (for a specific version at freeze time)
SELECT_TRUTH_LINKS_AT_VERSION = """
SELECT 
    ftl.id AS link_id,
    ftl.fragment_id,
    ftl.truth_id,
    ftl.claim_kind,
    ftl.claim_span,
    ftl.extracted_claim_value,
    ftl.linked_at_version_id,
    
    cts.nct_id,
    cts.metric_name,
    cts.metric_value_float,
    cts.metric_value_text,
    cts.is_primary_endpoint
FROM prose.fragment_truth_links ftl
JOIN truth.clinical_truth_store cts ON cts.id = ftl.truth_id
WHERE ftl.fragment_id = $1
  AND (ftl.linked_at_version_id IS NULL OR ftl.linked_at_version_id <= $2)
"""

# =============================================================================
# Precedent Search Queries (enhanced)
# =============================================================================

# Search precedents with agency + therapeutic area filters
SEARCH_PRECEDENTS_FILTERED = """
SELECT 
    id,
    agency_code,
    failure_mode,
    historical_question,
    source_ref,
    therapeutic_area,
    submission_type,
    1 - (precedent_vector <=> $1::vector) AS similarity
FROM adversarial.regulatory_adversarial_precedents
WHERE precedent_vector IS NOT NULL
  AND ($3::text IS NULL OR agency_code = $3)
  AND ($4::text IS NULL OR therapeutic_area = $4)
  AND ($5::text IS NULL OR submission_type = $5)
ORDER BY precedent_vector <=> $1::vector
LIMIT $2
"""

# Get precedent count by agency (for coverage reporting)
SELECT_PRECEDENT_COVERAGE = """
SELECT 
    agency_code,
    COUNT(*) AS total_precedents,
    COUNT(*) FILTER (WHERE precedent_vector IS NOT NULL) AS vectorized_precedents,
    COUNT(DISTINCT failure_mode) AS distinct_failure_modes,
    COUNT(DISTINCT therapeutic_area) AS distinct_therapeutic_areas
FROM adversarial.regulatory_adversarial_precedents
GROUP BY agency_code
ORDER BY total_precedents DESC
"""

# =============================================================================
# Audit Log Queries (heatmap-ready)
# =============================================================================

# Insert audit log with full context (version-aware)
INSERT_AUDIT_LOG_VERSIONED = """
INSERT INTO audit.concomitant_audit_logs (
    fragment_id,
    agent_identity,
    risk_status,
    feedback_payload,
    drift_magnitude,
    request_id,
    interrogated_version_id
) VALUES ($1, $2, $3, $4, $5, $6, $7)
RETURNING 
    id,
    fragment_id,
    agent_identity,
    risk_status,
    feedback_payload,
    drift_magnitude,
    request_id,
    interrogated_version_id,
    created_at
"""

# Get audit history for fragment (supports version filtering)
SELECT_AUDIT_HISTORY = """
SELECT 
    cal.id,
    cal.fragment_id,
    cal.agent_identity,
    cal.risk_status,
    cal.feedback_payload,
    cal.drift_magnitude,
    cal.request_id,
    cal.interrogated_version_id,
    cal.created_at,
    
    -- Join version details if available
    v.content_prose AS interrogated_content_preview,
    v.change_reason AS version_change_reason
FROM audit.concomitant_audit_logs cal
LEFT JOIN prose.smart_fragment_versions v 
    ON v.fragment_id = cal.fragment_id 
    AND v.version_id = cal.interrogated_version_id
WHERE cal.fragment_id = $1
  AND ($2::int IS NULL OR cal.interrogated_version_id = $2)
ORDER BY cal.created_at DESC
LIMIT $3
"""

# Get audit logs by request ID (for batch interrogation tracking)
SELECT_AUDIT_BY_REQUEST = """
SELECT 
    cal.id,
    cal.fragment_id,
    sf.ectd_section_path,
    sf.jurisdiction,
    cal.agent_identity,
    cal.risk_status,
    cal.drift_magnitude,
    cal.interrogated_version_id,
    cal.created_at
FROM audit.concomitant_audit_logs cal
JOIN prose.smart_fragments sf ON sf.id = cal.fragment_id
WHERE cal.request_id = $1
ORDER BY cal.created_at
"""

# Aggregate audit stats by request
SELECT_AUDIT_REQUEST_STATS = """
SELECT 
    request_id,
    COUNT(*) AS total_interrogated,
    COUNT(*) FILTER (WHERE risk_status = 'ALIGNED') AS aligned_count,
    COUNT(*) FILTER (WHERE risk_status = 'DATA_DRIFT') AS drift_count,
    COUNT(*) FILTER (WHERE risk_status = 'IR_PREDICTED') AS ir_predicted_count,
    AVG(drift_magnitude) AS avg_drift,
    MAX(drift_magnitude) AS max_drift,
    MIN(created_at) AS started_at,
    MAX(created_at) AS completed_at,
    EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))) AS duration_seconds
FROM audit.concomitant_audit_logs
WHERE request_id = $1
GROUP BY request_id
"""

# =============================================================================
# Batch Interrogation Queries
# =============================================================================

# Get fragments for batch interrogation (by section/jurisdiction)
SELECT_FRAGMENTS_FOR_BATCH = """
SELECT 
    fc.fragment_id,
    fc.ectd_section_path,
    fc.ectd_section_root,
    fc.jurisdiction,
    fc.current_version_id,
    fc.content_prose,
    
    -- Embedding from current version
    (SELECT embedding FROM prose.smart_fragment_versions v 
     WHERE v.fragment_id = fc.fragment_id AND v.version_id = fc.current_version_id) AS embedding,
    
    fc.truth_link_count,
    fc.latest_risk_status,
    fc.latest_drift_magnitude,
    fc.last_interrogated_at
FROM prose.v_fragment_current fc
WHERE ($1::text IS NULL OR fc.ectd_section_path LIKE $1)
  AND ($2::text IS NULL OR fc.jurisdiction = $2)
  AND ($3::text IS NULL OR fc.ectd_section_root = $3)
ORDER BY fc.ectd_section_path
LIMIT $4
"""

# Get fragments needing re-interrogation (stale or never interrogated)
SELECT_STALE_FRAGMENTS = """
SELECT 
    fc.fragment_id,
    fc.ectd_section_path,
    fc.jurisdiction,
    fc.current_version_id,
    fc.latest_risk_status,
    fc.last_interrogated_at,
    fc.current_version_created_at,
    
    -- Calculate staleness
    EXTRACT(EPOCH FROM (NOW() - COALESCE(fc.last_interrogated_at, '1970-01-01'::timestamptz))) / 3600 AS hours_since_interrogation,
    
    -- Flag if version changed since last interrogation
    CASE 
        WHEN fc.last_interrogated_at IS NULL THEN TRUE
        WHEN fc.current_version_created_at > fc.last_interrogated_at THEN TRUE
        ELSE FALSE
    END AS version_changed_since_interrogation
FROM prose.v_fragment_current fc
WHERE 
    -- Never interrogated
    fc.last_interrogated_at IS NULL
    -- Or version changed since last interrogation
    OR fc.current_version_created_at > fc.last_interrogated_at
    -- Or interrogation is stale (default: > 24 hours)
    OR fc.last_interrogated_at < NOW() - INTERVAL '24 hours'
ORDER BY 
    -- Prioritize: never interrogated > version changed > stale
    (CASE WHEN fc.last_interrogated_at IS NULL THEN 0
          WHEN fc.current_version_created_at > fc.last_interrogated_at THEN 1
          ELSE 2 END),
    fc.last_interrogated_at NULLS FIRST
LIMIT $1
"""

# =============================================================================
# Heatmap Queries (from views)
# =============================================================================

# Section risk rollup (heatmap backbone)
SELECT_HEATMAP_SECTIONS = """
SELECT 
    ectd_section_root,
    jurisdiction,
    fragments_total,
    verified_fragments,
    unlinked_fragments,
    red_fragments,
    amber_fragments,
    green_fragments,
    never_interrogated_fragments,
    avg_latest_drift,
    max_latest_drift,
    last_interrogated_at,
    avg_risk_score
FROM prose.v_section_risk_rollup
WHERE ($1::text IS NULL OR ectd_section_root = $1)
  AND ($2::text IS NULL OR jurisdiction = $2)
ORDER BY avg_risk_score DESC, max_latest_drift DESC NULLS LAST
"""

# Jurisdiction summary
SELECT_HEATMAP_JURISDICTIONS = """
SELECT 
    jurisdiction,
    fragments_total,
    red_fragments,
    amber_fragments,
    green_fragments,
    never_interrogated_fragments,
    avg_latest_drift,
    max_latest_drift,
    last_interrogated_at
FROM prose.v_jurisdiction_risk_rollup
ORDER BY red_fragments DESC, avg_latest_drift DESC NULLS LAST
"""

# Top risky fragments (for drill-down)
SELECT_TOP_RISKY_FRAGMENTS = """
SELECT 
    fragment_id,
    ectd_section_path,
    ectd_section_root,
    jurisdiction,
    current_version_id,
    latest_risk_status,
    latest_drift_magnitude,
    truth_link_count,
    primary_endpoint_links,
    last_interrogated_at
FROM prose.v_fragment_current
WHERE latest_risk_status IN ('DATA_DRIFT', 'IR_PREDICTED')
   OR ($1::bool = TRUE AND latest_risk_status IS NULL)  -- Include never-interrogated if requested
ORDER BY 
    (CASE latest_risk_status 
        WHEN 'IR_PREDICTED' THEN 3 
        WHEN 'DATA_DRIFT' THEN 2 
        ELSE 1 END) DESC,
    latest_drift_magnitude DESC NULLS LAST
LIMIT $2
"""

# =============================================================================
# Snapshot Integration Queries
# =============================================================================

# Get snapshot fragments with current risk comparison
SELECT_SNAPSHOT_FRAGMENT_COMPARISON = """
SELECT 
    ssf.snapshot_id,
    ssf.fragment_id,
    ssf.version_id AS frozen_version_id,
    ssf.ectd_section_path,
    ssf.jurisdiction,
    
    -- Frozen state at snapshot time
    ssf.risk_status_at_freeze,
    ssf.drift_magnitude_at_freeze,
    ssf.truth_link_count_at_freeze,
    ssf.primary_endpoint_links_at_freeze,
    
    -- Current live state
    fc.current_version_id,
    fc.latest_risk_status AS current_risk_status,
    fc.latest_drift_magnitude AS current_drift_magnitude,
    fc.truth_link_count AS current_truth_link_count,
    
    -- Drift indicators
    (fc.current_version_id > ssf.version_id) AS version_changed,
    (fc.latest_risk_status IS DISTINCT FROM ssf.risk_status_at_freeze) AS risk_changed,
    (ABS(COALESCE(fc.latest_drift_magnitude, 0) - COALESCE(ssf.drift_magnitude_at_freeze, 0)) > 0.01) AS drift_changed
FROM prose.submission_snapshot_fragments ssf
JOIN prose.v_fragment_current fc ON fc.fragment_id = ssf.fragment_id
WHERE ssf.snapshot_id = $1
ORDER BY ssf.ectd_section_path
"""

# Get snapshot gate metrics (submission readiness)
SELECT_SNAPSHOT_GATE_DETAILED = """
SELECT 
    sgm.snapshot_id,
    sgm.snapshot_name,
    sgm.jurisdiction,
    sgm.target_agency,
    sgm.dossier_type,
    sgm.status,
    sgm.fragments_total,
    sgm.unlinked_fragments,
    sgm.red_fragments,
    sgm.amber_fragments,
    sgm.green_fragments,
    sgm.never_interrogated_fragments,
    sgm.avg_drift,
    sgm.max_drift,
    sgm.gate_pass_recommended,
    
    -- Additional snapshot metadata
    ss.created_at,
    ss.created_by,
    ss.frozen_at,
    ss.frozen_by,
    ss.submitted_at,
    ss.submitted_by
FROM prose.v_snapshot_gate_metrics sgm
JOIN prose.submission_snapshots ss ON ss.id = sgm.snapshot_id
WHERE sgm.snapshot_id = $1
"""
