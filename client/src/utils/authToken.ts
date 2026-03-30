/**
 * Centralized auth token management for Concept2Cure client.
 *
 * Single source of truth for token storage. Uses sessionStorage as primary
 * with a one-time migration from legacy localStorage keys.
 *
 * Salvaged from PR #311 and integrated into single-brain sprint.
 *
 * @module client/src/utils/authToken
 */

const TOKEN_KEY = 'token';
const LEGACY_TOKEN_KEYS = ['authToken', 'auth_token'];
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

  // One-time migration from legacy localStorage keys
  for (const key of [TOKEN_KEY, ...LEGACY_TOKEN_KEYS]) {
    const legacyToken = localStorage.getItem(key);
    if (legacyToken) {
      sessionStorage.setItem(TOKEN_KEY, legacyToken);
      // Clean up legacy keys
      for (const k of [TOKEN_KEY, ...LEGACY_TOKEN_KEYS]) {
        localStorage.removeItem(k);
      }
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
  // Clean legacy keys
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

/**
 * Get auth headers for raw fetch calls.
 * Centralizes both token and org ID retrieval.
 */
export const getAuthHeaders = (): Record<string, string> => {
  const token = getAuthToken() || '';
  const orgId =
    localStorage.getItem('organizationId') ||
    localStorage.getItem('currentOrganizationId') ||
    '1';
  return {
    'Content-Type': 'application/json',
    'x-organization-id': orgId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};
