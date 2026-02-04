-- ============================================================================
-- Phase 2 Graph RLS + Indexes Patch
-- Migration: 20260203_phase2_graph_rls_indexes_patch.sql
-- Purpose: Add program_id RLS enforcement + performance indexes
-- Author: Copilot Agent A4
-- Date: 2026-02-03
-- ============================================================================
--
-- eCTD MODULE CONTEXT:
--   Module 1 (Administrative): Program-level data isolation for sponsors
--   Module 5 (Clinical Study Reports): Blinded/unblinded data separation
--
-- REGULATORY AUDIT TRAIL:
--   Row-Level Security (RLS) via program_id ensures:
--   - IND-enabling study data isolation between sponsors
--   - Blinded vs unblinded CSR data separation
--   - 21 CFR Part 11 compliant access control audit logging

BEGIN;

-- ============================================================================
-- SECTION 1: Ensure program_id column exists on both tables
-- ============================================================================

-- Add program_id to anchors if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'vault'
        AND table_name = 'anchors'
        AND column_name = 'program_id'
    ) THEN
        ALTER TABLE vault.anchors ADD COLUMN program_id UUID NOT NULL;
    END IF;
END $$;

-- Add program_id to cross_references if not exists
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'vault'
        AND table_name = 'cross_references'
        AND column_name = 'program_id'
    ) THEN
        ALTER TABLE vault.cross_references ADD COLUMN program_id UUID NOT NULL;
    END IF;
END $$;

-- ============================================================================
-- SECTION 2: Performance Indexes for anchors
-- ============================================================================

-- Index: (program_id, content_hash) - fast lookup by program + content dedup
CREATE INDEX IF NOT EXISTS idx_anchors_program_content_hash
    ON vault.anchors (program_id, content_hash);

-- Index: (program_id, anchor_key) - fast lookup by program + anchor key
CREATE INDEX IF NOT EXISTS idx_anchors_program_anchor_key
    ON vault.anchors (program_id, anchor_key);

-- Index: (program_id) alone for RLS filter pushdown
CREATE INDEX IF NOT EXISTS idx_anchors_program_id
    ON vault.anchors (program_id);

COMMENT ON INDEX vault.idx_anchors_program_content_hash IS
    'Composite index for program-scoped content deduplication';
COMMENT ON INDEX vault.idx_anchors_program_anchor_key IS
    'Composite index for program-scoped anchor key lookups';

-- ============================================================================
-- SECTION 3: Performance Indexes for cross_references
-- ============================================================================

-- Index: (program_id, content_hash) - fast lookup by program + content dedup
CREATE INDEX IF NOT EXISTS idx_xrefs_program_content_hash
    ON vault.cross_references (program_id, content_hash);

-- Index: (program_id, validation_status) - fast filtering by validation state
CREATE INDEX IF NOT EXISTS idx_xrefs_program_validation_status
    ON vault.cross_references (program_id, validation_status);

-- Index: (program_id, target_anchor_key) - fast join to anchors
CREATE INDEX IF NOT EXISTS idx_xrefs_program_target_anchor_key
    ON vault.cross_references (program_id, target_anchor_key);

-- Index: (program_id) alone for RLS filter pushdown
CREATE INDEX IF NOT EXISTS idx_xrefs_program_id
    ON vault.cross_references (program_id);

COMMENT ON INDEX vault.idx_xrefs_program_content_hash IS
    'Composite index for program-scoped cross-reference deduplication';
COMMENT ON INDEX vault.idx_xrefs_program_validation_status IS
    'Composite index for program-scoped validation status filtering';
COMMENT ON INDEX vault.idx_xrefs_program_target_anchor_key IS
    'Composite index for program-scoped target anchor joins';

-- ============================================================================
-- SECTION 4: Row-Level Security on anchors
-- ============================================================================

-- Enable RLS
ALTER TABLE vault.anchors ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent recreation)
DROP POLICY IF EXISTS anchors_tenant_isolation ON vault.anchors;
DROP POLICY IF EXISTS anchors_select_policy ON vault.anchors;
DROP POLICY IF EXISTS anchors_insert_policy ON vault.anchors;
DROP POLICY IF EXISTS anchors_update_policy ON vault.anchors;
DROP POLICY IF EXISTS anchors_delete_policy ON vault.anchors;

-- SELECT policy: can only read rows matching current program_id
CREATE POLICY anchors_select_policy ON vault.anchors
    FOR SELECT
    USING (program_id = current_setting('app.current_program_id', true)::uuid);

-- INSERT policy: can only insert rows matching current program_id
CREATE POLICY anchors_insert_policy ON vault.anchors
    FOR INSERT
    WITH CHECK (program_id = current_setting('app.current_program_id', true)::uuid);

-- UPDATE policy: can only update rows matching current program_id
CREATE POLICY anchors_update_policy ON vault.anchors
    FOR UPDATE
    USING (program_id = current_setting('app.current_program_id', true)::uuid)
    WITH CHECK (program_id = current_setting('app.current_program_id', true)::uuid);

-- DELETE policy: can only delete rows matching current program_id
CREATE POLICY anchors_delete_policy ON vault.anchors
    FOR DELETE
    USING (program_id = current_setting('app.current_program_id', true)::uuid);

COMMENT ON TABLE vault.anchors IS
    'Document anchors (headings, figures, tables) with program-scoped RLS';

-- ============================================================================
-- SECTION 5: Row-Level Security on cross_references
-- ============================================================================

-- Enable RLS
ALTER TABLE vault.cross_references ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any (idempotent recreation)
DROP POLICY IF EXISTS xrefs_tenant_isolation ON vault.cross_references;
DROP POLICY IF EXISTS xrefs_select_policy ON vault.cross_references;
DROP POLICY IF EXISTS xrefs_insert_policy ON vault.cross_references;
DROP POLICY IF EXISTS xrefs_update_policy ON vault.cross_references;
DROP POLICY IF EXISTS xrefs_delete_policy ON vault.cross_references;

-- SELECT policy: can only read rows matching current program_id
CREATE POLICY xrefs_select_policy ON vault.cross_references
    FOR SELECT
    USING (program_id = current_setting('app.current_program_id', true)::uuid);

-- INSERT policy: can only insert rows matching current program_id
CREATE POLICY xrefs_insert_policy ON vault.cross_references
    FOR INSERT
    WITH CHECK (program_id = current_setting('app.current_program_id', true)::uuid);

-- UPDATE policy: can only update rows matching current program_id
CREATE POLICY xrefs_update_policy ON vault.cross_references
    FOR UPDATE
    USING (program_id = current_setting('app.current_program_id', true)::uuid)
    WITH CHECK (program_id = current_setting('app.current_program_id', true)::uuid);

-- DELETE policy: can only delete rows matching current program_id
CREATE POLICY xrefs_delete_policy ON vault.cross_references
    FOR DELETE
    USING (program_id = current_setting('app.current_program_id', true)::uuid);

COMMENT ON TABLE vault.cross_references IS
    'Cross-references between documents with program-scoped RLS';

-- ============================================================================
-- SECTION 6: Verification queries (run manually after migration)
-- ============================================================================

-- Verify indexes exist:
-- SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'vault' AND tablename IN ('anchors', 'cross_references');

-- Verify RLS is enabled:
-- SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = 'vault'::regnamespace AND relname IN ('anchors', 'cross_references');

-- Verify policies exist:
-- SELECT tablename, policyname, permissive, roles, cmd, qual FROM pg_policies WHERE schemaname = 'vault';

COMMIT;
