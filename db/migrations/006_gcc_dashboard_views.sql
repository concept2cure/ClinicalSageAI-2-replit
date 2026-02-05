-- ============================================================================
-- Concept2Cure "Global Command Center" - Dashboard Views Migration
-- Migration: 006_gcc_dashboard_views.sql
-- Purpose: Creates materialized views and queries for regulatory heatmap,
--          risk rollups, and command center dashboards
-- ============================================================================
-- IDEMPOTENT: Safe to run multiple times
-- ============================================================================

BEGIN;

-- ============================================================================
-- FRAGMENT LATEST VIEW (Current state of all fragments)
-- ============================================================================

CREATE OR REPLACE VIEW prose.v_fragment_latest AS
SELECT
    sf.id AS fragment_id,
    sf.ectd_section_path,
    sf.jurisdiction,
    sf.content_prose,
    sf.objectivity_score,
    sf.confidence_rating,
    sf.is_verified_against_truth,
    sf.version_id,
    sf.current_version_id,
    sf.created_at,
    sf.updated_at,
    (sf.embedding IS NOT NULL) AS has_embedding,

    -- Latest version metadata
    sfv.created_by AS last_modified_by,
    sfv.change_reason AS last_change_reason,

    -- Truth link summary
    COUNT(DISTINCT ftl.id) AS truth_link_count,
    COUNT(DISTINCT CASE WHEN ftl.evidence_strength = 'primary_endpoint' THEN ftl.id END) AS primary_evidence_count,

    -- Section classification
    CASE
        WHEN sf.ectd_section_path LIKE 'm2.7.3%' THEN 'Efficacy Summary'
        WHEN sf.ectd_section_path LIKE 'm2.7.4%' THEN 'Safety Summary'
        WHEN sf.ectd_section_path LIKE 'm2.7.1%' THEN 'Biopharm Summary'
        WHEN sf.ectd_section_path LIKE 'm2.7.2%' THEN 'PK Summary'
        WHEN sf.ectd_section_path LIKE 'm2.5%' THEN 'Clinical Overview'
        WHEN sf.ectd_section_path LIKE 'm2.4%' THEN 'Nonclinical Overview'
        WHEN sf.ectd_section_path LIKE 'm2.3%' THEN 'Quality Overview'
        WHEN sf.ectd_section_path LIKE 'm3%' THEN 'Quality Module'
        WHEN sf.ectd_section_path LIKE 'm4%' THEN 'Nonclinical Module'
        WHEN sf.ectd_section_path LIKE 'm5%' THEN 'Clinical Module'
        ELSE 'Other'
    END AS section_category

FROM prose.smart_fragments sf
LEFT JOIN prose.smart_fragment_versions sfv
    ON sf.id = sfv.fragment_id AND sf.current_version_id = sfv.version_id
LEFT JOIN prose.fragment_truth_links ftl ON sf.id = ftl.fragment_id
GROUP BY sf.id, sfv.created_by, sfv.change_reason;

COMMENT ON VIEW prose.v_fragment_latest IS
    'Current state of all prose fragments with version and link metadata';

-- ============================================================================
-- FRAGMENT LATEST RISK VIEW (Latest Shadow Agent assessment per fragment)
-- ============================================================================

CREATE OR REPLACE VIEW audit.v_fragment_latest_risk AS
WITH ranked_audits AS (
    SELECT
        cal.fragment_id,
        cal.id AS audit_log_id,
        cal.agent_identity,
        cal.risk_status,
        cal.drift_magnitude,
        cal.feedback_payload,
        cal.created_at,
        cal.request_id,
        ROW_NUMBER() OVER (
            PARTITION BY cal.fragment_id
            ORDER BY cal.created_at DESC
        ) AS rn
    FROM audit.concomitant_audit_logs cal
    WHERE cal.fragment_id IS NOT NULL
)
SELECT
    ra.fragment_id,
    ra.audit_log_id,
    ra.agent_identity,
    ra.risk_status,
    ra.drift_magnitude,
    ra.feedback_payload,
    ra.created_at AS assessed_at,
    ra.request_id,

    -- Extract key metrics from payload
    (ra.feedback_payload->>'truth_links_count')::int AS truth_links_count,
    ra.feedback_payload->'predicted_questions' AS predicted_questions,
    jsonb_array_length(COALESCE(ra.feedback_payload->'predicted_questions', '[]'::jsonb)) AS question_count,

    -- Risk classification
    CASE
        WHEN ra.risk_status = 'IR_PREDICTED' THEN 'RED'
        WHEN ra.risk_status = 'DATA_DRIFT' THEN 'AMBER'
        WHEN ra.risk_status = 'ALIGNED' THEN 'GREEN'
        ELSE 'UNKNOWN'
    END AS risk_color

