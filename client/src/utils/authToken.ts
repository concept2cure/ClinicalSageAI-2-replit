const TOKEN_KEY = 'token';
const LEGACY_TOKEN_KEYS = ['auth_token'];
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

export const getAuthToken = (): string | null => {
  if (!canUseSessionStorage()) {
    return memoryToken;
  }

  const token = sessionStorage.getItem(TOKEN_KEY);
  if (token) return token;

  for (const key of LEGACY_TOKEN_KEYS) {
    const legacyToken = localStorage.getItem(key) || localStorage.getItem(TOKEN_KEY);
    if (legacyToken) {
      sessionStorage.setItem(TOKEN_KEY, legacyToken);
      localStorage.removeItem(key);
      localStorage.removeItem(TOKEN_KEY);
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
  }
  localStorage.removeItem(TOKEN_KEY);
  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
};

export const clearAuthToken = (): void => {
  memoryToken = null;
  if (canUseSessionStorage()) {
    sessionStorage.removeItem(TOKEN_KEY);
  }
  localStorage.removeItem(TOKEN_KEY);
  for (const key of LEGACY_TOKEN_KEYS) {
    localStorage.removeItem(key);
  }
};
