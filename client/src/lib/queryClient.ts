import { QueryClient } from '@tanstack/react-query';

export type ApiRequestMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';

interface GetQueryFnOptions {
  on401?: 'throw' | 'returnNull';
}

export const apiRequest = async (
  method: ApiRequestMethod,
  url: string,
  body?: any,
  customHeaders?: Record<string, string>
): Promise<Response> => {
  // Module-level: cannot use React hooks here. Reads from localStorage
  // which is synced by TenantProvider. Components should use useTenantContext() directly.
  const organizationId =
    localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';

  // Get auth token from localStorage (stored by authService on login)
  const authToken =
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('auth_token');

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
    // Module-level: cannot use React hooks. Synced by TenantProvider.
    const organizationId =
      localStorage.getItem('organizationId') ||
      localStorage.getItem('currentOrganizationId') ||
      '1';
    const response = await apiRequest('GET', url, undefined, {
      'x-organization-id': organizationId,
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
      queryFn: getQueryFn(),
    },
  },
});

export default queryClient;
