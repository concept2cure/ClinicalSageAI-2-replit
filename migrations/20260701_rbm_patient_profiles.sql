-- RBM Patient Profiles — patient/subject-level records for anomaly detection.
--
-- The CluePoints "Patient Profiles" idea: hold per-subject metrics (visits,
-- queries, deviations, AE counts, exposure, etc.) so central statistical
-- monitoring can flag patients whose pattern is atypical vs the study cohort.
-- Tenant-scoped via organization_id. See server/routes/mdx-rbm.ts.
--
-- Idempotent: safe to re-run.
-- 2026-11-06: Drizzle bootstrap could create this table without the inline
-- UNIQUE below; CREATE TABLE IF NOT EXISTS then left both existing upserts
-- without an arbiter (42P10). Repair the same intended identity on replay,
-- preserving all rows and the original NULL-distinct program semantics.

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

CREATE UNIQUE INDEX IF NOT EXISTS rbm_patient_profiles_organization_id_program_id_subject_id_key
  ON rbm_patient_profiles (organization_id, program_id, subject_id);

-- IF NOT EXISTS must not accept an unrelated, invalid or deferred named index.
-- This catalog-check shape is shared with the existing review/sharing repairs.
DO $patient_profile_identity$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_index i
     WHERE i.indexrelid = to_regclass('rbm_patient_profiles_organization_id_program_id_subject_id_key')
       AND i.indrelid = 'rbm_patient_profiles'::regclass
       AND i.indisunique AND i.indisvalid AND i.indisready AND i.indimmediate
       AND NOT i.indisexclusion AND NOT i.indnullsnotdistinct
       AND i.indpred IS NULL AND i.indexprs IS NULL AND i.indnkeyatts = 3
       AND ARRAY['organization_id', 'program_id', 'subject_id']::text[] <@ ARRAY(
         SELECT a.attname::text
           FROM unnest(i.indkey) WITH ORDINALITY AS k(attnum, ord)
           JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.attnum
          WHERE k.ord <= i.indnkeyatts
       )
  ) THEN
    RAISE EXCEPTION 'RBM patient profile identity requires reconciliation; existing rows and index definitions were retained.';
  END IF;
END
$patient_profile_identity$;
