"""SQL queries for Command Center heatmaps and submission snapshots.

These queries use the views from migrations 004 and 005.
"""

# =============================================================================
# Heatmap / Rollup Queries (Migration 004 views)
# =============================================================================

# Section risk rollup - heatmap backbone
SELECT_SECTION_RISK_ROLLUP = """
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
WHERE ($1::text IS NULL OR ectd_section_root LIKE $1)
  AND ($2::text IS NULL OR jurisdiction = $2)
ORDER BY avg_risk_score DESC NULLS LAST, max_latest_drift DESC NULLS LAST
"""

# Jurisdiction risk rollup - executive dashboard
SELECT_JURISDICTION_RISK_ROLLUP = """
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
ORDER BY red_fragments DESC, amber_fragments DESC
"""

# Fragment current state with risk - single pane of glass
SELECT_FRAGMENT_CURRENT = """
SELECT
    fragment_id,
    ectd_section_path,
    ectd_section_root,
    jurisdiction,
    current_version_id,
    content_prose,
    objectivity_score,
    confidence_rating,
    is_verified_against_truth,
    truth_link_count,
    primary_endpoint_links,
    latest_risk_status,
    latest_drift_magnitude,
    latest_audit_log_id,
    last_interrogated_at,
    current_version_created_by,
    current_change_reason,
    updated_at
FROM prose.v_fragment_current
WHERE fragment_id = $1
"""

# Top risky fragments - sorted by risk
SELECT_TOP_RISKY_FRAGMENTS = """
SELECT
    fragment_id,
    ectd_section_path,
    ectd_section_root,
    jurisdiction,
    current_version_id,
    truth_link_count,
    latest_risk_status,
    latest_drift_magnitude,
    last_interrogated_at
FROM prose.v_fragment_current
WHERE ($1::text IS NULL OR jurisdiction = $1)
ORDER BY
    (CASE latest_risk_status 
        WHEN 'DATA_DRIFT' THEN 3 
        WHEN 'IR_PREDICTED' THEN 2 
        WHEN 'ALIGNED' THEN 1 
        ELSE 0 
    END) DESC,
    latest_drift_magnitude DESC NULLS LAST
LIMIT $2
"""

# Fragments by section with risk
SELECT_FRAGMENTS_BY_SECTION_WITH_RISK = """
SELECT
    fragment_id,
    ectd_section_path,
    jurisdiction,
    current_version_id,
    truth_link_count,
    latest_risk_status,
    latest_drift_magnitude,
    last_interrogated_at,
    current_version_created_by,
    current_change_reason
FROM prose.v_fragment_current
WHERE ectd_section_root LIKE $1
  AND ($2::text IS NULL OR jurisdiction = $2)
ORDER BY ectd_section_path
"""

# Latest risk per fragment (direct view access)
SELECT_LATEST_RISK = """
SELECT
    fragment_id,
    audit_log_id,
    risk_status,
    drift_magnitude,
    feedback_payload,
    last_agent_identity,
    last_interrogated_at
FROM audit.v_fragment_latest_risk
WHERE fragment_id = $1
"""

# Truth coverage for fragment
SELECT_TRUTH_COVERAGE = """
SELECT
    fragment_id,
    truth_link_count,
    supports_count,
    contradicts_count,
    distinct_truth_points,
    primary_endpoint_links
FROM prose.v_fragment_truth_coverage
WHERE fragment_id = $1
"""

# =============================================================================
# Submission Snapshot Queries (Migration 005)
# =============================================================================

# Create snapshot
INSERT_SNAPSHOT = """
INSERT INTO prose.submission_snapshots (
    snapshot_name,
    jurisdiction,
    target_agency,
    dossier_type,
    notes,
    created_by
) VALUES ($1, $2, $3, $4, $5, $6)
RETURNING id, snapshot_name, jurisdiction, target_agency, dossier_type,
          notes, status, created_at, created_by
"""

