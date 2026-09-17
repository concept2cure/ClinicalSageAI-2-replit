-- ============================================================================
-- ARCHIVED 2026-09-10 (WO-1, ADR-0006) — NO APPLIER RUNS THIS FILE.
-- ============================================================================
-- It is in none of C2C_MIGRATION_FILES (deploy-migrate), the root migrations/
-- overlay, PRE_OVERLAY_CREATORS, AUTHORING_SUBSYSTEM_FILES, or the *_gcc_*
-- tree. The only glob that would match it belongs to scripts/db_migrate.sh,
-- which has no automated caller.
--
-- Defined a second time here: concept2cure_artifacts, concept2cure_artifact_versions
-- Real creator: shared/schema.ts via drizzle-kit push
--
-- Verified against a database built from empty by
-- scripts/db/provision-test-db.sh before archiving: nothing this file
-- uniquely creates was present, and every ALTER ... ADD COLUMN target it
-- carries already exists. Full reasoning, and why that check is mandatory
-- rather than a formality, in db/migrations/_legacy/README.md
-- (see the 2026-09-10 section).
-- ============================================================================

-- Migration: Create concept2cure_artifacts and concept2cure_artifact_versions tables
-- Purpose: Document lifecycle persistence for the Concept2Cure document factory
-- Date: 2026-03-11

CREATE TABLE IF NOT EXISTS concept2cure_artifacts (
  id SERIAL PRIMARY KEY,
  artifact_id TEXT NOT NULL UNIQUE,
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  conversation_id INTEGER,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  type TEXT NOT NULL,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  ctd_section TEXT,
  template_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',
  locked_at TIMESTAMP,
  locked_by_id INTEGER REFERENCES users(id),
  created_by_id INTEGER REFERENCES users(id),
  metadata JSON,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_artifact_project_idx ON concept2cure_artifacts(project_id);
CREATE INDEX IF NOT EXISTS c2c_artifact_id_idx ON concept2cure_artifacts(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_artifact_type_idx ON concept2cure_artifacts(type);
CREATE INDEX IF NOT EXISTS c2c_artifact_status_idx ON concept2cure_artifacts(status);

CREATE TABLE IF NOT EXISTS concept2cure_artifact_versions (
  id SERIAL PRIMARY KEY,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  version INTEGER NOT NULL,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  change_description TEXT,
  created_by_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(artifact_id, version)
);

CREATE INDEX IF NOT EXISTS c2c_artifact_ver_idx ON concept2cure_artifact_versions(artifact_id, version);
