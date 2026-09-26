/**
 * The session-inactivity service (security audit 2026-09-24, IAM-06; plan
 * P1-1): the claims a sign-in mints, how a tenant's window is read, and the
 * two questions the authenticators and the refresh ask of the activity store.
 * Redis is away here, so the store is the in-memory tier and the clock is
 * passed in.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));

import {
  ABSOLUTE_SESSION_HOURS,
  CONNECTOR_TOKEN_USE,
  DEFAULT_IDLE_MINUTES,
  DEFAULT_MAX_CONCURRENT_SESSIONS,
  MAX_IDLE_MINUTES,
  MIN_IDLE_MINUTES,
  continuedSessionClaims,
  idleWindowSecondsOf,
  idleWindowSecondsOfClaims,
  maxConcurrentSessionsOf,
  newSessionClaims,
  openConnectorSession,
  openSession,
  refreshInactivityReason,
  registerSession,
  resetSessionActivityForTests,
  sessionEndCodeOf,
  sessionInactivityReason,
  sessionKeyOf,
  sessionLifetimeExceeded,
  unregisterSession,
} from '../session-inactivity';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = Date.parse('2026-09-26T09:00:00Z');
const s = (ms: number) => Math.floor(ms / 1000);

beforeEach(() => resetSessionActivityForTests());

describe('the idle window', () => {
  it('is the tenant setting in minutes, clamped to [1 min, 24 h], and the default when unset or malformed', () => {
    expect(idleWindowSecondsOf(undefined)).toBe(DEFAULT_IDLE_MINUTES * 60);
    expect(idleWindowSecondsOf({})).toBe(15 * 60);
    expect(idleWindowSecondsOf({ security: { sessionTimeoutMinutes: 30 } })).toBe(30 * 60);
    expect(idleWindowSecondsOf({ security: { sessionTimeoutMinutes: 0 } })).toBe(60);
    expect(idleWindowSecondsOf({ security: { sessionTimeoutMinutes: 100_000 } })).toBe(24 * 60 * 60);
    expect(idleWindowSecondsOf({ security: { sessionTimeoutMinutes: '45' } })).toBe(15 * 60);
  });

  it('read back from a token is the idl claim, else the default', () => {
    expect(idleWindowSecondsOfClaims({ idl: 1800 })).toBe(1800);
    expect(idleWindowSecondsOfClaims({ idl: 5 })).toBe(15 * 60); // below the floor: not a window this service minted
    expect(idleWindowSecondsOfClaims({})).toBe(15 * 60);
  });
});

describe('the session claims', () => {
  it('a new session has a fresh id, starts now and carries the tenant window', () => {
    const a = newSessionClaims({ security: { sessionTimeoutMinutes: 20 } }, T0);
    const b = newSessionClaims(undefined, T0);
    expect(a.sid).not.toBe(b.sid);
    expect(a).toMatchObject({ sst: s(T0), idl: 1200 });
    expect(b.idl).toBe(900);
  });

  it('a continued session keeps its id, start and window; a token from before sessions had ids starts at its own issue', () => {
    expect(continuedSessionClaims({ sid: 'S', sst: 1, idl: 1800, iat: 99 }, T0)).toEqual({ sid: 'S', sst: 1, idl: 1800 });
    const legacy = continuedSessionClaims({ iat: s(T0 - HOUR) }, T0);
    expect(legacy.sid).toMatch(/^[0-9a-f-]{36}$/);
    expect(legacy).toMatchObject({ sst: s(T0 - HOUR), idl: 900 });
  });

  it('keys activity by the session id, else by the token itself', () => {
    expect(sessionKeyOf('t', { sid: 'S' })).toBe('sid:S');
    expect(sessionKeyOf('t', {})).toMatch(/^tok:[0-9a-f]{64}$/);
    expect(sessionKeyOf('t', {})).not.toBe(sessionKeyOf('u', {}));
  });
});

describe('sessionInactivityReason — an access token', () => {
  const claims = (issuedAt: number, extra: Record<string, unknown> = {}) => ({ sid: `S-${issuedAt}`, sst: s(issuedAt), idl: 900, iat: s(issuedAt), ...extra });

  it('a session never seen is measured from its token: within the window it is admitted and recorded, past it it is idle', async () => {
    expect(await sessionInactivityReason('t', claims(T0 - 14 * MINUTE), { now: T0 })).toBeNull();
    expect(await sessionInactivityReason('t', claims(T0 - 16 * MINUTE), { now: T0 })).toBe('idle');
  });

  it('each admitted request extends the window; a gap longer than the window ends the session', async () => {
    const c = claims(T0);
    expect(await sessionInactivityReason('t', c, { now: T0 + 14 * MINUTE })).toBeNull();
    expect(await sessionInactivityReason('t', c, { now: T0 + 28 * MINUTE })).toBeNull();
    expect(await sessionInactivityReason('t', c, { now: T0 + 28 * MINUTE + 16 * MINUTE })).toBe('idle');
  });

  it('a check that is not the user acting does not extend the window', async () => {
    const c = claims(T0);
    expect(await sessionInactivityReason('t', c, { now: T0 + 10 * MINUTE, activity: false })).toBeNull();
    expect(await sessionInactivityReason('t', c, { now: T0 + 20 * MINUTE })).toBe('idle');
  });

  it('an idle session is not touched by being asked', async () => {
    const c = claims(T0 - 16 * MINUTE);
    expect(await sessionInactivityReason('t', c, { now: T0 })).toBe('idle');
    expect(await sessionInactivityReason('t', c, { now: T0 })).toBe('idle');
  });

  it('a session older than the lifetime is over however active', async () => {
    const c = claims(T0 - MINUTE, { sst: s(T0 - (ABSOLUTE_SESSION_HOURS * HOUR + MINUTE)) });
    expect(await sessionInactivityReason('t', c, { now: T0 })).toBe('lifetime');
    expect(sessionLifetimeExceeded(c, T0)).toBe(true);
    expect(sessionLifetimeExceeded({ sst: s(T0 - 11 * HOUR) }, T0)).toBe(false);
  });

  it('tokens minted before sessions had ids are independent of one another', async () => {
    const legacy = { iat: s(T0 - 5 * MINUTE) };
    expect(await sessionInactivityReason('token-a', legacy, { now: T0 })).toBeNull();
    expect(await sessionInactivityReason('token-b', { iat: s(T0 - 20 * MINUTE) }, { now: T0 })).toBe('idle');
    expect(await sessionInactivityReason('token-a', legacy, { now: T0 + 10 * MINUTE })).toBeNull();
  });
});

describe('refreshInactivityReason — a refresh token', () => {
  it('reads the session\'s activity and never records any', async () => {
    const access = { sid: 'S', sst: s(T0 - 10 * MINUTE), idl: 900, iat: s(T0 - 10 * MINUTE) };
    await sessionInactivityReason('a', access, { now: T0 - 10 * MINUTE });
    const refresh = { sid: 'S', sst: s(T0 - 10 * MINUTE), idl: 900, iat: s(T0 - 10 * MINUTE) };
    expect(await refreshInactivityReason(refresh, T0)).toBeNull();
    expect(await refreshInactivityReason(refresh, T0 + 6 * MINUTE)).toBe('idle'); // 16 min since the last request; the refresh at T0 counted for nothing
  });

  it('a session with no record is measured from its start; a lifetime is a lifetime', async () => {
    expect(await refreshInactivityReason({ sid: 'N', sst: s(T0 - 16 * MINUTE), idl: 900 }, T0)).toBe('idle');
    expect(await refreshInactivityReason({ sid: 'N', sst: s(T0 - 13 * HOUR), idl: 900 }, T0)).toBe('lifetime');
  });

  it('a refresh token from before sessions had ids is checked for its lifetime only', async () => {
    expect(await refreshInactivityReason({ iat: s(T0 - 3 * HOUR) }, T0)).toBeNull();
    expect(await refreshInactivityReason({ iat: s(T0 - 13 * HOUR) }, T0)).toBe('lifetime');
  });
});

describe('the concurrent-session limit', () => {
  const settings = (n: unknown) => ({ security: { maxConcurrentSessions: n } });
  /** The access-token claims of a session, as an authenticator sees them. */
  const tokenClaims = (session: { sid: string; sst: number; idl: number }, userId = '42') => ({ ...session, iat: session.sst, userId });

  it('is the tenant setting, clamped to [1, 20], and 5 when unset or malformed', () => {
    expect(DEFAULT_MAX_CONCURRENT_SESSIONS).toBe(5);
    expect(maxConcurrentSessionsOf(undefined)).toBe(5);
    expect(maxConcurrentSessionsOf({ security: {} })).toBe(5);
    expect(maxConcurrentSessionsOf(settings(2))).toBe(2);
    expect(maxConcurrentSessionsOf(settings(0))).toBe(1);
    expect(maxConcurrentSessionsOf(settings(99))).toBe(20);
    expect(maxConcurrentSessionsOf(settings('3'))).toBe(5);
    expect(sessionEndCodeOf('superseded')).toBe('SESSION_SUPERSEDED');
  });

  it('a sign-in beyond the limit ends the oldest session: its next request and its refresh are refused, the others are not', async () => {
    const first = await openSession(42, settings(2), T0);
    const second = await openSession(42, settings(2), T0 + MINUTE);
    expect(await sessionInactivityReason('t1', tokenClaims(first), { now: T0 + 2 * MINUTE })).toBeNull();
    const third = await openSession(42, settings(2), T0 + 3 * MINUTE);
    expect(await sessionInactivityReason('t1', tokenClaims(first), { now: T0 + 4 * MINUTE }), 'the oldest session survived a third sign-in').toBe('superseded');
    expect(await refreshInactivityReason(tokenClaims(first), T0 + 4 * MINUTE)).toBe('superseded');
    expect(await sessionInactivityReason('t2', tokenClaims(second), { now: T0 + 4 * MINUTE })).toBeNull();
    expect(await sessionInactivityReason('t3', tokenClaims(third), { now: T0 + 4 * MINUTE })).toBeNull();
  });

  it('the newest session is never the one that ends, whatever the limit', async () => {
    const a = await openSession(42, settings(1), T0);
    const b = await openSession(42, settings(1), T0 + MINUTE);
    expect(await sessionInactivityReason('a', tokenClaims(a), { now: T0 + 2 * MINUTE })).toBe('superseded');
    expect(await sessionInactivityReason('b', tokenClaims(b), { now: T0 + 2 * MINUTE })).toBeNull();
  });

  it('registerSession names the sessions it ended; a signed-out session frees its slot; accounts do not count against one another', async () => {
    const a = newSessionClaims(undefined, T0);
    expect(await registerSession(42, a, 1, T0)).toEqual([]);
    await unregisterSession(42, a.sid);
    const b = newSessionClaims(undefined, T0 + MINUTE);
    expect(await registerSession(42, b, 1, T0 + MINUTE), 'a signed-out session still held its slot').toEqual([]);
    const other = newSessionClaims(undefined, T0 + 2 * MINUTE);
    expect(await registerSession(43, other, 1, T0 + 2 * MINUTE)).toEqual([]);
    const c = newSessionClaims(undefined, T0 + 3 * MINUTE);
    expect(await registerSession(42, c, 1, T0 + 3 * MINUTE)).toEqual([b.sid]);
    expect(await sessionInactivityReason('o', tokenClaims(other, '43'), { now: T0 + 4 * MINUTE })).toBeNull();
  });

  it('a session past its lifetime holds no slot', async () => {
    const stale = newSessionClaims(undefined, T0 - 13 * HOUR);
    expect(await registerSession(42, stale, 1, T0 - 13 * HOUR)).toEqual([]);
    const fresh = newSessionClaims(undefined, T0);
    expect(await registerSession(42, fresh, 1, T0), 'a session 13 hours old kept a live sign-in out').toEqual([]);
  });

  it('a superseded session stays superseded for the lifetime it could still be presented in, and is not revived by being asked', async () => {
    const a = await openSession(42, settings(1), T0);
    await openSession(42, settings(1), T0 + MINUTE);
    for (const at of [T0 + 2 * MINUTE, T0 + 6 * HOUR, T0 + 11 * HOUR]) {
      expect(await sessionInactivityReason('a', tokenClaims(a), { now: at })).toBe('superseded');
    }
    expect(await sessionInactivityReason('a', tokenClaims(a), { now: T0 + 13 * HOUR })).toBe('lifetime');
  });
});