# Get snapshot by ID
SELECT_SNAPSHOT_BY_ID = """
SELECT
    id,
    snapshot_name,
    jurisdiction,
    target_agency,
    dossier_type,
    notes,
    status::text AS status,
    created_at,
    created_by,
    frozen_at,
    frozen_by,
    submitted_at,
    submitted_by,
    archived_at,
    archived_by
FROM prose.submission_snapshots
WHERE id = $1
"""

# List snapshots
SELECT_SNAPSHOTS = """
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
    submitted_by
FROM prose.submission_snapshots
WHERE ($1::text IS NULL OR jurisdiction = $1)
  AND ($2::text IS NULL OR status::text = $2)
ORDER BY created_at DESC
LIMIT $3
"""

# Update snapshot status (triggers handle state machine)
UPDATE_SNAPSHOT_STATUS = """
UPDATE prose.submission_snapshots
SET status = $2::prose.snapshot_status
WHERE id = $1
RETURNING id, snapshot_name, jurisdiction, status::text AS status,
          frozen_at, frozen_by, submitted_at, submitted_by, archived_at, archived_by
"""

# Delete draft snapshot
DELETE_DRAFT_SNAPSHOT = """
DELETE FROM prose.submission_snapshots
WHERE id = $1 AND status = 'DRAFT'
RETURNING id
"""

# Add fragment to snapshot (auto-captures current version + risk state)
INSERT_SNAPSHOT_FRAGMENT = """
INSERT INTO prose.submission_snapshot_fragments (
    snapshot_id,
    fragment_id,
    included_by
) VALUES ($1, $2, $3)
RETURNING id, snapshot_id, fragment_id, version_id, ectd_section_path, jurisdiction,
          included_at, included_by, truth_link_count_at_freeze, primary_endpoint_links_at_freeze,
          risk_status_at_freeze, drift_magnitude_at_freeze, audit_log_id
"""

# Add multiple fragments to snapshot (batch insert)
INSERT_SNAPSHOT_FRAGMENTS_BATCH = """
INSERT INTO prose.submission_snapshot_fragments (snapshot_id, fragment_id, included_by)
SELECT $1, sf.id, $3
FROM prose.smart_fragments sf
WHERE sf.jurisdiction = $2
  AND sf.ectd_section_path LIKE $4
RETURNING id, fragment_id, version_id, ectd_section_path, jurisdiction,
          truth_link_count_at_freeze, risk_status_at_freeze, drift_magnitude_at_freeze
"""

# Get snapshot fragments
SELECT_SNAPSHOT_FRAGMENTS = """
SELECT
    ssf.id,
    ssf.snapshot_id,
    ssf.fragment_id,
    ssf.version_id,
    ssf.ectd_section_path,
    ssf.jurisdiction,
    ssf.included_at,
    ssf.included_by,
    ssf.truth_link_count_at_freeze,
    ssf.primary_endpoint_links_at_freeze,
    ssf.risk_status_at_freeze,
    ssf.drift_magnitude_at_freeze,
    ssf.audit_log_id
FROM prose.submission_snapshot_fragments ssf
WHERE ssf.snapshot_id = $1
ORDER BY ssf.ectd_section_path
"""

# Get snapshot gate metrics
SELECT_SNAPSHOT_GATE_METRICS = """
SELECT
    snapshot_id,
    snapshot_name,
    jurisdiction,
    target_agency,
    dossier_type,
    status,
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

# Get all gate metrics for comparison
SELECT_ALL_SNAPSHOT_GATE_METRICS = """
SELECT
    snapshot_id,
    snapshot_name,
    jurisdiction,
    target_agency,
    dossier_type,
    status,
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
WHERE ($1::text IS NULL OR jurisdiction = $1)
ORDER BY 
    CASE status 
        WHEN 'DRAFT' THEN 1 
        WHEN 'FROZEN' THEN 2 
        WHEN 'SUBMITTED' THEN 3 
        WHEN 'ARCHIVED' THEN 4 
    END,
    gate_pass_recommended DESC,
    red_fragments ASC
