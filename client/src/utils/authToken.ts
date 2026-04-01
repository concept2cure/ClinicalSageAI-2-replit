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

const ORG_KEY = 'organizationId';

export const getOrgId = (): string => {
  try {
    return sessionStorage.getItem(ORG_KEY) || localStorage.getItem(ORG_KEY) || '';
  } catch {
    return '';
  }
};

export const setOrgId = (orgId: string): void => {
  try {
    sessionStorage.setItem(ORG_KEY, orgId);
  } catch {
    // fallback: do nothing
  }
};

export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken();
  const orgId = getOrgId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  if (orgId) {
    headers['x-organization-id'] = orgId;
  }
  return headers;
};
