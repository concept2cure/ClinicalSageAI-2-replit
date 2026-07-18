// @vitest-environment jsdom
//
// Pins the fix for the dual auth-token store desync (product-readiness blocker #6).
// The bearer token's single source of truth is `trialsage_access_token` (written by
// authService in sessionStorage for an in-tab login or localStorage for "remember
// me"). getAuthToken must read it fresh and non-destructively so that: a refreshed
// token propagates (D3), "remember me" survives repeated reads (D2), and a cleared
// token is not resurfaced after logout (D1).
import { describe, it, expect, beforeEach, vi } from 'vitest';

// authToken.ts caches a module-scope `memoryToken`; re-import fresh each test so
// state never leaks between cases.
async function loadAuthToken() {
  vi.resetModules();
  return import('../authToken');
}

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('getAuthToken — canonical trialsage_access_token, non-destructive', () => {
  it('reads an in-tab (sessionStorage) login token', async () => {
    sessionStorage.setItem('trialsage_access_token', 'tok-session');
    const { getAuthToken } = await loadAuthToken();
    expect(getAuthToken()).toBe('tok-session');
  });

  it('D2: a "remember me" (localStorage) token survives repeated reads and is never deleted', async () => {
    localStorage.setItem('trialsage_access_token', 'tok-remember');
    const { getAuthToken } = await loadAuthToken();
    expect(getAuthToken()).toBe('tok-remember');
    // The persistent copy must NOT be migrated away / deleted by the read.
    expect(localStorage.getItem('trialsage_access_token')).toBe('tok-remember');
    expect(getAuthToken()).toBe('tok-remember');
    expect(localStorage.getItem('trialsage_access_token')).toBe('tok-remember');
  });

  it('D3: a token refresh propagates on the next read', async () => {
    localStorage.setItem('trialsage_access_token', 'tok-old');
    const { getAuthToken } = await loadAuthToken();
    expect(getAuthToken()).toBe('tok-old'); // primes any internal cache
    // Refresh writes a new token to the same canonical store.
    localStorage.setItem('trialsage_access_token', 'tok-new');
    expect(getAuthToken()).toBe('tok-new');
  });

  it('D1: after logout clears the canonical key in both stores, no stale token is returned', async () => {
    sessionStorage.setItem('trialsage_access_token', 'tok');
    const { getAuthToken } = await loadAuthToken();
    expect(getAuthToken()).toBe('tok'); // primes memoryToken
    // logout (authService SecureStorage.clear) removes the canonical key from both stores.
    sessionStorage.removeItem('trialsage_access_token');
    localStorage.removeItem('trialsage_access_token');
    expect(getAuthToken()).toBeNull();
  });

  it('session tier takes precedence over localStorage; both are readable', async () => {
    localStorage.setItem('trialsage_access_token', 'tok-local');
    sessionStorage.setItem('trialsage_access_token', 'tok-session');
    const { getAuthToken } = await loadAuthToken();
    expect(getAuthToken()).toBe('tok-session');
  });

  it('returns null when nothing is stored', async () => {
    const { getAuthToken } = await loadAuthToken();
    expect(getAuthToken()).toBeNull();
  });
});

describe('getAuthHeaders', () => {
  it('attaches Bearer from the canonical token', async () => {
    sessionStorage.setItem('trialsage_access_token', 'tok');
    const { getAuthHeaders } = await loadAuthToken();
    expect(getAuthHeaders().Authorization).toBe('Bearer tok');
  });

  it('omits Authorization when no token is present', async () => {
    const { getAuthHeaders } = await loadAuthToken();
    expect(getAuthHeaders().Authorization).toBeUndefined();
  });
});

describe('setAuthToken / clearAuthToken keep a single canonical tier', () => {
  it('setAuthToken(token, true) persists to localStorage and getAuthToken reads it', async () => {
    const { setAuthToken, getAuthToken } = await loadAuthToken();
    setAuthToken('tok-p', true);
    expect(localStorage.getItem('trialsage_access_token')).toBe('tok-p');
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
    expect(getAuthToken()).toBe('tok-p');
  });

  it('setAuthToken(token) defaults to sessionStorage and clears the localStorage tier', async () => {
    localStorage.setItem('trialsage_access_token', 'stale');
    const { setAuthToken, getAuthToken } = await loadAuthToken();
    setAuthToken('tok-s');
    expect(sessionStorage.getItem('trialsage_access_token')).toBe('tok-s');
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(getAuthToken()).toBe('tok-s');
  });

  it('clearAuthToken removes the token from both stores', async () => {
    localStorage.setItem('trialsage_access_token', 'tok');
    sessionStorage.setItem('trialsage_access_token', 'tok');
    const { clearAuthToken, getAuthToken } = await loadAuthToken();
    clearAuthToken();
    expect(sessionStorage.getItem('trialsage_access_token')).toBeNull();
    expect(localStorage.getItem('trialsage_access_token')).toBeNull();
    expect(getAuthToken()).toBeNull();
  });
});
