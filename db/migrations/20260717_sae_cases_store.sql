-- Safety-narrative SAE case store — the ICH E3 §16 individual-case worklist
-- (expedited-reporting clock + subject/event facts) backing the v2
-- SafetyNarrative surface's GET read. The narrative composer stays a pure,
-- deterministic client/service function. Org-scoped, FK-free, schema-only,
-- idempotent. Nested/array facts (event, medical history, con-meds) are held
-- as JSONB so the row rehydrates straight into the surface's SaeCase shape.

CREATE TABLE IF NOT EXISTS c2c_sae_cases (
  id                TEXT    NOT NULL,
  organization_id   INTEGER NOT NULL,
  due               TEXT,
  clock             TEXT,
  due_days          INTEGER,
  subject_id        TEXT,
  age               INTEGER,
  sex               TEXT,
  study_id          TEXT,
  treatment_arm     TEXT,
  study_drug        TEXT,
  dose              TEXT,
  first_dose_date   TEXT,
  medical_history   JSONB NOT NULL DEFAULT '[]'::jsonb,
  concomitant_meds  JSONB NOT NULL DEFAULT '[]'::jsonb,
  event             JSONB NOT NULL DEFAULT '{}'::jsonb,
  PRIMARY KEY (organization_id, id)
);
