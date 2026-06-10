-- ============================================================================
-- IACUC / Animal Study Governance (Capability C2C-05)
-- ============================================================================
--
-- Institutional Animal Care and Use Committee protocols, animal census,
-- committee review/determinations, amendments, and semi-annual facility
-- inspections. The IACUC protocol is the origin node of the preclinical
-- provenance chain (→ nonclinical studies → Module 4), threaded via
-- provenance_links by the service.
--
-- Grounded in PHS Policy on Humane Care and Use of Laboratory Animals, the
-- Animal Welfare Act (9 CFR Ch. I), NIH OLAW, and USDA pain categories B-E.
-- Tenancy/audit mirror the platform; status/type columns are CHECK-constrained.
--
-- Schema:  shared/schema/iacuc.ts
-- Service: server/services/iacuc/*
-- Routes:  server/routes/iacuc.ts (/api/iacuc)
-- ============================================================================

-- ─── Protocols ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iacuc_protocols (
  id                    serial PRIMARY KEY,
  organization_id       integer NOT NULL REFERENCES organizations(id),
  submission_id         integer REFERENCES submissions(id),
  protocol_number       text NOT NULL,
  title                 text NOT NULL,
  pain_category         text NOT NULL CHECK (pain_category IN ('B','C','D','E')),
  review_type           text CHECK (review_type IN ('designated_member_review','full_committee_review')),
  status                text NOT NULL DEFAULT 'draft' CHECK (status IN
                          ('draft','submitted','dmr','fcr','approved','conditional','tabled','withdrawn','expired')),
  three_rs_replacement  text,
  three_rs_reduction    text,
  three_rs_refinement   text,
  pain_justification    text,
  approval_date         date,
  expiration_date       date,
  created_by            integer NOT NULL REFERENCES users(id),
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  deleted_at            timestamptz
);
CREATE INDEX IF NOT EXISTS idx_iacuc_protocols_org        ON iacuc_protocols(organization_id);
CREATE INDEX IF NOT EXISTS idx_iacuc_protocols_submission ON iacuc_protocols(submission_id);

-- ─── Animal cohorts (census / management) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS iacuc_animal_cohorts (
  id               serial PRIMARY KEY,
  organization_id  integer NOT NULL REFERENCES organizations(id),
  protocol_id      integer NOT NULL REFERENCES iacuc_protocols(id),
  species          text NOT NULL,
  strain           text,
  planned_count    integer NOT NULL DEFAULT 0,
  housed_count     integer NOT NULL DEFAULT 0,
  pain_category    text NOT NULL CHECK (pain_category IN ('B','C','D','E')),
  housing_location text,
  status           text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested','approved','housed','completed')),
  created_by       integer NOT NULL REFERENCES users(id),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  deleted_at       timestamptz
);
CREATE INDEX IF NOT EXISTS idx_iacuc_cohorts_org      ON iacuc_animal_cohorts(organization_id);
CREATE INDEX IF NOT EXISTS idx_iacuc_cohorts_protocol ON iacuc_animal_cohorts(protocol_id);

-- ─── Committee reviews / determinations ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS iacuc_reviews (
  id                 serial PRIMARY KEY,
  organization_id    integer NOT NULL REFERENCES organizations(id),
  protocol_id        integer NOT NULL REFERENCES iacuc_protocols(id),
  review_type        text NOT NULL CHECK (review_type IN ('designated_member_review','full_committee_review')),
  reviewer_count     integer NOT NULL DEFAULT 1,
  outcome            text NOT NULL CHECK (outcome IN ('approved','conditional','tabled','withdrawn')),
  conditions         text,
  determination_date date,
  created_by         integer NOT NULL REFERENCES users(id),
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);
CREATE INDEX IF NOT EXISTS idx_iacuc_reviews_org      ON iacuc_reviews(organization_id);
CREATE INDEX IF NOT EXISTS idx_iacuc_reviews_protocol ON iacuc_reviews(protocol_id);

-- ─── Amendments ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS iacuc_amendments (
  id              serial PRIMARY KEY,
  organization_id integer NOT NULL REFERENCES organizations(id),
  protocol_id     integer NOT NULL REFERENCES iacuc_protocols(id),
  description     text NOT NULL,
  significant     boolean NOT NULL DEFAULT false,
  status          text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','approved','rejected')),
  created_by      integer NOT NULL REFERENCES users(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_iacuc_amendments_org      ON iacuc_amendments(organization_id);
CREATE INDEX IF NOT EXISTS idx_iacuc_amendments_protocol ON iacuc_amendments(protocol_id);

-- ─── Semi-annual facility inspections (PHS Policy IV.B.1-2) ──────────────────
CREATE TABLE IF NOT EXISTS iacuc_facility_inspections (
  id                           serial PRIMARY KEY,
  organization_id              integer NOT NULL REFERENCES organizations(id),
  facility_name                text NOT NULL,
  inspection_date              date,
  status                       text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','completed')),
  findings                     text,
  deficiency_count             integer NOT NULL DEFAULT 0,
  significant_deficiency_count integer NOT NULL DEFAULT 0,
  created_by                   integer NOT NULL REFERENCES users(id),
  created_at                   timestamptz NOT NULL DEFAULT now(),
  updated_at                   timestamptz NOT NULL DEFAULT now(),
  deleted_at                   timestamptz
);
CREATE INDEX IF NOT EXISTS idx_iacuc_inspections_org ON iacuc_facility_inspections(organization_id);
