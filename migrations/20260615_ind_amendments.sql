-- IND amendments (21 CFR 312.30 / 312.31) — durable, per-submission records.
--
-- Each protocol/information amendment plan is tracked as a draft so an RA team
-- has an auditable history of every amendment (draft -> filed), its classes,
-- planned leaves and advisory warnings. Event-driven (no deadline), so no
-- overdue feed; sequence_id is set when filed as an amendment eCTD sequence.
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
