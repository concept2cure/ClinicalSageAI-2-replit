-- IND master-data registries: sponsor, US agent, investigator.
--
-- Reusable org-scoped master data the IND assembly flow (FDA Form 1571 / 1572)
-- draws from so the same sponsor, US agent (21 CFR 312.3), and investigator
-- records are not re-keyed per submission.
--
--   ind_sponsors           — IND sponsor + Form 1571 signatory block.
--   ind_regulatory_agents  — US agent for a foreign sponsor (21 CFR 312.3).
--   ind_investigators      — clinical investigators (Form 1572): site, IRB, sub-Is.
--
-- Tenant column is the canonical integer organization_id; each table is indexed
-- on it because every service query is org-scoped. UUID PKs match the q-sub
-- domain style.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ind_sponsors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL,
  address_line1   TEXT,
  address_line2   TEXT,
  city            VARCHAR(128),
  state_province  VARCHAR(128),
  postal_code     VARCHAR(32),
  country         VARCHAR(64),
  contact_name    TEXT,
  contact_phone   VARCHAR(64),
  contact_email   VARCHAR(256),
  duns            VARCHAR(16),
  signatory_name  TEXT,
  signatory_title TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      INTEGER
);

CREATE INDEX IF NOT EXISTS ind_sponsors_org_idx ON ind_sponsors (organization_id);

CREATE TABLE IF NOT EXISTS ind_regulatory_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id INTEGER NOT NULL,
  name            TEXT NOT NULL,
  address_line1   TEXT,
  address_line2   TEXT,
  city            VARCHAR(128),
  state_province  VARCHAR(128),
  postal_code     VARCHAR(32),
  country         VARCHAR(64),
  contact_name    TEXT,
  contact_phone   VARCHAR(64),
  contact_email   VARCHAR(256),
  is_us_agent     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      INTEGER
);

CREATE INDEX IF NOT EXISTS ind_regulatory_agents_org_idx ON ind_regulatory_agents (organization_id);

CREATE TABLE IF NOT EXISTS ind_investigators (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   INTEGER NOT NULL,
  first_name        TEXT NOT NULL,
  last_name         TEXT NOT NULL,
  credentials       VARCHAR(128),
  site_name         TEXT,
  site_address      TEXT,
  irb_name          TEXT,
  irb_address       TEXT,
  cv_document_ref   TEXT,
  phone             VARCHAR(64),
  email             VARCHAR(256),
  sub_investigators JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        INTEGER
);

CREATE INDEX IF NOT EXISTS ind_investigators_org_idx ON ind_investigators (organization_id);
