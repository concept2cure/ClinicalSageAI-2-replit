-- ============================================================================
-- Clinical Investigator Financial Disclosure — 21 CFR 54 (Capability C2C-01)
-- + generic ALCOA+ provenance spine seed (Capability C2C-02).
-- ============================================================================
--
-- Captures investigator financial disclosures and drives the Module 1 forms:
--   Form FDA 3454 — Certification (no disclosable financial interests)
--   Form FDA 3455 — Disclosure (of financial interests / arrangements)
-- The four disclosable-interest categories follow 21 CFR 54.2(a)/(b)/(c)/(f);
-- the disclosure period follows 54.4 (study + 1 year).
--
-- provenance_links is a GENERIC spine: source record -> target record with a
-- role (e.g. financial_disclosure -> submission_module1, role 'supports'). FCOI
-- is its first consumer; the full ALCOA+ spine builds on top later.
--
-- Tenancy/audit mirror the platform: organization_id + created_by + created_at/
-- updated_at/deleted_at on every table; every FK and organization_id indexed;
-- status/type columns CHECK-constrained, never bare TEXT.
--
-- Schema:  shared/schema/financial-disclosures.ts
-- Service: server/services/financial-disclosures/*
-- Routes:  server/routes/financial-disclosures.ts (/api/financial-disclosures)
-- ============================================================================

-- ─── Investigators ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clinical_investigators (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  full_name        text NOT NULL,
  role             text NOT NULL CHECK (role IN ('principal_investigator','sub_investigator','coordinator','other')),
  institution      text,
  study_id         integer REFERENCES clinical_studies(id),
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_clinical_investigators_org   ON clinical_investigators(organization_id);
CREATE INDEX IF NOT EXISTS idx_clinical_investigators_study ON clinical_investigators(study_id);

-- ─── Financial disclosures ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS financial_disclosures (
  id                        serial PRIMARY KEY,
  organization_id           integer NOT NULL REFERENCES organizations(id),
  investigator_id           integer NOT NULL REFERENCES clinical_investigators(id),
  submission_id             integer REFERENCES submissions(id),
  disclosure_period_start   date,
  disclosure_period_end     date,
  has_disclosable_interests boolean NOT NULL DEFAULT false,
  form_type                 text NOT NULL CHECK (form_type IN ('FDA_3454','FDA_3455')),
  status                    text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','certified','signed','superseded')),
  certification_statement   text,
  content_hash              text,
  signed_by                 integer REFERENCES users(id),
  signed_at                 timestamptz,
  signature_meaning         text,
  created_by                integer NOT NULL REFERENCES users(id),
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  deleted_at                timestamptz,
  -- 3454 = no interests, 3455 = interests: keep form_type consistent with the flag.
  CONSTRAINT chk_fcoi_form_matches_flag CHECK (
    (has_disclosable_interests = false AND form_type = 'FDA_3454') OR
    (has_disclosable_interests = true  AND form_type = 'FDA_3455')
  )
);
CREATE INDEX IF NOT EXISTS idx_financial_disclosures_org          ON financial_disclosures(organization_id);
CREATE INDEX IF NOT EXISTS idx_financial_disclosures_investigator ON financial_disclosures(investigator_id);
CREATE INDEX IF NOT EXISTS idx_financial_disclosures_submission   ON financial_disclosures(submission_id);

-- ─── Disclosure interests (only present on a 3455) ──────────────────────────
CREATE TABLE IF NOT EXISTS disclosure_interests (
  id                            serial PRIMARY KEY,
  organization_id               integer NOT NULL REFERENCES organizations(id),
  disclosure_id                 integer NOT NULL REFERENCES financial_disclosures(id),
  interest_type                 text NOT NULL CHECK (interest_type IN
                                  ('COMPENSATION_BY_OUTCOME','EQUITY_INTEREST','PROPRIETARY_INTEREST','SIGNIFICANT_PAYMENTS')),
  description                   text NOT NULL,
  monetary_value                numeric(14,2),
  arrangements_to_minimize_bias text,
  created_by                    integer NOT NULL REFERENCES users(id),
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now(),
  deleted_at                    timestamptz
);
CREATE INDEX IF NOT EXISTS idx_disclosure_interests_org        ON disclosure_interests(organization_id);
CREATE INDEX IF NOT EXISTS idx_disclosure_interests_disclosure ON disclosure_interests(disclosure_id);

-- ─── Generic provenance spine seed (C2C-02) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS provenance_links (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  source_type      text NOT NULL,
  source_id        integer NOT NULL,
  target_type      text NOT NULL,
  target_id        integer NOT NULL,
  link_role        text NOT NULL,
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_provenance_links_org    ON provenance_links(organization_id);
CREATE INDEX IF NOT EXISTS idx_provenance_links_source ON provenance_links(source_type, source_id);
CREATE INDEX IF NOT EXISTS idx_provenance_links_target ON provenance_links(target_type, target_id);
