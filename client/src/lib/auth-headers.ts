/**
 * Shared auth header construction for raw fetch calls.
 *
 * Used when apiRequest() can't be used (SSE streaming needs
 * AbortController signal, file upload needs multipart FormData).
 *
 * Replicates the auth logic from apiRequest() in queryClient.ts
 * without duplicating localStorage key knowledge.
 */
export function getAuthHeaders(): Record<string, string> {
  const orgId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  const token = localStorage.getItem('token') || localStorage.getItem('authToken') || localStorage.getItem('auth_token') || '';
  return {
    'x-organization-id': orgId,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}
