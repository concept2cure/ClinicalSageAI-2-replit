-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Add project-level sharing and visibility controls for Concept2Cure Projects.
--
-- eCTD/CTD Context:
--   - Module(s): Platform governance and collaboration controls
--   - Integrity Risk Addressed: unauthorized project access and unmanaged collaboration scope
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - RLS policies must enforce program_id isolation where applicable.
--   - Migration must be idempotent where possible (IF EXISTS / IF NOT EXISTS).
-- =============================================================================

-- 2026-10-14 durable prerequisite contract: validate existing stores without
-- changing retained rows, explicit role defaults or timestamp/index shapes.
CREATE TABLE IF NOT EXISTS project_visibility_settings (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  visibility TEXT NOT NULL DEFAULT 'private',
  updated_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_visibility_mode
    CHECK (visibility IN ('private', 'org_public')),
  CONSTRAINT uq_project_visibility_settings
    UNIQUE (project_id)
);

CREATE INDEX IF NOT EXISTS idx_project_visibility_org
  ON project_visibility_settings (organization_id, visibility);

CREATE TABLE IF NOT EXISTS project_members (
  id SERIAL PRIMARY KEY,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  invited_by_id INTEGER REFERENCES users(id),
  accepted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_project_member_role
    CHECK (role IN ('owner', 'edit', 'use')),
  CONSTRAINT chk_project_member_status
    CHECK (status IN ('active', 'revoked')),
  CONSTRAINT uq_project_member
    UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_project_members_org_project
  ON project_members (organization_id, project_id);

CREATE INDEX IF NOT EXISTS idx_project_members_user
  ON project_members (organization_id, user_id, status);

-- A declared/pushed or older table may already exist. Validate required
-- columns and semantic unique identities; do not rewrite retained stores,
-- historical timestamps, index names or CHECK constraints to force parity.
DO $current_store_contract$
DECLARE requirement RECORD;
BEGIN
  FOR requirement IN
    SELECT * FROM (VALUES
      ('public.project_visibility_settings', ARRAY['id', 'project_id', 'organization_id', 'visibility', 'updated_by_id', 'created_at', 'updated_at']::text[]),
      ('public.project_members', ARRAY['id', 'project_id', 'organization_id', 'user_id', 'role', 'status', 'invited_by_id', 'accepted_at', 'created_at', 'updated_at']::text[])
    ) expected(table_name, required_columns)
  LOOP
    IF NOT requirement.required_columns <@ ARRAY(
      SELECT a.attname::text FROM pg_attribute a
       WHERE a.attrelid = to_regclass(requirement.table_name)
         AND a.attnum > 0 AND NOT a.attisdropped
    ) OR NOT EXISTS (
      SELECT 1 FROM pg_attribute a
       WHERE a.attrelid = to_regclass(requirement.table_name)
         AND a.attname = 'organization_id' AND NOT a.attisdropped
         AND a.atttypid = 'integer'::regtype AND a.attnotnull
    ) THEN
      RAISE EXCEPTION 'Project sharing store requires reconciliation; retained rows and schema were not repaired.';
    END IF;
  END LOOP;

  FOR requirement IN
    SELECT * FROM (VALUES
      ('public.project_visibility_settings', ARRAY['id']::text[]),
      ('public.project_visibility_settings', ARRAY['project_id']::text[]),
      ('public.project_members', ARRAY['id']::text[]),
      ('public.project_members', ARRAY['project_id', 'user_id']::text[])
    ) expected(table_name, key_columns)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_index i
       WHERE i.indrelid = to_regclass(requirement.table_name)
         AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
         AND i.indpred IS NULL AND i.indexprs IS NULL
         AND i.indnkeyatts = cardinality(requirement.key_columns)
         AND requirement.key_columns <@ ARRAY(
           SELECT a.attname::text
             FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
            WHERE k.ord <= i.indnkeyatts
         )
    ) THEN
      RAISE EXCEPTION 'Project sharing store requires reconciliation; retained rows and schema were not repaired.';
    END IF;
  END LOOP;
END
$current_store_contract$;
