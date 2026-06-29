-- ============================================================================
-- Protocol Schedule-of-Assessments (SoA) matrix (Capability C2C-21)
-- ============================================================================
-- Assessments (rows) × visits (existing protocol_schedule_visits, columns), with a
-- cell marking each assessment performed at each visit. Grounded in ICH M11 / ICH
-- E6(R2) (schedule of activities). CHECK-constrained enums; governed/audited.
--
-- Schema:  shared/schema/protocol-soa.ts
-- Service: server/services/protocol-soa/*
-- Routes:  server/routes/protocol-soa.ts (/api/protocol-soa)
-- ============================================================================

CREATE TABLE IF NOT EXISTS protocol_soa_assessments (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  name                 text NOT NULL,
  category             text NOT NULL DEFAULT 'other'
                         CHECK (category IN ('lab','imaging','exam','vital_signs','pk','questionnaire','procedure','eligibility','other')),
  order_index          integer NOT NULL DEFAULT 0,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_protocol_soa_assessments_org ON protocol_soa_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_soa_assessments_doc ON protocol_soa_assessments(protocol_document_id);

CREATE TABLE IF NOT EXISTS protocol_soa_cells (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  protocol_document_id integer NOT NULL,
  assessment_id        integer NOT NULL REFERENCES protocol_soa_assessments(id),
  visit_id             integer NOT NULL,
  required             boolean NOT NULL DEFAULT true,
  notes                text,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_protocol_soa_cells_org ON protocol_soa_cells(organization_id);
CREATE INDEX IF NOT EXISTS idx_protocol_soa_cells_doc ON protocol_soa_cells(protocol_document_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_protocol_soa_cell ON protocol_soa_cells(assessment_id, visit_id);
