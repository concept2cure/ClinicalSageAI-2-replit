-- IVDR aggregate stores — back the MDX/IVD analytics surfaces.
--
-- Routes (server/routes/ivdr-routes.ts, workspace-summary.ts) + the demo seed
-- (scripts/seed/ga-demo.d/60-mdx-aggregates.mjs) were shipped, but these tables
-- were never created by a migration in the runner's tree, so the surfaces fell
-- back to fixtures. Columns derived from the seed INSERTs + the route SQL.

CREATE TABLE IF NOT EXISTS ivdr_analytical_validations (
  id                serial PRIMARY KEY,
  classification_id integer NOT NULL,
  device_name       text NOT NULL,
  analyte_name      text,
  validation_type   text,
  status            text,
  lod               numeric,
  loq               numeric,
  precision_cv      numeric,
  sensitivity       numeric,
  specificity       numeric,
  organization_id   integer NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ivdr_analytical_validations_org ON ivdr_analytical_validations (organization_id);

CREATE TABLE IF NOT EXISTS ivdr_clinical_evidence (
  id                     serial PRIMARY KEY,
  classification_id      integer NOT NULL,
  study_title            text,
  study_type             text,
  sample_size            integer,
  true_positive          integer,
  false_positive         integer,
  true_negative          integer,
  false_negative         integer,
  calculated_sensitivity numeric,
  calculated_specificity numeric,
  calculated_ppv         numeric,
  calculated_npv         numeric,
  calculated_accuracy    numeric,
  status                 text,
  organization_id        integer NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ivdr_clinical_evidence_org ON ivdr_clinical_evidence (organization_id);

CREATE TABLE IF NOT EXISTS ivdr_gspr_assessments (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL,
  project_id      uuid NOT NULL,
  device_name     text NOT NULL,
  classification  text,
  requirements    jsonb,
  created_by      text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ivdr_gspr_assessments_org ON ivdr_gspr_assessments (organization_id);
CREATE INDEX IF NOT EXISTS idx_ivdr_gspr_assessments_project ON ivdr_gspr_assessments (organization_id, project_id);
