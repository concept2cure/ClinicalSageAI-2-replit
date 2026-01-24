-- 035_gcc_entity_chain_events.sql
-- Generalized Entity Chain-of-Custody Events (for ANY object)

BEGIN;

CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.entity_chain_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL, -- keep TEXT to avoid enum migration pain; enforce via conventions
  prev_event_id UUID REFERENCES audit.entity_chain_events(id) ON DELETE SET NULL,

  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS entity_chain_entity_idx
  ON audit.entity_chain_events(entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS entity_chain_program_idx
  ON audit.entity_chain_events(program_id, created_at DESC);

-- Append-only
CREATE OR REPLACE FUNCTION audit.prevent_entity_chain_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'entity_chain_events is append-only';
END $$;

DROP TRIGGER IF EXISTS trg_no_update_delete_entity_chain_events ON audit.entity_chain_events;
CREATE TRIGGER trg_no_update_delete_entity_chain_events
  BEFORE UPDATE OR DELETE ON audit.entity_chain_events
  FOR EACH ROW EXECUTE FUNCTION audit.prevent_entity_chain_mutation();

-- Insert helper: serializes per entity for deterministic chaining
CREATE OR REPLACE FUNCTION audit.insert_entity_chain_event(
  p_entity_id UUID,
  p_event_type TEXT,
  p_payload JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = audit, core, public
AS $$
DECLARE
  v_program_id UUID;
  v_prev UUID;
  v_actor TEXT := COALESCE(current_setting('app.user', true), 'unknown');
  v_req TEXT := current_setting('app.request_id', true);
  v_new UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_entity_id::text));

  SELECT program_id INTO v_program_id
  FROM core.entities
  WHERE id = p_entity_id;

  IF v_program_id IS NULL THEN
    RAISE EXCEPTION 'Entity not found for chain event: %', p_entity_id;
  END IF;

  SELECT id INTO v_prev
  FROM audit.entity_chain_events
  WHERE entity_id = p_entity_id
  ORDER BY created_at DESC
  LIMIT 1;

  INSERT INTO audit.entity_chain_events(program_id, entity_id, event_type, prev_event_id, payload, created_by, request_id)
  VALUES (v_program_id, p_entity_id, p_event_type, v_prev, COALESCE(p_payload,'{}'::jsonb), v_actor, v_req)
  RETURNING id INTO v_new;

  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION audit.insert_entity_chain_event(UUID,TEXT,JSONB) FROM PUBLIC;

-- RLS
ALTER TABLE audit.entity_chain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_entity_chain_select ON audit.entity_chain_events;
CREATE POLICY p_entity_chain_select ON audit.entity_chain_events FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

-- Auto-chain events for key tables (if present)
DO $$
BEGIN
  -- Safety signal versions
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='safety' AND table_name='signal_versions') THEN
    CREATE OR REPLACE FUNCTION safety.tg_chain_signal_version()
    RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
    BEGIN
      PERFORM audit.insert_entity_chain_event(
        NEW.entity_id,
        'SAFETY_SIGNAL_VERSION_CREATED',
        jsonb_build_object('signal_id', NEW.signal_id, 'version', NEW.version, 'status', NEW.status, 'severity', NEW.severity)
      );
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_chain_signal_version ON safety.signal_versions;
    CREATE TRIGGER trg_chain_signal_version
      AFTER INSERT ON safety.signal_versions
      FOR EACH ROW EXECUTE FUNCTION safety.tg_chain_signal_version();
  END IF;

  -- CRO RBM findings
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='cro_ops' AND table_name='rbm_findings') THEN
    CREATE OR REPLACE FUNCTION cro_ops.tg_chain_rbm_finding()
    RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
    BEGIN
      PERFORM audit.insert_entity_chain_event(
        NEW.entity_id,
        'CRO_RBM_FINDING_CREATED',
        jsonb_build_object('finding_type', NEW.finding_type, 'severity', NEW.severity)
      );
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_chain_rbm_finding ON cro_ops.rbm_findings;
    CREATE TRIGGER trg_chain_rbm_finding
      AFTER INSERT ON cro_ops.rbm_findings
      FOR EACH ROW EXECUTE FUNCTION cro_ops.tg_chain_rbm_finding();
  END IF;

  -- Intel pack exports
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='intel' AND table_name='pack_exports') THEN
    CREATE OR REPLACE FUNCTION intel.tg_chain_pack_export()
    RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
    BEGIN
      PERFORM audit.insert_entity_chain_event(
        NEW.entity_id,
        'INTEL_PACK_EXPORTED',
        jsonb_build_object('pack_id', NEW.pack_id, 'pack_version', NEW.pack_version, 'sha256', NEW.manifest_sha256)
      );
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_chain_pack_export ON intel.pack_exports;
    CREATE TRIGGER trg_chain_pack_export
      AFTER INSERT ON intel.pack_exports
      FOR EACH ROW EXECUTE FUNCTION intel.tg_chain_pack_export();
  END IF;

  -- Intel pack export signatures (if e_signatures exists)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='audit' AND table_name='e_signatures') THEN
    CREATE OR REPLACE FUNCTION audit.tg_chain_on_intel_pack_esign()
    RETURNS TRIGGER LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.signed_object_type::text <> 'INTEL_PACK_EXPORT' THEN
        RETURN NEW;
      END IF;

      -- signed_object_id is the intel.pack_exports id; we chain against that export's entity_id
      PERFORM audit.insert_entity_chain_event(
        (SELECT entity_id FROM intel.pack_exports WHERE id = NEW.signed_object_id),
        'INTEL_PACK_SIGNED',
        jsonb_build_object('signer', NEW.signer_identity, 'role', NEW.signer_role, 'meaning', NEW.meaning::text)
      );

      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_chain_intel_pack_esign ON audit.e_signatures;
    CREATE TRIGGER trg_chain_intel_pack_esign
      AFTER INSERT ON audit.e_signatures
      FOR EACH ROW EXECUTE FUNCTION audit.tg_chain_on_intel_pack_esign();
  END IF;
END $$;

COMMIT;
