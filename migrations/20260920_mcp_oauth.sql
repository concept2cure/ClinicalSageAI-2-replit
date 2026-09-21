-- =============================================================================
-- eCTD REGULATORY AUDIT CONTEXT
-- System: Concept2Cure.RI — Claude connector (remote MCP server, server/mcp/)
-- Compliance: 21 CFR Part 11 (auditability of who reached governed records
--             through which client), ALCOA+ (attributable), OAuth 2.1 + PKCE
--             (RFC 6749/7636/7591/8414/8707/9728) as the MCP authorization
--             specification requires of a resource server.
-- Purpose: The three records an OAuth 2.1 authorization server must keep so a
--          Claude client can obtain a scoped, tenant-bound bearer token for
--          /mcp without a second identity system: dynamically registered
--          clients, single-use PKCE authorization codes, and revocable refresh
--          tokens. Access tokens are NOT stored — they are platform JWTs
--          verified by the same verifier the REST API uses
--          (server/utils/jwtVerify.ts), so there is exactly one verifier.
--
-- eCTD/CTD Context:
--   - Module(s): none directly. This governs HOW an external assistant reaches
--     the platform's readiness, validation and drafting engines; the governed
--     write it enables (a draft leaf filed for review) lands in the
--     submissions spine (submission_leaves), whose own migrations apply.
--   - Integrity Risk Addressed: without these tables a connector would have to
--     accept long-lived static secrets or mint tokens outside the platform's
--     verifier. Codes here are hashed, single-use and ten-minute; refresh
--     tokens are hashed and rotate on use; every grant is bound to the
--     organization_users membership row that authorised it.
--
-- Determinism Contract:
--   - Schema changes must not undermine deterministic evidence pointers.
--   - Any change impacting canonical schemas requires spec version bump.
--
-- Notes:
--   - public schema. The two tenant-scoped tables carry
--     organization_id INTEGER NOT NULL, so the integer tenant-isolation sweep
--     that closes C2C_MIGRATION_FILES policies them (CLAUDE.md RULE 1,
--     corollary 2); this file is ordered ABOVE that sweep for that reason.
--   - Both tenant-scoped tables ALSO reference organization_users(id) ON
--     DELETE CASCADE. A grant is a property of a membership: when the member
--     is removed from the organisation the codes and refresh tokens they
--     authorised disappear with the membership row, which is the revocation
--     the MCP authorization spec expects and is what tenant off-boarding's
--     purge of organization_users already does (ci:purge-coverage measures
--     that cascade).
--   - mcp_oauth_clients deliberately has NO organization_id. RFC 7591 dynamic
--     client registration happens BEFORE any user has authenticated, so there
--     is no tenant to bind it to; the row holds only the client's own
--     metadata (redirect URIs, display name) and nothing about any tenant.
--     It is therefore not swept, by design, and holds no tenant data.
--   - client_secret is stored as issued. The MCP SDK's client-authentication
--     middleware compares the presented secret to the stored value directly
--     (OAuthRegisteredClientsStore contract), and the connector registers
--     public clients (token_endpoint_auth_method 'none', no secret) in the
--     normal case; a confidential client's secret expires per
--     client_secret_expires_at.
--   - Additive and idempotent (CREATE TABLE / INDEX IF NOT EXISTS). Nothing is
--     dropped or renamed. Because the whole set re-executes on every deploy,
--     CREATE TABLE IF NOT EXISTS is a no-op on a provisioned database: a later
--     column goes in as its own ADD COLUMN IF NOT EXISTS below the CREATE, with
--     a dated note (CLAUDE.md RULE 1).
-- =============================================================================

CREATE TABLE IF NOT EXISTS mcp_oauth_clients (
  client_id                 TEXT PRIMARY KEY,
  client_secret             TEXT,
  client_id_issued_at       BIGINT NOT NULL,
  client_secret_expires_at  BIGINT,
  client_name               TEXT,
  redirect_uris             JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- The full RFC 7591 registration response as issued (metadata + credentials),
  -- so getClient() returns exactly what registerClient() returned.
  registration              JSONB NOT NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mcp_oauth_authorization_codes (
  -- sha256 hex of the code handed to the client; the code itself is never stored.
  code_hash        TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  organization_id  INTEGER NOT NULL,
  user_id          INTEGER NOT NULL,
  membership_id    INTEGER NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  code_challenge   TEXT NOT NULL,
  redirect_uri     TEXT NOT NULL,
  scopes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  resource         TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,
  redeemed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_org
  ON mcp_oauth_authorization_codes (organization_id);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_codes_expires
  ON mcp_oauth_authorization_codes (expires_at);

CREATE TABLE IF NOT EXISTS mcp_oauth_refresh_tokens (
  -- sha256 hex of the refresh token handed to the client.
  token_hash       TEXT PRIMARY KEY,
  client_id        TEXT NOT NULL REFERENCES mcp_oauth_clients(client_id) ON DELETE CASCADE,
  organization_id  INTEGER NOT NULL,
  user_id          INTEGER NOT NULL,
  membership_id    INTEGER NOT NULL REFERENCES organization_users(id) ON DELETE CASCADE,
  scopes           JSONB NOT NULL DEFAULT '[]'::jsonb,
  resource         TEXT,
  expires_at       TIMESTAMPTZ NOT NULL,
  revoked_at       TIMESTAMPTZ,
  -- Rotation lineage: the hash of the token this one replaced, for audit.
  rotated_from     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_org
  ON mcp_oauth_refresh_tokens (organization_id);
CREATE INDEX IF NOT EXISTS idx_mcp_oauth_refresh_membership
  ON mcp_oauth_refresh_tokens (membership_id);