"""

# Remove fragment from draft snapshot
DELETE_SNAPSHOT_FRAGMENT = """
DELETE FROM prose.submission_snapshot_fragments
WHERE id = $1
RETURNING id, snapshot_id, fragment_id
"""

# Get fragment version content from snapshot
SELECT_SNAPSHOT_FRAGMENT_CONTENT = """
SELECT
    ssf.fragment_id,
    ssf.version_id,
    ssf.ectd_section_path,
    ssf.jurisdiction,
    v.content_prose,
    v.objectivity_score,
    v.confidence_rating,
    v.is_verified_against_truth,
    v.burden_of_proof_justification,
    v.created_at AS version_created_at,
    v.created_by AS version_created_by,
    v.change_reason,
    ssf.truth_link_count_at_freeze,
    ssf.risk_status_at_freeze,
    ssf.drift_magnitude_at_freeze
FROM prose.submission_snapshot_fragments ssf
JOIN prose.smart_fragment_versions v 
    ON v.fragment_id = ssf.fragment_id AND v.version_id = ssf.version_id
WHERE ssf.snapshot_id = $1 AND ssf.fragment_id = $2
"""

# Compare current fragment state vs snapshot state
SELECT_FRAGMENT_VS_SNAPSHOT = """
SELECT
    'current' AS source,
    fc.fragment_id,
    fc.current_version_id AS version_id,
    fc.content_prose,
    fc.truth_link_count,
    fc.latest_risk_status AS risk_status,
    fc.latest_drift_magnitude AS drift_magnitude
FROM prose.v_fragment_current fc
WHERE fc.fragment_id = $2

UNION ALL

SELECT
    'snapshot' AS source,
    ssf.fragment_id,
    ssf.version_id,
    v.content_prose,
    ssf.truth_link_count_at_freeze AS truth_link_count,
    ssf.risk_status_at_freeze AS risk_status,
    ssf.drift_magnitude_at_freeze AS drift_magnitude
FROM prose.submission_snapshot_fragments ssf
JOIN prose.smart_fragment_versions v 
    ON v.fragment_id = ssf.fragment_id AND v.version_id = ssf.version_id
WHERE ssf.snapshot_id = $1 AND ssf.fragment_id = $2
"""

# =============================================================================
# Snapshot Automation Queries
# =============================================================================

# Get fragments needing interrogation in a section (never assessed or stale)
SELECT_STALE_FRAGMENTS_FOR_INTERROGATION = """
SELECT 
    sf.id AS fragment_id,
    sf.ectd_section_path,
    sf.jurisdiction,
    sf.version_id,
    fc.last_interrogated_at,
    fc.latest_risk_status
FROM prose.smart_fragments sf
LEFT JOIN prose.v_fragment_current fc ON fc.fragment_id = sf.id
WHERE sf.ectd_section_path LIKE $1
  AND ($2::text IS NULL OR sf.jurisdiction = $2)
  AND (
      fc.last_interrogated_at IS NULL  -- Never interrogated
      OR fc.last_interrogated_at < NOW() - INTERVAL '24 hours'  -- Stale
  )
ORDER BY fc.last_interrogated_at NULLS FIRST
"""

# Count fragments by status for section
SELECT_SECTION_FRAGMENT_STATS = """
SELECT
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE fc.latest_risk_status = 'DATA_DRIFT') AS red_count,
    COUNT(*) FILTER (WHERE fc.latest_risk_status = 'IR_PREDICTED') AS amber_count,
    COUNT(*) FILTER (WHERE fc.latest_risk_status = 'ALIGNED') AS green_count,
    COUNT(*) FILTER (WHERE fc.last_interrogated_at IS NULL) AS never_interrogated,
    COALESCE(AVG(fc.latest_drift_magnitude), 0) AS avg_drift,
    COALESCE(MAX(fc.latest_drift_magnitude), 0) AS max_drift
FROM prose.smart_fragments sf
LEFT JOIN prose.v_fragment_current fc ON fc.fragment_id = sf.id
WHERE sf.ectd_section_path LIKE $1
  AND ($2::text IS NULL OR sf.jurisdiction = $2)
