-- 034_gcc_intel_packs.sql
-- Intel Packs (productized growth artifacts + signable exports)

BEGIN;

CREATE SCHEMA IF NOT EXISTS intel;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='intel' AND t.typname='pack_type'
  ) THEN
    CREATE TYPE intel.pack_type AS ENUM ('CEO','RA','CMC','CLINICAL','SAFETY','CRO','INVESTOR');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='intel' AND t.typname='pack_status'
  ) THEN
    CREATE TYPE intel.pack_status AS ENUM ('DRAFT','FROZEN','EXPORTED','ARCHIVED');
  END IF;
END $$;

-- Pack header (mutable only in limited ways; content lives in versions)
CREATE TABLE IF NOT EXISTS intel.packs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  pack_type intel.pack_type NOT NULL,
  pack_name TEXT NOT NULL,
  description TEXT,

  status intel.pack_status NOT NULL DEFAULT 'DRAFT',
  scope JSONB NOT NULL DEFAULT '{}'::jsonb,  -- snapshot_id, review_session_ids, ctd nodes, etc.

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT,

  frozen_at TIMESTAMPTZ,
  frozen_by TEXT,

  archived_at TIMESTAMPTZ,
  archived_by TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_packs_entity_uniq') THEN
    ALTER TABLE intel.packs ADD CONSTRAINT intel_packs_entity_uniq UNIQUE (entity_id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS intel_packs_program_idx ON intel.packs(program_id, created_at DESC);

-- Pack versions (append-only)
CREATE TABLE IF NOT EXISTS intel.pack_versions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  pack_id UUID NOT NULL REFERENCES intel.packs(id) ON DELETE RESTRICT,
  version INT NOT NULL,

  dataset_snapshot_id UUID REFERENCES audit.dataset_snapshots(id) ON DELETE SET NULL,
  config_bundle_id UUID REFERENCES audit.config_bundles(id) ON DELETE SET NULL,

  content JSONB NOT NULL DEFAULT '{}'::jsonb,
  embedding VECTOR(1536),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='intel_pack_versions_uniq') THEN
    ALTER TABLE intel.pack_versions ADD CONSTRAINT intel_pack_versions_uniq UNIQUE (pack_id, version);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS intel_pack_versions_pack_idx ON intel.pack_versions(pack_id, version DESC);

-- Pack items (append-only)
CREATE TABLE IF NOT EXISTS intel.pack_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  pack_version_id UUID NOT NULL REFERENCES intel.pack_versions(id) ON DELETE RESTRICT,
  rank INT NOT NULL DEFAULT 0,

  item_entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,
  item_category TEXT,   -- "Top Risk", "Key Deficiency", "CMC Gap", "Trial Mismatch", etc.
  severity TEXT,
  rationale TEXT,

  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS intel_pack_items_version_idx ON intel.pack_items(pack_version_id, rank);

-- Pack exports (append-only + signable)
CREATE TABLE IF NOT EXISTS intel.pack_exports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,

  pack_id UUID NOT NULL REFERENCES intel.packs(id) ON DELETE RESTRICT,
  pack_version INT NOT NULL,

  entity_id UUID NOT NULL REFERENCES core.entities(id) ON DELETE RESTRICT,

  export_format TEXT NOT NULL DEFAULT 'json',
  manifest_sha256 TEXT NOT NULL,
  manifest_json JSONB NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS intel_pack_exports_pack_idx ON intel.pack_exports(pack_id, created_at DESC);

-- Append-only enforcement
CREATE OR REPLACE FUNCTION intel.prevent_mutation()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Intel pack records are append-only or lifecycle-locked';
END $$;

DROP TRIGGER IF EXISTS trg_no_update_delete_pack_versions ON intel.pack_versions;
CREATE TRIGGER trg_no_update_delete_pack_versions
  BEFORE UPDATE OR DELETE ON intel.pack_versions
  FOR EACH ROW EXECUTE FUNCTION intel.prevent_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_pack_items ON intel.pack_items;
CREATE TRIGGER trg_no_update_delete_pack_items
  BEFORE UPDATE OR DELETE ON intel.pack_items
  FOR EACH ROW EXECUTE FUNCTION intel.prevent_mutation();

DROP TRIGGER IF EXISTS trg_no_update_delete_pack_exports ON intel.pack_exports;
CREATE TRIGGER trg_no_update_delete_pack_exports
  BEFORE UPDATE OR DELETE ON intel.pack_exports
  FOR EACH ROW EXECUTE FUNCTION intel.prevent_mutation();

