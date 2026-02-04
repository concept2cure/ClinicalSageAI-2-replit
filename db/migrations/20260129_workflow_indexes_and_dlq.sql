-- GA Readiness: Workflow indexes + Dead Letter Queue table
-- Date: 2026-01-29

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workflow_runs'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant_status_created_at ON workflow_runs (tenant_id, status, created_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_project_status ON workflow_runs (project_id, status)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_current_step ON workflow_runs (current_step_id)';
  ELSE
    RAISE NOTICE 'Skipping workflow_runs indexes; table missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'workflow_steps'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_steps_run_status_order ON workflow_steps (workflow_run_id, status, "order")';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_steps_assignee ON workflow_steps (assignee_user_id, status)';
  ELSE
    RAISE NOTICE 'Skipping workflow_steps indexes; table missing.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'step_runs'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_step_runs_run_performed_at ON step_runs (workflow_run_id, performed_at DESC)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_step_runs_tenant_time ON step_runs (tenant_id, performed_at DESC)';
  ELSE
    RAISE NOTICE 'Skipping step_runs indexes; table missing.';
  END IF;
END $$;

-- Dead Letter Queue table for workflow failures
CREATE TABLE IF NOT EXISTS workflow_step_dead_letter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL,
  workflow_run_id uuid NOT NULL,
  workflow_step_id uuid NOT NULL,
  step_run_id uuid,
  action varchar(50),
  error_message text,
  error_stack text,
  payload jsonb,
  retry_count integer NOT NULL DEFAULT 0,
  max_retries integer NOT NULL DEFAULT 3,
  status varchar(30) NOT NULL DEFAULT 'PENDING',
  next_retry_at timestamp,
  resolved_at timestamp,
  resolution varchar(50),
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflow_dlq_tenant_status
  ON workflow_step_dead_letter (tenant_id, status);

CREATE INDEX IF NOT EXISTS idx_workflow_dlq_retry
  ON workflow_step_dead_letter (next_retry_at);

COMMIT;
