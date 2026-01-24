-- Migration 007: Shadow Run Groups + Multi-Persona + Version Pinning
-- Purpose: Makes every Shadow run reproducible by pinning fragment version,
--          persona, and grouping multiple logs under one run_group_id.
-- Regulatory: Supports 21 CFR Part 11 audit trail requirements

BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

-- =============================================================================
-- A) Run group table (one batch run can produce many audit rows)
-- =============================================================================
-- A run group represents a single invocation like:
--   "Run FDA_STATS + FDA_CLINICAL over all of M2.7.3 before weekly QC"

CREATE TABLE IF NOT EXISTS audit.shadow_run_groups (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Human-readable name for the run
  run_name TEXT,
  
  -- Type of run: FRAGMENT_SINGLE | SECTION_BATCH | SNAPSHOT_QC | FULL_SUBMISSION
  run_type TEXT NOT NULL,
  
  -- Regulatory context
  jurisdiction TEXT,
  agency_code TEXT,
  
  -- Which personas were invoked (e.g., ['FDA_STATS', 'FDA_CLINICAL'])
  persona_set TEXT[],
  
  -- Full configuration snapshot for reproducibility
  config JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Attribution (Part 11 compliance)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

COMMENT ON TABLE audit.shadow_run_groups IS 
  'Groups multiple Shadow Agent audit logs into a single traceable batch run';

COMMENT ON COLUMN audit.shadow_run_groups.run_type IS 
  'FRAGMENT_SINGLE=one fragment, SECTION_BATCH=eCTD section, SNAPSHOT_QC=frozen snapshot, FULL_SUBMISSION=entire dossier';

COMMENT ON COLUMN audit.shadow_run_groups.persona_set IS 
  'Array of persona codes invoked in this run (e.g., FDA_STATS, FDA_CLINICAL, FDA_SAFETY, CMC_QUALITY)';

-- Attribution trigger (Part 11-supporting pattern)
CREATE OR REPLACE FUNCTION audit.tg_set_run_group_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(current_setting('app.user', true), NEW.created_by, 'unknown');
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_run_group_attrib ON audit.shadow_run_groups;
CREATE TRIGGER trg_run_group_attrib
  BEFORE INSERT ON audit.shadow_run_groups
  FOR EACH ROW
  EXECUTE FUNCTION audit.tg_set_run_group_attribution();

-- =============================================================================
-- B) Extend audit logs with run_group_id, fragment_version_id, agent_persona
-- =============================================================================

-- run_group_id: correlates logs to a batch run
ALTER TABLE audit.concomitant_audit_logs
  ADD COLUMN IF NOT EXISTS run_group_id UUID 
    REFERENCES audit.shadow_run_groups(id) ON DELETE SET NULL;

-- fragment_version_id: pins audit to the EXACT prose version evaluated
ALTER TABLE audit.concomitant_audit_logs
  ADD COLUMN IF NOT EXISTS fragment_version_id INT;

-- agent_persona: which persona performed the evaluation (FDA_STATS, FDA_CLINICAL, etc.)
ALTER TABLE audit.concomitant_audit_logs
  ADD COLUMN IF NOT EXISTS agent_persona TEXT;

COMMENT ON COLUMN audit.concomitant_audit_logs.run_group_id IS 
  'Links to batch run group for multi-persona or section-wide interrogations';

COMMENT ON COLUMN audit.concomitant_audit_logs.fragment_version_id IS 
  'Pins audit to exact prose version (enables reproducibility and diff tracking)';

COMMENT ON COLUMN audit.concomitant_audit_logs.agent_persona IS 
  'Persona code that performed this evaluation (e.g., FDA_STATS, FDA_CLINICAL, FDA_SAFETY, CMC_QUALITY)';

-- =============================================================================
-- C) Foreign key to immutable version history (pins audit to exact version)
-- =============================================================================
-- This ensures we can always answer: "What EXACTLY did the Shadow Agent evaluate?"

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'audit_logs_fragment_version_fk'
  ) THEN
    -- Only add if prose.smart_fragment_versions exists with composite key
    IF EXISTS (
      SELECT 1 FROM information_schema.tables 
      WHERE table_schema = 'prose' AND table_name = 'smart_fragment_versions'
    ) THEN
      ALTER TABLE audit.concomitant_audit_logs
        ADD CONSTRAINT audit_logs_fragment_version_fk
        FOREIGN KEY (fragment_id, fragment_version_id)
        REFERENCES prose.smart_fragment_versions(fragment_id, version_id)
        ON DELETE RESTRICT;
    END IF;
  END IF;
