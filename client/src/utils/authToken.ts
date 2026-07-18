const TOKEN_KEY = 'token';
// `trialsage_access_token` is NOT dead: the auth service persists it (localStorage
// for "remember me", sessionStorage otherwise) and several hooks/contexts read it
// directly (useLicense, TenantContext, LanguageContext, …). It is kept in lockstep
// with the canonical key and cleared on logout, but never deleted while a session
// is live — deleting it would drop those readers and break restart persistence.
const SHARED_TOKEN_KEY = 'trialsage_access_token';
// Truly dead legacy key — safe to sweep into the canonical key whenever seen.
const DEAD_TOKEN_KEYS = ['auth_token'];
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

  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) return token;

  // Mirror the shared key (written by the auth service; also read directly by
  // legacy hooks) into the canonical key. Do NOT delete it — other readers and
  // "remember me" persistence still depend on it.
  const shared =
    sessionStorage.getItem(SHARED_TOKEN_KEY) ||
    readLocalStorage(SHARED_TOKEN_KEY) ||
    readLocalStorage(TOKEN_KEY);
  if (shared) {
    sessionStorage.setItem(TOKEN_KEY, shared);
    memoryToken = shared;
    return shared;
  }

  // Sweep any value left under a truly-dead legacy key into the canonical key.
  for (const key of DEAD_TOKEN_KEYS) {
    const legacyToken = sessionStorage.getItem(key) || readLocalStorage(key);
    if (legacyToken) {
      sessionStorage.setItem(TOKEN_KEY, legacyToken);
      sessionStorage.removeItem(key);
      removeLocalStorage(key);
      memoryToken = legacyToken;
      return legacyToken;
    }
  }

  return memoryToken;
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

export const setAuthToken = (token: string): void => {
  memoryToken = token;

  if (canUseSessionStorage()) {
    sessionStorage.setItem(TOKEN_KEY, token);
    // Keep the shared key in sync for hooks/contexts that read it directly.
    sessionStorage.setItem(SHARED_TOKEN_KEY, token);
  }

  // Sweep a stray canonical copy or a dead legacy key from localStorage, but
  // PRESERVE localStorage[SHARED_TOKEN_KEY]: the auth service persists the token
  // there for "remember me", and deleting it would drop the session on restart.
  removeLocalStorage(TOKEN_KEY);
  for (const key of DEAD_TOKEN_KEYS) {
    removeLocalStorage(key);
  }
};

export const clearAuthToken = (): void => {
  memoryToken = null;

  const keys = [TOKEN_KEY, SHARED_TOKEN_KEY, ...DEAD_TOKEN_KEYS];
  if (canUseSessionStorage()) {
    for (const key of keys) {
      sessionStorage.removeItem(key);
    }
  }
  for (const key of keys) {
    removeLocalStorage(key);
  }
};

export const setOrgId = (organizationId: string): void => {
  if (!organizationId) return;
  writeLocalStorage(ORG_ID_KEY, organizationId);
  writeLocalStorage('currentOrganization', organizationId);
};
