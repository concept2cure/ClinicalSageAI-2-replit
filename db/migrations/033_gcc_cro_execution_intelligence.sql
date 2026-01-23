-- 033_gcc_cro_execution_intelligence.sql
-- CRO Execution Intelligence (feasibility/RBM/CDISC validation)

BEGIN;

CREATE SCHEMA IF NOT EXISTS cro_ops;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='cro_ops' AND t.typname='severity'
  ) THEN
    CREATE TYPE cro_ops.severity AS ENUM ('LOW','MED','HIGH','CRITICAL');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='cro_ops' AND t.typname='finding_kind'
  ) THEN
    CREATE TYPE cro_ops.finding_kind AS ENUM ('FEASIBILITY','RBM','CDISC','SITE','VENDOR','QUALITY');
  END IF;
END $$;

-- Feasibility "runs" are append-only analytical products
CREATE TABLE IF NOT EXISTS cro_ops.feasibility_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  run_name TEXT,
  protocol_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  dataset_snapshot_id UUID REFERENCES audit.dataset_snapshots(id) ON DELETE SET NULL,
  config_bundle_id UUID REFERENCES audit.config_bundles(id) ON DELETE SET NULL,

  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  risk_scores JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='cro_feasibility_runs_entity_uniq') THEN
    ALTER TABLE cro_ops.feasibility_runs ADD CONSTRAINT cro_feasibility_runs_entity_uniq UNIQUE (entity_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS cro_feasibility_runs_program_idx ON cro_ops.feasibility_runs(program_id, created_at DESC);

-- Feasibility findings (append-only)
CREATE TABLE IF NOT EXISTS cro_ops.feasibility_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  run_id UUID NOT NULL REFERENCES cro_ops.feasibility_runs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  severity cro_ops.severity NOT NULL DEFAULT 'MED',
  summary TEXT NOT NULL,
  impacted_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  evidence_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

-- RBM findings (append-only)
CREATE TABLE IF NOT EXISTS cro_ops.rbm_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  severity cro_ops.severity NOT NULL DEFAULT 'MED',
  finding_type TEXT NOT NULL,                 -- MISSING_DATA/DEVIATION/AE_REPORTING/etc
  summary TEXT NOT NULL,

  impacted_claim_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  impacted_ctd_node_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  evidence_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

-- CDISC validation runs (append-only)
CREATE TABLE IF NOT EXISTS cro_ops.cdisc_validation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  define_document_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  standard TEXT NOT NULL,                     -- SDTM/ADaM
  standard_version TEXT,
  validator_name TEXT,                        -- internal/P21-like
  validator_version TEXT,

  summary JSONB NOT NULL DEFAULT '{}'::jsonb,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

-- CDISC findings (append-only)
CREATE TABLE IF NOT EXISTS cro_ops.cdisc_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  run_id UUID NOT NULL REFERENCES cro_ops.cdisc_validation_runs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  severity cro_ops.severity NOT NULL DEFAULT 'MED',
  rule_id TEXT NOT NULL,
  message TEXT NOT NULL,

  dataset_name TEXT,
  variable_name TEXT,
  record_ref TEXT,

  impacted_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  evidence_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION cro_ops.prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'CRO ops tables are append-only';
END $$;

DROP TRIGGER IF EXISTS trg_no_update_delete_feasibility_findings ON cro_ops.feasibility_findings;
CREATE TRIGGER trg_no_update_delete_feasibility_findings
  BEFORE UPDATE OR DELETE ON cro_ops.feasibility_findings
  FOR EACH ROW EXECUTE FUNCTION cro_ops.prevent_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_rbm_findings ON cro_ops.rbm_findings;
CREATE TRIGGER trg_no_update_delete_rbm_findings
  BEFORE UPDATE OR DELETE ON cro_ops.rbm_findings
  FOR EACH ROW EXECUTE FUNCTION cro_ops.prevent_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_cdisc_findings ON cro_ops.cdisc_findings;
CREATE TRIGGER trg_no_update_delete_cdisc_findings
  BEFORE UPDATE OR DELETE ON cro_ops.cdisc_findings
  FOR EACH ROW EXECUTE FUNCTION cro_ops.prevent_mutation();

-- Auto-register entities (using TG_ARGV for trigger arguments)
CREATE OR REPLACE FUNCTION cro_ops.tg_register_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
  v_type core.entity_type;
BEGIN
  IF NEW.id IS NULL THEN NEW.id := uuid_generate_v4(); END IF;

  -- Get entity type from trigger argument
  v_type := TG_ARGV[0]::core.entity_type;
  v_key := v_type::text || ':' || NEW.id::text;
  v_hash := core.sha256_hex((to_jsonb(NEW) - 'entity_id')::text);

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    v_type,
    v_key,
    'v1',
    v_hash,
    jsonb_build_object('domain','cro_ops','table',TG_TABLE_NAME)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_feasibility_run_entity ON cro_ops.feasibility_runs;
CREATE TRIGGER trg_register_feasibility_run_entity
  BEFORE INSERT ON cro_ops.feasibility_runs
  FOR EACH ROW EXECUTE FUNCTION cro_ops.tg_register_entity('CRO_OBJECT');

DROP TRIGGER IF EXISTS trg_register_feasibility_finding_entity ON cro_ops.feasibility_findings;
CREATE TRIGGER trg_register_feasibility_finding_entity
  BEFORE INSERT ON cro_ops.feasibility_findings
  FOR EACH ROW EXECUTE FUNCTION cro_ops.tg_register_entity('CRO_OBJECT');

DROP TRIGGER IF EXISTS trg_register_rbm_finding_entity ON cro_ops.rbm_findings;
CREATE TRIGGER trg_register_rbm_finding_entity
  BEFORE INSERT ON cro_ops.rbm_findings
  FOR EACH ROW EXECUTE FUNCTION cro_ops.tg_register_entity('CRO_OBJECT');

DROP TRIGGER IF EXISTS trg_register_cdisc_run_entity ON cro_ops.cdisc_validation_runs;
CREATE TRIGGER trg_register_cdisc_run_entity
  BEFORE INSERT ON cro_ops.cdisc_validation_runs
  FOR EACH ROW EXECUTE FUNCTION cro_ops.tg_register_entity('CRO_OBJECT');

DROP TRIGGER IF EXISTS trg_register_cdisc_finding_entity ON cro_ops.cdisc_findings;
CREATE TRIGGER trg_register_cdisc_finding_entity
  BEFORE INSERT ON cro_ops.cdisc_findings
  FOR EACH ROW EXECUTE FUNCTION cro_ops.tg_register_entity('CRO_OBJECT');

-- RLS
ALTER TABLE cro_ops.feasibility_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cro_ops.feasibility_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cro_ops.rbm_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE cro_ops.cdisc_validation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE cro_ops.cdisc_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_cro_select_runs ON cro_ops.feasibility_runs;
CREATE POLICY p_cro_select_runs ON cro_ops.feasibility_runs FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_insert_runs ON cro_ops.feasibility_runs;
CREATE POLICY p_cro_insert_runs ON cro_ops.feasibility_runs FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_select_findings ON cro_ops.feasibility_findings;
CREATE POLICY p_cro_select_findings ON cro_ops.feasibility_findings FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_insert_findings ON cro_ops.feasibility_findings;
CREATE POLICY p_cro_insert_findings ON cro_ops.feasibility_findings FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_select_rbm ON cro_ops.rbm_findings;
CREATE POLICY p_cro_select_rbm ON cro_ops.rbm_findings FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_insert_rbm ON cro_ops.rbm_findings;
CREATE POLICY p_cro_insert_rbm ON cro_ops.rbm_findings FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_select_cdisc_runs ON cro_ops.cdisc_validation_runs;
CREATE POLICY p_cro_select_cdisc_runs ON cro_ops.cdisc_validation_runs FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_insert_cdisc_runs ON cro_ops.cdisc_validation_runs;
CREATE POLICY p_cro_insert_cdisc_runs ON cro_ops.cdisc_validation_runs FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_select_cdisc_findings ON cro_ops.cdisc_findings;
CREATE POLICY p_cro_select_cdisc_findings ON cro_ops.cdisc_findings FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_cro_insert_cdisc_findings ON cro_ops.cdisc_findings;
CREATE POLICY p_cro_insert_cdisc_findings ON cro_ops.cdisc_findings FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

-- Views for dashboards
CREATE OR REPLACE VIEW cro_ops.v_rbm_top_risks AS
SELECT
  program_id,
  severity,
  finding_type,
  summary,
  impacted_claim_entity_id,
  impacted_ctd_node_entity_id,
  created_at
FROM cro_ops.rbm_findings
ORDER BY
  CASE severity WHEN 'CRITICAL' THEN 4 WHEN 'HIGH' THEN 3 WHEN 'MED' THEN 2 ELSE 1 END DESC,
  created_at DESC;

COMMIT;
