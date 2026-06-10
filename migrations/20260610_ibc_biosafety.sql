-- ============================================================================
-- IBC / Biosafety (Capability C2C-07)
-- ============================================================================
--
-- Institutional Biosafety Committee registration of recombinant/synthetic
-- nucleic acid research, biological agents, and containment — the clearance that
-- gates modality-heavy programs (cell & gene therapy, mRNA, viral vectors). An
-- approved registration threads biosafety clearance to the IND-enabling record
-- via provenance_links.
--
-- Grounded in the NIH Guidelines for Research Involving Recombinant or Synthetic
-- Nucleic Acid Molecules and the CDC/NIH BMBL (BSL-1..4; risk groups RG1..4).
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/ibc.ts
-- Service: server/services/ibc/*
-- Routes:  server/routes/ibc.ts (/api/ibc)
-- ============================================================================

-- ─── Registrations ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ibc_registrations (
  id                           serial PRIMARY KEY,
  organization_id              integer NOT NULL REFERENCES organizations(id),
  submission_id                integer REFERENCES submissions(id),
  registration_number          text NOT NULL,
  title                        text NOT NULL,
  nih_guidelines_section       text NOT NULL DEFAULT 'not_applicable' CHECK (nih_guidelines_section IN
                                 ('III-A','III-B','III-C','III-D','III-E','III-F','exempt','not_applicable')),
  biosafety_level              text NOT NULL DEFAULT 'BSL-1' CHECK (biosafety_level IN ('BSL-1','BSL-2','BSL-3','BSL-4')),
  involves_recombinant_dna     boolean NOT NULL DEFAULT false,
  involves_human_gene_transfer boolean NOT NULL DEFAULT false,
  status                       text NOT NULL DEFAULT 'draft' CHECK (status IN
                                 ('draft','submitted','under_review','approved','conditional','disapproved','expired','closed')),
  approval_date                date,
  expiration_date              date,
  created_by                   integer NOT NULL REFERENCES users(id),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  deleted_at                   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ibc_registrations_org        ON ibc_registrations(organization_id);
CREATE INDEX IF NOT EXISTS idx_ibc_registrations_submission ON ibc_registrations(submission_id);

-- ─── Biological agents ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ibc_biological_agents (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  registration_id integer NOT NULL REFERENCES ibc_registrations(id),
  agent_name      text NOT NULL,
  agent_type      text NOT NULL CHECK (agent_type IN ('virus','bacterium','fungus','toxin','viral_vector','cell_line','recombinant_construct','other')),
  risk_group      text NOT NULL CHECK (risk_group IN ('RG1','RG2','RG3','RG4')),
  required_bsl    text NOT NULL CHECK (required_bsl IN ('BSL-1','BSL-2','BSL-3','BSL-4')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ibc_agents_org          ON ibc_biological_agents(organization_id);
CREATE INDEX IF NOT EXISTS idx_ibc_agents_registration ON ibc_biological_agents(registration_id);

-- ─── Determinations ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ibc_reviews (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  registration_id    integer NOT NULL REFERENCES ibc_registrations(id),
  outcome            text NOT NULL CHECK (outcome IN ('approved','conditional','disapproved','tabled')),
  convened_quorum    boolean NOT NULL DEFAULT false,
  conditions         text,
  determination_date date,
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ibc_reviews_org          ON ibc_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_ibc_reviews_registration ON ibc_reviews(registration_id);
