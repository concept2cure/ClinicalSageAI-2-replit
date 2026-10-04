/**
 * Postgres store for the OAuth 2.1 authorization server.
 *
 * Three tables (migrations/20260920_mcp_oauth.sql): registered clients,
 * single-use PKCE authorization codes, rotating refresh tokens. Codes and
 * refresh tokens are stored as sha256 hashes; the plaintext exists only in the
 * client's hands. Every tenant-scoped row is bound to the organization_users
 * membership that authorised it, so a removed member's grants cascade away.
 *
 * Two scopes, and which one a query runs in is not a style choice:
 *
 *   PRE-AUTH  (runWithPreAuthScope, no tenant, no role). For the two tables
 *             that hold no tenant data and carry no tenant policy:
 *             mcp_oauth_clients (registration precedes any user) and the
 *             membership read (organization_users is on the RLS allowlist).
 *
 *   TENANT    (the grant's own organisation). For mcp_oauth_authorization_codes
 *             and mcp_oauth_refresh_tokens, which carry organization_id and so
 *             are under the tenant sweep's policy. Until 2026-09-25 these ran
 *             in the pre-auth scope too, and under RLS_ENFORCE=on (the only
 *             mode production boots in) that scope sees and writes none of
 *             their rows: the consent POST failed with "new row violates
 *             row-level security policy", every /token lookup found nothing,
 *             and no client could connect (mcp-account-standing.dbtest.ts).
 *             The pre-auth scope is built to fail this way rather than bypass
 *             a policy (db/tenantStore.ts), and the super-admin scope that
 *             would bypass it is exactly what pre-auth code must not hold.
 *
 * So a code or refresh token names its organisation: `<organizationId>.<secret>`.
 * /token has nothing but that string, and the prefix is what lets the lookup
 * run in the grant's tenant scope with no bypass. The prefix grants nothing:
 * the row is found by the sha256 of the WHOLE string, so a prefix changed to
 * another organisation's id only narrows the search to rows it cannot match.
 * It discloses nothing either: the access token the grant yields already
 * carries organizationId in clear. A string without a well-formed prefix names
 * no grant (a code or token issued before this change is refused, and the
 * client authorises again).
 */

import { createHash, randomBytes } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getPool } from '../../db';
import { runWithPreAuthScope, runWithTenantScope } from '../../db/tenantStore';
import { ACCOUNT_STATUS_ACTIVE } from '../../services/account-standing';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function preAuth<T>(caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithPreAuthScope(`mcp-oauth:${caller}`, fn);
}

/** The grant's own tenant scope. No role: it reads and writes this organisation's grant rows and nothing else. */
function inGrantTenant<T>(organizationId: number, caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithTenantScope(
    { tenantId: String(organizationId), role: null, source: 'request', caller: `mcp-oauth:${caller}` },
    fn,
  );
}

/** A code or refresh token: `<organizationId>.<random>`. */
function mintGrantSecret(organizationId: number, bytes: number): string {
  return `${organizationId}.${randomToken(bytes)}`;
}

/**
 * The organisation a code or refresh token names, or null when it names none.
 * The random part is base64url of at least 32 bytes (43+ characters); anything
 * shorter or otherwise shaped is not a secret this server issued.
 */
export function organizationOfGrantSecret(secret: string): number | null {
  const m = /^([1-9]\d{0,9})\.[A-Za-z0-9_-]{43,}$/.exec(secret);
  if (!m) return null;
  const id = Number(m[1]);
  return Number.isSafeInteger(id) && id <= 2_147_483_647 ? id : null;
}

// ── Clients ─────────────────────────────────────────────────────────────────

export async function getClient(clientId: string): Promise<OAuthClientInformationFull | undefined> {
  return preAuth('get-client', async () => {
    const { rows } = await getPool().query<{ registration: OAuthClientInformationFull }>(
      'SELECT registration FROM mcp_oauth_clients WHERE client_id = $1',
      [clientId],
    );
    return rows[0]?.registration;
  });
}

