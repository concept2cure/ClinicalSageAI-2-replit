-- 000_gcc_bootstrap_core.sql
-- Bootstrap minimal core schema and auth stub for Neon environment
-- This avoids touching Neon's managed auth schema

BEGIN;

-- Core schema
CREATE SCHEMA IF NOT EXISTS core;

-- UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector') THEN
    CREATE EXTENSION IF NOT EXISTS "vector";
  ELSE
    RAISE NOTICE 'Extension "vector" not available, skipping.';
  END IF;
END $$;

-- Entity type enum
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
    WHERE n.nspname='core' AND t.typname='entity_type'
  ) THEN
    CREATE TYPE core.entity_type AS ENUM (
      'PROGRAM',
      'DOCUMENT',
      'ANCHOR',
      'KNOWLEDGE_ITEM',
      'CLAIM',
      'CTD_NODE',
      'CSR_RECORD',
      'REVIEW_SESSION',
      'SNAPSHOT',
      'SAFETY_SIGNAL'
    );
  END IF;
END $$;

-- Programs table
CREATE TABLE IF NOT EXISTS core.programs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'ACTIVE',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS programs_code_idx ON core.programs(code);
CREATE INDEX IF NOT EXISTS programs_status_idx ON core.programs(status);

-- Entities table (central registry)
CREATE TABLE IF NOT EXISTS core.entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  entity_type core.entity_type NOT NULL,
  entity_key TEXT NOT NULL,
  entity_version TEXT NOT NULL DEFAULT 'v1',
  entity_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'unknown',
  request_id TEXT
);

CREATE INDEX IF NOT EXISTS entities_program_idx ON core.entities(program_id);
CREATE INDEX IF NOT EXISTS entities_type_idx ON core.entities(entity_type);
CREATE INDEX IF NOT EXISTS entities_key_idx ON core.entities(entity_key);

-- Audit schema for snapshots and config bundles
CREATE SCHEMA IF NOT EXISTS audit;

CREATE TABLE IF NOT EXISTS audit.dataset_snapshots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  snapshot_name TEXT,
  snapshot_hash TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

CREATE TABLE IF NOT EXISTS audit.config_bundles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  program_id UUID NOT NULL REFERENCES core.programs(id) ON DELETE RESTRICT,
  bundle_name TEXT,
  bundle_hash TEXT,
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by TEXT NOT NULL DEFAULT 'system'
);

-- Auth stub: can_access_program function in core schema
-- This is a permissive stub; in production you'd wire this to your actual auth
CREATE OR REPLACE FUNCTION core.can_access_program(p_program_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  -- Permissive stub: allow all access for now
  -- In production, check current_setting('app.user') against program membership
  RETURN TRUE;
END;
$$;

-- Create auth schema alias if we can, or use core
DO $$
BEGIN
  -- Try to create auth.can_access_program as wrapper to core function
  -- This may fail on Neon or CI environments without auth schema
  BEGIN
    EXECUTE 'CREATE OR REPLACE FUNCTION auth.can_access_program(p_program_id UUID) RETURNS BOOLEAN LANGUAGE SQL STABLE AS $fn$ SELECT core.can_access_program(p_program_id); $fn$;';
  EXCEPTION
    WHEN insufficient_privilege THEN
      RAISE NOTICE 'Cannot create auth.can_access_program - using core.can_access_program instead';
    WHEN invalid_schema_name THEN
      RAISE NOTICE 'Schema "auth" does not exist - using core.can_access_program instead';
    WHEN OTHERS THEN
      RAISE NOTICE 'Cannot create auth.can_access_program (SQLSTATE %): % - using core.can_access_program instead', SQLSTATE, SQLERRM;
  END;
END $$;

COMMIT;
