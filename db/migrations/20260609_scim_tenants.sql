-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure RIAI — Enterprise Identity (SCIM provisioning)
-- Compliance: 21 CFR Part 11 §11.10(d) — limiting system access to authorized
--             individuals. A SCIM bearer token authorizes an external IdP to
--             provision / DEPROVISION users into one specific organization;
--             that authorization is a controlled, auditable credential.
-- Purpose: DB-backed, per-org SCIM bearer tokens so multiple client orgs can be
--          provisioned from one deployment WITHOUT putting tokens in env JSON.
--          Tokens are stored as SHA-256 hashes only — never in plaintext.
-- =============================================================================

CREATE TABLE IF NOT EXISTS scim_tenants (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  token_hash      TEXT NOT NULL UNIQUE,
  label           TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scim_tenants_org_idx ON scim_tenants (organization_id);
CREATE INDEX IF NOT EXISTS scim_tenants_enabled_idx ON scim_tenants (enabled);
