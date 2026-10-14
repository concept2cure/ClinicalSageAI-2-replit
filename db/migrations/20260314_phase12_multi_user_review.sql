-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure — governed artifact review and submission evidence
-- Compliance context: 21 CFR Part 11 auditability and traceability;
--                     ALCOA+ record integrity principles
-- Purpose: Make recorded review assignments and decisions available on the
--          durable deployment path while preserving historical identities.
--
-- eCTD/CTD Context:
--   - Module(s): cross-cutting artifact review and submission evidence
--   - Integrity Risk Addressed: missing review prerequisites, tenant isolation,
--     ambiguous record identities and invented historical update timestamps
--
-- Determinism Contract:
--   - Preserve artifact pointers, assignment/decision identities and tenant keys.
--   - Verify required columns and unique identities; refuse unresolved stores.
--   - Unknown historical updated_at remains NULL; defaults affect future inserts.
--
-- Notes:
--   - Creator statements are idempotent; existing records are not backfilled.
--   - This header documents control intent, not regulatory qualification.
-- =============================================================================

-- Phase 12: Multi-User Review Operations
-- Creates review_assignments and review_decisions tables for team-based review workflows.
-- Applied: 2026-03-14
-- 2026-10-14 durable prerequisite reconciliation: preserve all historical rows.
-- Add nullable updated_at without a backfill; only future inserts get now().
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
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMP
);

CREATE INDEX IF NOT EXISTS c2c_review_decision_artifact_idx
  ON concept2cure_review_decisions (artifact_id, review_round);
CREATE INDEX IF NOT EXISTS c2c_review_decision_assignment_idx
  ON concept2cure_review_decisions (assignment_id);
CREATE INDEX IF NOT EXISTS c2c_review_decision_reviewer_idx
  ON concept2cure_review_decisions (reviewer_id);
CREATE INDEX IF NOT EXISTS c2c_review_decision_org_idx
  ON concept2cure_review_decisions (organization_id);

-- Unknown historical update time remains NULL. SET DEFAULT changes only
-- subsequent inserts; deployment must not timestamp old reviewer decisions.
ALTER TABLE concept2cure_review_decisions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP;
ALTER TABLE concept2cure_review_decisions
  ALTER COLUMN updated_at SET DEFAULT NOW();

-- A declared/pushed or older table may already exist. Validate required
-- columns and semantic unique identities; do not rewrite retained stores,
-- historical timestamps, index names or CHECK constraints to force parity.
DO $current_store_contract$
DECLARE requirement RECORD;
BEGIN
  FOR requirement IN
    SELECT * FROM (VALUES
      ('public.concept2cure_review_assignments', ARRAY['id', 'assignment_id', 'artifact_id', 'organization_id', 'reviewer_id', 'assigned_by_id', 'review_round', 'status', 'due_date', 'notes', 'created_at', 'updated_at']::text[]),
      ('public.concept2cure_review_decisions', ARRAY['id', 'decision_id', 'assignment_id', 'artifact_id', 'organization_id', 'reviewer_id', 'review_round', 'decision', 'comment', 'version_reviewed', 'created_at', 'updated_at']::text[])
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
      RAISE EXCEPTION 'Artifact review store requires reconciliation; retained rows and schema were not repaired.';
    END IF;
  END LOOP;

  FOR requirement IN
    SELECT * FROM (VALUES
      ('public.concept2cure_review_assignments', ARRAY['id']::text[]),
      ('public.concept2cure_review_assignments', ARRAY['assignment_id']::text[]),
      ('public.concept2cure_review_assignments', ARRAY['artifact_id', 'reviewer_id', 'review_round']::text[]),
      ('public.concept2cure_review_decisions', ARRAY['id']::text[]),
      ('public.concept2cure_review_decisions', ARRAY['decision_id']::text[])
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
      RAISE EXCEPTION 'Artifact review store requires reconciliation; retained rows and schema were not repaired.';
    END IF;
  END LOOP;
END
$current_store_contract$;

COMMIT;

-- ── ROLLBACK (uncomment to reverse) ──────────────────────────────────────────
-- DROP TABLE IF EXISTS concept2cure_review_decisions CASCADE;
-- DROP TABLE IF EXISTS concept2cure_review_assignments CASCADE;
