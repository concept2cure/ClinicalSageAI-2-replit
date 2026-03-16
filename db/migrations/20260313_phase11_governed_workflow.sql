-- Phase 11: Governed Workflow Migration
-- Adds missing tables (submission_snapshots, provenance_events, review_comments)
-- Adds missing columns to concept2cure_artifacts (approved_version_id, published_version_id, published_at)
-- Adds performance indexes
-- Idempotent: all operations use IF NOT EXISTS / IF EXISTS guards
-- Rollback: see ROLLBACK section at bottom

BEGIN;

-- ============================================================================
-- 1. Add governance columns to concept2cure_artifacts
-- ============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concept2cure_artifacts' AND column_name = 'approved_version_id'
  ) THEN
    ALTER TABLE concept2cure_artifacts ADD COLUMN approved_version_id INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concept2cure_artifacts' AND column_name = 'published_version_id'
  ) THEN
    ALTER TABLE concept2cure_artifacts ADD COLUMN published_version_id INTEGER;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'concept2cure_artifacts' AND column_name = 'published_at'
  ) THEN
    ALTER TABLE concept2cure_artifacts ADD COLUMN published_at TIMESTAMPTZ;
  END IF;
END $$;

-- ============================================================================
-- 2. Create concept2cure_provenance_events table
-- ============================================================================
CREATE TABLE IF NOT EXISTS concept2cure_provenance_events (
  id              SERIAL PRIMARY KEY,
  event_id        TEXT NOT NULL UNIQUE,
  artifact_id     INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  artifact_version_id INTEGER REFERENCES concept2cure_artifact_versions(id),
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  event_type      TEXT NOT NULL,       -- source_input, generation, transformation, edit, approval, export, placement
  event_action    TEXT NOT NULL,       -- ai_generate, human_edit, template_apply, docx_export, etc.
  actor_id        INTEGER REFERENCES users(id),
  actor_name      TEXT,
  actor_email     TEXT,
  details         JSON DEFAULT '{}',
  source_artifact_id INTEGER REFERENCES concept2cure_artifacts(id),
  source_description TEXT,
  backend_route   TEXT,
  backend_service TEXT,
  ip_address      VARCHAR(45),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_prov_artifact_idx     ON concept2cure_provenance_events(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_prov_event_type_idx   ON concept2cure_provenance_events(event_type);
CREATE INDEX IF NOT EXISTS c2c_prov_org_idx          ON concept2cure_provenance_events(organization_id);
CREATE INDEX IF NOT EXISTS c2c_prov_created_at_idx   ON concept2cure_provenance_events(created_at);

-- ============================================================================
-- 3. Create concept2cure_submission_snapshots table
-- ============================================================================
CREATE TABLE IF NOT EXISTS concept2cure_submission_snapshots (
  id                    SERIAL PRIMARY KEY,
  snapshot_id           TEXT NOT NULL UNIQUE,
  artifact_id           INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id       INTEGER NOT NULL REFERENCES organizations(id),
  version_id            INTEGER NOT NULL,
  approved_version_id   INTEGER,
  published_version_id  INTEGER,
  content_hash          TEXT NOT NULL,
  export_hash           TEXT,
  title                 TEXT NOT NULL,
  ctd_section           TEXT,
  template_id           TEXT,
  filename              TEXT,
  file_size             INTEGER,
  action_type           TEXT NOT NULL, -- publish, export-docx, export-pdf, submission-snapshot
  actor_id              INTEGER REFERENCES users(id),
  actor_name            TEXT NOT NULL,
  actor_email           TEXT,
  actor_role            TEXT,
  attestation_text      TEXT,
  signature_meaning     TEXT,
  metadata              JSON DEFAULT '{}',
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_snap_id_idx           ON concept2cure_submission_snapshots(snapshot_id);
CREATE INDEX IF NOT EXISTS c2c_snap_artifact_idx     ON concept2cure_submission_snapshots(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_snap_action_type_idx  ON concept2cure_submission_snapshots(action_type);
CREATE INDEX IF NOT EXISTS c2c_snap_org_idx          ON concept2cure_submission_snapshots(organization_id);
CREATE INDEX IF NOT EXISTS c2c_snap_created_at_idx   ON concept2cure_submission_snapshots(created_at);

-- ============================================================================
-- 4. Create concept2cure_review_comments table
-- ============================================================================
CREATE TABLE IF NOT EXISTS concept2cure_review_comments (
  id              SERIAL PRIMARY KEY,
  comment_id      TEXT NOT NULL UNIQUE,
  artifact_id     INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  version         INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'open',
  comment         TEXT NOT NULL,
  user_id         INTEGER NOT NULL REFERENCES users(id),
  user_name       TEXT NOT NULL,
  resolved_by_id  INTEGER REFERENCES users(id),
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_review_comment_artifact_idx ON concept2cure_review_comments(artifact_id);
CREATE INDEX IF NOT EXISTS c2c_review_comment_org_idx      ON concept2cure_review_comments(organization_id);

-- ============================================================================
-- 5. Additional performance indexes on existing tables
-- ============================================================================
CREATE INDEX IF NOT EXISTS c2c_artifact_org_status_idx   ON concept2cure_artifacts(organization_id, status);
CREATE INDEX IF NOT EXISTS c2c_artifact_updated_idx      ON concept2cure_artifacts(updated_at DESC);
CREATE INDEX IF NOT EXISTS c2c_sig_type_idx              ON concept2cure_signatures(signature_type);
CREATE INDEX IF NOT EXISTS c2c_versions_created_idx      ON concept2cure_artifact_versions(created_at DESC);

COMMIT;

-- ============================================================================
-- ROLLBACK (run manually if needed — DO NOT include in forward migration)
-- ============================================================================
-- BEGIN;
-- ALTER TABLE concept2cure_artifacts DROP COLUMN IF EXISTS approved_version_id;
-- ALTER TABLE concept2cure_artifacts DROP COLUMN IF EXISTS published_version_id;
-- ALTER TABLE concept2cure_artifacts DROP COLUMN IF EXISTS published_at;
-- DROP TABLE IF EXISTS concept2cure_review_comments;
-- DROP TABLE IF EXISTS concept2cure_submission_snapshots;
-- DROP TABLE IF EXISTS concept2cure_provenance_events;
-- DROP INDEX IF EXISTS c2c_artifact_org_status_idx;
-- DROP INDEX IF EXISTS c2c_artifact_updated_idx;
-- DROP INDEX IF EXISTS c2c_sig_type_idx;
-- DROP INDEX IF EXISTS c2c_versions_created_idx;
-- COMMIT;
