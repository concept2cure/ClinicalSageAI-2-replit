-- Regulatory Graph Foundation
-- Migration: 20260429_regulatory_graph.sql
--
-- Adds first-class entities for the regulatory knowledge graph:
--   device_claims            — every regulatory claim about a device
--   submission_sections      — canonical section identity per program
--   regulatory_standards     — catalog of consensus standards (ISO/IEC/AAMI/etc.)
--   standards_applicability  — per-program decision: does standard X apply?
--
-- Hangs off existing tables (regulatory_programs, evidence_objects, evidence_links)
-- introduced by shared/schema/programs.ts.
--
-- Compliance touch points:
--   - 21 CFR Part 11 §11.10(b),(c),(e)  immutable audit + traceable evidence
--   - EU MDR Annex II                    technical documentation traceability
--   - ISO 13485:2016 §4.2.4              control of records
--
-- All tables are organization-scoped; all timestamps use timestamptz semantics
-- via `timestamp` ... defaultNow() (matches drizzle pattern in this repo).

-- ═══════════════════════════════════════════════════════════════════════════════
-- DEVICE CLAIMS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS device_claims (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          integer NOT NULL,
  program_id               uuid REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  code                     varchar(80) NOT NULL,
  version                  integer NOT NULL DEFAULT 1,

  claim_text               text NOT NULL,
  claim_type               text NOT NULL,
  source_document          text,
  source_path              text,

  population               text,
  anatomical_site          text,
  use_environment          text,

  status                   text NOT NULL DEFAULT 'proposed',
  superseded_by_claim_id   uuid,

  risk_level               text,
  risk_rationale           text,

  metadata                 json,
  tags                     json DEFAULT '[]'::json,

  created_by               text,
  updated_by               text,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS device_claims_org_idx
  ON device_claims (organization_id);
CREATE INDEX IF NOT EXISTS device_claims_program_idx
  ON device_claims (program_id);
CREATE INDEX IF NOT EXISTS device_claims_type_idx
  ON device_claims (claim_type);
CREATE INDEX IF NOT EXISTS device_claims_status_idx
  ON device_claims (status);
CREATE UNIQUE INDEX IF NOT EXISTS device_claims_code_version_idx
  ON device_claims (organization_id, code, version);

-- ═══════════════════════════════════════════════════════════════════════════════
-- SUBMISSION SECTIONS
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS submission_sections (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             integer NOT NULL,
  program_id                  uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  parent_section_id           uuid,
  section_code                varchar(80) NOT NULL,
  section_name                text NOT NULL,
  ordering                    integer DEFAULT 0,

  framework                   text NOT NULL,
  required_evidence_types     json DEFAULT '[]'::json,
  optional_evidence_types     json DEFAULT '[]'::json,
  is_required                 boolean NOT NULL DEFAULT true,

  status                      text NOT NULL DEFAULT 'not_started',

  metadata                    json,

  created_by                  text,
  updated_by                  text,
  created_at                  timestamp NOT NULL DEFAULT now(),
  updated_at                  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS submission_sections_program_idx
  ON submission_sections (program_id);
CREATE INDEX IF NOT EXISTS submission_sections_framework_idx
  ON submission_sections (framework);
CREATE INDEX IF NOT EXISTS submission_sections_parent_idx
  ON submission_sections (parent_section_id);
CREATE UNIQUE INDEX IF NOT EXISTS submission_sections_code_idx
  ON submission_sections (program_id, framework, section_code);

-- ═══════════════════════════════════════════════════════════════════════════════
-- REGULATORY STANDARDS CATALOG
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS regulatory_standards (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  code                          varchar(80) NOT NULL,
  title                         text NOT NULL,
  sdo                           varchar(32) NOT NULL,
  version                       varchar(32),
  published_at                  timestamp,

  domain                        text NOT NULL,
  applies_to                    json DEFAULT '[]'::json,

  fda_recognition_number        varchar(32),
  fda_recognized                boolean DEFAULT false,
  eu_harmonized                 boolean DEFAULT false,
  jurisdictions                 json DEFAULT '[]'::json,

  status                        text NOT NULL DEFAULT 'active',
  superseded_by_standard_id     uuid,
  withdrawn_at                  timestamp,
  effective_at                  timestamp,

  source_url                    text,
  summary                       text,

  metadata                      json,

  created_at                    timestamp NOT NULL DEFAULT now(),
  updated_at                    timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS regulatory_standards_code_idx
  ON regulatory_standards (code);
CREATE INDEX IF NOT EXISTS regulatory_standards_sdo_idx
  ON regulatory_standards (sdo);
CREATE INDEX IF NOT EXISTS regulatory_standards_domain_idx
  ON regulatory_standards (domain);
CREATE INDEX IF NOT EXISTS regulatory_standards_status_idx
  ON regulatory_standards (status);

-- ═══════════════════════════════════════════════════════════════════════════════
-- STANDARDS APPLICABILITY
-- ═══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS standards_applicability (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id          integer NOT NULL,
  program_id               uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  standard_id              uuid NOT NULL REFERENCES regulatory_standards(id) ON DELETE RESTRICT,

  applicability            text NOT NULL,
  rationale                text,

  conformance_method       text,
  conformance_status       text NOT NULL DEFAULT 'not_started',

  primary_evidence_id      uuid REFERENCES evidence_objects(id) ON DELETE SET NULL,
  gap_description          text,

  decided_by               text,
  decided_at               timestamp,
  reviewed_by              text,
  reviewed_at              timestamp,

  metadata                 json,

  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS standards_applicability_program_idx
  ON standards_applicability (program_id);
CREATE INDEX IF NOT EXISTS standards_applicability_standard_idx
  ON standards_applicability (standard_id);
CREATE INDEX IF NOT EXISTS standards_applicability_status_idx
  ON standards_applicability (conformance_status);
CREATE UNIQUE INDEX IF NOT EXISTS standards_applicability_pair_idx
  ON standards_applicability (program_id, standard_id);
