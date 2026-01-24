-- Migration 008: Snapshot Export Manifest
-- Purpose: Provides reproducible artifact for audit defense, governance gates,
--          and external assembly workflows.
-- Contains: prose versions + truth citations + audit results in one exportable unit

BEGIN;

CREATE SCHEMA IF NOT EXISTS prose;

-- =============================================================================
-- A) Snapshot export records (immutable audit trail of exports)
-- =============================================================================

CREATE TABLE IF NOT EXISTS prose.submission_snapshot_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  -- Link to the frozen snapshot
  snapshot_id UUID NOT NULL REFERENCES prose.submission_snapshots(id) ON DELETE RESTRICT,

  -- Export format: json | xml | pdf_manifest | ectd_backbone
  export_format TEXT NOT NULL DEFAULT 'json',
  
  -- SHA-256 of the canonical JSON manifest (for integrity verification)
  manifest_sha256 TEXT NOT NULL,
  
  -- The full manifest content (prose + citations + audit results)
  manifest_json JSONB NOT NULL,

  -- Export metadata
  export_purpose TEXT,  -- e.g., 'WEEKLY_QC', 'SUBMISSION_FREEZE', 'AUDIT_DEFENSE'
  export_destination TEXT,  -- e.g., 'S3://bucket/path', 'LOCAL', 'VEEVA_VAULT'
  
  -- Attribution (Part 11 compliance)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

COMMENT ON TABLE prose.submission_snapshot_exports IS 
  'Immutable record of snapshot exports - each row represents a frozen, signed manifest';

COMMENT ON COLUMN prose.submission_snapshot_exports.manifest_sha256 IS 
  'SHA-256 hash of canonical JSON for integrity verification and tamper detection';

COMMENT ON COLUMN prose.submission_snapshot_exports.manifest_json IS 
  'Complete manifest: snapshot header, gate metrics, fragments with prose+citations+audit';

-- Index for snapshot lookups
CREATE INDEX IF NOT EXISTS snapshot_exports_snapshot_idx
  ON prose.submission_snapshot_exports (snapshot_id, created_at DESC);

-- Index for integrity verification queries
CREATE INDEX IF NOT EXISTS snapshot_exports_sha256_idx
  ON prose.submission_snapshot_exports (manifest_sha256);

-- =============================================================================
-- B) Append-only enforcement (immutable export record)
-- =============================================================================

CREATE OR REPLACE FUNCTION prose.prevent_snapshot_exports_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'submission_snapshot_exports is append-only (immutable for regulatory compliance)';
END;
$$;

DROP TRIGGER IF EXISTS trg_no_update_delete_snapshot_exports ON prose.submission_snapshot_exports;
CREATE TRIGGER trg_no_update_delete_snapshot_exports
  BEFORE UPDATE OR DELETE ON prose.submission_snapshot_exports
  FOR EACH ROW
  EXECUTE FUNCTION prose.prevent_snapshot_exports_mutation();

-- =============================================================================
-- C) Attribution trigger
-- =============================================================================

CREATE OR REPLACE FUNCTION prose.tg_snapshot_exports_attribution()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.created_by := COALESCE(current_setting('app.user', true), NEW.created_by, 'unknown');
  NEW.request_id := COALESCE(current_setting('app.request_id', true), NEW.request_id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_exports_attrib ON prose.submission_snapshot_exports;
CREATE TRIGGER trg_snapshot_exports_attrib
  BEFORE INSERT ON prose.submission_snapshot_exports
  FOR EACH ROW
  EXECUTE FUNCTION prose.tg_snapshot_exports_attribution();

-- =============================================================================
-- D) View: Export history with verification status
-- =============================================================================

CREATE OR REPLACE VIEW prose.v_snapshot_export_history AS
SELECT
  e.id AS export_id,
  e.snapshot_id,
  s.label AS snapshot_label,
  s.status AS snapshot_status,
  s.jurisdiction,
  e.export_format,
  e.manifest_sha256,
  e.export_purpose,
  e.export_destination,
  e.created_at AS exported_at,
  e.created_by AS exported_by,
  -- Manifest summary (without full content)
  jsonb_build_object(
    'fragment_count', jsonb_array_length(COALESCE(e.manifest_json->'fragments', '[]'::jsonb)),
    'gate_status', e.manifest_json->'gate_metrics'->'overall_status',
    'red_count', e.manifest_json->'gate_metrics'->'red_count',
    'amber_count', e.manifest_json->'gate_metrics'->'amber_count',
    'green_count', e.manifest_json->'gate_metrics'->'green_count'
  ) AS manifest_summary
FROM prose.submission_snapshot_exports e
JOIN prose.submission_snapshots s ON s.id = e.snapshot_id
ORDER BY e.created_at DESC;

