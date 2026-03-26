-- Production hardening for AI goal planning runtime tables.
-- Adds referential integrity, status guardrails, and query indexes.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_goal_plan_runs'
  ) THEN
    ALTER TABLE ai_goal_plan_runs
      ADD CONSTRAINT ai_goal_plan_runs_status_check
      CHECK (status IN ('active', 'completed', 'failed', 'cancelled'));
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_goal_plan_step_events'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'ai_goal_plan_runs'
  ) THEN
    ALTER TABLE ai_goal_plan_step_events
      ADD CONSTRAINT ai_goal_plan_step_events_plan_run_fk
      FOREIGN KEY (plan_run_id)
      REFERENCES ai_goal_plan_runs(id)
      ON DELETE CASCADE;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS idx_goal_plan_runs_status_created
  ON ai_goal_plan_runs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_goal_step_events_event_type_created
  ON ai_goal_plan_step_events(event_type, created_at DESC);
