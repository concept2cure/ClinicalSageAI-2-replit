-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Lumen Cortex — FDA Shadow Review + eCTD Integrity Layer
-- Compliance: 21 CFR Part 11 (auditability, traceability), ALCOA+ principles
-- Purpose: Invention disclosures and the Bayh-Dole reporting clock
--          (35 U.S.C. 200-212, 37 CFR 401.14).
--
-- eCTD/CTD Context:
--   - Module(s): none (technology-transfer record; no CTD placement)
--   - Integrity Risk Addressed: an unchecked funding source stored as "not
--     federally funded"
--
-- Notes:
--   - In C2C_MIGRATION_FILES: re-runs on every deploy (CLAUDE.md RULE 1).
--   - Idempotent (IF NOT EXISTS throughout; the amendment below is conditional).
-- =============================================================================
-- ─── AMENDED 2026-10-15 — federal_funding is tri-state ──────────────────────
-- It was `boolean NOT NULL DEFAULT false` and the service wrote `=== true`, so a
-- disclosure whose funding source nobody had checked was stored as "not
-- federally funded" and the Bayh-Dole compliance picture reported every
-- 37 CFR 401.14 obligation 'not_applicable' for it. Now nullable with no
-- default: NULL = not yet determined, which the compliance logic reports as
-- applicability 'undetermined'. The CREATE declares that; the conditional block
-- after it drops NOT NULL and the default on a database created before this
-- amendment. Amended in place, not a DROP: nothing is removed and nothing
-- re-creates the old shape. Stored `false` values are kept — one written before
-- this change cannot be told from a recorded "no".
-- ─────────────────────────────────────────────────────────────────────────────
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
  federal_funding   boolean,  -- NULL = not yet determined (2026-10-15)
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

-- 2026-10-15: a database created before the amendment above still has NOT NULL
-- DEFAULT false here. Conditional on the live shape, so it is a no-op (and takes
-- no lock) on every deploy after the first.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = current_schema() AND table_name = 'invention_disclosures'
       AND column_name = 'federal_funding'
       AND (is_nullable = 'NO' OR column_default IS NOT NULL)
  ) THEN
    ALTER TABLE invention_disclosures ALTER COLUMN federal_funding DROP DEFAULT;
    ALTER TABLE invention_disclosures ALTER COLUMN federal_funding DROP NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_invention_disclosures_org      ON invention_disclosures(organization_id);
CREATE INDEX IF NOT EXISTS idx_invention_disclosures_proposal ON invention_disclosures(grant_proposal_id);
CREATE INDEX IF NOT EXISTS idx_invention_disclosures_status   ON invention_disclosures(status);
