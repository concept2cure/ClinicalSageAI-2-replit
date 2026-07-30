-- eSTAR client registration.
--
-- Persists a client's (organization's) FDA eSTAR registration state — the
-- prerequisites CDRH/CBER require before transmitting eSTAR submissions. The
-- pure eligibility model computes per-submission eligibility from this record,
-- so a client registers once and files many submissions.
--
--   estar_registrations — one row per organization (unique organization_id).
--                         Four booleans mirror EstarRegistrationRequirement
--                         (ESG / CDRH portal / org identity / MDUFA fee), plus
--                         supporting identifiers and the filable device variants.
--
-- Tenant column is the canonical integer organization_id. UUID PK + drizzle-zod
-- style match the q-sub / ind-master-data domains.
--
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS estar_registrations (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id       INTEGER NOT NULL,
  fda_esg_account       BOOLEAN NOT NULL DEFAULT FALSE,
  cdrh_portal_account   BOOLEAN NOT NULL DEFAULT FALSE,
  organization_identity BOOLEAN NOT NULL DEFAULT FALSE,
  mdufa_fee_account     BOOLEAN NOT NULL DEFAULT FALSE,
  esg_account_id        VARCHAR(128),
  cdrh_portal_email     VARCHAR(256),
  duns                  VARCHAR(16),
  fei                   VARCHAR(16),
  mdufa_org_id          VARCHAR(64),
  mdufa_fee_tier        VARCHAR(32),
  variants              JSONB NOT NULL DEFAULT '["device","ivd"]'::jsonb,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by            INTEGER
);

CREATE UNIQUE INDEX IF NOT EXISTS estar_registrations_org_uq
  ON estar_registrations (organization_id);
