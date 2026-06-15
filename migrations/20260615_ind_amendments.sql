-- IND amendments (21 CFR 312.30 / 312.31) — durable, per-submission records.
--
-- Each planned protocol (312.30) or information (312.31) amendment is tracked as
-- a draft so an RA team can follow it draft -> filed and see the planned-leaf and
-- advisory counts. The full amendment plan is stored; sequence_id is set when the
-- amendment is filed as an `amendment` eCTD sequence.
--
-- Unlike safety / annual reports, an amendment is event-driven (no statutory
-- clock), so there is no due_date / overdue feed here.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- submission_id because the service queries are org-scoped and per-submission.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_amendments (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER NOT NULL,
  submission_id     INTEGER NOT NULL,
  ind_number        TEXT NOT NULL,
  project_id        TEXT NOT NULL,
  amendment_classes JSONB NOT NULL DEFAULT '[]'::jsonb,
  status            TEXT NOT NULL DEFAULT 'draft',
  sequence_id       INTEGER,
  filed_at          TIMESTAMPTZ,
  leaf_count        INTEGER NOT NULL DEFAULT 0,
  warning_count     INTEGER NOT NULL DEFAULT 0,
  plan              JSONB NOT NULL,
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ind_amendments_org_idx ON ind_amendments (organization_id);
CREATE INDEX IF NOT EXISTS ind_amendments_submission_idx ON ind_amendments (submission_id);
