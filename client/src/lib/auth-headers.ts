/**
 * Shared auth header construction for raw fetch calls.
 *
 * Used when apiRequest() can't be used (SSE streaming needs
 * AbortController signal, file upload needs multipart FormData).
 *
 * Delegates to the canonical authToken module — no direct localStorage access.
 */
<<<<<<< HEAD
import { getAuthToken, getAuthHeaders as getCanonicalAuthHeaders } from '@/utils/authToken';

export function getAuthHeaders(): Record<string, string> {
  return getCanonicalAuthHeaders();
}

/**
 * @deprecated Use getAuthToken() from '@/utils/authToken' directly
 */
export function getToken(): string {
  return getAuthToken() || '';
=======
import { getAuthToken } from '../utils/authToken';

export function getAuthHeaders(): Record<string, string> {
  const orgId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  const token = getAuthToken() || '';
  return {
    'x-organization-id': orgId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
>>>>>>> origin/codex/initiate-beta-hardening-program-for-concept2cure-v2
}
