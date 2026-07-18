// Canonical bearer-token store, written by every auth path (login / MFA / refresh /
// demo) via authService (SecureStorage) to sessionStorage for an in-tab login or
// localStorage for "remember me". This module reads it as the single source of truth.
const CANONICAL_TOKEN_KEY = 'trialsage_access_token';
// Read-only fallbacks for older writers; never written or deleted in getAuthToken.
const LEGACY_TOKEN_KEYS = ['token', 'auth_token'];
const ORG_ID_KEY = 'currentOrganizationId';
const LEGACY_ORG_ID_KEYS = ['currentOrganization', 'organizationId'];

let memoryToken: string | null = null;

const canUseSessionStorage = (): boolean => {
  try {
    const testKey = '__c2c_session_storage_test__';
    sessionStorage.setItem(testKey, testKey);
    sessionStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
};

const readLocalStorage = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const writeLocalStorage = (key: string, value: string): void => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Ignore storage write failures in restricted browser modes.
  }
};

const removeLocalStorage = (key: string): void => {
  try {
    localStorage.removeItem(key);
  } catch {
    // Ignore storage write failures in restricted browser modes.
  }
};

export const getAuthToken = (): string | null => {
  if (!canUseSessionStorage()) {
    return memoryToken;
  }

  // Read the canonical key fresh on every call, session-first then localStorage,
  // WITHOUT mutating storage. This fixes the token-store desync: a refreshed token
  // propagates (no cached copy wins), "remember me" survives (the persistent
  // localStorage copy is never deleted), and logout — which clears this key in both
  // stores — is honored (no stale token resurfaces). Legacy keys are read-only.
  const token =
    sessionStorage.getItem(CANONICAL_TOKEN_KEY) ||
    readLocalStorage(CANONICAL_TOKEN_KEY) ||
    sessionStorage.getItem('token') ||
    readLocalStorage('token') ||
    readLocalStorage('auth_token');

  memoryToken = token;
  return token;
};

export const getOrgId = (): string => {
  const fromCurrent = localStorage.getItem('currentOrganizationId');
  if (fromCurrent && fromCurrent.trim()) return fromCurrent.trim();

  const fromLegacy = localStorage.getItem('currentOrganization');
  if (fromLegacy && fromLegacy.trim()) return fromLegacy.trim();

  try {
    const rawUser = localStorage.getItem('trialsage_user');
    if (rawUser) {
      const parsed = JSON.parse(rawUser) as { organizationId?: string | number };
      const orgId = parsed?.organizationId;
      if (orgId !== undefined && orgId !== null && String(orgId).trim()) {
        return String(orgId).trim();
      }
    }
  } catch {
    // ignore malformed user payload and fall through to default
  }

  return '1';
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  const orgId = getOrgId();

  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    'x-organization-id': orgId,
  };
};

export const setAuthToken = (token: string, persistent = false): void => {
  memoryToken = token;

  const canSession = canUseSessionStorage();

  // Keep the token in exactly one tier: localStorage for "remember me", else
  // sessionStorage. Clearing the opposite tier keeps getAuthToken's session-first
  // read unambiguous after a tier change (e.g. a refresh writing a new tier).
  if (persistent) {
    writeLocalStorage(CANONICAL_TOKEN_KEY, token);
    if (canSession) sessionStorage.removeItem(CANONICAL_TOKEN_KEY);
  } else {
    if (canSession) sessionStorage.setItem(CANONICAL_TOKEN_KEY, token);
    removeLocalStorage(CANONICAL_TOKEN_KEY);
  }

  // Purge stale legacy copies so no reader resolves an outdated token.
  for (const key of LEGACY_TOKEN_KEYS) {
    if (canSession) sessionStorage.removeItem(key);
    removeLocalStorage(key);
  }
};

export const clearAuthToken = (): void => {
  memoryToken = null;

  const canSession = canUseSessionStorage();
  const keys = [CANONICAL_TOKEN_KEY, ...LEGACY_TOKEN_KEYS];
  for (const key of keys) {
    if (canSession) sessionStorage.removeItem(key);
    removeLocalStorage(key);
  }
};

export const setOrgId = (organizationId: string): void => {
  if (!organizationId) return;
  writeLocalStorage(ORG_ID_KEY, organizationId);
  writeLocalStorage('currentOrganization', organizationId);
};
