-- P-111 item 4 (founder decision, 2026-11-09; the coordinating session's ruling for slice 5): a work project's task
-- has one level of subtasks, kept in the canonical task store, unified_tasks. Never in the legacy project_tasks WBS.
--
-- RULE 1: this file re-runs on every deploy. It is additive and replay-safe:
--   - the column is added IF NOT EXISTS, nullable (every existing task stays a top-level task);
--   - the foreign key and the check are added only when absent, by name;
--   - the index is IF NOT EXISTS;
--   - nothing is dropped.
-- unified_tasks.id is a serial integer, so the parent column is an integer referencing it. ON DELETE SET NULL: a
-- removed parent leaves its subtasks as tasks, never deletes them. The rest of the rule (one level only, the same
-- organisation, the same project) is enforced by the one write path, tasking/task-project.ts admitParentTask, which
-- reads the parent under a share lock in the writer's own transaction.

ALTER TABLE unified_tasks ADD COLUMN IF NOT EXISTS parent_task_id integer;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unified_tasks_parent_task_id_fk'
                   AND conrelid = 'public.unified_tasks'::regclass) THEN
    ALTER TABLE unified_tasks ADD CONSTRAINT unified_tasks_parent_task_id_fk
      FOREIGN KEY (parent_task_id) REFERENCES unified_tasks(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'unified_tasks_parent_not_self'
                   AND conrelid = 'public.unified_tasks'::regclass) THEN
    ALTER TABLE unified_tasks ADD CONSTRAINT unified_tasks_parent_not_self
      CHECK (parent_task_id IS NULL OR parent_task_id <> id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS unified_tasks_parent_task_idx ON unified_tasks (parent_task_id) WHERE parent_task_id IS NOT NULL;
