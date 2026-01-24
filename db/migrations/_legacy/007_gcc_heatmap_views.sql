-- ============================================================================
-- Concept2Cure "Global Command Center" - Heatmap Views + Latest-Risk Rollups
-- Migration: 004_gcc_heatmap_views.sql
-- Purpose:
--   - Make the DB "queryable like a Command Center":
--       * Latest risk per fragment
--       * Truth coverage per fragment
--       * Section/jurisdiction rollups for heatmaps
--   - Add performance indexes for "latest log" lookups
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times (Neon-friendly)
-- ============================================================================

BEGIN;

CREATE SCHEMA IF NOT EXISTS prose;
CREATE SCHEMA IF NOT EXISTS audit;
CREATE SCHEMA IF NOT EXISTS truth;

-- ============================================================================
-- A) Performance: latest audit log per fragment
-- ============================================================================
CREATE INDEX IF NOT EXISTS audit_logs_fragment_created_at_desc_idx
  ON audit.concomitant_audit_logs (fragment_id, created_at DESC);

-- ============================================================================
-- B) Latest risk per fragment (one-row-per-fragment view)
-- ============================================================================
CREATE OR REPLACE VIEW audit.v_fragment_latest_risk AS
SELECT DISTINCT ON (l.fragment_id)
  l.fragment_id,
  l.id AS audit_log_id,
  l.risk_status,
  l.drift_magnitude,
  l.feedback_payload,
  l.agent_identity AS last_agent_identity,
  l.created_at AS last_interrogated_at
FROM audit.concomitant_audit_logs l
WHERE l.fragment_id IS NOT NULL
ORDER BY l.fragment_id, l.created_at DESC;

COMMENT ON VIEW audit.v_fragment_latest_risk IS
  'Latest interrogation result per fragment - use for current risk state';

-- ============================================================================
-- C) Truth coverage per fragment (counts + primary endpoint linkage)
-- ============================================================================
CREATE OR REPLACE VIEW prose.v_fragment_truth_coverage AS
SELECT
  ftl.fragment_id,
  COUNT(*)::INT AS truth_link_count,
  COUNT(*) FILTER (WHERE ftl.claim_kind = 'supports')::INT AS supports_count,
  COUNT(*) FILTER (WHERE ftl.claim_kind = 'contradicts')::INT AS contradicts_count,
  COUNT(DISTINCT ftl.truth_id)::INT AS distinct_truth_points,
  COUNT(*) FILTER (WHERE ct.is_primary_endpoint IS TRUE)::INT AS primary_endpoint_links
FROM prose.fragment_truth_links ftl
LEFT JOIN truth.clinical_truth_store ct ON ct.id = ftl.truth_id
GROUP BY ftl.fragment_id;

COMMENT ON VIEW prose.v_fragment_truth_coverage IS
  'Truth linkage summary per fragment - shows data traceability';

-- ============================================================================
-- D) Current fragment "single pane of glass" view:
--    fragment header + current version text + truth coverage + latest risk
-- ============================================================================
CREATE OR REPLACE VIEW prose.v_fragment_current AS
SELECT
  sf.id AS fragment_id,
  sf.ectd_section_path,
  split_part(sf.ectd_section_path, '-', 1) AS ectd_section_root, -- e.g. "m2.7.3"
  sf.jurisdiction,

  sf.version_id AS current_version_id,

  v.content_prose,
  v.embedding,
  v.objectivity_score,
  v.confidence_rating,
  v.is_verified_against_truth,
  v.regulatory_precedent_id,
  v.burden_of_proof_justification,

  sf.created_at,
  sf.updated_at,
  sf.current_version_created_at,
  sf.current_version_created_by,
  sf.current_change_reason,
  sf.current_request_id,

  COALESCE(cov.truth_link_count, 0) AS truth_link_count,
  COALESCE(cov.primary_endpoint_links, 0) AS primary_endpoint_links,

  lr.risk_status AS latest_risk_status,
  lr.drift_magnitude AS latest_drift_magnitude,
  lr.audit_log_id AS latest_audit_log_id,
  lr.last_interrogated_at

