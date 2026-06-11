-- ============================================================================
-- Research Compliance — shared foundation (roster + training-gating)
-- ============================================================================
-- The shared personnel roster + per-person training/clearance records that gate
-- committee approvals ("no index until trained") and feed the compliance-
-- checklist reasoning engine. CITI / OLAW / NIH biosafety / GCP grounding.
-- Schema:  shared/schema/research-compliance.ts
-- Service: server/services/research-compliance/*
-- Routes:  server/routes/research-compliance.ts (/api/research-compliance)
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_personnel (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  user_id         integer REFERENCES users(id),
  full_name       text NOT NULL,
  email           text,
  role            text NOT NULL CHECK (role IN ('principal_investigator','co_investigator','coordinator','research_staff','veterinarian','biosafety_officer','other')),
  institution     text,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_research_personnel_org ON research_personnel(organization_id);

CREATE TABLE IF NOT EXISTS personnel_training (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  personnel_id    integer NOT NULL REFERENCES research_personnel(id),
  training_type   text NOT NULL CHECK (training_type IN
                    ('citi_human_subjects','citi_gcp','citi_animal','citi_rcr','biosafety','bloodborne_pathogens','iata_shipping','hipaa','fcoi_disclosure','other')),
  completed_date  date,
  expires_date    date,
  certificate_ref text,
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_personnel_training_org       ON personnel_training(organization_id);
CREATE INDEX IF NOT EXISTS idx_personnel_training_personnel ON personnel_training(personnel_id);