COMMENT ON VIEW prose.v_snapshot_export_history IS 
  'Export audit trail with summary metrics - for compliance dashboards';

-- =============================================================================
-- E) Function: Generate canonical manifest JSON for a snapshot
-- =============================================================================

CREATE OR REPLACE FUNCTION prose.fn_generate_snapshot_manifest(p_snapshot_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_manifest JSONB;
  v_snapshot RECORD;
  v_gate_metrics RECORD;
BEGIN
  -- Get snapshot header
  SELECT * INTO v_snapshot
  FROM prose.submission_snapshots
  WHERE id = p_snapshot_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Snapshot not found: %', p_snapshot_id;
  END IF;
  
  -- Get gate metrics
  SELECT * INTO v_gate_metrics
  FROM prose.v_snapshot_gate_metrics
  WHERE snapshot_id = p_snapshot_id;
  
  -- Build manifest
  v_manifest := jsonb_build_object(
    'manifest_version', '1.0.0',
    'generated_at', NOW(),
    'snapshot', jsonb_build_object(
      'id', v_snapshot.id,
      'label', v_snapshot.label,
      'status', v_snapshot.status,
      'jurisdiction', v_snapshot.jurisdiction,
      'agency_code', v_snapshot.agency_code,
      'frozen_at', v_snapshot.frozen_at,
      'created_by', v_snapshot.created_by
    ),
    'gate_metrics', COALESCE(to_jsonb(v_gate_metrics), '{}'::jsonb),
    'fragments', (
      SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
          'fragment_id', sf.fragment_id,
          'version_id', sf.version_id,
          'ectd_section_path', fv.ectd_section_path,
          'jurisdiction', fv.jurisdiction,
          'content_prose', fv.content_prose,
          'audit_log_id', sf.audit_log_id,
          'risk_status', al.risk_status,
          'drift_magnitude', al.drift_magnitude,
          'truth_citations', (
            SELECT COALESCE(jsonb_agg(
              jsonb_build_object(
                'truth_id', tl.truth_id,
                'link_type', tl.link_type,
                'truth_type', ts.truth_type,
                'source_reference', ts.source_reference,
                'numeric_value', ts.numeric_value,
                'confidence_score', ts.confidence_score
              )
            ), '[]'::jsonb)
            FROM prose.fragment_truth_links tl
            JOIN truth.clinical_truth_store ts ON ts.id = tl.truth_id
            WHERE tl.fragment_id = sf.fragment_id
          )
        )
      ), '[]'::jsonb)
      FROM prose.submission_snapshot_fragments sf
      LEFT JOIN prose.smart_fragment_versions fv 
        ON fv.fragment_id = sf.fragment_id AND fv.version_id = sf.version_id
      LEFT JOIN audit.concomitant_audit_logs al ON al.id = sf.audit_log_id
      WHERE sf.snapshot_id = p_snapshot_id
    )
  );
  
  RETURN v_manifest;
END;
$$;

COMMENT ON FUNCTION prose.fn_generate_snapshot_manifest IS 
  'Generates canonical JSON manifest for a snapshot (prose + citations + audit results)';

-- =============================================================================
-- F) Function: Export snapshot with SHA-256 and persist
-- =============================================================================

CREATE OR REPLACE FUNCTION prose.fn_export_snapshot(
  p_snapshot_id UUID,
  p_export_format TEXT DEFAULT 'json',
  p_export_purpose TEXT DEFAULT NULL,
  p_export_destination TEXT DEFAULT NULL,
  p_persist BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  export_id UUID,
  manifest_sha256 TEXT,
  manifest_json JSONB
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_manifest JSONB;
  v_sha256 TEXT;
  v_export_id UUID;
BEGIN
  -- Generate manifest
  v_manifest := prose.fn_generate_snapshot_manifest(p_snapshot_id);
  
  -- Calculate SHA-256 of canonical JSON
  v_sha256 := encode(sha256(v_manifest::TEXT::BYTEA), 'hex');
  
  -- Persist if requested
  IF p_persist THEN
    INSERT INTO prose.submission_snapshot_exports (
      snapshot_id, export_format, manifest_sha256, manifest_json,
      export_purpose, export_destination
    )
    VALUES (
      p_snapshot_id, p_export_format, v_sha256, v_manifest,
      p_export_purpose, p_export_destination
    )
    RETURNING id INTO v_export_id;
  END IF;
  
  RETURN QUERY SELECT v_export_id, v_sha256, v_manifest;
END;
$$;

COMMENT ON FUNCTION prose.fn_export_snapshot IS 
  'Exports snapshot as manifest with SHA-256 integrity hash, optionally persisting to audit trail';

COMMIT;
