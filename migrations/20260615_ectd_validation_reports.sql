-- External eCTD validation reports — durable, per-sequence records.
--
-- Persists the normalized result of each external-validator run (the
-- ExternalValidationReport shape) for a submission sequence, so the dispatch
-- path can fold the latest report's error count into the hard gate and so a
-- program's validation history is auditable.
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- sequence_id because the service queries are org-scoped and per-sequence.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS submission_validation_reports (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER NOT NULL,
  submission_id     INTEGER NOT NULL,
  sequence_id       INTEGER NOT NULL,
  validator_name    TEXT NOT NULL,
  validator_version TEXT NOT NULL,
  error_count       INTEGER NOT NULL DEFAULT 0,
  warning_count     INTEGER NOT NULL DEFAULT 0,
  report            JSONB NOT NULL,
  created_by        INTEGER,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submission_validation_reports_org_idx ON submission_validation_reports (organization_id);
CREATE INDEX IF NOT EXISTS submission_validation_reports_sequence_idx ON submission_validation_reports (sequence_id);
