-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: IBC biosafety registrations, biological agents and determinations
--          (NIH Guidelines, BMBL).
--
-- eCTD/CTD Context:
--   - Module(s): Module 4 (biosafety clearance threaded via provenance_links)
--   - Integrity Risk Addressed: an unanswered NIH Guidelines category,
--     gene-transfer or recombinant-DNA question, or an undeclared containment
--     level, stored as an answer
--
-- Notes:
--   - Install-fresh overlay only; not in C2C_MIGRATION_FILES.
--   - Idempotent (IF NOT EXISTS throughout; the amendments below are conditional).
-- =============================================================================
-- ─── AMENDED 2026-10-15 — nih_guidelines_section and
-- involves_human_gene_transfer are tri-state ─────────────────────────────────
-- They were NOT NULL DEFAULT 'not_applicable' / false and the writers sent the
-- same defaults, so a registration nobody had categorised was stored as "not
-- applicable" and "no gene transfer", and the convened-IBC review requirement
-- (NIH Guidelines III-A/B/C, human gene transfer) was reported as not required.
-- Now nullable with no default: NULL = not recorded, which ibc-logic.ts reports
-- as not assessed. The CREATE declares that; the conditional block below drops
-- NOT NULL and the defaults wherever this file runs on a table created before
-- the amendment. Nothing is dropped; stored values are kept.
-- ─── AMENDED AGAIN 2026-10-15 — biosafety_level and involves_recombinant_dna
-- are not recorded until stated ──────────────────────────────────────────────
-- biosafety_level was NOT NULL DEFAULT 'BSL-1': a declared containment nobody
-- declared, which the containment gate compared against the agents.
-- involves_recombinant_dna was NOT NULL DEFAULT false and the service wrote
-- `=== true`, so an unanswered question was stored as "no". Both are now
-- nullable with no default (NULL = not declared / not recorded; the gate
-- reports the containment check as not assessed), by the same CREATE change
-- and the same conditional block, which now covers all four columns. Likewise
-- ibc_reviews.convened_quorum (NOT NULL DEFAULT false, written `=== true`, so a
-- determination nobody described read as made without a convened quorum),
-- relaxed by its own conditional block after that CREATE.
-- migrations/20261015h_ibc_unrecorded_facts_nullable.sql does the same on
-- deployed databases. Nothing is dropped; stored values are kept.
-- ─────────────────────────────────────────────────────────────────────────────
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
  -- NULL = not recorded / not declared (2026-10-15), for all four of these.
  nih_guidelines_section       text CHECK (nih_guidelines_section IN
                                 ('III-A','III-B','III-C','III-D','III-E','III-F','exempt','not_applicable')),
  biosafety_level              text CHECK (biosafety_level IN ('BSL-1','BSL-2','BSL-3','BSL-4')),
  involves_recombinant_dna     boolean,
  involves_human_gene_transfer boolean,
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

-- 2026-10-15: a table created before the amendments above still has NOT NULL and
-- the defaults here (on all four columns, or on the last two only). Conditional
-- on the live shape, so a re-run is a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'ibc_registrations'
       AND column_name IN ('nih_guidelines_section', 'involves_human_gene_transfer', 'biosafety_level', 'involves_recombinant_dna')
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE ibc_registrations ALTER COLUMN nih_guidelines_section DROP DEFAULT;
    ALTER TABLE ibc_registrations ALTER COLUMN nih_guidelines_section DROP NOT NULL;
    ALTER TABLE ibc_registrations ALTER COLUMN involves_human_gene_transfer DROP DEFAULT;
    ALTER TABLE ibc_registrations ALTER COLUMN involves_human_gene_transfer DROP NOT NULL;
    ALTER TABLE ibc_registrations ALTER COLUMN biosafety_level DROP DEFAULT;
    ALTER TABLE ibc_registrations ALTER COLUMN biosafety_level DROP NOT NULL;
    ALTER TABLE ibc_registrations ALTER COLUMN involves_recombinant_dna DROP DEFAULT;
    ALTER TABLE ibc_registrations ALTER COLUMN involves_recombinant_dna DROP NOT NULL;
  END IF;
END $$;

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
  convened_quorum    boolean,  -- NULL = not recorded (2026-10-15)
  conditions         text,
  determination_date date,
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_ibc_reviews_org          ON ibc_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_ibc_reviews_registration ON ibc_reviews(registration_id);

-- 2026-10-15: a table created before the amendment above still has NOT NULL and
-- the default on convened_quorum. Conditional on the live shape.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'ibc_reviews' AND column_name = 'convened_quorum'
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE ibc_reviews ALTER COLUMN convened_quorum DROP DEFAULT;
    ALTER TABLE ibc_reviews ALTER COLUMN convened_quorum DROP NOT NULL;
  END IF;
END $$;
