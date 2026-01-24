-- 032_gcc_safety_signal_intelligence.sql
-- Safety Signal Intelligence (CDC/public health + postmarket-ready)

BEGIN;

CREATE SCHEMA IF NOT EXISTS safety;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='safety' AND t.typname='signal_status'
  ) THEN
    CREATE TYPE safety.signal_status AS ENUM ('NEW','MONITOR','CONFIRMED','CLOSED');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='safety' AND t.typname='signal_severity'
  ) THEN
    CREATE TYPE safety.signal_severity AS ENUM ('LOW','MED','HIGH','CRITICAL');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='safety' AND t.typname='signal_kind'
  ) THEN
    CREATE TYPE safety.signal_kind AS ENUM (
      'AE_IMBALANCE','SAE_CLUSTER','LAB_SHIFT','VITALS_SIGNAL','ECG_SIGNAL',
      'CLASS_EFFECT','MECHANISM_RISK','QUALITY_DEFECT','EPIDEMIOLOGIC'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='safety' AND t.typname='impact_type'
  ) THEN
    CREATE TYPE safety.impact_type AS ENUM ('LABELING','RMP','CTD_NODE','CLAIM','MONITORING','CMC','TRIAL_DESIGN');
  END IF;
END $$;

-- Safety signal header (immutable identity; evolving state is in versions)
CREATE TABLE IF NOT EXISTS safety.signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  signal_code TEXT,                 -- internal code or external key
  signal_kind safety.signal_kind NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='safety_signals_entity_uniq') THEN
    ALTER TABLE safety.signals ADD CONSTRAINT safety_signals_entity_uniq UNIQUE (entity_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS safety_signals_program_idx ON safety.signals(program_id, created_at DESC);

-- Safety signal versions (append-only)
CREATE TABLE IF NOT EXISTS safety.signal_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  signal_id UUID NOT NULL REFERENCES safety.signals(id) ON DELETE RESTRICT,
  version INT NOT NULL,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  status safety.signal_status NOT NULL DEFAULT 'NEW',
  severity safety.signal_severity NOT NULL DEFAULT 'MED',

  detected_at TIMESTAMPTZ,
  detection_method TEXT,          -- openFDA, literature, CDC, internal, etc.
  narrative TEXT,
  evidence_summary TEXT,

  embedding VECTOR(1536),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='signal_versions_uniq') THEN
    ALTER TABLE safety.signal_versions ADD CONSTRAINT signal_versions_uniq UNIQUE (signal_id, version);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS signal_versions_signal_idx ON safety.signal_versions(signal_id, version DESC);
CREATE INDEX IF NOT EXISTS signal_versions_program_idx ON safety.signal_versions(program_id, created_at DESC);

-- Evidence items linked to a signal version (append-only)
CREATE TABLE IF NOT EXISTS safety.signal_evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  signal_version_id UUID NOT NULL REFERENCES safety.signal_versions(id) ON DELETE RESTRICT,

  evidence_entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT, -- document or anchor entity
  evidence_kind TEXT NOT NULL,         -- "FAERS_CASE_SERIES", "LITERATURE", "CDC_GUIDANCE", "CSR_TABLE", etc.
  excerpt TEXT,
  excerpt_sha256 TEXT,

  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS signal_evidence_version_idx ON safety.signal_evidence(signal_version_id);

-- Impacts (what does this signal affect?) (append-only)
CREATE TABLE IF NOT EXISTS safety.signal_impacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  signal_version_id UUID NOT NULL REFERENCES safety.signal_versions(id) ON DELETE RESTRICT,
  impact safety.impact_type NOT NULL,
  impacted_entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  severity safety.signal_severity NOT NULL DEFAULT 'MED',
  rationale TEXT,
  recommended_actions JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS signal_impacts_version_idx ON safety.signal_impacts(signal_version_id);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION safety.prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Safety tables are append-only';
END $$;

DROP TRIGGER IF EXISTS trg_no_update_delete_signal_versions ON safety.signal_versions;
CREATE TRIGGER trg_no_update_delete_signal_versions
  BEFORE UPDATE OR DELETE ON safety.signal_versions
  FOR EACH ROW EXECUTE FUNCTION safety.prevent_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_signal_evidence ON safety.signal_evidence;
