-- ============================================================================
-- Export Control review (ITAR / EAR / OFAC) (Capability C2C-26)
-- ============================================================================
--
-- Export-control screening for research: classify a project under ITAR (22 CFR
-- 120–130), EAR (15 CFR 730–774) or OFAC, decide whether the Fundamental Research
-- Exclusion applies (15 CFR 734.8 / NSDD-189), and determine whether an export
-- (including a deemed export to a foreign national) requires a license. The legal
-- determination is computed deterministically; rationale text is advisory.
--
-- Soft-links to grant_proposals(id) via grant_proposal_id (nullable, no FK).
-- CHECK-constrained enums; governed + audited under 'protocol_development'.
--
-- Schema:  shared/schema/export-control.ts
-- Service: server/services/export-control/*
-- Routes:  server/routes/export-control.ts (/api/export-control)
-- ============================================================================

CREATE TABLE IF NOT EXISTS export_control_reviews (
  id                             serial PRIMARY KEY,
  organization_id                integer NOT NULL REFERENCES organizations(id),
  grant_proposal_id              integer,
  project_title                  text NOT NULL,
  description                    text,
  jurisdiction                   text NOT NULL DEFAULT 'pending' CHECK (jurisdiction IN ('itar','ear','ofac','not_subject','pending')),
  classification                 text,
  involves_foreign_nationals     boolean NOT NULL DEFAULT false,
  foreign_countries              text,
  fundamental_research_exclusion boolean NOT NULL DEFAULT false,
  has_publication_restrictions   boolean NOT NULL DEFAULT false,
  has_proprietary_restrictions   boolean NOT NULL DEFAULT false,
  involves_physical_export       boolean NOT NULL DEFAULT false,
  license_required               text NOT NULL DEFAULT 'unknown' CHECK (license_required IN ('yes','no','unknown')),
  determination_rationale        text,
  status                         text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','under_review','determined','expired')),
  determined_by                  integer REFERENCES users(id),
  determined_at                  timestamptz,
  created_by                     integer NOT NULL REFERENCES users(id),
  created_at                     timestamptz NOT NULL DEFAULT now(),
  updated_at                     timestamptz NOT NULL DEFAULT now(),
  deleted_at                     timestamptz
);
CREATE INDEX IF NOT EXISTS idx_export_control_reviews_org      ON export_control_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_export_control_reviews_proposal ON export_control_reviews(grant_proposal_id);
CREATE INDEX IF NOT EXISTS idx_export_control_reviews_status   ON export_control_reviews(status);
