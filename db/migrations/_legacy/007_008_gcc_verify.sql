-- ============================================================================
-- Verification Script for Migrations 007-008: Heatmap Views + Snapshots
-- File: db/migrations/007_008_gcc_verify.sql
-- Run after migrations to confirm proper setup
-- ============================================================================

-- ============================================================================
-- Migration 007 Verification: Heatmap Views
-- ============================================================================

-- 1) Confirm latest risk view exists
SELECT 
  'audit.v_fragment_latest_risk exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema='audit' AND table_name='v_fragment_latest_risk'
  ) AS passed;

-- 2) Confirm truth coverage view exists
SELECT 
  'prose.v_fragment_truth_coverage exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema='prose' AND table_name='v_fragment_truth_coverage'
  ) AS passed;

-- 3) Confirm fragment current view exists
SELECT 
  'prose.v_fragment_current exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema='prose' AND table_name='v_fragment_current'
  ) AS passed;

-- 4) Confirm section risk rollup view exists
SELECT 
  'prose.v_section_risk_rollup exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema='prose' AND table_name='v_section_risk_rollup'
  ) AS passed;

-- 5) Confirm jurisdiction risk rollup view exists
SELECT 
  'prose.v_jurisdiction_risk_rollup exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema='prose' AND table_name='v_jurisdiction_risk_rollup'
  ) AS passed;

-- 6) Confirm performance index exists
SELECT 
  'audit_logs_fragment_created_at_desc_idx exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE indexname='audit_logs_fragment_created_at_desc_idx'
  ) AS passed;

-- ============================================================================
-- Migration 008 Verification: Submission Snapshots
-- ============================================================================

-- 7) Confirm snapshot status enum exists
SELECT 
  'prose.snapshot_status enum exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_type t 
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'snapshot_status' AND n.nspname = 'prose'
  ) AS passed;

-- 8) Confirm snapshots table exists
SELECT 
  'prose.submission_snapshots exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='prose' AND table_name='submission_snapshots'
  ) AS passed;

-- 9) Confirm snapshot fragments table exists
SELECT 
  'prose.submission_snapshot_fragments exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='prose' AND table_name='submission_snapshot_fragments'
  ) AS passed;

-- 10) Confirm gate metrics view exists
SELECT 
  'prose.v_snapshot_gate_metrics exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema='prose' AND table_name='v_snapshot_gate_metrics'
  ) AS passed;

-- 11) Confirm state machine trigger exists
SELECT 
  'trg_submission_snapshots_before_update exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_submission_snapshots_before_update'
  ) AS passed;

-- 12) Confirm fragment immutability trigger exists
SELECT 
  'trg_no_update_delete_snapshot_fragments_when_not_draft exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_no_update_delete_snapshot_fragments_when_not_draft'
  ) AS passed;

-- ============================================================================
-- FUNCTIONAL TEST: Create snapshot, add fragment, freeze, verify gate
-- ============================================================================

-- Test data setup (creates test fragment if not exists)
DO $$
DECLARE
  v_fragment_id UUID;
  v_snapshot_id UUID;
  v_gate_pass BOOLEAN;
BEGIN
  -- Create test fragment
  INSERT INTO prose.smart_fragments (ectd_section_path, jurisdiction, content_prose)
  VALUES ('m2.7.3-test-snapshot', 'FDA', 'Test fragment for snapshot verification')
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_fragment_id;

  IF v_fragment_id IS NULL THEN
    SELECT id INTO v_fragment_id FROM prose.smart_fragments 
    WHERE ectd_section_path = 'm2.7.3-test-snapshot';
  END IF;

  -- Create snapshot
  PERFORM set_config('app.user', 'test.user@verify.com', true);
  
  INSERT INTO prose.submission_snapshots (snapshot_name, jurisdiction, target_agency, notes)
  VALUES ('Verify-Snapshot-' || NOW()::text, 'FDA', 'FDA', 'Verification test')
  RETURNING id INTO v_snapshot_id;

  -- Add fragment to snapshot
  INSERT INTO prose.submission_snapshot_fragments (snapshot_id, fragment_id)
  VALUES (v_snapshot_id, v_fragment_id);

  -- Freeze snapshot
  UPDATE prose.submission_snapshots SET status = 'FROZEN' WHERE id = v_snapshot_id;

  -- Check gate metrics
  SELECT gate_pass_recommended INTO v_gate_pass
  FROM prose.v_snapshot_gate_metrics
  WHERE snapshot_id = v_snapshot_id;

  RAISE NOTICE 'Snapshot test completed: snapshot_id=%, gate_pass=%', v_snapshot_id, v_gate_pass;

  -- Archive snapshot (cleanup)
  UPDATE prose.submission_snapshots SET status = 'ARCHIVED' WHERE id = v_snapshot_id;
END $$;

-- ============================================================================
-- SAMPLE QUERIES (for manual testing)
-- ============================================================================

-- Heatmap by section
SELECT * FROM prose.v_section_risk_rollup ORDER BY avg_risk_score DESC LIMIT 10;

-- Jurisdiction summary
SELECT * FROM prose.v_jurisdiction_risk_rollup;

-- Top risky fragments
SELECT fragment_id, ectd_section_path, jurisdiction, latest_risk_status, latest_drift_magnitude
FROM prose.v_fragment_current
ORDER BY 
  (CASE latest_risk_status WHEN 'DATA_DRIFT' THEN 3 WHEN 'IR_PREDICTED' THEN 2 ELSE 1 END) DESC,
  latest_drift_magnitude DESC NULLS LAST
LIMIT 20;

-- Snapshot gate metrics
SELECT snapshot_name, status, fragments_total, red_fragments, unlinked_fragments, gate_pass_recommended
FROM prose.v_snapshot_gate_metrics;

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT '✅ Migration 007-008 verification complete' AS status;
