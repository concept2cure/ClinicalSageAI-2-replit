-- IND dispatch-readiness snapshots.
--
-- A point-in-time record of a sequence's dispatch-gate verdict so a program's
-- go/no-go history is auditable over time. Append-only by convention.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- sequence_id because the service queries are org-scoped and per-sequence. UUID
-- PK matches the IND master-data domain style.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_dispatch_snapshots (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  submission_id   INTEGER NOT NULL,
  sequence_id     INTEGER NOT NULL,
  sequence_number TEXT NOT NULL,
  can_dispatch    BOOLEAN NOT NULL,
  blocker_count   INTEGER NOT NULL DEFAULT 0,
  warning_count   INTEGER NOT NULL DEFAULT 0,
  blocker_codes   JSONB NOT NULL DEFAULT '[]'::jsonb,
  verdict         JSONB NOT NULL,
  created_by      INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ind_dispatch_snapshots_org_idx ON ind_dispatch_snapshots (organization_id);
CREATE INDEX IF NOT EXISTS ind_dispatch_snapshots_seq_idx ON ind_dispatch_snapshots (sequence_id);
