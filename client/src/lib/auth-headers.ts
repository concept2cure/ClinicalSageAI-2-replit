/**
 * Shared auth header construction for raw fetch calls.
 *
 * Used when apiRequest() can't be used (SSE streaming needs
 * AbortController signal, file upload needs multipart FormData).
 *
 * Delegates to the canonical authToken module — no direct localStorage access.
 */
import { getAuthToken, getAuthHeaders as getCanonicalAuthHeaders } from '@/utils/authToken';

export function getAuthHeaders(): Record<string, string> {
  return getCanonicalAuthHeaders();
}

/**
 * @deprecated Use getAuthToken() from '@/utils/authToken' directly
 */
export function getToken(): string {
  return getAuthToken() || '';
}