export async function registerClient(
  client: OAuthClientInformationFull,
): Promise<OAuthClientInformationFull> {
  return preAuth('register-client', async () => {
    await getPool().query(
      `INSERT INTO mcp_oauth_clients
         (client_id, client_secret, client_id_issued_at, client_secret_expires_at, client_name, redirect_uris, registration)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb)
       ON CONFLICT (client_id) DO NOTHING`,
      [
        client.client_id,
        client.client_secret ?? null,
        client.client_id_issued_at ?? Math.floor(Date.now() / 1000),
        client.client_secret_expires_at ?? null,
        client.client_name ?? null,
        JSON.stringify(client.redirect_uris ?? []),
        JSON.stringify(client),
      ],
    );
    return client;
  });
}

// ── Membership (the tenant binding every grant carries) ─────────────────────

export interface Membership {
  membershipId: number;
  organizationId: number;
  userId: number;
  role: string;
  organizationUuid: string | null;
  /** Not selected here (users is joined only for its status); the verifier takes it from the token claims. */
  email: string | null;
  /**
   * organizations.settings, read with the membership on every call: the
   * concurrent-session limit a connector session is opened with (P1-38), and
   * whether the organisation's owner has turned the connector on (P1-47,
   * connector-enablement.ts).
   */
  organizationSettings?: unknown;
}

/**
 * Re-check, against the live membership table, that `userId` is still a member
 * of `organizationId`. This is the same fact the REST path's
 * enforceOrgMembership asserts on every request; a token minted at login is
 * not proof of membership now.
 */
export async function findMembership(userId: number, organizationId: number): Promise<Membership | null> {
  return preAuth('find-membership', async () => {
    const { rows } = await getPool().query<{
      id: number;
      organization_id: number;
      user_id: number;
      role: string;
      uuid: string | null;
      email: string | null;
      settings: unknown;
    }>(
      `SELECT ou.id, ou.organization_id, ou.user_id, ou.role, o.uuid, o.settings, NULL::text AS email
         FROM organization_users ou
         JOIN organizations o ON o.id = ou.organization_id
         JOIN users u ON u.id = ou.user_id
        WHERE ou.user_id = $1 AND ou.organization_id = $2
          -- A membership row outlives the account it belongs to: a suspended or
          -- deactivated user, or any member of a suspended organisation, is not
          -- a member for the connector's purposes (2026-09-22 review, #6).
          -- Every caller has already asked the canonical question
          -- (account-standing.ts, through verifyLiveToken or the exchanges'
          -- liveGrantorMembership), which is what refuses with the reason; this
          -- is the backstop, and it takes "active" from the same definition.
          AND u.status = $3
          AND COALESCE(o.status, 'active') <> 'suspended'
        LIMIT 1`,
      [userId, organizationId, ACCOUNT_STATUS_ACTIVE],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      membershipId: r.id,
      organizationId: r.organization_id,
      userId: r.user_id,
      role: r.role,
      organizationUuid: r.uuid,
      email: r.email,
      organizationSettings: r.settings,
    };
  });
}

// ── Authorization codes ─────────────────────────────────────────────────────

export interface IssuedCodeInput {
  clientId: string;
  membership: Membership;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource: string | null;
  ttlSeconds: number;
}

export async function issueAuthorizationCode(input: IssuedCodeInput): Promise<string> {
  const code = mintGrantSecret(input.membership.organizationId, 32);
  await inGrantTenant(input.membership.organizationId, 'issue-code', async () => {
    await getPool().query(
      `INSERT INTO mcp_oauth_authorization_codes
         (code_hash, client_id, organization_id, user_id, membership_id, code_challenge, redirect_uri, scopes, resource, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, now() + ($10 || ' seconds')::interval)`,
      [
        sha256Hex(code),
        input.clientId,
        input.membership.organizationId,
        input.membership.userId,
        input.membership.membershipId,
        input.codeChallenge,
        input.redirectUri,
        JSON.stringify(input.scopes),
        input.resource,
        String(input.ttlSeconds),
      ],
    );
  });
  return code;
}

export interface StoredCode {
  clientId: string;
  organizationId: number;
  userId: number;
  membershipId: number;
  codeChallenge: string;
  redirectUri: string;
  scopes: string[];
  resource: string | null;
  expired: boolean;
  redeemed: boolean;
  /** When the user consented: the code's created_at. */
  issuedAt: Date;
}

