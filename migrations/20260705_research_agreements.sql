-- ============================================================================
-- Research Agreements — MTA / DUA / CDA (Capability C2C-27)
-- ============================================================================
--
-- Material Transfer, Data Use and Confidential Disclosure agreements for moving
-- materials or data into/out of the institution. Tracks type, direction, parties,
-- the material/data described, and the compliance flags that gate execution — most
-- importantly PHI handling under HIPAA (a DUA with a limited data set per
-- 45 CFR 164.514(e), or de-identification per 164.514(b)).
--
-- Soft-links to grant_proposals(id) and protocol_documents(id) (nullable, no FK).
-- CHECK-constrained enums; governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/research-agreements.ts
-- Service: server/services/research-agreements/*
-- Routes:  server/routes/research-agreements.ts (/api/research-agreements)
-- ============================================================================

CREATE TABLE IF NOT EXISTS research_agreements (
  id                          serial PRIMARY KEY,
  organization_id             integer NOT NULL REFERENCES organizations(id),
  grant_proposal_id           integer,
  protocol_document_id        integer,
  agreement_type              text NOT NULL DEFAULT 'mta' CHECK (agreement_type IN ('mta','dua','cda')),
  direction                   text NOT NULL DEFAULT 'incoming' CHECK (direction IN ('incoming','outgoing')),
  title                       text NOT NULL,
  our_party                   text,
  other_party                 text NOT NULL,
  material_or_data_description text,
  contains_phi                boolean NOT NULL DEFAULT false,
  contains_human_data         boolean NOT NULL DEFAULT false,
  is_deidentified             boolean NOT NULL DEFAULT false,
  limited_data_set            boolean NOT NULL DEFAULT false,
  ip_rights_terms             text,
  publication_rights          boolean NOT NULL DEFAULT true,
  status                      text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','negotiation','executed','expired','terminated')),
  effective_date              date,
  expiration_date             date,
  executed_by                 integer REFERENCES users(id),
  executed_at                 timestamptz,
  created_by                  integer NOT NULL REFERENCES users(id),
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  deleted_at                  timestamptz
);
CREATE INDEX IF NOT EXISTS idx_research_agreements_org      ON research_agreements(organization_id);
CREATE INDEX IF NOT EXISTS idx_research_agreements_proposal ON research_agreements(grant_proposal_id);
CREATE INDEX IF NOT EXISTS idx_research_agreements_status   ON research_agreements(status);
