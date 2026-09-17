-- ============================================================================
-- ARCHIVED 2026-09-10 (WO-1, ADR-0006) — NO APPLIER RUNS THIS FILE.
-- ============================================================================
-- It is in none of C2C_MIGRATION_FILES (deploy-migrate), the root migrations/
-- overlay, PRE_OVERLAY_CREATORS, AUTHORING_SUBSYSTEM_FILES, or the *_gcc_*
-- tree. The only glob that would match it belongs to scripts/db_migrate.sh,
-- which has no automated caller.
--
-- Defined a second time here: concept2cure_submission_snapshots, concept2cure_review_comments
-- Real creator: shared/schema.ts via drizzle-kit push
--
-- Verified against a database built from empty by
-- scripts/db/provision-test-db.sh before archiving: nothing this file
-- uniquely creates was present, and every ALTER ... ADD COLUMN target it
-- carries already exists. Full reasoning, and why that check is mandatory
-- rather than a formality, in db/migrations/_legacy/README.md
-- (see the 2026-09-10 section).
-- ============================================================================

-- =============================================================================
-- Migration: concept2cure_submission_snapshots + Phase 9/10 column additions
-- Date: 2026-03-13
-- Purpose: Immutable submission/export snapshot records, Phase 9 version tracking
-- =============================================================================

-- =============================================================================
-- 1) Phase 9: Add version-tracking columns to concept2cure_artifacts (if missing)
-- =============================================================================

ALTER TABLE concept2cure_artifacts
  ADD COLUMN IF NOT EXISTS approved_version_id INTEGER,
  ADD COLUMN IF NOT EXISTS published_version_id INTEGER,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMP;

-- =============================================================================
-- 2) Phase 10: Create concept2cure_submission_snapshots table
-- =============================================================================

CREATE TABLE IF NOT EXISTS concept2cure_submission_snapshots (
  id SERIAL PRIMARY KEY,
  snapshot_id TEXT NOT NULL UNIQUE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  -- Version state at time of action
  version_id INTEGER NOT NULL,
  approved_version_id INTEGER,
  published_version_id INTEGER,
  -- Integrity hashes
  content_hash TEXT NOT NULL,
  export_hash TEXT,
  -- Document identity at time of snapshot
  title TEXT NOT NULL,
  ctd_section TEXT,
  template_id TEXT,
  -- File details (for export snapshots)
  filename TEXT,
  file_size INTEGER,
  -- Action classification
  action_type TEXT NOT NULL, -- publish, export-docx, export-pdf, submission-snapshot
  -- Actor attribution
  actor_id INTEGER REFERENCES users(id),
  actor_name TEXT NOT NULL,
  actor_email TEXT,
  actor_role TEXT,
  -- Attestation (for publish/approve actions)
  attestation_text TEXT,
  signature_meaning TEXT,
  -- Immutable metadata payload
  metadata JSON DEFAULT '{}',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- 3) Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS c2c_snap_id_idx
  ON concept2cure_submission_snapshots(snapshot_id);

CREATE INDEX IF NOT EXISTS c2c_snap_artifact_idx
  ON concept2cure_submission_snapshots(artifact_id);

CREATE INDEX IF NOT EXISTS c2c_snap_action_type_idx
  ON concept2cure_submission_snapshots(action_type);

CREATE INDEX IF NOT EXISTS c2c_snap_org_idx
  ON concept2cure_submission_snapshots(organization_id);

CREATE INDEX IF NOT EXISTS c2c_snap_created_at_idx
  ON concept2cure_submission_snapshots(created_at);

-- =============================================================================
-- 4) Phase 10: Create concept2cure_review_comments table (if missing)
-- =============================================================================

CREATE TABLE IF NOT EXISTS concept2cure_review_comments (
  id SERIAL PRIMARY KEY,
  comment_id TEXT NOT NULL UNIQUE,
  artifact_id INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  version INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  comment TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id),
  user_name TEXT NOT NULL,
  resolved_by_id INTEGER REFERENCES users(id),
  resolved_at TIMESTAMP,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_review_comment_artifact_idx
  ON concept2cure_review_comments(artifact_id);

CREATE INDEX IF NOT EXISTS c2c_review_comment_org_idx
  ON concept2cure_review_comments(organization_id);
