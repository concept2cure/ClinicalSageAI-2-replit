-- RBM Patient Profiles — patient/subject-level records for anomaly detection.
--
-- The CluePoints "Patient Profiles" idea: hold per-subject metrics (visits,
-- queries, deviations, AE counts, exposure, etc.) so central statistical
-- monitoring can flag patients whose pattern is atypical vs the study cohort.
-- Tenant-scoped via organization_id. See server/routes/mdx-rbm.ts.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS rbm_patient_profiles (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  program_id      UUID,
  site_id         TEXT,
  subject_id      TEXT NOT NULL,
  metrics         JSONB NOT NULL DEFAULT '{}'::jsonb,   -- arbitrary numeric patient metrics
  anomaly_score   NUMERIC(8,3),                          -- max |robust z| across dimensions
  top_dimension   TEXT,
  status          TEXT NOT NULL DEFAULT 'normal',        -- normal | review | flagged
  detail          TEXT,
  scored_at       TIMESTAMPTZ,
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at      TIMESTAMPTZ,
  UNIQUE (organization_id, program_id, subject_id)
);
CREATE INDEX IF NOT EXISTS rbm_patient_profiles_org_idx         ON rbm_patient_profiles (organization_id);
CREATE INDEX IF NOT EXISTS rbm_patient_profiles_org_program_idx ON rbm_patient_profiles (organization_id, program_id);
CREATE INDEX IF NOT EXISTS rbm_patient_profiles_status_idx      ON rbm_patient_profiles (organization_id, status);