CREATE TRIGGER trg_no_update_delete_signal_evidence
  BEFORE UPDATE OR DELETE ON safety.signal_evidence
  FOR EACH ROW EXECUTE FUNCTION safety.prevent_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_signal_impacts ON safety.signal_impacts;
CREATE TRIGGER trg_no_update_delete_signal_impacts
  BEFORE UPDATE OR DELETE ON safety.signal_impacts
  FOR EACH ROW EXECUTE FUNCTION safety.prevent_mutation();

-- Auto-register entity rows for safety.signals and safety.signal_versions
CREATE OR REPLACE FUNCTION safety.tg_register_signal_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := uuid_generate_v4();
  END IF;

  v_key := COALESCE(NEW.signal_code, 'SAFETY_SIGNAL:' || NEW.id::text);
  v_hash := core.sha256_hex( (jsonb_build_object(
    'signal_id', NEW.id,
    'signal_code', NEW.signal_code,
    'signal_kind', NEW.signal_kind
  ))::text );

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    'SAFETY_SIGNAL',
    v_key,
    'v1',
    v_hash,
    jsonb_build_object('domain','safety','table','signals')
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_signal_entity ON safety.signals;
CREATE TRIGGER trg_register_signal_entity
  BEFORE INSERT ON safety.signals
  FOR EACH ROW EXECUTE FUNCTION safety.tg_register_signal_entity();

CREATE OR REPLACE FUNCTION safety.tg_register_signal_version_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
BEGIN
  IF NEW.id IS NULL THEN
    NEW.id := uuid_generate_v4();
  END IF;

  v_key := 'SAFETY_SIGNAL_VERSION:' || NEW.id::text;
  v_hash := core.sha256_hex( (to_jsonb(NEW) - 'entity_id')::text );

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    'KNOWLEDGE_ITEM',
    v_key,
    'v' || NEW.version::text,
    v_hash,
    jsonb_build_object('domain','safety','table','signal_versions','signal_id',NEW.signal_id)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_signal_version_entity ON safety.signal_versions;
CREATE TRIGGER trg_register_signal_version_entity
  BEFORE INSERT ON safety.signal_versions
  FOR EACH ROW EXECUTE FUNCTION safety.tg_register_signal_version_entity();

-- RLS
ALTER TABLE safety.signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.signal_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.signal_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE safety.signal_impacts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_safety_signals_select ON safety.signals;
CREATE POLICY p_safety_signals_select ON safety.signals FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signals_insert ON safety.signals;
CREATE POLICY p_safety_signals_insert ON safety.signals FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signal_versions_select ON safety.signal_versions;
CREATE POLICY p_safety_signal_versions_select ON safety.signal_versions FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signal_versions_insert ON safety.signal_versions;
CREATE POLICY p_safety_signal_versions_insert ON safety.signal_versions FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signal_evidence_select ON safety.signal_evidence;
CREATE POLICY p_safety_signal_evidence_select ON safety.signal_evidence FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signal_evidence_insert ON safety.signal_evidence;
CREATE POLICY p_safety_signal_evidence_insert ON safety.signal_evidence FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signal_impacts_select ON safety.signal_impacts;
CREATE POLICY p_safety_signal_impacts_select ON safety.signal_impacts FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_safety_signal_impacts_insert ON safety.signal_impacts;
CREATE POLICY p_safety_signal_impacts_insert ON safety.signal_impacts FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

-- Views: latest version per signal (for dashboards)
CREATE OR REPLACE VIEW safety.v_signal_latest AS
SELECT DISTINCT ON (sv.signal_id)
  s.program_id,
  s.id AS signal_id,
  s.signal_code,
  s.signal_kind,
  sv.id AS signal_version_id,
  sv.version,
  sv.status,
  sv.severity,
  sv.detected_at,
  sv.detection_method,
  sv.evidence_summary,
  sv.created_at AS version_created_at
FROM safety.signals s
JOIN safety.signal_versions sv ON sv.signal_id = s.id
ORDER BY sv.signal_id, sv.version DESC;

COMMIT;
