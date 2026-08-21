-- ============================================================================
-- 20260730_manufacturing_processes_reconstruction.sql
--
-- Code-derived reconstruction of manufacturing_processes (C-11 pattern),
-- from the blank-DB provisioning audit 2026-07-30 (ledger C-29 context).
--
-- No creator existed anywhere (not shared/schema.ts, not migrations/, not
-- db/migrations/), yet the table is live read surface AND an FK target:
--   - server/services/cmc/ich-compliance-checker.ts SELECTs process_name,
--     process_type, process_steps, critical_process_parameters,
--     process_controls, validation_status WHERE project_id = $1::text::uuid;
--   - server/services/cmc/qbd-analyzer.ts SELECTs the same set (minus
--     validation_status);
--   - migrations/0006_regulatory_atoms.sql declares
--     cmc_process_steps.process_id UUID REFERENCES manufacturing_processes(id)
--     — so the regulatory-atoms file could never apply on a fresh database.
--
-- Shape decisions, grounded in the readers' SQL: id UUID (the FK target
-- type), project_id UUID (both readers cast their parameter to uuid),
-- structured columns JSONB, the rest TEXT. organization_id INTEGER with this
-- table's own tenant_isolation_policy per repo policy for new tenant-keyed
-- tables (0021 never revisits tables added later); nullable because the
-- readers filter by project_id and no writer exists yet to populate it —
-- tightening to NOT NULL belongs to whichever change adds the writer.
--
-- Idempotent: CREATE TABLE/INDEX IF NOT EXISTS; policy dropped + recreated.
-- ============================================================================

CREATE TABLE IF NOT EXISTS manufacturing_processes (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             INTEGER REFERENCES organizations(id),
  project_id                  UUID,
  process_name                TEXT NOT NULL,
  process_type                TEXT,
  process_steps               JSONB,
  critical_process_parameters JSONB,
  process_controls            JSONB,
  validation_status           TEXT,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS manufacturing_processes_project_idx
  ON manufacturing_processes (project_id);
CREATE INDEX IF NOT EXISTS manufacturing_processes_org_idx
  ON manufacturing_processes (organization_id);

DO $$
BEGIN
  IF to_regclass('public.manufacturing_processes') IS NOT NULL THEN
    ALTER TABLE public.manufacturing_processes ENABLE ROW LEVEL SECURITY;
    DROP POLICY IF EXISTS tenant_isolation_policy ON public.manufacturing_processes;
    CREATE POLICY tenant_isolation_policy ON public.manufacturing_processes
      FOR ALL
      USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
      WITH CHECK (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR organization_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR organization_id = substring(current_setting('app.current_org_id',    TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      );
  END IF;
END $$;
