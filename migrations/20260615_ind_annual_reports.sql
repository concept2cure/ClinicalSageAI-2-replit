-- IND annual reports (21 CFR 312.33) — durable, per-submission records.
--
-- Each IND Annual Report / DSUR is tracked as a draft so an RA team can follow
-- it draft -> filed, see the open-gap count, and surface ones whose 60-day
-- anniversary deadline has passed. The section model is stored; sequence_id is
-- set when filed as an `annual` eCTD sequence.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- submission_id because the service queries are org-scoped and per-submission.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_annual_reports (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        INTEGER NOT NULL,
  submission_id          INTEGER NOT NULL,
  ind_number             TEXT NOT NULL,
  product_name           TEXT NOT NULL,
  reporting_period_start TIMESTAMPTZ,
  reporting_period_end   TIMESTAMPTZ,
  due_date               TIMESTAMPTZ,
  status                 TEXT NOT NULL DEFAULT 'draft',
  sequence_id            INTEGER,
  filed_at               TIMESTAMPTZ,
  gap_count              INTEGER NOT NULL DEFAULT 0,
  model                  JSONB NOT NULL,
  created_by             INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ind_annual_reports_org_idx ON ind_annual_reports (organization_id);
CREATE INDEX IF NOT EXISTS ind_annual_reports_submission_idx ON ind_annual_reports (submission_id);
