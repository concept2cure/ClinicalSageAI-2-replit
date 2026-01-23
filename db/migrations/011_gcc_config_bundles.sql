-- Migration 011: Validated Configuration Registry
-- Purpose: Make Shadow Agent decisions reproducible by storing exact config bundles
--
-- This migration creates append-only config bundle records that capture:
--   - Embedding model + version
--   - LLM model + version (if applicable)
--   - Persona settings
--   - Thresholds
--   - Prompt template hashes
--
-- Every run group and audit log can reference a config_bundle_id,
-- answering: "What exact configuration produced this decision?"

BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

-- =============================================================================
-- A) Config Bundles Table (append-only)
-- =============================================================================

CREATE TABLE IF NOT EXISTS audit.config_bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Bundle identification
  bundle_name TEXT,                      -- Human-readable name
  bundle_version TEXT,                   -- Semantic version (e.g., "1.2.0")
  bundle_sha256 TEXT NOT NULL,           -- SHA-256 of canonical JSON for deduplication
  bundle_json JSONB NOT NULL,            -- Full config payload
  
  -- What this bundle configures
  bundle_type TEXT NOT NULL DEFAULT 'SHADOW_AGENT', -- SHADOW_AGENT | DRIFT_MONITOR | BATCH_QC
  
  -- Attribution
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

COMMENT ON TABLE audit.config_bundles IS 
  'Append-only registry of configuration bundles - enables reproducible AI decisions';

COMMENT ON COLUMN audit.config_bundles.bundle_sha256 IS 
  'SHA-256 of canonical JSON - use for deduplication and integrity verification';

COMMENT ON COLUMN audit.config_bundles.bundle_json IS 
  'Full configuration: models, versions, thresholds, prompts, persona settings';

-- Indexes
CREATE INDEX IF NOT EXISTS config_bundles_sha_idx
  ON audit.config_bundles (bundle_sha256);

CREATE INDEX IF NOT EXISTS config_bundles_type_idx
  ON audit.config_bundles (bundle_type, created_at DESC);

CREATE INDEX IF NOT EXISTS config_bundles_name_idx
  ON audit.config_bundles (bundle_name, bundle_version);

-- Unique constraint: same SHA means same config (allows reuse)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='config_bundles_sha_unique') THEN
    ALTER TABLE audit.config_bundles
      ADD CONSTRAINT config_bundles_sha_unique UNIQUE (bundle_sha256);
  END IF;
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- Append-only enforcement (config bundles are immutable records)
CREATE OR REPLACE FUNCTION audit.prevent_config_bundles_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'config_bundles is append-only (immutable for reproducibility)';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_config_bundles ON audit.config_bundles;
CREATE TRIGGER trg_no_update_delete_config_bundles
  BEFORE UPDATE OR DELETE ON audit.config_bundles
  FOR EACH ROW
  EXECUTE FUNCTION audit.prevent_config_bundles_mutation();

-- Attribution trigger
CREATE OR REPLACE FUNCTION audit.tg_config_bundles_attrib()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(current_setting('app.user', true), NEW.created_by, 'unknown');
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_config_bundles_attrib ON audit.config_bundles;
CREATE TRIGGER trg_config_bundles_attrib
  BEFORE INSERT ON audit.config_bundles
  FOR EACH ROW
  EXECUTE FUNCTION audit.tg_config_bundles_attrib();

-- =============================================================================
-- B) Add config_bundle_id references to run groups and audit logs
-- =============================================================================

-- Link run groups to their config bundle
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='shadow_run_groups') THEN
    ALTER TABLE audit.shadow_run_groups ADD COLUMN IF NOT EXISTS config_bundle_id UUID;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='shadow_run_groups_config_bundle_fk') THEN
      ALTER TABLE audit.shadow_run_groups 
        ADD CONSTRAINT shadow_run_groups_config_bundle_fk
        FOREIGN KEY (config_bundle_id) REFERENCES audit.config_bundles(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS shadow_run_groups_config_bundle_idx
      ON audit.shadow_run_groups (config_bundle_id);
  END IF;
END $$;

-- Link individual audit logs to their config bundle (allows per-log override)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='concomitant_audit_logs') THEN
    ALTER TABLE audit.concomitant_audit_logs ADD COLUMN IF NOT EXISTS config_bundle_id UUID;
    
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='audit_logs_config_bundle_fk') THEN
      ALTER TABLE audit.concomitant_audit_logs 
        ADD CONSTRAINT audit_logs_config_bundle_fk
        FOREIGN KEY (config_bundle_id) REFERENCES audit.config_bundles(id) ON DELETE RESTRICT;
    END IF;
    
    CREATE INDEX IF NOT EXISTS audit_logs_config_bundle_idx
      ON audit.concomitant_audit_logs (config_bundle_id);
  END IF;
