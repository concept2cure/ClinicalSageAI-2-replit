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
  DEFAULT_IDLE_MINUTES,
  continuedSessionClaims,
  idleWindowSecondsOf,
  idleWindowSecondsOfClaims,
  newSessionClaims,
  refreshInactivityReason,
  resetSessionActivityForTests,
  sessionInactivityReason,
  sessionKeyOf,
  sessionLifetimeExceeded,
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