"""

# Insert snapshot fragments with auto-interrogate (populates from section)
INSERT_SNAPSHOT_FRAGMENTS_WITH_INTERROGATE = """
WITH new_fragments AS (
    INSERT INTO prose.submission_snapshot_fragments (snapshot_id, fragment_id, included_by)
    SELECT $1, sf.id, $3
    FROM prose.smart_fragments sf
    WHERE sf.jurisdiction = $2
      AND sf.ectd_section_path LIKE $4
    ON CONFLICT (snapshot_id, fragment_id) DO NOTHING
    RETURNING id, fragment_id, version_id, ectd_section_path, jurisdiction,
              truth_link_count_at_freeze, risk_status_at_freeze, drift_magnitude_at_freeze
)
SELECT 
    nf.*,
    (SELECT COUNT(*) FROM new_fragments) AS fragments_added
FROM new_fragments nf
"""

# Freeze snapshot only if gate passes
UPDATE_SNAPSHOT_FREEZE_IF_GATE_PASS = """
UPDATE prose.submission_snapshots ss
SET status = 'FROZEN',
    frozen_at = NOW(),
    frozen_by = $2
FROM prose.v_snapshot_gate_metrics gm
WHERE ss.id = $1
  AND ss.status = 'DRAFT'
  AND gm.snapshot_id = ss.id
  AND gm.gate_pass_recommended = TRUE
RETURNING ss.id, ss.snapshot_name, ss.status::text AS status, 
          ss.frozen_at, ss.frozen_by,
          gm.gate_pass_recommended,
          gm.red_fragments,
          gm.amber_fragments,
          gm.max_drift
"""

# Force freeze (bypasses gate check, for override scenarios)
UPDATE_SNAPSHOT_FORCE_FREEZE = """
UPDATE prose.submission_snapshots
SET status = 'FROZEN',
    frozen_at = NOW(),
    frozen_by = $2,
    notes = COALESCE(notes, '') || E'\n[FORCE FREEZE: ' || $3 || ']'
WHERE id = $1
  AND status = 'DRAFT'
RETURNING id, snapshot_name, status::text AS status, frozen_at, frozen_by
"""

# Get snapshot automation status
SELECT_SNAPSHOT_AUTOMATION_STATUS = """
SELECT
    ss.id AS snapshot_id,
    ss.snapshot_name,
    ss.jurisdiction,
    ss.status::text AS status,
    COUNT(ssf.id) AS fragments_included,
    COUNT(ssf.id) FILTER (WHERE ssf.risk_status_at_freeze IS NULL) AS not_interrogated,
    COUNT(ssf.id) FILTER (WHERE ssf.risk_status_at_freeze = 'DATA_DRIFT') AS red_count,
    COUNT(ssf.id) FILTER (WHERE ssf.risk_status_at_freeze = 'IR_PREDICTED') AS amber_count,
    COUNT(ssf.id) FILTER (WHERE ssf.risk_status_at_freeze = 'ALIGNED') AS green_count,
    COALESCE(AVG(ssf.drift_magnitude_at_freeze), 0) AS avg_drift,
    COALESCE(MAX(ssf.drift_magnitude_at_freeze), 0) AS max_drift,
    gm.gate_pass_recommended
FROM prose.submission_snapshots ss
LEFT JOIN prose.submission_snapshot_fragments ssf ON ssf.snapshot_id = ss.id
LEFT JOIN prose.v_snapshot_gate_metrics gm ON gm.snapshot_id = ss.id
WHERE ss.id = $1
GROUP BY ss.id, ss.snapshot_name, ss.jurisdiction, ss.status, gm.gate_pass_recommended
"""

# Select section rollup (heatmap backbone - legacy compatibility)
SELECT_SECTION_ROLLUP = """
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
WHERE ($1::text IS NULL OR ectd_section_root LIKE $1)
  AND ($2::text IS NULL OR jurisdiction = $2)
ORDER BY avg_risk_score DESC NULLS LAST, max_latest_drift DESC NULLS LAST
"""

# Jurisdiction rollup (legacy compatibility)
SELECT_JURISDICTION_ROLLUP = """
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
ORDER BY red_fragments DESC, amber_fragments DESC
"""