-- 036_gcc_discovery_bridge.sql
-- Drug Discovery Bridge (targets/assays/preclinical)

BEGIN;

CREATE SCHEMA IF NOT EXISTS discovery;

-- Core discovery objects (typed, provenance-ready)
CREATE TABLE IF NOT EXISTS discovery.targets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  gene_symbol TEXT,
  uniprot_id TEXT,
  target_class TEXT,
  organism TEXT,

  document_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  anchor_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE TABLE IF NOT EXISTS discovery.assays (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  assay_type TEXT, -- biochemical/cell-based/in vivo
  readout TEXT,
  conditions JSONB NOT NULL DEFAULT '{}'::jsonb,

  document_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  anchor_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE TABLE IF NOT EXISTS discovery.assay_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  assay_id UUID NOT NULL REFERENCES discovery.assays(id) ON DELETE RESTRICT,
  analyte TEXT,
  result_type TEXT,       -- IC50/EC50/Kd/etc
  value_float DOUBLE PRECISION,
  value_text TEXT,
  units TEXT,
  n INT,

  document_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,
  anchor_entity_id UUID REFERENCES core.entities(id) ON DELETE SET NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS discovery_results_assay_idx ON discovery.assay_results(assay_id);

-- Append-only for results (discovery truth shouldn't be edited; supersede with new records)
CREATE OR REPLACE FUNCTION discovery.prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Discovery tables are append-only for regulated provenance';
END $$;

DROP TRIGGER IF EXISTS trg_no_update_delete_assay_results ON discovery.assay_results;
CREATE TRIGGER trg_no_update_delete_assay_results
  BEFORE UPDATE OR DELETE ON discovery.assay_results
  FOR EACH ROW EXECUTE FUNCTION discovery.prevent_mutation();

-- Auto-register entities
CREATE OR REPLACE FUNCTION discovery.tg_register_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
BEGIN
  IF NEW.id IS NULL THEN NEW.id := uuid_generate_v4(); END IF;

  v_key := 'DISCOVERY_OBJECT:' || TG_TABLE_NAME || ':' || NEW.id::text;
  v_hash := core.sha256_hex((to_jsonb(NEW) - 'entity_id')::text);

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    'DISCOVERY_OBJECT',
    v_key,
    'v1',
    v_hash,
    jsonb_build_object('domain','discovery','table',TG_TABLE_NAME)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_targets_entity ON discovery.targets;
CREATE TRIGGER trg_register_targets_entity
  BEFORE INSERT ON discovery.targets
  FOR EACH ROW EXECUTE FUNCTION discovery.tg_register_entity();

DROP TRIGGER IF EXISTS trg_register_assays_entity ON discovery.assays;
CREATE TRIGGER trg_register_assays_entity
  BEFORE INSERT ON discovery.assays
  FOR EACH ROW EXECUTE FUNCTION discovery.tg_register_entity();

DROP TRIGGER IF EXISTS trg_register_assay_results_entity ON discovery.assay_results;
CREATE TRIGGER trg_register_assay_results_entity
  BEFORE INSERT ON discovery.assay_results
  FOR EACH ROW EXECUTE FUNCTION discovery.tg_register_entity();

-- RLS
ALTER TABLE discovery.targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery.assays ENABLE ROW LEVEL SECURITY;
ALTER TABLE discovery.assay_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_discovery_select_targets ON discovery.targets;
CREATE POLICY p_discovery_select_targets ON discovery.targets FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_discovery_insert_targets ON discovery.targets;
CREATE POLICY p_discovery_insert_targets ON discovery.targets FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_discovery_select_assays ON discovery.assays;
CREATE POLICY p_discovery_select_assays ON discovery.assays FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_discovery_insert_assays ON discovery.assays;
CREATE POLICY p_discovery_insert_assays ON discovery.assays FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_discovery_select_results ON discovery.assay_results;
CREATE POLICY p_discovery_select_results ON discovery.assay_results FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_discovery_insert_results ON discovery.assay_results;
CREATE POLICY p_discovery_insert_results ON discovery.assay_results FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

COMMIT;
