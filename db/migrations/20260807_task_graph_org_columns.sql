-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — tenant column on the task graph tables
-- Compliance: 21 CFR Part 11 (auditability), multi-tenant isolation
-- Purpose: task_dependencies and cross_module_task_links carried NO tenant
--          column (collaboration/tasking assessment D20). Reads compensate by
--          scoping through the org's own task ids, but the tables themselves
--          were invisible to the RLS regime. This adds organization_id,
--          backfills it from the predecessor/source task (both endpoints were
--          validated same-org at write time), and indexes it. The
--          tenant-isolation sweep (always last in the apply set) attaches the
--          standard policy on its next run.
--
-- Determinism Contract:
--   - Additive nullable column + index per table; nothing existing rewritten
--     except the one-time backfill UPDATE of NULL org values.
--   - Idempotent: IF EXISTS/IF NOT EXISTS guards; the backfill only touches
--     rows still NULL, so re-runs are no-ops.
--   - Nullable by design: an orphaned legacy row (endpoint task hard-deleted
--     before soft delete existed) keeps NULL rather than a fabricated tenant;
--     endpoint-id scoping remains the primary isolation for reads.
-- =============================================================================

ALTER TABLE IF EXISTS task_dependencies
  ADD COLUMN IF NOT EXISTS organization_id INTEGER;
ALTER TABLE IF EXISTS cross_module_task_links
  ADD COLUMN IF NOT EXISTS organization_id INTEGER;

DO $$
BEGIN
  IF to_regclass('public.task_dependencies') IS NOT NULL
     AND to_regclass('public.unified_tasks') IS NOT NULL THEN
    UPDATE task_dependencies td
    SET organization_id = ut.organization_id
    FROM unified_tasks ut
    WHERE td.organization_id IS NULL
      AND ut.task_id = td.predecessor_task_id;
  END IF;

  IF to_regclass('public.cross_module_task_links') IS NOT NULL
     AND to_regclass('public.unified_tasks') IS NOT NULL THEN
    UPDATE cross_module_task_links cl
    SET organization_id = ut.organization_id
    FROM unified_tasks ut
    WHERE cl.organization_id IS NULL
      AND ut.task_id = cl.source_task_id;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS task_dependencies_org_idx
  ON task_dependencies (organization_id);
CREATE INDEX IF NOT EXISTS cross_module_task_links_org_idx
  ON cross_module_task_links (organization_id);
