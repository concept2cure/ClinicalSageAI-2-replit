import { QueryClient } from '@tanstack/react-query';

export type ApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface GetQueryFnOptions {
  on401?: 'throw' | 'returnNull';
}

// Cache localStorage reads to avoid repeated lookups on every API call.
// Invalidated on storage events (other tabs) and re-read lazily.
let _cachedOrgId: string | null = null;
let _cachedAuthToken: string | null = null;

export function getCachedOrgId(): string {
  if (!_cachedOrgId) {
    _cachedOrgId =
      localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  }
  return _cachedOrgId;
}

function getCachedAuthToken(): string | null {
  if (_cachedAuthToken === null) {
    _cachedAuthToken =
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('auth_token') ||
      '';
  }
  return _cachedAuthToken || null;
}

// Invalidate cache when localStorage changes (login/logout/org switch)
if (typeof window !== 'undefined') {
  window.addEventListener('storage', () => {
    _cachedOrgId = null;
    _cachedAuthToken = null;
  });
}

/** Force-refresh the cached org/auth values (call after login or org switch). */
export function invalidateApiCache() {
  _cachedOrgId = null;
  _cachedAuthToken = null;
}

export const apiRequest = async (
  method: ApiRequestMethod,
  url: string,
  body?: any,
  customHeaders?: Record<string, string>
): Promise<Response> => {
  const organizationId = getCachedOrgId();
  const authToken = getCachedAuthToken();

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...customHeaders,
  };

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok && response.status !== 401) {
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const errorPayload = await response.json().catch(() => ({}));
      const message = errorPayload?.error?.message || errorPayload?.error || errorPayload?.message;
      throw new Error(message || `API request failed with status ${response.status}`);
    }
    const errorText = await response.text();
    throw new Error(errorText || `API request failed with status ${response.status}`);
  }

  return response;
};

export const getQueryFn = (options: GetQueryFnOptions = {}) => {
  return async ({ queryKey }: { queryKey: string[] }) => {
    const [url] = queryKey;
    const response = await apiRequest('GET', url, undefined, {
      'x-organization-id': getCachedOrgId(),
    });

    if (response.status === 401) {
      if (options.on401 === 'returnNull') {
        return null;
      }
      throw new Error('Unauthorized');
    }

    // For empty responses or 204 No Content
    if (response.status === 204 || response.headers.get('Content-Length') === '0') {
      return null;
    }

    return response.json();
  };
};

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // Keep unused data for 10 minutes before GC
      refetchOnWindowFocus: false, // Avoid unnecessary refetches on tab switch
      refetchOnReconnect: true, // Refetch after network recovery
      queryFn: getQueryFn(),
    },
    mutations: {
      retry: 0, // Don't auto-retry mutations
    },
  },
});

export default queryClient;
