-- 037_gcc_registry_trial_ledger.sql
-- NIH ClinicalTrials.gov Trial Ledger (typed registry + reconciliation findings)

BEGIN;

CREATE SCHEMA IF NOT EXISTS registry;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='registry' AND t.typname='finding_severity'
  ) THEN
    CREATE TYPE registry.finding_severity AS ENUM ('LOW','MED','HIGH','CRITICAL');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS registry.trials (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  nct_id TEXT NOT NULL,
  title TEXT,
  phase TEXT,
  status TEXT,
  sponsor TEXT,

  start_date DATE,
  completion_date DATE,

  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,
  interventions JSONB NOT NULL DEFAULT '{}'::jsonb,

  source_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,  -- knowledge item entity
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='registry_trials_nct_uniq') THEN
    ALTER TABLE registry.trials ADD CONSTRAINT registry_trials_nct_uniq UNIQUE (program_id, nct_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS registry.outcomes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  trial_id UUID NOT NULL REFERENCES registry.trials(id) ON DELETE RESTRICT,

  outcome_type TEXT NOT NULL,      -- primary/secondary/other
  measure TEXT,
  time_frame TEXT,
  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE TABLE IF NOT EXISTS registry.arms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  trial_id UUID NOT NULL REFERENCES registry.trials(id) ON DELETE RESTRICT,

  arm_label TEXT,
  arm_type TEXT,
  description TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE TABLE IF NOT EXISTS registry.results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  trial_id UUID NOT NULL REFERENCES registry.trials(id) ON DELETE RESTRICT,

  outcome_id UUID REFERENCES registry.outcomes(id) ON DELETE SET NULL,
  arm_id UUID REFERENCES registry.arms(id) ON DELETE SET NULL,

  value_float DOUBLE PRECISION,
  value_text TEXT,
  units TEXT,
  p_value DOUBLE PRECISION,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

-- Reconciliation findings (registry vs CSR vs CTD)
CREATE TABLE IF NOT EXISTS registry.reconciliation_findings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  nct_id TEXT NOT NULL,
  severity registry.finding_severity NOT NULL DEFAULT 'MED',
  finding_type TEXT NOT NULL,      -- ENDPOINT_MISMATCH / POPULATION_MISMATCH / SAMPLE_SIZE_MISMATCH / TIMELINE_MISMATCH
  summary TEXT NOT NULL,

  linked_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL, -- claim/ctd/csr entity
  details JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

-- Append-only for reconciliation findings
CREATE OR REPLACE FUNCTION registry.prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Registry reconciliation findings are append-only';
END $$;

DROP TRIGGER IF EXISTS trg_no_update_delete_registry_findings ON registry.reconciliation_findings;
CREATE TRIGGER trg_no_update_delete_registry_findings
  BEFORE UPDATE OR DELETE ON registry.reconciliation_findings
  FOR EACH ROW EXECUTE FUNCTION registry.prevent_mutation();

-- Auto-register entities for trials + findings (using TG_ARGV for trigger arguments)
CREATE OR REPLACE FUNCTION registry.tg_register_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
  v_key_prefix TEXT;
BEGIN
  IF NEW.id IS NULL THEN NEW.id := uuid_generate_v4(); END IF;

  v_key_prefix := TG_ARGV[0];
  v_key := v_key_prefix || ':' || NEW.id::text;
  v_hash := core.sha256_hex((to_jsonb(NEW) - 'entity_id')::text);

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    'REGISTRY_OBJECT',
    v_key,
    'v1',
    v_hash,
    jsonb_build_object('domain','registry','table',TG_TABLE_NAME)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_registry_trial_entity ON registry.trials;
CREATE TRIGGER trg_register_registry_trial_entity
  BEFORE INSERT ON registry.trials
  FOR EACH ROW EXECUTE FUNCTION registry.tg_register_entity('REGISTRY_TRIAL');

DROP TRIGGER IF EXISTS trg_register_registry_finding_entity ON registry.reconciliation_findings;
CREATE TRIGGER trg_register_registry_finding_entity
  BEFORE INSERT ON registry.reconciliation_findings
  FOR EACH ROW EXECUTE FUNCTION registry.tg_register_entity('REGISTRY_FINDING');

-- RLS
ALTER TABLE registry.trials ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.outcomes ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.arms ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE registry.reconciliation_findings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_registry_trials_select ON registry.trials;
CREATE POLICY p_registry_trials_select ON registry.trials FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_trials_insert ON registry.trials;
CREATE POLICY p_registry_trials_insert ON registry.trials FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_select_outcomes ON registry.outcomes;
CREATE POLICY p_registry_select_outcomes ON registry.outcomes FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_insert_outcomes ON registry.outcomes;
CREATE POLICY p_registry_insert_outcomes ON registry.outcomes FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_select_arms ON registry.arms;
CREATE POLICY p_registry_select_arms ON registry.arms FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_insert_arms ON registry.arms;
CREATE POLICY p_registry_insert_arms ON registry.arms FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_select_results ON registry.results;
CREATE POLICY p_registry_select_results ON registry.results FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_insert_results ON registry.results;
CREATE POLICY p_registry_insert_results ON registry.results FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_findings_select ON registry.reconciliation_findings;
CREATE POLICY p_registry_findings_select ON registry.reconciliation_findings FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_registry_findings_insert ON registry.reconciliation_findings;
CREATE POLICY p_registry_findings_insert ON registry.reconciliation_findings FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

COMMIT;
