-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure RIAI — Enterprise Identity (SCIM network access policy)
-- Compliance: 21 CFR Part 11 §11.10(d) — limiting system access to authorized
--             individuals/systems. A per-org SCIM IP allowlist restricts which
--             source networks may present a (valid) SCIM bearer token, so a
--             leaked token cannot be replayed from outside the customer's IdP
--             egress ranges. The allowlist itself is a controlled, auditable
--             access control.
-- Purpose: DB-backed, per-org CIDR allowlist enforced on /scim/v2. Opt-in: an
--          org with no enabled rows is unrestricted (back-compat); once any row
--          is enabled, requests from outside the listed CIDRs are denied
--          (fail-closed).
-- =============================================================================

CREATE TABLE IF NOT EXISTS scim_ip_allowlist (
  id              SERIAL PRIMARY KEY,
  organization_id INTEGER NOT NULL REFERENCES organizations(id),
  cidr            TEXT NOT NULL,
  label           TEXT,
  enabled         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMP NOT NULL DEFAULT now(),
  updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS scim_ip_allowlist_org_idx ON scim_ip_allowlist (organization_id);
CREATE INDEX IF NOT EXISTS scim_ip_allowlist_enabled_idx ON scim_ip_allowlist (enabled);
