-- 031_gcc_enum_extensions_and_entity_utils.sql
-- Adds generic entity types and utility functions to register entities safely.

-- NOTE: ALTER TYPE ADD VALUE may not be allowed inside a transaction on some Postgres versions.
-- Keep enum additions outside BEGIN/COMMIT.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Extend core.entity_type with generic new domains (idempotent via pg_enum check)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='core' AND t.typname='entity_type' AND e.enumlabel='CRO_OBJECT'
  ) THEN
    ALTER TYPE core.entity_type ADD VALUE 'CRO_OBJECT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='core' AND t.typname='entity_type' AND e.enumlabel='DISCOVERY_OBJECT'
  ) THEN
    ALTER TYPE core.entity_type ADD VALUE 'DISCOVERY_OBJECT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='core' AND t.typname='entity_type' AND e.enumlabel='REGISTRY_OBJECT'
  ) THEN
    ALTER TYPE core.entity_type ADD VALUE 'REGISTRY_OBJECT';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='core' AND t.typname='entity_type' AND e.enumlabel='INTEL_PACK'
  ) THEN
    ALTER TYPE core.entity_type ADD VALUE 'INTEL_PACK';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid=e.enumtypid
    JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='core' AND t.typname='entity_type' AND e.enumlabel='INTEL_PACK_EXPORT'
  ) THEN
    ALTER TYPE core.entity_type ADD VALUE 'INTEL_PACK_EXPORT';
  END IF;
END $$;

-- Extend audit.signed_object_type for signing intel pack exports (if audit.signed_object_type exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='audit' AND t.typname='signed_object_type'
  ) THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_enum e
      JOIN pg_type t ON t.oid=e.enumtypid
      JOIN pg_namespace n ON n.oid=t.typnamespace
      WHERE n.nspname='audit' AND t.typname='signed_object_type' AND e.enumlabel='INTEL_PACK_EXPORT'
    ) THEN
      ALTER TYPE audit.signed_object_type ADD VALUE 'INTEL_PACK_EXPORT';
    END IF;
  END IF;
END $$;

BEGIN;

-- Utility: sha256(text) -> hex
CREATE OR REPLACE FUNCTION core.sha256_hex(p_text TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT encode(digest(coalesce(p_text,''), 'sha256'), 'hex');
$$;

REVOKE ALL ON FUNCTION core.sha256_hex(TEXT) FROM PUBLIC;

-- Utility: register entity row (creates core.entities row and returns id)
-- SECURITY DEFINER: ensures triggers can register entities even with restricted app roles.
CREATE OR REPLACE FUNCTION core.register_entity(
  p_program_id UUID,
  p_entity_type core.entity_type,
  p_entity_key TEXT,
  p_entity_version TEXT,
  p_entity_hash TEXT,
  p_metadata JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = core, public
AS $$
DECLARE
  v_id UUID;
  v_actor TEXT := COALESCE(current_setting('app.user', true), 'unknown');
  v_req TEXT := current_setting('app.request_id', true);
BEGIN
  INSERT INTO core.entities (program_id, entity_type, entity_key, entity_version, entity_hash, metadata, created_by, request_id)
  VALUES (p_program_id, p_entity_type, p_entity_key, p_entity_version, p_entity_hash, COALESCE(p_metadata,'{}'::jsonb), v_actor, v_req)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION core.register_entity(UUID, core.entity_type, TEXT, TEXT, TEXT, JSONB) FROM PUBLIC;

COMMIT;