FROM ranked_audits ra
WHERE ra.rn = 1;

COMMENT ON VIEW audit.v_fragment_latest_risk IS
    'Latest Shadow Agent risk assessment for each fragment';

-- ============================================================================
-- SECTION RISK ROLLUP VIEW (Aggregate risk by eCTD section)
-- ============================================================================

CREATE OR REPLACE VIEW prose.v_section_risk_rollup AS
SELECT
    sf.ectd_section_path,
    sf.jurisdiction,

    -- Fragment counts
    COUNT(DISTINCT sf.id) AS total_fragments,
    COUNT(DISTINCT CASE WHEN flr.risk_status = 'IR_PREDICTED' THEN sf.id END) AS red_fragments,
    COUNT(DISTINCT CASE WHEN flr.risk_status = 'DATA_DRIFT' THEN sf.id END) AS amber_fragments,
    COUNT(DISTINCT CASE WHEN flr.risk_status = 'ALIGNED' THEN sf.id END) AS green_fragments,
    COUNT(DISTINCT CASE WHEN flr.risk_status IS NULL THEN sf.id END) AS unassessed_fragments,

    -- Drift statistics
    AVG(flr.drift_magnitude) AS avg_drift,
    MAX(flr.drift_magnitude) AS max_drift,

    -- Overall section status
    CASE
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status = 'IR_PREDICTED' THEN sf.id END) > 0 THEN 'RED'
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status = 'DATA_DRIFT' THEN sf.id END) > 0 THEN 'AMBER'
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status IS NULL THEN sf.id END) > COUNT(sf.id) * 0.2 THEN 'INCOMPLETE'
        ELSE 'GREEN'
    END AS section_status,

    -- Submission readiness score (0-100)
    ROUND(
        (COUNT(DISTINCT CASE WHEN flr.risk_status = 'ALIGNED' THEN sf.id END)::numeric
         / NULLIF(COUNT(DISTINCT sf.id), 0)) * 100
    , 1) AS readiness_score,

    -- Section category
    CASE
        WHEN sf.ectd_section_path LIKE 'm2.7.3%' THEN 'Efficacy Summary'
        WHEN sf.ectd_section_path LIKE 'm2.7.4%' THEN 'Safety Summary'
        WHEN sf.ectd_section_path LIKE 'm2.5%' THEN 'Clinical Overview'
        WHEN sf.ectd_section_path LIKE 'm3%' THEN 'Quality Module'
        ELSE 'Other'
    END AS section_category

FROM prose.smart_fragments sf
LEFT JOIN audit.v_fragment_latest_risk flr ON sf.id = flr.fragment_id
GROUP BY sf.ectd_section_path, sf.jurisdiction
ORDER BY
    CASE
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status = 'IR_PREDICTED' THEN sf.id END) > 0 THEN 1
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status = 'DATA_DRIFT' THEN sf.id END) > 0 THEN 2
        ELSE 3
    END,
    sf.ectd_section_path;

COMMENT ON VIEW prose.v_section_risk_rollup IS
    'Aggregate risk metrics by eCTD section for regulatory heatmap';

-- ============================================================================
-- AGENCY-SPECIFIC RISK VIEW (Risk breakdown by target agency)
-- ============================================================================

CREATE OR REPLACE VIEW prose.v_agency_risk_summary AS
SELECT
    sf.jurisdiction AS agency,

    -- Overall counts
    COUNT(DISTINCT sf.id) AS total_fragments,
    COUNT(DISTINCT sf.ectd_section_path) AS sections_count,

    -- Risk distribution
    COUNT(DISTINCT CASE WHEN flr.risk_status = 'IR_PREDICTED' THEN sf.id END) AS ir_predicted_count,
    COUNT(DISTINCT CASE WHEN flr.risk_status = 'DATA_DRIFT' THEN sf.id END) AS drift_count,
    COUNT(DISTINCT CASE WHEN flr.risk_status = 'ALIGNED' THEN sf.id END) AS aligned_count,

    -- Predicted question count
    SUM(jsonb_array_length(COALESCE(flr.feedback_payload->'predicted_questions', '[]'::jsonb))) AS total_predicted_questions,

    -- Submission readiness
    ROUND(
        (COUNT(DISTINCT CASE WHEN flr.risk_status = 'ALIGNED' THEN sf.id END)::numeric
         / NULLIF(COUNT(DISTINCT sf.id), 0)) * 100
    , 1) AS readiness_score,

    -- Gate status
    CASE
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status = 'IR_PREDICTED' THEN sf.id END) > 0 THEN 'BLOCKED'
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status = 'DATA_DRIFT' THEN sf.id END) > 5 THEN 'REVIEW_REQUIRED'
        WHEN COUNT(DISTINCT CASE WHEN flr.risk_status IS NULL THEN sf.id END) > COUNT(sf.id) * 0.1 THEN 'INCOMPLETE'
        ELSE 'READY'
    END AS submission_gate_status

