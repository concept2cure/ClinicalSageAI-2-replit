-- ============================================================================
-- AI-native eTMF (Capability C2C-08)
-- ============================================================================
--
-- Trial Master File management against the DIA TMF Reference Model: a per-study
-- container and its classified artifacts (zone/section/artifact), with a
-- completeness gap-check feeding inspection readiness.
--
-- Grounded in the DIA TMF Reference Model (11 zones) and ICH E6(R2) §8.
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/etmf.ts
-- Service: server/services/etmf/*
-- Routes:  server/routes/etmf.ts (/api/etmf)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tmf_files (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  study_id        integer REFERENCES clinical_studies(id),
  title           text NOT NULL,
  tmf_model       text NOT NULL DEFAULT 'dia_rm_v3',
  status          text NOT NULL DEFAULT 'active' CHECK (status IN ('active','archived','locked')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tmf_files_org   ON tmf_files(organization_id);
CREATE INDEX IF NOT EXISTS idx_tmf_files_study ON tmf_files(study_id);

CREATE TABLE IF NOT EXISTS tmf_artifacts (
  id                    serial PRIMARY KEY,
  organization_id       integer NOT NULL REFERENCES organizations(id),
  tmf_file_id           integer NOT NULL REFERENCES tmf_files(id),
  zone                  integer NOT NULL CHECK (zone BETWEEN 1 AND 11),
  section               text,
  artifact_name         text NOT NULL,
  expected              boolean NOT NULL DEFAULT true,
  completeness_required boolean NOT NULL DEFAULT true,
  status                text NOT NULL DEFAULT 'expected' CHECK (status IN ('expected','received','in_review','final','missing','not_applicable')),
  document_date         date,
  created_by            integer NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_tmf_artifacts_org  ON tmf_artifacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_tmf_artifacts_file ON tmf_artifacts(tmf_file_id);
