-- Phase 12: Multi-User Review Operations
-- Creates review_assignments and review_decisions tables for team-based review workflows.
-- Applied: 2026-03-14
-- Rollback: DROP TABLE statements at bottom (commented out)

BEGIN;

-- 1. Review Assignments — who must review this artifact
CREATE TABLE IF NOT EXISTS concept2cure_review_assignments (
  id              SERIAL PRIMARY KEY,
  assignment_id   TEXT NOT NULL UNIQUE,
  artifact_id     INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  reviewer_id     INTEGER NOT NULL REFERENCES users(id),
  assigned_by_id  INTEGER NOT NULL REFERENCES users(id),
  review_round    INTEGER NOT NULL DEFAULT 1,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','in_progress','completed','withdrawn')),
  due_date        TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate assignments for same artifact+reviewer+round
CREATE UNIQUE INDEX IF NOT EXISTS c2c_review_assign_unique
  ON concept2cure_review_assignments (artifact_id, reviewer_id, review_round);

CREATE INDEX IF NOT EXISTS c2c_review_assign_artifact_idx
  ON concept2cure_review_assignments (artifact_id);
CREATE INDEX IF NOT EXISTS c2c_review_assign_reviewer_idx
  ON concept2cure_review_assignments (reviewer_id, status);
CREATE INDEX IF NOT EXISTS c2c_review_assign_org_idx
  ON concept2cure_review_assignments (organization_id);

-- 2. Review Decisions — each reviewer's formal decision
CREATE TABLE IF NOT EXISTS concept2cure_review_decisions (
  id              SERIAL PRIMARY KEY,
  decision_id     TEXT NOT NULL UNIQUE,
  assignment_id   INTEGER NOT NULL REFERENCES concept2cure_review_assignments(id) ON DELETE CASCADE,
  artifact_id     INTEGER NOT NULL REFERENCES concept2cure_artifacts(id) ON DELETE CASCADE,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  reviewer_id     INTEGER NOT NULL REFERENCES users(id),
  review_round    INTEGER NOT NULL,
  decision        TEXT NOT NULL
                    CHECK (decision IN ('approve','request_changes','reject')),
  comment         TEXT,
  version_reviewed INTEGER NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS c2c_review_decision_artifact_idx
  ON concept2cure_review_decisions (artifact_id, review_round);
CREATE INDEX IF NOT EXISTS c2c_review_decision_assignment_idx
  ON concept2cure_review_decisions (assignment_id);
CREATE INDEX IF NOT EXISTS c2c_review_decision_reviewer_idx
  ON concept2cure_review_decisions (reviewer_id);
CREATE INDEX IF NOT EXISTS c2c_review_decision_org_idx
  ON concept2cure_review_decisions (organization_id);

COMMIT;

-- ── ROLLBACK (uncomment to reverse) ──────────────────────────────────────────
-- DROP TABLE IF EXISTS concept2cure_review_decisions CASCADE;
-- DROP TABLE IF EXISTS concept2cure_review_assignments CASCADE;
