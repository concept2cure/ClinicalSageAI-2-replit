-- GSPR + Post-Market authoring foundation
-- Migration: 20260429_gspr_postmarket.sql

CREATE TABLE IF NOT EXISTS gspr_requirements (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regulation               varchar(16) NOT NULL,
  annex                    varchar(16) NOT NULL DEFAULT 'I',
  chapter                  varchar(8),
  clause                   varchar(32) NOT NULL,
  title                    text NOT NULL,
  summary                  text,
  device_class_scope       text[],
  product_type_scope       text[],
  is_implantable_only      boolean DEFAULT false,
  is_sterile_only          boolean DEFAULT false,
  related_standards        text[],
  status                   varchar(16) NOT NULL DEFAULT 'active',
  metadata                 json,
  created_at               timestamp NOT NULL DEFAULT now(),
  updated_at               timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS gspr_req_reg_clause_idx
  ON gspr_requirements (regulation, annex, clause);
CREATE INDEX IF NOT EXISTS gspr_req_regulation_idx ON gspr_requirements (regulation);
CREATE INDEX IF NOT EXISTS gspr_req_chapter_idx    ON gspr_requirements (chapter);
CREATE INDEX IF NOT EXISTS gspr_req_status_idx     ON gspr_requirements (status);

CREATE TABLE IF NOT EXISTS gspr_program_mappings (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id             integer NOT NULL,
  program_id                  uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,
  requirement_id              uuid NOT NULL REFERENCES gspr_requirements(id) ON DELETE RESTRICT,

  applicability               varchar(24) NOT NULL,
  rationale                   text,

  primary_evidence_id         uuid REFERENCES evidence_objects(id) ON DELETE SET NULL,
  method_of_demonstration     text,

  conformance_status          varchar(24) NOT NULL DEFAULT 'not_started',
  gap_description             text,

  decided_by                  text,
  decided_at                  timestamp,
  reviewed_by                 text,
  reviewed_at                 timestamp,

  metadata                    json,

  created_at                  timestamp NOT NULL DEFAULT now(),
  updated_at                  timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS gspr_map_program_idx     ON gspr_program_mappings (program_id);
CREATE INDEX IF NOT EXISTS gspr_map_requirement_idx ON gspr_program_mappings (requirement_id);
CREATE INDEX IF NOT EXISTS gspr_map_status_idx      ON gspr_program_mappings (conformance_status);
CREATE UNIQUE INDEX IF NOT EXISTS gspr_map_pair_idx
  ON gspr_program_mappings (program_id, requirement_id);

CREATE TABLE IF NOT EXISTS post_market_documents (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id               integer NOT NULL,
  program_id                    uuid NOT NULL REFERENCES regulatory_programs(id) ON DELETE CASCADE,

  document_type                 varchar(32) NOT NULL,

  code                          varchar(64) NOT NULL,
  version                       integer NOT NULL DEFAULT 1,
  previous_document_id          uuid,

  title                         text NOT NULL,
  device_subject_name           text,

  reporting_period_start        timestamp,
  reporting_period_end          timestamp,

  content                       json,

  summary                       text,
  risks_identified              text,
  benefit_risk_conclusion       text,

  status                        varchar(32) NOT NULL DEFAULT 'draft',
  locked                        boolean NOT NULL DEFAULT false,
  approved_by                   text,
  approved_at                   timestamp,
  signature_id                  uuid,

  related_cer_report_id         integer,
  related_predicate_k_number    varchar(32),

  metadata                      json,

  created_by                    text,
  updated_by                    text,
  created_at                    timestamp NOT NULL DEFAULT now(),
  updated_at                    timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS post_market_program_idx ON post_market_documents (program_id);
CREATE INDEX IF NOT EXISTS post_market_org_idx     ON post_market_documents (organization_id);
CREATE INDEX IF NOT EXISTS post_market_type_idx    ON post_market_documents (document_type);
CREATE INDEX IF NOT EXISTS post_market_status_idx  ON post_market_documents (status);
CREATE UNIQUE INDEX IF NOT EXISTS post_market_code_version_idx
  ON post_market_documents (organization_id, program_id, document_type, code, version);
