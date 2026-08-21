-- ============================================================================
-- 20260730_cmc_evidence_tables.sql
--
-- eCTD / REGULATORY AUDIT CONTEXT — schema-contract remediation (CMC subsystem).
-- Backs CMC / stability / specification queries the server runs against tables
-- no migration created (repo-wide schema-contract audit).
--
-- Evidence (exact referencing SQL) + severity:
--   cmc_methods            — server/src/routes/stability.router.ts (SELECT + 3
--                            LEFT JOINs). UNGUARDED: 3 endpoints throw 500 today.
--   stab_signoffs          — stability.router.ts INSERT ... RETURNING * + SELECT.
--                            UNGUARDED: 2 endpoints 500. The only stab_* sibling
--                            with no creator, yet db/stability_constraints_*.sql
--                            already ALTER it (those ALTERs are latent failures
--                            too). Columns/tenant_id/updated_at mirror those ALTERs.
--   specification_audit_log— server/api/cmc/specificationRoutes.ts (3 INSERT
--                            variants + history SELECT). Its absence causes a
--                            spec row to be written WITHOUT its audit entry
--                            (partial write) and the approve txn to roll back —
--                            a 21 CFR Part 11 audit gap.
--   dp_specs/qc_specs/qa_methods/proc_control_strategy — CMC evidence reads in
--                            regulatory_aiDraft.ts / reg/evidence.ts, currently
--                            try/catch → silent empty. Created as-referenced.
--
-- Contracts extracted from the real SQL. product_id is VARCHAR(255) to match
-- reg_submissions.product_id (the value's source). method_id types are inferred
-- uuid (no DDL to confirm). NOTE for owners: dp_specs and qc_specs are near-
-- identical (method_status vs method_ref) and cmc_methods/qa_methods/the existing
-- analytical_methods are three "methods" tables — likely consolidation targets;
-- this migration only makes the referenced relations exist, it does not refactor.
--
-- Non-destructive + idempotent (CREATE TABLE IF NOT EXISTS; guarded policy). No
-- FK constraints are added to relations created outside this lineage (drizzle
-- pgTables / constraint files own those) to avoid ordering failures.
-- ============================================================================

-- ── cmc_methods (ACTIVE 500s) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cmc_methods (
  id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),  -- joined as m.id = stab_tests.method_id (uuid)
  title  TEXT,
  status TEXT
);

-- ── qa_methods (silent no-op) ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qa_methods (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  method_id  UUID,
  name       TEXT,
  status     TEXT,
  product_id VARCHAR(255)
);
CREATE INDEX IF NOT EXISTS qa_methods_product_idx ON qa_methods (product_id);

-- ── dp_specs (silent no-op) ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dp_specs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    VARCHAR(255),
  attribute     TEXT,
  unit          TEXT,
  limit_low     NUMERIC,
  limit_high    NUMERIC,
  method_id     UUID,
  method_status TEXT
);
CREATE INDEX IF NOT EXISTS dp_specs_product_idx ON dp_specs (product_id);

-- ── qc_specs (silent no-op; ≈ dp_specs, different subsystem) ──────────────────
CREATE TABLE IF NOT EXISTS qc_specs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id VARCHAR(255),
  attribute  TEXT,
  unit       TEXT,
  limit_low  NUMERIC,
  limit_high NUMERIC,
  method_id  UUID,
  method_ref TEXT
);
CREATE INDEX IF NOT EXISTS qc_specs_product_idx ON qc_specs (product_id);

-- ── proc_control_strategy (silent no-op) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS proc_control_strategy (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   VARCHAR(255),
  control_id   TEXT,
  version      TEXT,
  mapping_json JSONB,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS proc_control_strategy_product_idx ON proc_control_strategy (product_id);

-- ── stab_signoffs (ACTIVE 500s; tenant-scoped) ───────────────────────────────
-- Columns mirror the INSERT/SELECT plus the tenant_id/updated_at that
-- db/stability_constraints_ddl.sql adds. study_id is uuid (constraints_fix.sql
-- forces that type). No FK added here: stab_studies + the FK are owned by the
-- stability constraint files; adding it here would risk double-definition.
CREATE TABLE IF NOT EXISTS stab_signoffs (
  signoff_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  study_id     UUID,
  stage        TEXT,
  signer_name  TEXT,
  signer_email TEXT,
  reason       TEXT,
  hash         TEXT,
  signed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id    INTEGER,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stab_signoffs_study_idx  ON stab_signoffs (study_id);
CREATE INDEX IF NOT EXISTS stab_signoffs_tenant_idx ON stab_signoffs (tenant_id);

-- ── specification_audit_log (ACTIVE: partial writes / Part 11 audit gap) ──────
-- No FK to quality_specifications (a drizzle pgTable, created outside this SQL
-- lineage) — the app JOINs on it but does not require a DB-level FK.
CREATE TABLE IF NOT EXISTS specification_audit_log (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  specification_id UUID,
  action           TEXT,
  changed_by       TEXT,
  previous_values  JSONB,
  new_values       JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS specification_audit_log_spec_idx ON specification_audit_log (specification_id, created_at DESC);

-- ── RLS: stab_signoffs is tenant-scoped (tenant_id). Mirror the canonical
-- tenant_isolation_policy (shadow-mode bypass + tenant match + super-admin). ──
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'stab_signoffs' AND policyname = 'tenant_isolation_policy') THEN
    EXECUTE 'ALTER TABLE stab_signoffs ENABLE ROW LEVEL SECURITY';
    EXECUTE 'ALTER TABLE stab_signoffs FORCE ROW LEVEL SECURITY';
    EXECUTE $pol$
      CREATE POLICY tenant_isolation_policy ON stab_signoffs USING (
        NULLIF(current_setting('app.rls_enforce', TRUE), '') IS DISTINCT FROM 'on'
        OR tenant_id = NULLIF(current_setting('app.current_tenant_id', TRUE), '')::INT
        OR tenant_id = substring(current_setting('app.current_org_id', TRUE) from '^[0-9]+$')::INT
        OR current_setting('app.current_user_role', TRUE) = 'app_super_admin'
      )
    $pol$;
  END IF;
END $$;