FROM prose.smart_fragments sf
LEFT JOIN audit.v_fragment_latest_risk flr ON sf.id = flr.fragment_id
GROUP BY sf.jurisdiction
ORDER BY sf.jurisdiction;

COMMENT ON VIEW prose.v_agency_risk_summary IS
    'Risk summary by target regulatory agency for submission gating';

-- ============================================================================
-- PREDICTED IR HOTSPOTS VIEW (Top IR predictions across all fragments)
-- ============================================================================

CREATE OR REPLACE VIEW adversarial.v_predicted_ir_hotspots AS
WITH expanded_questions AS (
    SELECT
        cal.fragment_id,
        cal.created_at AS predicted_at,
        q->>'question' AS predicted_question,
        (q->>'similarity')::float AS similarity,
        q->>'precedent_id' AS precedent_id,
        q->>'agency' AS source_agency,
        q->>'failure_mode' AS failure_mode
    FROM audit.concomitant_audit_logs cal,
         jsonb_array_elements(cal.feedback_payload->'predicted_questions') AS q
    WHERE cal.agent_identity = 'SHADOW_AGENT'
      AND cal.feedback_payload->'predicted_questions' IS NOT NULL
)
SELECT
    eq.predicted_question,
    eq.failure_mode,
    eq.source_agency,
    COUNT(DISTINCT eq.fragment_id) AS fragment_count,
    AVG(eq.similarity) AS avg_similarity,
    MAX(eq.similarity) AS max_similarity,
    ARRAY_AGG(DISTINCT sf.ectd_section_path) AS affected_sections,
    MAX(eq.predicted_at) AS last_predicted
FROM expanded_questions eq
JOIN prose.smart_fragments sf ON eq.fragment_id = sf.id
GROUP BY eq.predicted_question, eq.failure_mode, eq.source_agency
HAVING COUNT(DISTINCT eq.fragment_id) >= 1
ORDER BY COUNT(DISTINCT eq.fragment_id) DESC, AVG(eq.similarity) DESC
LIMIT 100;

COMMENT ON VIEW adversarial.v_predicted_ir_hotspots IS
    'Top predicted regulatory questions aggregated across all fragments';

-- ============================================================================
-- SUBMISSION GATE CHECK VIEW (Go/No-Go criteria for submission)
-- ============================================================================

CREATE OR REPLACE VIEW prose.v_submission_gate_check AS
WITH gate_criteria AS (
    SELECT
        sf.jurisdiction,

        -- Critical sections unlinked
        COUNT(DISTINCT CASE
            WHEN sf.ectd_section_path LIKE 'm2.7.3%'
                 AND NOT sf.is_verified_against_truth
            THEN sf.id
        END) AS unlinked_efficacy_fragments,

        -- High-drift fragments
        COUNT(DISTINCT CASE
            WHEN flr.drift_magnitude > 0.2
            THEN sf.id
        END) AS high_drift_fragments,

        -- IR predicted fragments
        COUNT(DISTINCT CASE
            WHEN flr.risk_status = 'IR_PREDICTED'
            THEN sf.id
        END) AS ir_predicted_fragments,

        -- Unassessed critical fragments
        COUNT(DISTINCT CASE
            WHEN sf.ectd_section_path LIKE 'm2.%'
                 AND flr.risk_status IS NULL
            THEN sf.id
        END) AS unassessed_module2_fragments,

        -- Total fragments
        COUNT(DISTINCT sf.id) AS total_fragments,
        COUNT(DISTINCT CASE WHEN sf.ectd_section_path LIKE 'm2.%' THEN sf.id END) AS module2_fragments

    FROM prose.smart_fragments sf
    LEFT JOIN audit.v_fragment_latest_risk flr ON sf.id = flr.fragment_id
    GROUP BY sf.jurisdiction
)
SELECT
    gc.jurisdiction,
    gc.total_fragments,
    gc.module2_fragments,
    gc.unlinked_efficacy_fragments,
    gc.high_drift_fragments,
    gc.ir_predicted_fragments,
    gc.unassessed_module2_fragments,

    -- Individual gate checks
    gc.unlinked_efficacy_fragments = 0 AS gate_efficacy_linked,
    gc.high_drift_fragments <= 3 AS gate_drift_acceptable,
    gc.ir_predicted_fragments = 0 AS gate_no_ir_predictions,
    gc.unassessed_module2_fragments = 0 AS gate_fully_assessed,

    -- Overall gate decision
    CASE
        WHEN gc.ir_predicted_fragments > 0 THEN 'STOP'
        WHEN gc.unlinked_efficacy_fragments > 0 THEN 'STOP'
        WHEN gc.high_drift_fragments > 3 THEN 'REVIEW'
        WHEN gc.unassessed_module2_fragments > 0 THEN 'INCOMPLETE'
        ELSE 'GO'
    END AS gate_decision,

    -- Blockers summary
    ARRAY_REMOVE(ARRAY[
        CASE WHEN gc.ir_predicted_fragments > 0
             THEN gc.ir_predicted_fragments || ' fragments have IR predictions' END,
        CASE WHEN gc.unlinked_efficacy_fragments > 0
             THEN gc.unlinked_efficacy_fragments || ' efficacy fragments unlinked to truth' END,
        CASE WHEN gc.high_drift_fragments > 3
             THEN gc.high_drift_fragments || ' fragments have high drift' END,
        CASE WHEN gc.unassessed_module2_fragments > 0
             THEN gc.unassessed_module2_fragments || ' Module 2 fragments unassessed' END
    ], NULL) AS blockers

