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
<<<<<<< HEAD
  const demoOrganizationId = (import.meta as any).env?.VITE_DEMO_ORG_ID as string | undefined;
  const organizationId =
    localStorage.getItem('currentOrganizationId') ||
    localStorage.getItem('organizationId') ||
    demoOrganizationId;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(customHeaders ?? {}),
=======
  // Get organization ID from localStorage when available
  const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...customHeaders,
    ...(organizationId ? { 'x-organization-id': organizationId } : {}),
>>>>>>> codex/implement-liquid-csr-ingestion-pipeline
  };

  if (organizationId) {
    headers['x-organization-id'] = organizationId;
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
<<<<<<< HEAD
    const response = await apiRequest('GET', url);
=======
    // Get organization ID from localStorage when available
    const organizationId = localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
    const response = await apiRequest(
      'GET',
      url,
      undefined,
      organizationId ? { 'x-organization-id': organizationId } : undefined
    );
>>>>>>> codex/implement-liquid-csr-ingestion-pipeline

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
