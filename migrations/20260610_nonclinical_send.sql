-- ============================================================================
-- Nonclinical Study Management + SEND (Capability C2C-04)
-- ============================================================================
--
-- A GOVERNED, submission-linked nonclinical study registry + CDISC SEND dataset
-- packaging. Distinct from ctd_nonclinical_studies (the AI-extraction landing
-- zone): this is the curated, audited record linking a study to its authorizing
-- IACUC protocol and forward into CTD Module 4. Closes "GLP tox data
-- disconnected from submission; SEND built late."
--
-- Grounded in ICH M4 (Module 4), ICH S-series, the CDISC SENDIG, and the FDA
-- Study Data Technical Conformance Guide. Tenancy/audit mirror the platform;
-- status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/nonclinical.ts
-- Service: server/services/nonclinical/*
-- Routes:  server/routes/nonclinical.ts (/api/nonclinical)
-- ============================================================================

-- ─── Studies ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS nonclinical_studies (
  id                    serial PRIMARY KEY,
  organization_id       integer NOT NULL REFERENCES organizations(id),
  submission_id         integer REFERENCES submissions(id),
  iacuc_protocol_id     integer REFERENCES iacuc_protocols(id),
  study_number          text NOT NULL,
  title                 text NOT NULL,
  study_type            text NOT NULL CHECK (study_type IN
                          ('single_dose_tox','repeat_dose_tox','safety_pharmacology','genotoxicity',
                           'carcinogenicity','reproductive_tox','local_tolerance','adme_pk','immunotoxicity','other')),
  species               text,
  glp_compliant         boolean NOT NULL DEFAULT false,
  testing_facility      text,
  noael                 text,
  status                text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_life','in_reporting','finalized','cancelled')),
  ctd_section           text,
  report_finalized_date date,
  created_by            integer NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_nonclinical_studies_org        ON nonclinical_studies(organization_id);
CREATE INDEX IF NOT EXISTS idx_nonclinical_studies_submission ON nonclinical_studies(submission_id);
CREATE INDEX IF NOT EXISTS idx_nonclinical_studies_iacuc      ON nonclinical_studies(iacuc_protocol_id);

-- ─── SEND datasets ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS send_datasets (
  id                       serial PRIMARY KEY,
  organization_id          integer NOT NULL REFERENCES organizations(id),
  study_id                 integer NOT NULL REFERENCES nonclinical_studies(id),
  sendig_version           text NOT NULL DEFAULT '3.1',
  domains_present          text[] NOT NULL DEFAULT '{}',
  define_xml_present        boolean NOT NULL DEFAULT false,
  nsdrc_present            boolean NOT NULL DEFAULT false,
  validation_status        text NOT NULL DEFAULT 'not_validated' CHECK (validation_status IN ('not_validated','passed','warnings','errors')),
  validator_error_count    integer NOT NULL DEFAULT 0,
  validator_warning_count  integer NOT NULL DEFAULT 0,
  created_by               integer NOT NULL REFERENCES users(id),
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now(),
  deleted_at               timestamptz
);
CREATE INDEX IF NOT EXISTS idx_send_datasets_org   ON send_datasets(organization_id);
CREATE INDEX IF NOT EXISTS idx_send_datasets_study ON send_datasets(study_id);
