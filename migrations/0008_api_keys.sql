-- Migration 0008: API Keys for External Programmatic Access
-- Supports multiple API keys per organization with scoped access to intelligence services

CREATE TABLE IF NOT EXISTS api_keys (
  id                SERIAL PRIMARY KEY,
  uuid              UUID DEFAULT gen_random_uuid() NOT NULL UNIQUE,
  organization_id   INTEGER NOT NULL REFERENCES organizations(id),
  name              TEXT NOT NULL,
  key_hash          TEXT NOT NULL UNIQUE,
  key_prefix        TEXT NOT NULL,
  scopes            JSON NOT NULL DEFAULT '[]',
  status            TEXT NOT NULL DEFAULT 'active',
  expires_at        TIMESTAMP,
  last_used_at      TIMESTAMP,
  request_count     INTEGER NOT NULL DEFAULT 0,
  rate_limit        INTEGER NOT NULL DEFAULT 60,
  metadata          JSON,
  created_by        INTEGER NOT NULL,
  created_at        TIMESTAMP DEFAULT NOW() NOT NULL,
  revoked_at        TIMESTAMP
);

CREATE INDEX IF NOT EXISTS api_keys_org_idx ON api_keys(organization_id);
CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS api_keys_status_idx ON api_keys(status);
