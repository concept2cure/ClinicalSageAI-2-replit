-- ============================================================================
-- Inspection Readiness (BIMO / PAI) (Capability C2C-13)
-- ============================================================================
--
-- Mock-inspection prep + live-inspection management: inspections (FDA BIMO/PAI,
-- EMA GCP/GMP), Form FDA 483 observations + responses (15-business-day clock),
-- per-area readiness assessments. Closes "no mock-inspection workflow; 483
-- responses ad hoc".
--
-- Grounded in the FDA BIMO program, pre-approval inspections, Form 483 / EIR
-- practice, and EMA GCP/GMP. Tenancy/audit mirror the platform; status/type
-- columns are CHECK-constrained.
--
-- Schema:  shared/schema/inspection.ts
-- Service: server/services/inspection/*
-- Routes:  server/routes/inspections.ts (/api/inspections)
-- ============================================================================

CREATE TABLE IF NOT EXISTS inspections (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  inspection_type text NOT NULL CHECK (inspection_type IN ('bimo','pai','gcp','gmp','routine','for_cause','other')),
  agency          text NOT NULL CHECK (agency IN ('fda','ema','mhra','pmda','other')),
  site_name       text NOT NULL,
  scheduled_date  date,
  start_date      date,
  end_date        date,
  status          text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','closed')),
  outcome         text NOT NULL DEFAULT 'pending' CHECK (outcome IN ('pending','nai','vai','oai')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_inspections_org ON inspections(organization_id);

CREATE TABLE IF NOT EXISTS inspection_findings (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  inspection_id      integer NOT NULL REFERENCES inspections(id),
  observation_number integer NOT NULL,
  description        text NOT NULL,
  classification     text NOT NULL DEFAULT 'observation' CHECK (classification IN ('critical','major','minor','observation')),
  status             text NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded','closed')),
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_org        ON inspection_findings(organization_id);
CREATE INDEX IF NOT EXISTS idx_inspection_findings_inspection ON inspection_findings(inspection_id);

CREATE TABLE IF NOT EXISTS finding_responses (
  id                   serial PRIMARY KEY,
  organization_id      integer NOT NULL REFERENCES organizations(id),
  finding_id           integer NOT NULL REFERENCES inspection_findings(id),
  response_description text NOT NULL,
  due_date             date,
  status               text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','accepted','rejected')),
  submitted_date       date,
  created_by           integer NOT NULL REFERENCES users(id),
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  deleted_at           timestamptz
);
CREATE INDEX IF NOT EXISTS idx_finding_responses_org     ON finding_responses(organization_id);
CREATE INDEX IF NOT EXISTS idx_finding_responses_finding ON finding_responses(finding_id);

CREATE TABLE IF NOT EXISTS readiness_assessments (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  inspection_id   integer REFERENCES inspections(id),
  area            text NOT NULL,
  status          text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started','in_progress','ready','at_risk')),
  gaps            text,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_readiness_assessments_org        ON readiness_assessments(organization_id);
CREATE INDEX IF NOT EXISTS idx_readiness_assessments_inspection ON readiness_assessments(inspection_id);
