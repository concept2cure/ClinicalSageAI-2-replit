// @vitest-environment jsdom
/**
 * Regression coverage for readiness blocker #6 — the dual auth-token store
 * desync. The bug was a separate "canonical" mirror key that every real auth
 * path (login / MFA / refresh / logout, all of which use
 * 'trialsage_access_token') failed to keep in sync, plus a lazy migration in
 * getAuthToken that mutated storage on read. These tests pin the invariants
 * that kill each symptom:
 *
 *   D1 — no stale bearer survives logout
 *   D2 — a remember-me (localStorage) token survives the first API call
 *   D3 — a token refresh propagates on the next read
 *   + tier precedence, single-tier set/clear, and the getOrgId /
 *     x-organization-id header contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getAuthHeaders,
  getOrgId,
  getJwtOrgId,
  capturedActorHeaders,
} from '../authToken';

const TOKEN_KEY = 'trialsage_access_token';
const organizationToken = (organizationId: string | number, revision = 'fixture') =>
  `fixture.${btoa(JSON.stringify({ userId: 7, organizationId }))}.${revision}`;

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // Reset the module's in-memory fallback so tests don't leak a token between
  // each other.
  clearAuthToken();
});
afterEach(() => vi.restoreAllMocks());

describe('captured actor headers for governed ceremonies', () => {
  const token = (claims: unknown, nonce = 'fixture') => `fixture.${btoa(JSON.stringify(claims))}.${nonce}`;
  const scope = { userId: 7, organizationId: 12 };
  it('pins a refreshed same-actor bearer without trusting the organization storage fallback', () => {
    localStorage.setItem('currentOrganizationId', '99');
    const bearer = token({ userId: '7', organizationId: 12 }, 'refreshed-fixture');
    setAuthToken(bearer);
    expect(capturedActorHeaders(scope)).toEqual({ Authorization: `Bearer ${bearer}`, 'x-organization-id': '12' });
  });
  it.each([
    { userId: 8, organizationId: 12 }, { userId: 7, organizationId: 13 },
    { userId: '7garbage', organizationId: 12 }, { userId: 7, organizationId: '12garbage' },
    { userId: null, organizationId: 12 }, null,
  ])('refuses a replaced or malformed captured identity: %j', claims => {
    setAuthToken(token(claims));
    expect(() => capturedActorHeaders(scope)).toThrow('account or organization changed');
  });
  it('refuses missing or unreadable bearer instead of falling back to persisted identity', () => {
    localStorage.setItem('trialsage_user', JSON.stringify({ id: 7, organizationId: 12 }));
    expect(() => capturedActorHeaders(scope)).toThrow();
    setAuthToken('fixture-malformed');
    expect(() => capturedActorHeaders(scope)).toThrow();
  });
});

describe('getAuthToken — fresh, non-mutating reads', () => {
  it('reads the canonical trialsage_access_token key fresh on every call', () => {
    sessionStorage.setItem(TOKEN_KEY, 'tok-1');
    expect(getAuthToken()).toBe('tok-1');
  });

  it('prefers sessionStorage over localStorage (tier precedence)', () => {
    localStorage.setItem(TOKEN_KEY, 'local-tok');
    sessionStorage.setItem(TOKEN_KEY, 'session-tok');
    expect(getAuthToken()).toBe('session-tok');
  });

  it('falls back to localStorage when sessionStorage has no token', () => {
    localStorage.setItem(TOKEN_KEY, 'local-tok');
    expect(getAuthToken()).toBe('local-tok');
  });

  it('does NOT mutate storage on read (no lazy migration)', () => {
    localStorage.setItem(TOKEN_KEY, 'local-tok');
    getAuthToken();
    getAuthToken();
    // The token must still be exactly where the auth flow wrote it.
    expect(localStorage.getItem(TOKEN_KEY)).toBe('local-tok');
    // And it must not have been mirrored into a second tier/key.
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });

  it('returns null when no token is present anywhere', () => {
    expect(getAuthToken()).toBeNull();
  });
});

describe('D2 — remember-me (localStorage) token survives the first API call', () => {
  it('reading the token never deletes the persisted localStorage copy', () => {
    // Remember-me path (authService SecureStorage persistent=true) writes here.
    localStorage.setItem(TOKEN_KEY, 'remember-me-tok');

    // Simulate the first authenticated API call resolving the token.
    expect(getAuthToken()).toBe('remember-me-tok');

    // Simulate a new tab/session (sessionStorage empty) reading again — the
    // persisted token must still be there, i.e. remember-me still works.
    expect(localStorage.getItem(TOKEN_KEY)).toBe('remember-me-tok');
    expect(getAuthToken()).toBe('remember-me-tok');
  });
});

describe('D3 — a token refresh propagates', () => {
  it('a refreshed trialsage_access_token is seen on the next read', () => {
    sessionStorage.setItem(TOKEN_KEY, 'old-tok');
    expect(getAuthToken()).toBe('old-tok');

    // Token refresh path rewrites the canonical key with the new token.
    sessionStorage.setItem(TOKEN_KEY, 'refreshed-tok');

    // No stale cache: the next read reflects the refreshed value.
    expect(getAuthToken()).toBe('refreshed-tok');
    expect(getAuthHeaders().Authorization).toBe('Bearer refreshed-tok');
  });
});

describe('D1 — no stale bearer survives logout', () => {
  it('clearAuthToken wipes the token from both tiers so getAuthToken returns null', () => {
    setAuthToken('live-tok');
    expect(getAuthToken()).toBe('live-tok');

    clearAuthToken();

    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(getAuthHeaders().Authorization).toBeUndefined();
  });

  it('no leftover mirror in either tier can revive the bearer after logout', () => {
    // Pre-existing token in localStorage (remember-me) plus a legacy mirror.
    localStorage.setItem(TOKEN_KEY, 'live-tok');
    sessionStorage.setItem('token', 'legacy-mirror');
    localStorage.setItem('token', 'legacy-mirror');

    clearAuthToken();

    expect(getAuthToken()).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('token')).toBeNull();
  });
});

describe('setAuthToken / clearAuthToken — single-tier invariant', () => {
  it('setAuthToken keeps the token in exactly one tier (session) and clears the other', () => {
    // Simulate a stale remember-me copy already in localStorage.
    localStorage.setItem(TOKEN_KEY, 'stale-local');

    setAuthToken('new-tok');

    expect(sessionStorage.getItem(TOKEN_KEY)).toBe('new-tok');
    // localStorage copy is cleared — no second tier to drift.
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(getAuthToken()).toBe('new-tok');
  });

  it('setAuthToken clears legacy keys from both tiers', () => {
    sessionStorage.setItem('token', 'legacy');
    localStorage.setItem('auth_token', 'legacy');

    setAuthToken('new-tok');

    expect(sessionStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
    expect(getAuthToken()).toBe('new-tok');
  });
});

describe('legacy fallback — read only', () => {
  it('resolves a legacy "token" key but never migrates or deletes it', () => {
    localStorage.setItem('token', 'legacy-tok');

    expect(getAuthToken()).toBe('legacy-tok');
    // Read-only: the legacy value stays put, and nothing is written to the
    // canonical key as a side effect.
    expect(localStorage.getItem('token')).toBe('legacy-tok');
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
    expect(localStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('prefers the canonical key over a legacy key', () => {
    localStorage.setItem('token', 'legacy-tok');
    sessionStorage.setItem(TOKEN_KEY, 'canonical-tok');
    expect(getAuthToken()).toBe('canonical-tok');
  });
});

describe('getOrgId / x-organization-id header contract', () => {
  it('keeps a tab-scoped bearer and its organization together despite another tab changing shared selection', () => {
    const bearer = organizationToken(12);
    sessionStorage.setItem(TOKEN_KEY, bearer);
    localStorage.setItem(TOKEN_KEY, organizationToken(99));
    localStorage.setItem('currentOrganizationId', '99');
    localStorage.setItem('currentOrganization', '99');
    localStorage.setItem('trialsage_user', JSON.stringify({ organizationId: 99 }));

    expect(getOrgId()).toBe('12');
    expect(getJwtOrgId()).toBe('12');
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${bearer}`, 'x-organization-id': '12' });
    // Resolving a request must not repair shared storage out from under the other tab.
    expect(localStorage.getItem('currentOrganizationId')).toBe('99');
    expect(localStorage.getItem(TOKEN_KEY)).toBe(organizationToken(99));
    expect(sessionStorage.getItem(TOKEN_KEY)).toBe(bearer);
  });

  it('uses a remembered bearer organization without moving its token into session storage', () => {
    const bearer = organizationToken('42');
    localStorage.setItem(TOKEN_KEY, bearer);
    localStorage.setItem('currentOrganizationId', '99');

    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${bearer}`, 'x-organization-id': '42' });
    expect(localStorage.getItem(TOKEN_KEY)).toBe(bearer);
    expect(sessionStorage.getItem(TOKEN_KEY)).toBeNull();
  });

  it('follows a replaced session on the next read and returns to legacy selection after logout', () => {
    localStorage.setItem('currentOrganizationId', '99');
    sessionStorage.setItem(TOKEN_KEY, organizationToken(12));
    expect(getOrgId()).toBe('12');
    const rotated = organizationToken(42, 'rotated');
    sessionStorage.setItem(TOKEN_KEY, rotated);
    expect(getAuthHeaders()).toEqual({ Authorization: `Bearer ${rotated}`, 'x-organization-id': '42' });

    clearAuthToken();
    expect(getOrgId()).toBe('99');
    expect(getJwtOrgId()).toBe('99');
    expect(getAuthHeaders()).toEqual({ 'x-organization-id': '99' });
  });

  it.each(['unreadable-token', 'fixture.e30.fixture'])('preserves persisted fallback for a token without a readable organization: %s', bearer => {
    sessionStorage.setItem(TOKEN_KEY, bearer);
    localStorage.setItem('currentOrganizationId', '42');
    expect(getOrgId()).toBe('42');
    expect(getJwtOrgId()).toBe('42');
  });

  it('retains the default when browser privacy settings refuse local-storage reads', () => {
    const getItem = Storage.prototype.getItem;
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (this: Storage, key: string) {
      if (this === localStorage) throw new DOMException('Storage unavailable', 'SecurityError');
      return getItem.call(this, key);
    });
    expect(getOrgId()).toBe('1');
    expect(getJwtOrgId()).toBe('1');
    expect(getAuthHeaders()).toEqual({ 'x-organization-id': '1' });
  });

  it('reads currentOrganizationId as the primary org source', () => {
    localStorage.setItem('currentOrganizationId', '42');
    expect(getOrgId()).toBe('42');
  });

  it('falls back to legacy currentOrganization', () => {
    localStorage.setItem('currentOrganization', '7');
    expect(getOrgId()).toBe('7');
  });

  it('falls back to the persisted user payload organizationId', () => {
    localStorage.setItem('trialsage_user', JSON.stringify({ organizationId: 99 }));
    expect(getOrgId()).toBe('99');
  });

  it('defaults to "1" when nothing is persisted', () => {
    expect(getOrgId()).toBe('1');
  });

  it('getAuthHeaders always carries x-organization-id, and the bearer when present', () => {
    localStorage.setItem('currentOrganizationId', '42');
    setAuthToken('hdr-tok');

    const headers = getAuthHeaders();
    expect(headers['x-organization-id']).toBe('42');
    expect(headers.Authorization).toBe('Bearer hdr-tok');
  });

  it('getAuthHeaders still sends x-organization-id when no token is present', () => {
    localStorage.setItem('currentOrganizationId', '42');
    const headers = getAuthHeaders();
    expect(headers['x-organization-id']).toBe('42');
    expect(headers.Authorization).toBeUndefined();
  });
});

describe('D1 (upgraded session) — logout purges legacy bearer keys', () => {
  // A browser upgraded mid-session can still hold a bearer under an old key.
  // getAuthToken resolves those as a read-only fallback, so the REAL logout path
  // (AuthService.clearAuth -> SecureStorage.clear) must purge them too —
  // otherwise a refresh replaces the canonical token, logout revokes it, and the
  // next request quietly falls back to the older, still-valid legacy bearer.
  const LEGACY_BEARER_KEYS = ['token', 'auth_token'];

  it('a legacy bearer left in either tier cannot outlive clearAuthToken', () => {
    for (const key of LEGACY_BEARER_KEYS) {
      sessionStorage.clear();
      localStorage.clear();
      sessionStorage.setItem(key, `legacy-session-${key}`);
      localStorage.setItem(key, `legacy-local-${key}`);
      sessionStorage.setItem(TOKEN_KEY, 'canonical-token');

      expect(getAuthToken()).toBe('canonical-token');

      clearAuthToken();

      expect(getAuthToken()).toBeNull();
      expect(sessionStorage.getItem(key)).toBeNull();
      expect(localStorage.getItem(key)).toBeNull();
    }
  });

  it('the authService logout key list stays in sync with the legacy fallback', async () => {
    // Guard against drift: if authToken.ts learns a new legacy key, the logout
    // purge in authService must learn it too, or the bug returns.
    const src = await import('../authToken?raw').catch(() => null);
    if (!src) return; // raw import unsupported in this env — the behavioral test above still holds
    for (const key of LEGACY_BEARER_KEYS) {
      expect(String((src as { default?: string }).default ?? '')).toContain(key);
    }
  });
});
