-- ============================================================================
-- Verification Script for Migration 003: Prose Versioning
-- File: db/migrations/003_gcc_prose_versioning_verify.sql
-- Run after migration to confirm proper setup
-- ============================================================================

-- 1) Confirm versions table exists with correct structure
SELECT 
  'smart_fragment_versions exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema='prose' AND table_name='smart_fragment_versions'
  ) AS passed;

-- 2) Confirm immutability trigger exists
SELECT 
  'immutability trigger exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_no_update_delete_smart_fragment_versions'
  ) AS passed;

-- 3) Confirm versioning triggers exist
SELECT 
  'before versioning trigger exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_smart_fragments_before_versioning'
  ) AS passed;

SELECT 
  'after versioning trigger exists' AS check_name,
  EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname='trg_smart_fragments_after_versioning'
  ) AS passed;

-- 4) Count existing versions (should match or exceed fragments count)
SELECT 
  'version count' AS metric,
  COUNT(*) AS value 
FROM prose.smart_fragment_versions;

SELECT 
  'fragment count' AS metric,
  COUNT(*) AS value 
FROM prose.smart_fragments;

-- 5) Confirm pointer columns exist on smart_fragments
SELECT 
  'current_version_id column exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='prose' AND table_name='smart_fragments' 
    AND column_name='current_version_id'
  ) AS passed;

SELECT 
  'current_version_created_by column exists' AS check_name,
  EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema='prose' AND table_name='smart_fragments' 
    AND column_name='current_version_created_by'
  ) AS passed;

-- ============================================================================
-- FUNCTIONAL TEST: Create, update, verify version history
-- ============================================================================

-- Create a test fragment
INSERT INTO prose.smart_fragments (ectd_section_path, jurisdiction, content_prose)
VALUES ('m2.7.3-efficacy-summary-test', 'FDA', 'Baseline efficacy summary text for verification test')
RETURNING id, version_id, current_version_id;

-- Update with audit context (should create a new version row)
DO $$
DECLARE
  v_fragment_id UUID;
BEGIN
  SELECT id INTO v_fragment_id 
  FROM prose.smart_fragments 
  WHERE ectd_section_path = 'm2.7.3-efficacy-summary-test';

  -- Set audit context
  PERFORM set_config('app.user', 'shadow.agent@concept2cure.ai', true);
  PERFORM set_config('app.reason', 'Auto-rewrite for objectivity verification', true);
  PERFORM set_config('app.request_id', 'VERIFY-2026-0001', true);

  -- Update the fragment
  UPDATE prose.smart_fragments
  SET content_prose = 'Rewritten efficacy summary text for verification test'
  WHERE id = v_fragment_id;
END $$;

-- Show version history for test fragment
SELECT 
  fragment_id, 
  version_id, 
  created_by, 
  change_reason, 
  request_id,
  created_at,
  LEFT(content_prose, 50) AS content_preview
FROM prose.smart_fragment_versions
WHERE ectd_section_path = 'm2.7.3-efficacy-summary-test'
ORDER BY version_id;

-- Confirm we have 2 versions (initial + update)
SELECT 
  'version history test' AS check_name,
  (COUNT(*) = 2) AS passed
FROM prose.smart_fragment_versions
WHERE ectd_section_path = 'm2.7.3-efficacy-summary-test';

-- Confirm immutability (this should FAIL - commented out for safety)
-- Uncomment to test:
-- UPDATE prose.smart_fragment_versions SET created_by='hacked' WHERE version_id=1;

-- Cleanup test data
DELETE FROM prose.smart_fragment_versions 
WHERE ectd_section_path = 'm2.7.3-efficacy-summary-test';

DELETE FROM prose.smart_fragments 
WHERE ectd_section_path = 'm2.7.3-efficacy-summary-test';

-- ============================================================================
-- SUMMARY
-- ============================================================================
SELECT '✅ Migration 003 verification complete' AS status;