END $$;

-- =============================================================================
-- C) Helper function: Get or create config bundle
-- =============================================================================
-- Returns existing bundle if SHA matches, or creates new one

CREATE OR REPLACE FUNCTION audit.fn_get_or_create_config_bundle(
  p_bundle_name TEXT,
  p_bundle_version TEXT,
  p_bundle_type TEXT,
  p_bundle_json JSONB
)
RETURNS UUID
LANGUAGE plpgsql
AS $$
DECLARE
  v_sha256 TEXT;
  v_bundle_id UUID;
BEGIN
  -- Calculate SHA-256 of canonical JSON
  v_sha256 := encode(sha256(p_bundle_json::TEXT::BYTEA), 'hex');
  
  -- Check if bundle with same SHA already exists
  SELECT id INTO v_bundle_id
  FROM audit.config_bundles
  WHERE bundle_sha256 = v_sha256;
  
  IF v_bundle_id IS NOT NULL THEN
    RETURN v_bundle_id;
  END IF;
  
  -- Create new bundle
  INSERT INTO audit.config_bundles (
    bundle_name, bundle_version, bundle_type, bundle_sha256, bundle_json
  )
  VALUES (p_bundle_name, p_bundle_version, p_bundle_type, v_sha256, p_bundle_json)
  RETURNING id INTO v_bundle_id;
  
  RETURN v_bundle_id;
END;
$$;

COMMENT ON FUNCTION audit.fn_get_or_create_config_bundle IS 
  'Gets existing config bundle by SHA or creates new one - ensures deduplication';

-- =============================================================================
-- D) View: Config bundle usage statistics
-- =============================================================================

CREATE OR REPLACE VIEW audit.v_config_bundle_usage AS
SELECT
  cb.id AS bundle_id,
  cb.bundle_name,
  cb.bundle_version,
  cb.bundle_type,
  cb.bundle_sha256,
  cb.created_at AS bundle_created_at,
  cb.created_by AS bundle_created_by,
  
  -- Usage counts
  (SELECT COUNT(*) FROM audit.shadow_run_groups rg WHERE rg.config_bundle_id = cb.id)::INT AS run_group_count,
  (SELECT COUNT(*) FROM audit.concomitant_audit_logs al WHERE al.config_bundle_id = cb.id)::INT AS audit_log_count,
  
  -- Last used
  GREATEST(
    (SELECT MAX(created_at) FROM audit.shadow_run_groups rg WHERE rg.config_bundle_id = cb.id),
    (SELECT MAX(created_at) FROM audit.concomitant_audit_logs al WHERE al.config_bundle_id = cb.id)
  ) AS last_used_at

FROM audit.config_bundles cb
ORDER BY cb.created_at DESC;

COMMENT ON VIEW audit.v_config_bundle_usage IS 
  'Shows config bundle usage statistics - for compliance reporting';

-- =============================================================================
-- E) Example bundle JSON structure (documentation)
-- =============================================================================
-- The bundle_json should follow this structure:

/*
{
  "shadow_agent": {
    "version": "2.1.0",
    "enabled": true
  },
  "embedding": {
    "provider": "openai",
    "model": "text-embedding-3-small",
    "model_version": "2024-01-25",
    "dimensions": 1536
  },
  "llm": {
    "provider": "openai",
    "model": "gpt-4-turbo",
    "model_version": "2024-04-09",
    "temperature": 0.1,
    "max_tokens": 2000
  },
  "persona": {
    "code": "FDA_STATS",
    "agency_filter": "FDA",
    "failure_modes": ["Statistical Plan Gap", "Multiplicity", "Estimand"],
    "top_k": 8,
    "drift_red_threshold": 0.18,
    "ir_similarity_threshold": 0.72
  },
  "thresholds": {
    "drift_red": 0.18,
    "drift_amber": 0.10,
    "similarity_high": 0.72,
    "similarity_medium": 0.50
  },
  "prompts": {
    "system_prompt_sha256": "abc123...",
    "interrogation_prompt_sha256": "def456...",
    "prompt_version": "v3.2.1"
  }
}
*/

COMMIT;
