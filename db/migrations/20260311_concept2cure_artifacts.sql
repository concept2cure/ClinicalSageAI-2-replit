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