FROM gate_criteria gc
ORDER BY
    CASE
        WHEN gc.ir_predicted_fragments > 0 THEN 1
        WHEN gc.unlinked_efficacy_fragments > 0 THEN 2
        ELSE 3
    END,
    gc.jurisdiction;

COMMENT ON VIEW prose.v_submission_gate_check IS
    'Go/No-Go criteria check for regulatory submission by jurisdiction';

-- ============================================================================
-- AUDIT TRAIL SUMMARY VIEW (For compliance reporting)
-- ============================================================================

CREATE OR REPLACE VIEW audit.v_audit_trail_summary AS
SELECT
    DATE_TRUNC('day', cal.created_at) AS audit_date,
    cal.agent_identity,
    cal.risk_status,
    COUNT(*) AS event_count,
    COUNT(DISTINCT cal.fragment_id) AS fragments_assessed,
    AVG(cal.drift_magnitude) AS avg_drift,
    COUNT(DISTINCT cal.request_id) AS unique_requests
FROM audit.concomitant_audit_logs cal
GROUP BY
    DATE_TRUNC('day', cal.created_at),
    cal.agent_identity,
    cal.risk_status
ORDER BY audit_date DESC, agent_identity, risk_status;

COMMENT ON VIEW audit.v_audit_trail_summary IS
    'Daily summary of audit events for compliance reporting';

-- ============================================================================
-- VERSION HISTORY TIMELINE VIEW
-- ============================================================================

CREATE OR REPLACE VIEW prose.v_version_timeline AS
SELECT
    sfv.fragment_id,
    sf.ectd_section_path,
    sf.jurisdiction,
    sfv.version_id,
    sfv.created_at,
    sfv.created_by,
    sfv.change_reason,
    sfv.request_id,
    LAG(sfv.created_at) OVER (PARTITION BY sfv.fragment_id ORDER BY sfv.version_id) AS previous_version_at,
    sfv.created_at - LAG(sfv.created_at) OVER (PARTITION BY sfv.fragment_id ORDER BY sfv.version_id) AS time_since_previous,
    LENGTH(sfv.content_prose) AS content_length,
    LENGTH(sfv.content_prose) - COALESCE(
        LAG(LENGTH(sfv.content_prose)) OVER (PARTITION BY sfv.fragment_id ORDER BY sfv.version_id), 0
    ) AS length_change
FROM prose.smart_fragment_versions sfv
JOIN prose.smart_fragments sf ON sfv.fragment_id = sf.id
ORDER BY sfv.fragment_id, sfv.version_id;

COMMENT ON VIEW prose.v_version_timeline IS
    'Version history timeline for all fragments showing changes over time';

-- ============================================================================
-- GRANT VIEW ACCESS TO ROLES
-- ============================================================================

-- Reader access to all views
GRANT SELECT ON prose.v_fragment_latest TO gcc_app_reader;
GRANT SELECT ON audit.v_fragment_latest_risk TO gcc_app_reader;
GRANT SELECT ON prose.v_section_risk_rollup TO gcc_app_reader;
GRANT SELECT ON prose.v_agency_risk_summary TO gcc_app_reader;
GRANT SELECT ON adversarial.v_predicted_ir_hotspots TO gcc_app_reader;
GRANT SELECT ON prose.v_submission_gate_check TO gcc_app_reader;
GRANT SELECT ON audit.v_audit_trail_summary TO gcc_app_reader;
GRANT SELECT ON prose.v_version_timeline TO gcc_app_reader;

-- Auditor access
GRANT SELECT ON audit.v_fragment_latest_risk TO gcc_auditor;
GRANT SELECT ON audit.v_audit_trail_summary TO gcc_auditor;
GRANT SELECT ON prose.v_version_timeline TO gcc_auditor;

COMMIT;