END $$;

-- =============================================================================
-- D) Indexes for dashboard queries
-- =============================================================================

CREATE INDEX IF NOT EXISTS audit_logs_run_group_idx
  ON audit.concomitant_audit_logs (run_group_id);

CREATE INDEX IF NOT EXISTS audit_logs_persona_idx
  ON audit.concomitant_audit_logs (agent_persona);

CREATE INDEX IF NOT EXISTS audit_logs_fragment_version_idx
  ON audit.concomitant_audit_logs (fragment_id, fragment_version_id, created_at DESC);

-- Composite index for persona-filtered queries
CREATE INDEX IF NOT EXISTS audit_logs_fragment_persona_time_idx
  ON audit.concomitant_audit_logs (fragment_id, agent_persona, created_at DESC);

-- =============================================================================
-- E) View: Latest risk PER fragment PER persona
-- =============================================================================
-- Useful for: "Show me the most recent evaluation of each fragment by each persona"

CREATE OR REPLACE VIEW audit.v_fragment_latest_risk_by_persona AS
SELECT DISTINCT ON (l.fragment_id, COALESCE(l.agent_persona, 'DEFAULT'))
  l.fragment_id,
  COALESCE(l.agent_persona, 'DEFAULT') AS agent_persona,
  l.id AS audit_log_id,
  l.fragment_version_id,
  l.risk_status,
  l.drift_magnitude,
  l.feedback_payload,
  l.created_at AS last_interrogated_at,
  l.run_group_id
FROM audit.concomitant_audit_logs l
WHERE l.fragment_id IS NOT NULL
ORDER BY l.fragment_id, COALESCE(l.agent_persona, 'DEFAULT'), l.created_at DESC;

COMMENT ON VIEW audit.v_fragment_latest_risk_by_persona IS 
  'Most recent Shadow Agent evaluation per fragment per persona - for dashboard heatmaps';

-- =============================================================================
-- F) View: Run group summary (batch-run reporting)
-- =============================================================================
-- Useful for: "How did the Weekly QC run perform across all fragments?"

CREATE OR REPLACE VIEW audit.v_run_group_summary AS
SELECT
  rg.id AS run_group_id,
  rg.run_name,
  rg.run_type,
  rg.jurisdiction,
  rg.agency_code,
  rg.persona_set,
  rg.created_at AS started_at,
  rg.created_by,
  l.agent_persona,
  COUNT(*)::INT AS logs_count,
  COUNT(*) FILTER (WHERE l.risk_status = 'DATA_DRIFT')::INT AS red_count,
  COUNT(*) FILTER (WHERE l.risk_status = 'IR_PREDICTED')::INT AS amber_count,
  COUNT(*) FILTER (WHERE l.risk_status = 'ALIGNED')::INT AS green_count,
  MAX(l.created_at) AS finished_at,
  ROUND(AVG(l.drift_magnitude)::NUMERIC, 4) AS avg_drift
FROM audit.shadow_run_groups rg
LEFT JOIN audit.concomitant_audit_logs l ON l.run_group_id = rg.id
GROUP BY rg.id, rg.run_name, rg.run_type, rg.jurisdiction, rg.agency_code, 
         rg.persona_set, rg.created_at, rg.created_by, l.agent_persona;

COMMENT ON VIEW audit.v_run_group_summary IS 
  'Aggregated summary of each batch run - for QC dashboards and compliance reporting';

-- =============================================================================
-- G) View: Cross-persona risk matrix (which fragments have disagreement?)
-- =============================================================================

CREATE OR REPLACE VIEW audit.v_cross_persona_risk_matrix AS
WITH latest AS (
  SELECT * FROM audit.v_fragment_latest_risk_by_persona
)
SELECT
  l1.fragment_id,
  l1.agent_persona AS persona_1,
  l2.agent_persona AS persona_2,
  l1.risk_status AS risk_1,
  l2.risk_status AS risk_2,
  CASE 
    WHEN l1.risk_status != l2.risk_status THEN 'DISAGREEMENT'
    ELSE 'AGREEMENT'
  END AS alignment_status,
  ABS(COALESCE(l1.drift_magnitude, 0) - COALESCE(l2.drift_magnitude, 0)) AS drift_delta
FROM latest l1
JOIN latest l2 ON l1.fragment_id = l2.fragment_id 
  AND l1.agent_persona < l2.agent_persona;

COMMENT ON VIEW audit.v_cross_persona_risk_matrix IS 
  'Identifies fragments where different personas disagree on risk - flags for human review';

COMMIT;
