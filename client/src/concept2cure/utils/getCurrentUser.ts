/**
 * getCurrentUser — Extract current user info from the JWT token in storage.
 *
 * This is a lightweight, synchronous helper for UI purposes (showing author
 * names, filtering "My comments", etc.). It does NOT validate the token.
 *
 * For auth decisions, use the server-side JWT verification or the AuthProvider.
 */
export function getCurrentUser(): { id: string; name: string; email: string } {
  try {
    const token =
      sessionStorage.getItem('trialsage_access_token') ||
      localStorage.getItem('trialsage_access_token');
    if (!token) return { id: 'anonymous', name: 'You', email: '' };
    const payload = JSON.parse(atob(token.split('.')[1]));
    return {
      id: String(payload.sub || payload.userId || payload.id || 'anonymous'),
      name: payload.displayName || payload.name || payload.email || 'You',
      email: payload.email || '',
    };
  } catch {
    return { id: 'anonymous', name: 'You', email: '' };
  }
}