FROM prose.smart_fragments sf
LEFT JOIN prose.smart_fragment_versions v
  ON v.fragment_id = sf.id AND v.version_id = sf.version_id
LEFT JOIN prose.v_fragment_truth_coverage cov
  ON cov.fragment_id = sf.id
LEFT JOIN audit.v_fragment_latest_risk lr
  ON lr.fragment_id = sf.id;

COMMENT ON VIEW prose.v_fragment_current IS
  'Single pane of glass: current fragment state + truth coverage + latest risk';

-- ============================================================================
-- E) Section rollup view (heatmap backbone)
--    Think: "Show me risk by M2.7.3 vs M3.2.S, per jurisdiction"
-- ============================================================================
CREATE OR REPLACE VIEW prose.v_section_risk_rollup AS
SELECT
  ectd_section_root,
  jurisdiction,

  COUNT(*)::INT AS fragments_total,

  COUNT(*) FILTER (WHERE is_verified_against_truth IS TRUE)::INT AS verified_fragments,
  COUNT(*) FILTER (WHERE truth_link_count = 0)::INT AS unlinked_fragments,

  COUNT(*) FILTER (WHERE latest_risk_status = 'DATA_DRIFT')::INT AS red_fragments,
  COUNT(*) FILTER (WHERE latest_risk_status = 'IR_PREDICTED')::INT AS amber_fragments,
  COUNT(*) FILTER (WHERE latest_risk_status = 'ALIGNED')::INT AS green_fragments,
  COUNT(*) FILTER (WHERE latest_risk_status IS NULL)::INT AS never_interrogated_fragments,

  AVG(latest_drift_magnitude) AS avg_latest_drift,
  MAX(latest_drift_magnitude) AS max_latest_drift,
  MAX(last_interrogated_at) AS last_interrogated_at,

  -- Simple numeric risk score for sorting (tweak later)
  AVG(
    CASE latest_risk_status
      WHEN 'DATA_DRIFT' THEN 3
      WHEN 'IR_PREDICTED' THEN 2
      WHEN 'ALIGNED' THEN 1
      ELSE 0
    END
  ) AS avg_risk_score

FROM prose.v_fragment_current
GROUP BY ectd_section_root, jurisdiction;

COMMENT ON VIEW prose.v_section_risk_rollup IS
  'Section-level risk aggregation - backbone for Command Center heatmaps';

-- ============================================================================
-- F) Jurisdiction rollup view (executive dashboard)
-- ============================================================================
CREATE OR REPLACE VIEW prose.v_jurisdiction_risk_rollup AS
SELECT
  jurisdiction,
  COUNT(*)::INT AS fragments_total,
  COUNT(*) FILTER (WHERE latest_risk_status = 'DATA_DRIFT')::INT AS red_fragments,
  COUNT(*) FILTER (WHERE latest_risk_status = 'IR_PREDICTED')::INT AS amber_fragments,
  COUNT(*) FILTER (WHERE latest_risk_status = 'ALIGNED')::INT AS green_fragments,
  COUNT(*) FILTER (WHERE latest_risk_status IS NULL)::INT AS never_interrogated_fragments,
  AVG(latest_drift_magnitude) AS avg_latest_drift,
  MAX(latest_drift_magnitude) AS max_latest_drift,
  MAX(last_interrogated_at) AS last_interrogated_at
FROM prose.v_fragment_current
GROUP BY jurisdiction;

COMMENT ON VIEW prose.v_jurisdiction_risk_rollup IS
  'Jurisdiction-level risk summary - executive dashboard view';

-- ============================================================================
-- COMMENTS (for documentation)
-- ============================================================================
COMMENT ON INDEX audit.audit_logs_fragment_created_at_desc_idx IS
  'Performance index for "latest audit log per fragment" queries';

COMMIT;
