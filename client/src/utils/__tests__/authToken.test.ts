// @vitest-environment jsdom
/**
 * Auth-token store bridge — regression guard for the dual-store desync.
 *
 * The auth service wrote/refreshed/cleared `trialsage_access_token` (via
 * SecureStorage) while the API layer / query client read the canonical `token`
 * key through getAuthToken, and nothing bridged the two. Symptoms this suite
 * pins down:
 *   - refresh: a refreshed token was written but getAuthToken kept returning the
 *     previous value (stale token → eventual 401s);
 *   - account switch: getAuthToken returned the first account's token;
 *   - logout: the canonical token lingered after SecureStorage.clear();
 *   - legacy readers: the first getAuthToken() migration DELETED
 *     `trialsage_access_token`, so hooks/contexts that read it directly
 *     (useLicense, TenantContext, LanguageContext) lost it, and "remember me"
 *     (localStorage persistence) broke on restart.
 *
 * The fix routes every login/refresh through setAuthToken and every logout
 * through clearAuthToken, and makes both non-destructive to the persisted
 * shared key. These tests exercise the canonical primitives the fixed auth
 * service now calls.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getAuthToken, setAuthToken, clearAuthToken } from '../authToken';

const CANONICAL = 'token';
const SHARED = 'trialsage_access_token'; // read directly by useLicense/TenantContext/LanguageContext

beforeEach(() => {
  sessionStorage.clear();
  localStorage.clear();
  // Reset the module-scope in-memory fallback so each test starts clean.
  clearAuthToken();
});

afterEach(() => {
  sessionStorage.clear();
  localStorage.clear();
});

describe('setAuthToken / getAuthToken bridge', () => {
  it('writes the canonical key AND the shared key legacy hooks read', () => {
    setAuthToken('t1');
    expect(getAuthToken()).toBe('t1');
    expect(sessionStorage.getItem(CANONICAL)).toBe('t1');
    expect(sessionStorage.getItem(SHARED)).toBe('t1');
  });

  it('account switch: getAuthToken returns the newest token, never the previous', () => {
    // First account established + migrated into the canonical key by a read.
    localStorage.setItem(SHARED, 'accountA');
    expect(getAuthToken()).toBe('accountA');
    // Second account logs in through the bridged path.
    setAuthToken('accountB');
    expect(getAuthToken()).toBe('accountB');
    expect(sessionStorage.getItem(SHARED)).toBe('accountB');
  });

  it('refresh freshness: a persisted token overwritten by setAuthToken reads fresh', () => {
    // Persistent login → SecureStorage(localStorage); a read migrates it.
    localStorage.setItem(SHARED, 'old');
    expect(getAuthToken()).toBe('old');
    // Token refresh: storeTokens now also calls setAuthToken(new).
    setAuthToken('refreshed');
    expect(getAuthToken()).toBe('refreshed');
  });
});

describe('non-destructive persistence (remember me)', () => {
  it('setAuthToken preserves the persisted localStorage copy of the shared key', () => {
    localStorage.setItem(SHARED, 'persist'); // authService persistent write
    setAuthToken('persist');
    // Must survive so loadStoredAuth can restore the session on browser restart.
    expect(localStorage.getItem(SHARED)).toBe('persist');
  });

  it('getAuthToken does not delete the shared key while migrating it', () => {
    localStorage.setItem(SHARED, 'leg');
    expect(getAuthToken()).toBe('leg');
    expect(localStorage.getItem(SHARED)).toBe('leg'); // legacy readers keep it
    expect(sessionStorage.getItem(CANONICAL)).toBe('leg'); // mirrored into canonical
  });
});

describe('clearAuthToken (logout)', () => {
  it('clears the canonical key, the shared key, and dead legacy keys from both storages', () => {
    setAuthToken('t');
    localStorage.setItem(SHARED, 't');
    localStorage.setItem('auth_token', 'x');
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
    expect(sessionStorage.getItem(CANONICAL)).toBeNull();
    expect(sessionStorage.getItem(SHARED)).toBeNull();
    expect(localStorage.getItem(SHARED)).toBeNull();
    expect(localStorage.getItem('auth_token')).toBeNull();
  });

  it('no live token survives logout (the lingering-token bug)', () => {
    localStorage.setItem(SHARED, 'live'); // persisted login
    expect(getAuthToken()).toBe('live');
    clearAuthToken();
    expect(getAuthToken()).toBeNull();
  });
});

describe('dead legacy key sweep', () => {
  it('migrates a value under a dead key into the canonical key and removes the dead key', () => {
    localStorage.setItem('auth_token', 'dead');
    expect(getAuthToken()).toBe('dead');
    expect(sessionStorage.getItem(CANONICAL)).toBe('dead');
    expect(localStorage.getItem('auth_token')).toBeNull();
  });
});