export async function readAuthorizationCode(code: string): Promise<StoredCode | null> {
  const organizationId = organizationOfGrantSecret(code);
  if (organizationId === null) return null;
  return inGrantTenant(organizationId, 'read-code', async () => {
    const { rows } = await getPool().query(
      `SELECT client_id, organization_id, user_id, membership_id, code_challenge, redirect_uri, scopes, resource,
              (expires_at < now()) AS expired, (redeemed_at IS NOT NULL) AS redeemed, created_at
         FROM mcp_oauth_authorization_codes WHERE code_hash = $1`,
      [sha256Hex(code)],
    );
    const r = rows[0];
    if (!r || Number(r.organization_id) !== organizationId) return null;
    return {
      clientId: r.client_id,
      organizationId: r.organization_id,
      userId: r.user_id,
      membershipId: r.membership_id,
      codeChallenge: r.code_challenge,
      redirectUri: r.redirect_uri,
      scopes: Array.isArray(r.scopes) ? r.scopes : [],
      resource: r.resource,
      expired: r.expired === true,
      redeemed: r.redeemed === true,
      issuedAt: new Date(r.created_at),
    };
  });
}

/** Marks the code redeemed. Returns false when it was already redeemed (replay). */
export async function redeemAuthorizationCode(code: string): Promise<boolean> {
  const organizationId = organizationOfGrantSecret(code);
  if (organizationId === null) return false;
  return inGrantTenant(organizationId, 'redeem-code', async () => {
    const res = await getPool().query(
      `UPDATE mcp_oauth_authorization_codes SET redeemed_at = now()
        WHERE code_hash = $1 AND redeemed_at IS NULL AND expires_at >= now()`,
      [sha256Hex(code)],
    );
    return (res.rowCount ?? 0) === 1;
  });
}

// ── Refresh tokens ──────────────────────────────────────────────────────────

export interface RefreshGrant {
  clientId: string;
  organizationId: number;
  userId: number;
  membershipId: number;
  scopes: string[];
  resource: string | null;
}

export async function issueRefreshToken(
  grant: RefreshGrant,
  ttlSeconds: number,
  rotatedFrom: string | null,
): Promise<string> {
  const token = mintGrantSecret(grant.organizationId, 48);
  await inGrantTenant(grant.organizationId, 'issue-refresh', async () => {
    await getPool().query(
      `INSERT INTO mcp_oauth_refresh_tokens
         (token_hash, client_id, organization_id, user_id, membership_id, scopes, resource, expires_at, rotated_from)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, now() + ($8 || ' seconds')::interval, $9)`,
      [
        sha256Hex(token),
        grant.clientId,
        grant.organizationId,
        grant.userId,
        grant.membershipId,
        JSON.stringify(grant.scopes),
        grant.resource,
        String(ttlSeconds),
        rotatedFrom,
      ],
    );
  });
  return token;
}

export interface StoredRefresh extends RefreshGrant {
  expired: boolean;
  revoked: boolean;
  /**
   * When THIS token was minted: its created_at. Every rotation passes the same
   * checks first, so once a password changes no token can be minted from a
   * grant authorised before it, and this is always earlier than that change.
   */
  issuedAt: Date;
}

export async function readRefreshToken(token: string): Promise<StoredRefresh | null> {
  const organizationId = organizationOfGrantSecret(token);
  if (organizationId === null) return null;
  return inGrantTenant(organizationId, 'read-refresh', async () => {
    const { rows } = await getPool().query(
      `SELECT client_id, organization_id, user_id, membership_id, scopes, resource,
              (expires_at < now()) AS expired, (revoked_at IS NOT NULL) AS revoked, created_at
         FROM mcp_oauth_refresh_tokens WHERE token_hash = $1`,
      [sha256Hex(token)],
    );
    const r = rows[0];
    if (!r || Number(r.organization_id) !== organizationId) return null;
    return {
      clientId: r.client_id,
      organizationId: r.organization_id,
      userId: r.user_id,
      membershipId: r.membership_id,
      scopes: Array.isArray(r.scopes) ? r.scopes : [],
      resource: r.resource,
      expired: r.expired === true,
      revoked: r.revoked === true,
      issuedAt: new Date(r.created_at),
    };
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  const organizationId = organizationOfGrantSecret(token);
  if (organizationId === null) return;
  await inGrantTenant(organizationId, 'revoke-refresh', async () => {
    await getPool().query(
      'UPDATE mcp_oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [sha256Hex(token)],
    );
  });
}
