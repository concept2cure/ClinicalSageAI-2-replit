-- ============================================================================
-- Invention Disclosure / Technology Transfer (Capability C2C-25)
-- ============================================================================
--
-- The tech-transfer lifecycle: a researcher discloses an invention to the TTO,
-- which evaluates it, elects title, pursues patenting, and tracks commercialization.
-- For federally-funded inventions the Bayh-Dole Act (35 U.S.C. §200–212, 37 CFR 401)
-- imposes a reporting timeline computed by the deterministic logic.
--
-- Soft-links to grant_proposals(id) via grant_proposal_id (nullable, no FK).
-- CHECK-constrained status enum; governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/invention-disclosure.ts
-- Service: server/services/invention-disclosure/*
-- Routes:  server/routes/invention-disclosure.ts (/api/invention-disclosures)
-- ============================================================================

CREATE TABLE IF NOT EXISTS invention_disclosures (
  id                serial PRIMARY KEY,
  organization_id   integer NOT NULL REFERENCES organizations(id),
  grant_proposal_id integer,
  title             text NOT NULL,
  inventors         text,
  funding_source    text,
  federal_funding   boolean NOT NULL DEFAULT false,
  federal_award     text,
  disclosure_date   date,
  election_date     date,
  status            text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','elected','patent_filed','licensed','released','abandoned')),
  decision_rationale text,
  reviewed_by       integer REFERENCES users(id),
  reviewed_at       timestamptz,
  created_by        integer NOT NULL REFERENCES users(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  deleted_at        timestamptz
);
CREATE INDEX IF NOT EXISTS idx_invention_disclosures_org      ON invention_disclosures(organization_id);
CREATE INDEX IF NOT EXISTS idx_invention_disclosures_proposal ON invention_disclosures(grant_proposal_id);
CREATE INDEX IF NOT EXISTS idx_invention_disclosures_status   ON invention_disclosures(status);