-- Lifecycle lock for packs after leaving DRAFT (only status transitions allowed)
CREATE OR REPLACE FUNCTION intel.tg_packs_before_update()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_actor TEXT := COALESCE(current_setting('app.user', true), 'unknown');
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status='DRAFT' AND NEW.status IN ('FROZEN','ARCHIVED') THEN
      IF NEW.status='FROZEN' THEN
        NEW.frozen_at := COALESCE(NEW.frozen_at, NOW());
        NEW.frozen_by := COALESCE(NEW.frozen_by, v_actor);
      ELSE
        NEW.archived_at := COALESCE(NEW.archived_at, NOW());
        NEW.archived_by := COALESCE(NEW.archived_by, v_actor);
      END IF;
    ELSIF OLD.status='FROZEN' AND NEW.status IN ('EXPORTED','ARCHIVED') THEN
      IF NEW.status='ARCHIVED' THEN
        NEW.archived_at := COALESCE(NEW.archived_at, NOW());
        NEW.archived_by := COALESCE(NEW.archived_by, v_actor);
      END IF;
    ELSE
      RAISE EXCEPTION 'Invalid intel pack status transition: % -> %', OLD.status, NEW.status;
    END IF;
  END IF;

  -- After leaving DRAFT, forbid edits to core fields
  IF OLD.status <> 'DRAFT' THEN
    IF (to_jsonb(NEW) - 'status' - 'frozen_at' - 'frozen_by' - 'archived_at' - 'archived_by')
       <> (to_jsonb(OLD) - 'status' - 'frozen_at' - 'frozen_by' - 'archived_at' - 'archived_by') THEN
      RAISE EXCEPTION 'Intel pack is immutable after leaving DRAFT';
    END IF;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_packs_before_update ON intel.packs;
CREATE TRIGGER trg_packs_before_update
  BEFORE UPDATE ON intel.packs
  FOR EACH ROW EXECUTE FUNCTION intel.tg_packs_before_update();

-- Auto-register entities for packs + exports
CREATE OR REPLACE FUNCTION intel.tg_register_pack_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
BEGIN
  IF NEW.id IS NULL THEN NEW.id := uuid_generate_v4(); END IF;

  v_key := 'INTEL_PACK:' || NEW.id::text;
  v_hash := core.sha256_hex((jsonb_build_object(
    'pack_id', NEW.id,
    'pack_type', NEW.pack_type,
    'pack_name', NEW.pack_name
  ))::text);

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    'INTEL_PACK',
    v_key,
    'v1',
    v_hash,
    jsonb_build_object('domain','intel','table','packs')
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_pack_entity ON intel.packs;
CREATE TRIGGER trg_register_pack_entity
  BEFORE INSERT ON intel.packs
  FOR EACH ROW EXECUTE FUNCTION intel.tg_register_pack_entity();

CREATE OR REPLACE FUNCTION intel.tg_register_pack_export_entity()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_hash TEXT;
  v_key TEXT;
BEGIN
  IF NEW.id IS NULL THEN NEW.id := uuid_generate_v4(); END IF;

  v_key := 'INTEL_PACK_EXPORT:' || NEW.id::text;
  v_hash := core.sha256_hex((to_jsonb(NEW) - 'entity_id')::text);

  NEW.entity_id := core.register_entity(
    NEW.program_id,
    'INTEL_PACK_EXPORT',
    v_key,
    'v' || NEW.pack_version::text,
    v_hash,
    jsonb_build_object('domain','intel','table','pack_exports','pack_id',NEW.pack_id)
  );

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_register_pack_export_entity ON intel.pack_exports;
CREATE TRIGGER trg_register_pack_export_entity
  BEFORE INSERT ON intel.pack_exports
  FOR EACH ROW EXECUTE FUNCTION intel.tg_register_pack_export_entity();

-- RLS
ALTER TABLE intel.packs ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.pack_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.pack_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE intel.pack_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS p_intel_packs_select ON intel.packs;
CREATE POLICY p_intel_packs_select ON intel.packs FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_packs_write ON intel.packs;
CREATE POLICY p_intel_packs_write ON intel.packs FOR ALL TO PUBLIC
USING (core.can_access_program(program_id))
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_pack_versions_select ON intel.pack_versions;
CREATE POLICY p_intel_pack_versions_select ON intel.pack_versions FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_pack_versions_insert ON intel.pack_versions;
CREATE POLICY p_intel_pack_versions_insert ON intel.pack_versions FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_pack_items_select ON intel.pack_items;
CREATE POLICY p_intel_pack_items_select ON intel.pack_items FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_pack_items_insert ON intel.pack_items;
CREATE POLICY p_intel_pack_items_insert ON intel.pack_items FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_pack_exports_select ON intel.pack_exports;
CREATE POLICY p_intel_pack_exports_select ON intel.pack_exports FOR SELECT TO PUBLIC
USING (core.can_access_program(program_id));

DROP POLICY IF EXISTS p_intel_pack_exports_insert ON intel.pack_exports;
CREATE POLICY p_intel_pack_exports_insert ON intel.pack_exports FOR INSERT TO PUBLIC
WITH CHECK (core.can_access_program(program_id));

-- Views: latest pack version, latest export
CREATE OR REPLACE VIEW intel.v_pack_latest_version AS
SELECT DISTINCT ON (pv.pack_id)
  p.program_id,
  p.id AS pack_id,
  p.pack_type,
  p.pack_name,
  p.status,
  pv.id AS pack_version_id,
  pv.version,
  pv.created_at AS version_created_at
FROM intel.packs p
JOIN intel.pack_versions pv ON pv.pack_id = p.id
ORDER BY pv.pack_id, pv.version DESC;

CREATE OR REPLACE VIEW intel.v_pack_latest_export AS
SELECT DISTINCT ON (pe.pack_id)
  pe.program_id,
  pe.pack_id,
  pe.id AS export_id,
  pe.pack_version,
  pe.manifest_sha256,
  pe.created_at AS exported_at
FROM intel.pack_exports pe
ORDER BY pe.pack_id, pe.created_at DESC;

COMMIT;
