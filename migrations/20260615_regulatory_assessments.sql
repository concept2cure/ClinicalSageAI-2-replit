-- Regulatory assessments — durable, per-program records of RI/CDISC/eTMF verdicts.
--
-- Persists a point-in-time result of a deterministic assessment (strategy brief,
-- CDISC package readiness, TMF completeness, market readiness, …) so a program
-- has an auditable history of its regulatory posture. Append-only by convention.
--
-- Tenant column is the canonical integer organization_id; indexed on it, on
-- submission_id and on assessment_type because the service queries are
-- org-scoped, per-submission and per-type.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS regulatory_assessments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  INTEGER NOT NULL,
  submission_id    INTEGER NOT NULL,
  assessment_type  TEXT NOT NULL,
  ready            BOOLEAN,
  summary          JSONB NOT NULL DEFAULT '{}'::jsonb,
  result           JSONB NOT NULL,
  created_by       INTEGER,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS regulatory_assessments_org_idx ON regulatory_assessments (organization_id);
CREATE INDEX IF NOT EXISTS regulatory_assessments_submission_idx ON regulatory_assessments (submission_id);
CREATE INDEX IF NOT EXISTS regulatory_assessments_type_idx ON regulatory_assessments (assessment_type);
