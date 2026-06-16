-- TMF artifact filings — durable per-trial log of filed DIA TMF Reference Model
-- artifact CODES, powering the code-based completeness checker. Distinct from
-- the richer etmf.ts tmf_artifacts registry. One row per (org, trial, code).
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS tmf_artifact_filings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  INTEGER NOT NULL,
  trial_id         TEXT NOT NULL,
  artifact_code    TEXT NOT NULL,
  zone_number      INTEGER,
  document_ref     TEXT,
  created_by       INTEGER,
  filed_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tmf_artifact_filings_unique UNIQUE (organization_id, trial_id, artifact_code)
);

CREATE INDEX IF NOT EXISTS tmf_artifact_filings_org_idx ON tmf_artifact_filings (organization_id);
CREATE INDEX IF NOT EXISTS tmf_artifact_filings_trial_idx ON tmf_artifact_filings (trial_id);
