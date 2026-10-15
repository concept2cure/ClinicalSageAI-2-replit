-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — which account an organisation's submissions go out under
-- Compliance: 21 CFR 11.10(e) (who sent what, under which identity); ALCOA+
-- Purpose: Each organisation chooses, per agency gateway and environment,
--          whether submissions transmit through the PLATFORM's gateway
--          account (the server's configured credentials) or the CLIENT's own
--          (credentials the organisation supplies, encrypted at rest). Founder
--          decision 2026-10-01: both are offered, set in admin settings and at
--          onboarding, because the right one depends on region, agency, account
--          and client preference. Read by the guarded transmit
--          (server/services/submission-gateways/index.ts), which records the
--          mode and sender identity on every transmittal.
--          Evidence docs/evidence/D7/2026-10-01-gateway-account-choice/.
--
-- Determinism Contract:
--   - New table + index only, all IF NOT EXISTS; no existing object touched.
--     No DROP (CLAUDE.md Rule 1: this file re-runs on every deploy).
--   - organization_id INTEGER NOT NULL, in public, so the tenant-isolation
--     sweep (last in C2C_MIGRATION_FILES) attaches tenant_isolation_policy:
--     one organisation never reads or writes another's account choice.
--   - credentials_ciphertext holds AES-256-GCM ciphertext only
--     (server/services/security/credential-cipher.ts); the API never returns
--     it, and credential_fields names what is held without its values.
--   - No row means the platform account: the behaviour before this table.
-- =============================================================================

CREATE TABLE IF NOT EXISTS organization_gateway_accounts (
  id                      SERIAL PRIMARY KEY,
  organization_id         INTEGER NOT NULL,
  region                  TEXT NOT NULL,
  gateway                 TEXT NOT NULL,
  environment             TEXT NOT NULL CHECK (environment IN ('staging', 'production')),
  account_mode            TEXT NOT NULL CHECK (account_mode IN ('platform', 'client')),
  sender_identifier       TEXT,
  credentials_ciphertext  TEXT,
  credential_fields       TEXT[] NOT NULL DEFAULT '{}',
  reason                  TEXT NOT NULL,
  updated_by              INTEGER,
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT organization_gateway_accounts_uniq UNIQUE (organization_id, region, gateway, environment)
);

CREATE INDEX IF NOT EXISTS organization_gateway_accounts_org_idx
  ON organization_gateway_accounts (organization_id);

COMMENT ON TABLE organization_gateway_accounts IS
  'Per organisation, agency gateway and environment: transmit through the platform''s account or the client''s own (credentials encrypted, never returned). No row = platform. Founder decision 2026-10-01.';
