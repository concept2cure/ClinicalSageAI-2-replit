const TOKEN_KEY = 'token';
const LEGACY_TOKEN_KEYS = ['auth_token', 'trialsage_access_token'];
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

  for (const key of LEGACY_TOKEN_KEYS) {
    const legacyToken = sessionStorage.getItem(key) || readLocalStorage(key) || readLocalStorage(TOKEN_KEY);
    if (legacyToken) {
      sessionStorage.setItem(TOKEN_KEY, legacyToken);
      removeLocalStorage(key);
      removeLocalStorage(TOKEN_KEY);
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
    // Keep legacy session key in sync while old hooks migrate to canonical auth access.
    sessionStorage.setItem('trialsage_access_token', token);
  }

  removeLocalStorage(TOKEN_KEY);
  removeLocalStorage('trialsage_access_token');
  for (const key of LEGACY_TOKEN_KEYS) {
    removeLocalStorage(key);
  }
};

export const clearAuthToken = (): void => {
  memoryToken = null;

  if (canUseSessionStorage()) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem('trialsage_access_token');
    for (const key of LEGACY_TOKEN_KEYS) {
      sessionStorage.removeItem(key);
    }
  }

  removeLocalStorage(TOKEN_KEY);
  removeLocalStorage('trialsage_access_token');
  for (const key of LEGACY_TOKEN_KEYS) {
    removeLocalStorage(key);
  }
};

export const getOrgId = (): string => {
  const direct = readLocalStorage(ORG_ID_KEY);
  if (direct && direct.trim().length > 0) return direct;

  for (const key of LEGACY_ORG_ID_KEYS) {
    const legacy = readLocalStorage(key);
    if (legacy && legacy.trim().length > 0) return legacy;
  }

  return '1';
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  const organizationId = getOrgId();
  return {
    'x-organization-id': organizationId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

export const setOrgId = (organizationId: string): void => {
  if (!organizationId) return;
  writeLocalStorage(ORG_ID_KEY, organizationId);
  writeLocalStorage('currentOrganization', organizationId);
};
