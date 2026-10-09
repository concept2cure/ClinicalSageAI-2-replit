/**
 * The connector access token is a session (plan P1-38; the IAM-02 / IAM-06
 * residual of the 2026-09-26 lens).
 *
 * mintAccessToken signed a `type: 'access'` token with no session claims and
 * no registration, so a connector token held no slot against the account's
 * concurrent-session limit, had no idle window and no lifetime — the one
 * access mint beside the first-run setup token outside openSession. It now
 * opens its session through openConnectorSession: the same claims (sid, sst,
 * idl), the same registration and the same lifetime rule as a sign-in, with
 * the connector's own idle policy (the token's TTL) and its own pool, so a
 * connector that refreshes every hour never signs the person out of the
 * browser. Redis is away here; the store is the memory tier.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';

vi.mock('../../services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));

import { MCP_TOKEN_USE, mintAccessToken } from '../auth/platform-token';
import type { Membership } from '../auth/store';
import {
  ABSOLUTE_SESSION_HOURS,
  DEFAULT_MAX_CONCURRENT_SESSIONS,
  MAX_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  openSession,
  resetSessionActivityForTests,
  sessionInactivityReason,
  sessionLifetimeExceeded,
} from '../../services/session-inactivity';
import { activeJwtSecret } from '../../utils/jwtVerify';

const RESOURCE = 'http://localhost:5300/mcp';
const membership = (settings?: unknown): Membership => ({
  membershipId: 11,
  organizationId: 2,
  userId: 7,
  role: 'member',
  organizationUuid: null,
  email: null,
  organizationSettings: settings,
});

type Claims = Record<string, unknown> & { sid?: string; sst?: number; idl?: number; iat?: number };
async function mint(ttlSeconds = 3600, settings?: unknown): Promise<{ token: string; claims: Claims }> {
  const { token } = await mintAccessToken({ membership: membership(settings), clientId: 'client-a', scopes: ['c2c:read'], resource: RESOURCE, ttlSeconds });
  return { token, claims: jwt.verify(token, activeJwtSecret(), { audience: RESOURCE }) as Claims };
}

beforeEach(() => resetSessionActivityForTests());

describe('mintAccessToken opens a connector session', () => {
  it('the token carries the session claims: a fresh id, its start, and the token TTL as its idle window', async () => {
    const before = Math.floor(Date.now() / 1000);
    const a = await mint(3600);
    const b = await mint(3600);
    expect(a.claims.type).toBe('access');
    expect(a.claims.token_use).toBe(MCP_TOKEN_USE);
    expect(typeof a.claims.sid, 'the connector token carries no session id: it was minted outside openConnectorSession').toBe('string');
    expect(a.claims.sid).not.toBe(b.claims.sid);
    expect(a.claims.sst).toBeGreaterThanOrEqual(before);
    expect(a.claims.sst).toBeLessThanOrEqual(Math.floor(Date.now() / 1000));
    expect(a.claims.idl).toBe(3600);
  });

  it('the idle window is the TTL held inside the platform window [1 min, 24 h]', async () => {
    expect((await mint(30)).claims.idl).toBe(MIN_IDLE_MINUTES * 60);
    expect((await mint(3 * 24 * 3600)).claims.idl).toBe(MAX_IDLE_MINUTES * 60);
  });

  it('the lifetime rule is the platform rule: the session is over ABSOLUTE_SESSION_HOURS after its start, whatever the TTL', async () => {
    const { claims } = await mint(3600);
    const start = (claims.sst as number) * 1000;
    expect(sessionLifetimeExceeded(claims, start + ABSOLUTE_SESSION_HOURS * 3600 * 1000 - 1000)).toBe(false);
    expect(sessionLifetimeExceeded(claims, start + ABSOLUTE_SESSION_HOURS * 3600 * 1000 + 1000)).toBe(true);
  });

  it('connector sessions hold slots in their own pool: beyond the limit the oldest connector token is superseded, the browser session is not', async () => {
    const browser = await openSession(7);
    const first = await mint(3600);
    for (let i = 1; i < DEFAULT_MAX_CONCURRENT_SESSIONS; i += 1) await mint(3600);
    expect(await sessionInactivityReason(first.token, first.claims)).toBeNull();
    const beyond = await mint(3600);
    expect(await sessionInactivityReason(first.token, first.claims), 'the sixth connector token did not end the first').toBe('superseded');
    expect(await sessionInactivityReason(beyond.token, beyond.claims)).toBeNull();
    expect(await sessionInactivityReason('browser-token', { ...browser, userId: '7' }), 'connector mints signed the browser session out').toBeNull();
  });

  it('the limit is the membership organisation\'s maxConcurrentSessions, as at sign-in', async () => {
    const settings = { security: { maxConcurrentSessions: 1 } };
    const first = await mint(3600, settings);
    await mint(3600, settings);
    expect(await sessionInactivityReason(first.token, first.claims)).toBe('superseded');
  });
});
