import { QueryClient } from '@tanstack/react-query';
import { getAccessToken } from './authClient';

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
  // Get organization ID from localStorage
  const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
  
  const accessToken =
    getAccessToken() ||
    localStorage.getItem('token') ||
    localStorage.getItem('authToken') ||
    localStorage.getItem('auth_token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    'x-organization-id': organizationId,
    ...customHeaders,
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

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
    const errorText = await response.text();
    throw new Error(errorText || `API request failed with status ${response.status}`);
  }

  return response;
};

export const getQueryFn = (options: GetQueryFnOptions = {}) => {
  return async ({ queryKey }: { queryKey: string[] }) => {
    const [url] = queryKey;
    // Get organization ID from localStorage
    const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId') || '1';
    const response = await apiRequest('GET', url, undefined, {
      'x-organization-id': organizationId
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
