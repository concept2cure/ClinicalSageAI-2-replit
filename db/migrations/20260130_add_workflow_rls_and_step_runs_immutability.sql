-- Enable RLS on workflow_runs and step_runs and add tenant isolation policies
-- Idempotent: skips if tables don't exist
BEGIN;

-- Enable RLS (IF EXISTS already handles missing tables)
ALTER TABLE IF EXISTS workflow_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS step_runs ENABLE ROW LEVEL SECURITY;

-- Create tenant isolation policies (assumes app.current_org GUC contains tenant uuid)
-- Wrapped in DO block to handle missing tables gracefully
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_runs') THEN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_policy ON workflow_runs';
    EXECUTE 'CREATE POLICY tenant_isolation_policy ON workflow_runs
      USING (tenant_id::text = current_setting(''app.current_org'', true)::text)
      WITH CHECK (tenant_id::text = current_setting(''app.current_org'', true)::text)';
    RAISE NOTICE 'Created tenant_isolation_policy on workflow_runs';
  ELSE
    RAISE NOTICE 'Skipping workflow_runs policies; table does not exist';
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'step_runs') THEN
    EXECUTE 'DROP POLICY IF EXISTS tenant_isolation_policy ON step_runs';
    EXECUTE 'CREATE POLICY tenant_isolation_policy ON step_runs
      USING (tenant_id::text = current_setting(''app.current_org'', true)::text)
      WITH CHECK (tenant_id::text = current_setting(''app.current_org'', true)::text)';
    RAISE NOTICE 'Created tenant_isolation_policy on step_runs';
  ELSE
    RAISE NOTICE 'Skipping step_runs policies; table does not exist';
  END IF;
END$$;

-- Add recommended indexes (IF NOT EXISTS handles missing tables with skip)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'workflow_runs') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_tenant ON workflow_runs(tenant_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_workflow_runs_project ON workflow_runs(project_id)';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'step_runs') THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_step_runs_workflow_run ON step_runs(workflow_run_id)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_step_runs_tenant ON step_runs(tenant_id)';
  END IF;
END$$;

-- Create immutability trigger for step_runs if not present
-- This prevents UPDATE or DELETE on step_runs (append-only audit)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'trg_no_update_delete') THEN
    CREATE OR REPLACE FUNCTION trg_no_update_delete()
    RETURNS trigger AS $fn$
    BEGIN
      RAISE EXCEPTION 'Attempt to modify audit record % on table %; audit tables are immutable', OLD.id, TG_TABLE_NAME;
      RETURN NULL;
    END;
    $fn$ LANGUAGE plpgsql;
  END IF;
END$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'step_runs') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_no_update_delete_step_runs ON step_runs';
    EXECUTE 'CREATE TRIGGER trg_no_update_delete_step_runs
      BEFORE UPDATE OR DELETE ON step_runs
      FOR EACH ROW EXECUTE FUNCTION trg_no_update_delete()';
    RAISE NOTICE 'Created immutability trigger on step_runs';
  ELSE
    RAISE NOTICE 'Skipping step_runs trigger; table does not exist';
  END IF;
END$$;

COMMIT;
