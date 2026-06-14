-- IND safety reports (21 CFR 312.32) — durable, per-submission records.
--
-- Each expedited IND Safety Report (7-/15-day) is tracked as a draft so a PV/RA
-- team can follow it draft -> filed and surface overdue ones. The obligation,
-- deadline and document model are stored; sequence_id is set when filed.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- submission_id because the service queries are org-scoped and per-submission.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_safety_reports (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       INTEGER NOT NULL,
  submission_id         INTEGER NOT NULL,
  adverse_event_id      TEXT NOT NULL,
  obligation            TEXT NOT NULL,
  reporting_window_days INTEGER,
  deadline              TIMESTAMPTZ,
  regulatory_basis      TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'draft',
  sequence_id           INTEGER,
  filed_at              TIMESTAMPTZ,
  classification        JSONB NOT NULL,
  document              JSONB NOT NULL,
  created_by            INTEGER,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ind_safety_reports_org_idx ON ind_safety_reports (organization_id);
CREATE INDEX IF NOT EXISTS ind_safety_reports_submission_idx ON ind_safety_reports (submission_id);
