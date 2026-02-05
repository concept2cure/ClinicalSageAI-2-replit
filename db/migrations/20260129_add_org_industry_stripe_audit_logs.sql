-- Adds organization industry/billing fields and base audit_logs table

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS industry_mode TEXT,
  ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id INTEGER NOT NULL,
  user_id INTEGER,
  action TEXT NOT NULL,
  table_name TEXT NOT NULL,
  record_id TEXT NOT NULL,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Backfill created_at if audit_logs existed without it
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill core columns if audit_logs exists with a reduced schema
ALTER TABLE audit_logs
  ADD COLUMN IF NOT EXISTS table_name TEXT,
  ADD COLUMN IF NOT EXISTS record_id TEXT;

CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_id ON audit_logs (tenant_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at);
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'table_name'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_logs'
      AND column_name = 'record_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs (table_name, record_id)';
  ELSE
    RAISE NOTICE 'Skipping idx_audit_logs_table_record; required columns missing.';
  END IF;
END $$;

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_logs_tenant_isolation_policy ON audit_logs;
CREATE POLICY audit_logs_tenant_isolation_policy ON audit_logs
  FOR ALL
  USING (
    tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );

ALTER TABLE audit_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS audit_events_tenant_isolation_policy ON audit_events;
CREATE POLICY audit_events_tenant_isolation_policy ON audit_events
  FOR ALL
  USING (
    organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INTEGER
    OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
  );