describe('openConnectorSession — the connector access token (P1-38)', () => {
  const settings = (n: unknown) => ({ security: { maxConcurrentSessions: n } });
  /** The connector token's claims, as a verifier sees them: the session, token_use, the account. */
  const connectorClaims = (session: { sid: string; sst: number; idl: number }, userId = '42') => ({ ...session, iat: session.sst, userId, token_use: CONNECTOR_TOKEN_USE });
  const browserClaims = (session: { sid: string; sst: number; idl: number }, userId = '42') => ({ ...session, iat: session.sst, userId });

  it('opens a session whose idle window is the token TTL held inside the platform window, starting now, with a fresh id', async () => {
    const a = await openConnectorSession(42, 3600, undefined, T0);
    const b = await openConnectorSession(42, 3600, undefined, T0);
    expect(a.sid).not.toBe(b.sid);
    expect(a.sst).toBe(s(T0));
    expect(a.idl).toBe(3600);
    expect((await openConnectorSession(42, 10, undefined, T0)).idl).toBe(MIN_IDLE_MINUTES * 60);
    expect((await openConnectorSession(42, 7 * 24 * 3600, undefined, T0)).idl).toBe(MAX_IDLE_MINUTES * 60);
  });

  it('the lifetime rule is the platform rule and the token is idle past its TTL', async () => {
    const a = await openConnectorSession(42, 3600, undefined, T0);
    expect(sessionLifetimeExceeded(connectorClaims(a), T0 + ABSOLUTE_SESSION_HOURS * HOUR + 1000)).toBe(true);
    expect(await sessionInactivityReason('c', connectorClaims(a), { now: T0 + 30 * MINUTE })).toBeNull();
    expect(await sessionInactivityReason('c', connectorClaims(a), { now: T0 + 30 * MINUTE + 61 * MINUTE })).toBe('idle');
  });

  it('connector sessions and browser sessions hold slots in separate pools of the same account, each at the tenant limit', async () => {
    const browser = await openSession(42, settings(1), T0);
    const first = await openConnectorSession(42, 3600, settings(1), T0 + MINUTE);
    expect(await sessionInactivityReason('b', browserClaims(browser), { now: T0 + 2 * MINUTE }), 'a connector mint signed the browser session out').toBeNull();
    const second = await openConnectorSession(42, 3600, settings(1), T0 + 3 * MINUTE);
    expect(await sessionInactivityReason('c1', connectorClaims(first), { now: T0 + 4 * MINUTE }), 'the oldest connector session survived a mint beyond the limit').toBe('superseded');
    expect(await sessionInactivityReason('c2', connectorClaims(second), { now: T0 + 4 * MINUTE })).toBeNull();
    await openSession(42, settings(1), T0 + 5 * MINUTE);
    expect(await sessionInactivityReason('b', browserClaims(browser), { now: T0 + 6 * MINUTE })).toBe('superseded');
    expect(await sessionInactivityReason('c2', connectorClaims(second), { now: T0 + 6 * MINUTE }), 'a browser sign-in ended the connector session').toBeNull();
  });

  it('a connector session found over frees its own pool\'s slot', async () => {
    const a = await openConnectorSession(42, 3600, settings(2), T0);
    expect(await sessionInactivityReason('ca', connectorClaims(a), { now: T0 + 2 * HOUR })).toBe('idle');
    const b = await openConnectorSession(42, 3600, settings(2), T0 + 2 * HOUR);
    await openConnectorSession(42, 3600, settings(2), T0 + 2 * HOUR + MINUTE);
    // Had the idle session kept its slot, the third mint would have superseded it, and that answer comes first.
    expect(await sessionInactivityReason('ca', connectorClaims(a), { now: T0 + 2 * HOUR + 2 * MINUTE }), 'the idle connector session still held its slot').toBe('idle');
    expect(await sessionInactivityReason('cb', connectorClaims(b), { now: T0 + 2 * HOUR + 2 * MINUTE })).toBeNull();
  });
});
