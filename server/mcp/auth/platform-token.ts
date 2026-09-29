/**
 * Bearer verification and minting for the connector.
 *
 * ONE verifier. `verifyPlatformBearer` is the connector's only way to accept a
 * token and it delegates to `verifyJwtWithRotation` — the function the REST
 * API's authenticateToken uses — plus the same `requireAccessTokenReason`
 * token-class rule and a live organization_users membership re-check. A token
 * the API would reject, the connector rejects for the same reason.
 *
 * Two token populations pass through it:
 *   1. First-party platform access tokens (POST /api/auth/login, /dev-login,
 *      MFA verify). They carry no `scope` claim; they are the user's own
 *      session, so they carry every connector scope.
 *   2. Connector-issued access tokens (POST /token below). Same claims, signed
 *      with the same active secret, plus `client_id`, `scope` and `aud` bound
 *      to the resource identifier. Scopes are exactly what the user consented
 *      to and are enforced per tool.
 */

import jwt from 'jsonwebtoken';
import type { AuthInfo } from '@modelcontextprotocol/sdk/server/auth/types.js';
import { InvalidTokenError } from '@modelcontextprotocol/sdk/server/auth/errors.js';
import { verifyJwtWithRotation, activeJwtSecret } from '../../utils/jwtVerify';
import { requireAccessTokenReason } from '../../middleware/tokenType';
import { CONNECTOR_TOKEN_USE, openConnectorSession } from '../../services/session-inactivity';
import { ALL_MCP_SCOPES, type McpConfig } from '../config';
import { findMembership, type Membership } from './store';

/** The session registry knows connector tokens by this claim (services/session-inactivity.ts). */
export const MCP_TOKEN_USE = CONNECTOR_TOKEN_USE;

interface PlatformClaims {
  userId?: number | string;
  id?: number | string;
  sub?: number | string;
  email?: string;
  role?: string;
  organizationId?: string | number;
  orgId?: string | number;
  organizationUuid?: string | null;
  type?: string;
  mfaPending?: boolean;
  exp?: number;
  aud?: string | string[];
  client_id?: string;
  scope?: string;
  token_use?: string;
}

/** What a verified bearer resolves to; carried on AuthInfo.extra for the tools. */
export interface McpPrincipal {
  userId: number;
  organizationId: number;
  organizationUuid: string | null;
  role: string;
  email: string | null;
  clientId: string;
  scopes: string[];
  tokenUse: 'platform' | 'mcp';
}

function toPositiveInt(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : NaN;
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

function decodeAccessClaims(token: string): PlatformClaims {
  let claims: PlatformClaims;
  try {
    claims = verifyJwtWithRotation<PlatformClaims>(token);
  } catch {
    throw new InvalidTokenError('Invalid or expired token');
  }
  const nonAccess = requireAccessTokenReason(claims);
  if (nonAccess) throw new InvalidTokenError('Token is not valid for this operation');
  return claims;
}

function resolveSubject(claims: PlatformClaims): { userId: number; organizationId: number } {
  const userId = toPositiveInt(claims.userId ?? claims.id ?? claims.sub);
  const organizationId = toPositiveInt(claims.organizationId ?? claims.orgId);
  if (userId === null) throw new InvalidTokenError('Token missing required subject claim');
  if (organizationId === null) throw new InvalidTokenError('Token carries no organisation; the connector needs a tenant');
  return { userId, organizationId };
}

/**
 * A connector-issued token is bound to this deployment's resource identifier
 * (RFC 8707). A first-party session token carries no audience and is accepted
 * as the user's own session.
 */
function checkAudience(claims: PlatformClaims, config: McpConfig): void {
  if (claims.aud === undefined) return;
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(config.resourceUrl.href)) {
    throw new InvalidTokenError('Token audience does not match this resource server');
  }
}

function resolveScopes(claims: PlatformClaims, tokenUse: McpPrincipal['tokenUse']): string[] {
  if (tokenUse !== 'mcp') return [...ALL_MCP_SCOPES];
  const known = new Set<string>(ALL_MCP_SCOPES);
  return (claims.scope ?? '').split(' ').filter((s) => known.has(s));
}

