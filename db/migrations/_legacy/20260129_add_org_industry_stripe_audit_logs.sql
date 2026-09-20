-- ============================================================================
-- ARCHIVED 2026-09-10 (WO-1, ADR-0006) — NO APPLIER RUNS THIS FILE.
-- ============================================================================
-- It is in none of C2C_MIGRATION_FILES (deploy-migrate), the root migrations/
-- overlay, PRE_OVERLAY_CREATORS, AUTHORING_SUBSYSTEM_FILES, or the *_gcc_*
-- tree. The only glob that would match it belongs to scripts/db_migrate.sh,
-- which has no automated caller.
--
-- Defined a second time here: audit_logs
-- Real creator: shared/schema.ts via drizzle-kit push
--
-- Verified against a database built from empty by
-- scripts/db/provision-test-db.sh before archiving: nothing this file
-- uniquely creates was present, and every ALTER ... ADD COLUMN target it
-- carries already exists. Full reasoning, and why that check is mandatory
-- rather than a formality, in db/migrations/_legacy/README.md
-- (see the 2026-09-10 section).
-- ============================================================================

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
  ADD COLUMN IF NOT EXISTS record_id TEXT,
  ADD COLUMN IF NOT EXISTS old_values JSONB,
  ADD COLUMN IF NOT EXISTS new_values JSONB,
  ADD COLUMN IF NOT EXISTS sha256_chain TEXT,
  ADD COLUMN IF NOT EXISTS hmac_seal TEXT;

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
