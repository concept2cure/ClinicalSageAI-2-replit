-- ============================================================================
-- NIH Biosketch builder (Capability C2C-24B)
-- ============================================================================
--
-- A section-based NIH biosketch for a senior/key person, composed of the required
-- sections of the NIH biosketch format (FORMS-H): A. Personal Statement;
-- B. Positions, Scientific Appointments & Honors; C. Contributions to Science.
-- Each section is tracked for whether it has been addressed + its content so
-- completeness can be scored before the biosketch is finalized. Soft-links to
-- research_personnel(id) via personnel_id and grant_proposals(id) via
-- grant_proposal_id (nullable, no FK).
--
-- CHECK-constrained status/type enums; governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/biosketch.ts
-- Service: server/services/biosketch/*
-- Routes:  server/routes/biosketch.ts (/api/biosketch)
-- ============================================================================

CREATE TABLE IF NOT EXISTS biosketches (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  personnel_id      integer,
  grant_proposal_id integer,
  person_name       text NOT NULL,
  biosketch_type    text NOT NULL DEFAULT 'nih' CHECK (biosketch_type IN ('nih','nsf','other')),
  status            text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','in_development','in_review','final')),
  finalized_by      integer REFERENCES users(id),
  finalized_at      timestamptz,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_biosketches_org       ON biosketches(organization_id);
CREATE INDEX IF NOT EXISTS idx_biosketches_personnel ON biosketches(personnel_id);
CREATE INDEX IF NOT EXISTS idx_biosketches_proposal  ON biosketches(grant_proposal_id);

CREATE TABLE IF NOT EXISTS biosketch_sections (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  biosketch_id      integer NOT NULL REFERENCES biosketches(id),
  section_key       text NOT NULL,
  title             text NOT NULL,
  content           text,
  addressed         boolean NOT NULL DEFAULT false,
  order_index       integer NOT NULL DEFAULT 0,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_biosketch_sections_org ON biosketch_sections(organization_id);
CREATE INDEX IF NOT EXISTS idx_biosketch_sections_bio ON biosketch_sections(biosketch_id);
