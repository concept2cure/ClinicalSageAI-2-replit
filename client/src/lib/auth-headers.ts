/**
 * Shared auth header construction for raw fetch calls.
 *
 * Used when apiRequest() can't be used (SSE streaming needs
 * AbortController signal, file upload needs multipart FormData).
 *
 * Replicates the auth logic from apiRequest() in queryClient.ts
 * without duplicating localStorage key knowledge.
 */
import { getAuthToken } from '../utils/authToken';

export function getAuthHeaders(): Record<string, string> {
  const orgId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  const token = getAuthToken() || '';
  return {
    'x-organization-id': orgId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
