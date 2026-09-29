/**
 * Postgres store for the OAuth 2.1 authorization server.
 *
 * Three tables (migrations/20260920_mcp_oauth.sql): registered clients,
 * single-use PKCE authorization codes, rotating refresh tokens. Codes and
 * refresh tokens are stored as sha256 hashes; the plaintext exists only in the
 * client's hands. Every tenant-scoped row is bound to the organization_users
 * membership that authorised it, so a removed member's grants cascade away.
 *
 * Reads that run before the caller has a tenant (client lookup, code
 * redemption) run under the pre-auth scope, which is the same scope the REST
 * login path uses for its own pre-auth queries. Under RLS_ENFORCE=on a bare
 * pool.query fails closed, so the scope is not optional.
 */

import { createHash, randomBytes } from 'crypto';
import type { OAuthClientInformationFull } from '@modelcontextprotocol/sdk/shared/auth.js';
import { getPool } from '../../db';
import { runWithPreAuthScope } from '../../db/tenantStore';

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

function preAuth<T>(caller: string, fn: () => Promise<T>): Promise<T> {
  return runWithPreAuthScope(`mcp-oauth:${caller}`, fn);
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
  /** organizations.settings: the concurrent-session limit a connector session is opened with (P1-38). */
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
          AND u.status = 'active'
          AND COALESCE(o.status, 'active') <> 'suspended'
        LIMIT 1`,
      [userId, organizationId],
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
  const code = randomToken(32);
  await preAuth('issue-code', async () => {
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
}

export async function readAuthorizationCode(code: string): Promise<StoredCode | null> {
  return preAuth('read-code', async () => {
    const { rows } = await getPool().query(
      `SELECT client_id, organization_id, user_id, membership_id, code_challenge, redirect_uri, scopes, resource,
              (expires_at < now()) AS expired, (redeemed_at IS NOT NULL) AS redeemed
         FROM mcp_oauth_authorization_codes WHERE code_hash = $1`,
      [sha256Hex(code)],
    );
    const r = rows[0];
    if (!r) return null;
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
    };
  });
}

/** Marks the code redeemed. Returns false when it was already redeemed (replay). */
export async function redeemAuthorizationCode(code: string): Promise<boolean> {
  return preAuth('redeem-code', async () => {
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
  const token = randomToken(48);
  await preAuth('issue-refresh', async () => {
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
}

export async function readRefreshToken(token: string): Promise<StoredRefresh | null> {
  return preAuth('read-refresh', async () => {
    const { rows } = await getPool().query(
      `SELECT client_id, organization_id, user_id, membership_id, scopes, resource,
              (expires_at < now()) AS expired, (revoked_at IS NOT NULL) AS revoked
         FROM mcp_oauth_refresh_tokens WHERE token_hash = $1`,
      [sha256Hex(token)],
    );
    const r = rows[0];
    if (!r) return null;
    return {
      clientId: r.client_id,
      organizationId: r.organization_id,
      userId: r.user_id,
      membershipId: r.membership_id,
      scopes: Array.isArray(r.scopes) ? r.scopes : [],
      resource: r.resource,
      expired: r.expired === true,
      revoked: r.revoked === true,
    };
  });
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await preAuth('revoke-refresh', async () => {
    await getPool().query(
      'UPDATE mcp_oauth_refresh_tokens SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL',
      [sha256Hex(token)],
    );
  });
}