export async function verifyPlatformBearer(token: string, config: McpConfig): Promise<AuthInfo> {
  const claims = decodeAccessClaims(token);
  const { userId, organizationId } = resolveSubject(claims);
  checkAudience(claims, config);

  const membership: Membership | null = await findMembership(userId, organizationId);
  if (!membership) throw new InvalidTokenError('The token subject is no longer a member of the organisation');

  const tokenUse: McpPrincipal['tokenUse'] = claims.token_use === MCP_TOKEN_USE ? 'mcp' : 'platform';
  const scopes = resolveScopes(claims, tokenUse);
  const principal: McpPrincipal = {
    userId,
    organizationId,
    organizationUuid: membership.organizationUuid ?? claims.organizationUuid ?? null,
    role: membership.role || claims.role || 'user',
    email: membership.email ?? claims.email ?? null,
    clientId: claims.client_id ?? 'platform-session',
    scopes,
    tokenUse,
  };

  return {
    token,
    clientId: principal.clientId,
    scopes,
    expiresAt: claims.exp,
    resource: config.resourceUrl,
    extra: { principal },
  };
}

export function principalOf(auth: AuthInfo | undefined): McpPrincipal | null {
  const p = auth?.extra?.principal;
  return p && typeof p === 'object' ? (p as McpPrincipal) : null;
}

export interface MintAccessTokenInput {
  membership: Membership;
  clientId: string;
  scopes: string[];
  resource: string;
  ttlSeconds: number;
}

/**
 * Mint a connector access token. Same claim shape and signing secret as the
 * login route's access token (so the ONE verifier accepts it), plus the OAuth
 * binding claims, plus the session claims every access token carries (P1-38):
 * the token is a session opened through openConnectorSession — registered in
 * the account's connector pool at the organisation's limit, idle at its own
 * TTL, over at the platform lifetime; that function explains the policy.
 * `activeJwtSecret()` rather than the config snapshot, for the reason that
 * function documents: minting and verifying must read the same secret at the
 * same moment.
 */
export async function mintAccessToken(input: MintAccessTokenInput): Promise<{ token: string; expiresIn: number }> {
  const m = input.membership;
  const session = await openConnectorSession(m.userId, input.ttlSeconds, m.organizationSettings);
  const token = jwt.sign(
    {
      userId: String(m.userId),
      email: m.email,
      organizationId: String(m.organizationId),
      organizationUuid: m.organizationUuid,
      role: m.role,
      type: 'access',
      token_use: MCP_TOKEN_USE,
      client_id: input.clientId,
      scope: input.scopes.join(' '),
      ...session,
    },
    activeJwtSecret(),
    { expiresIn: input.ttlSeconds, audience: input.resource, algorithm: 'HS256' },
  );
  return { token, expiresIn: input.ttlSeconds };
}

// ── The pending-authorization request (between /authorize and consent) ──────
//
// Stateless: a short-lived signed assertion carried through the consent form.
// It is typed `mcp_authorize_request`, so requireAccessTokenReason rejects it on
// every access path — it can never be presented as a bearer token.

export interface PendingAuthorization {
  clientId: string;
  clientName: string | null;
  redirectUri: string;
  codeChallenge: string;
  scopes: string[];
  state: string | null;
  resource: string | null;
}

const PENDING_TYPE = 'mcp_authorize_request';

export function signPendingAuthorization(pending: PendingAuthorization, ttlSeconds: number): string {
  return jwt.sign({ ...pending, type: PENDING_TYPE }, activeJwtSecret(), {
    expiresIn: ttlSeconds,
    algorithm: 'HS256',
  });
}

export function readPendingAuthorization(assertion: string): PendingAuthorization | null {
  try {
    const claims = verifyJwtWithRotation<PendingAuthorization & { type?: string }>(assertion);
    if (claims.type !== PENDING_TYPE) return null;
    if (typeof claims.clientId !== 'string' || typeof claims.redirectUri !== 'string' || typeof claims.codeChallenge !== 'string') {
      return null;
    }
    return {
      clientId: claims.clientId,
      clientName: claims.clientName ?? null,
      redirectUri: claims.redirectUri,
      codeChallenge: claims.codeChallenge,
      scopes: Array.isArray(claims.scopes) ? claims.scopes : [],
      state: claims.state ?? null,
      resource: claims.resource ?? null,
    };
  } catch {
    return null;
  }
}
