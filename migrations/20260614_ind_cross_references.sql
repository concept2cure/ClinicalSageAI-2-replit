-- IND cross-references — the external files (DMF / IND / NDA / BLA) an IND
-- depends on (eCTD Module 1.4), with Letter-of-Authorization coverage.
--
-- The cross-reference register + LOA-coverage QC is computed from these rows so
-- an RA team has a live, per-submission view of which external dependencies are
-- not yet authorized (and therefore not reviewable by FDA).
--
-- Tenant column is the canonical integer organization_id; indexed on it and on
-- submission_id because the service queries are org-scoped and per-submission.
-- UUID PK matches the IND domain style.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_cross_references (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id        INTEGER NOT NULL,
  submission_id          INTEGER NOT NULL,
  referenced_file_type   TEXT NOT NULL,
  referenced_file_number TEXT NOT NULL,
  subject_name           TEXT NOT NULL,
  authorized_sections    JSONB NOT NULL DEFAULT '[]'::jsonb,
  loa_on_file            BOOLEAN NOT NULL DEFAULT FALSE,
  loa_leaf_section       TEXT,
  created_by             INTEGER,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ind_cross_references_org_idx ON ind_cross_references (organization_id);
CREATE INDEX IF NOT EXISTS ind_cross_references_submission_idx ON ind_cross_references (submission_id);
