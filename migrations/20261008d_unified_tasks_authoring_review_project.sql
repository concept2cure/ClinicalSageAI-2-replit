-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: A review task raised on an authoring document is on that
--          document's program's project, so the program's Review tab lists it
--          (QA walk 2026-10-08, second pass, j1).
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting (review and approval work on governed drafts)
--   - Integrity Risk Addressed: the project page said "No tasks or approvals
--     on this program" while a review was assigned on one of its documents.
--
-- Determinism Contract:
--   - Sets unified_tasks.project_id only where it is NULL, to the project the
--     task's own source document resolves to. Never changes a recorded
--     project; drops nothing.
-- =============================================================================
-- 20261008d_unified_tasks_authoring_review_project.sql
--
-- WHY. Assign review (AssignReviewDialog → POST /api/tasks/tasks) sends
-- sourceEntityType 'authoring_document' and the document id, and no projectId:
-- the editor holds the program UUID, while unified_tasks.project_id is the
-- integer projects.id. The tasks were stored with project_id NULL (QA:
-- unified_tasks 17, 18, 19), and the Review tab reads work by project
-- (loadUnifiedWork). From this change the route records it
-- (server/services/tasking/task-project.ts, projectForTaskSource). This file
-- gives the tasks created before it the same answer, by the same rule:
--
--   the task's source document (authoring_documents.id = source_entity_id),
--   in the task's own organisation (tenant_id = organization_id), → its program
--   (client_program_id) → that program's project record in the same
--   organisation, the LOWEST id (readProgramAnchorRow, the one anchor reader;
--   projects_one_anchor_per_program holds one wherever the data allowed it).
--
-- Left alone: a task with a project already; a task whose document is not its
-- organisation's, has no program, or whose program has no project record;
-- every task whose source is not an authoring document; soft-deleted tasks.
--
-- RULE 1. Replayed on every deploy. Runs after 20261008 (the P-19 anchor
-- backfill), so a program anchored by that file in the same deploy is
-- resolvable here. Idempotent: only project_id IS NULL rows are touched, so a
-- replay changes nothing. One consequence, stated: a person who deliberately
-- clears the project of an authoring-document review task will see it set
-- again on the next deploy. For these tasks the project follows the document,
-- which is the rule the route applies to a new one.
--
-- ROLLBACK. None is safe to write here: the Review tab may already show these
-- tasks. To undo one, set its project_id back by hand.
-- =============================================================================

DO $mig$
DECLARE
  recorded integer := 0;
BEGIN
  IF to_regclass('public.unified_tasks') IS NULL
     OR to_regclass('public.authoring_documents') IS NULL
     OR to_regclass('public.projects') IS NULL THEN
    RAISE NOTICE 'authoring review task project: a table it reads is absent - skipped';
    RETURN;
  END IF;
  IF (SELECT count(DISTINCT column_name) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'unified_tasks'
         AND column_name IN ('organization_id', 'project_id', 'source_entity_type', 'source_entity_id', 'deleted_at')) < 5
     OR (SELECT count(DISTINCT column_name) FROM information_schema.columns
          WHERE table_schema = 'public' AND table_name = 'authoring_documents'
            AND column_name IN ('id', 'tenant_id', 'client_program_id')) < 3
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                     WHERE table_schema = 'public' AND table_name = 'projects'
                       AND column_name = 'regulatory_program_id') THEN
    RAISE NOTICE 'authoring review task project: a column it reads is absent - skipped';
    RETURN;
  END IF;

  UPDATE public.unified_tasks t
     SET project_id = anchor.project_id
    FROM (
      SELECT d.id::text AS doc_id,
             d.tenant_id AS organization_id,
             (SELECT min(p.id)
                FROM public.projects p
               WHERE p.regulatory_program_id = d.client_program_id
                 AND p.organization_id = d.tenant_id) AS project_id
        FROM public.authoring_documents d
       WHERE d.client_program_id IS NOT NULL
    ) anchor
   WHERE t.project_id IS NULL
     AND t.deleted_at IS NULL
     AND t.source_entity_type = 'authoring_document'
     AND t.source_entity_id = anchor.doc_id
     AND t.organization_id = anchor.organization_id
     AND anchor.project_id IS NOT NULL;
  GET DIAGNOSTICS recorded = ROW_COUNT;
  -- A count only: no tenant data in the deploy log.
  RAISE NOTICE '% authoring review task(s) recorded on their document''s project', recorded;
END
$mig$;
