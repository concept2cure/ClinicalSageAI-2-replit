import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import { getAuthToken, clearAuthToken } from '../utils/authToken';

const HTTP_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']);

// Create axios instance with default config
export const api = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor to include organization ID and auth token headers
api.interceptors.request.use(
  config => {
    // Get organization ID from localStorage (set by TenantContext)
    const orgId = localStorage.getItem('currentOrganizationId');
    if (orgId) {
      config.headers['x-organization-id'] = orgId;
    }
    // Include JWT auth token if available (stored by authService on login)
    const authToken = getAuthToken();
    if (authToken) {
      config.headers['Authorization'] = `Bearer ${authToken}`;
    }
    return config;
  },
  error => {
    return Promise.reject(error);
  }
);

// Default query function that works with the TenantContext
// to automatically include X-Tenant-ID header for authenticated requests
const defaultQueryFn = async ({ queryKey }) => {
  // The first item in the query key should be the endpoint URL
  const [endpoint] = queryKey;
  return apiRequest(endpoint); // Defaults to GET method
  // const [endpoint, ...params] = queryKey;

  // try {
  //   const response = await api.get(endpoint);
  //   return response.data;
  // } catch (error) {
  //   // Handle errors consistently
  //   const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
  //   console.error(`[API Error]: ${errorMessage}`, error);
  //   throw new Error(errorMessage);
  // }
};

// Helper for API requests with various methods (POST, PATCH, DELETE, etc.)
const parseErrorMessage = payload => {
  if (!payload || typeof payload !== 'object') return '';
  return payload?.error?.message || payload?.error || payload?.message || '';
};

const buildLegacyAxiosConfig = (url, options = {}) => {
  const { method = 'GET', data = null, ...restOptions } = options;
  const upperMethod = String(method || 'GET').toUpperCase();
  const requestConfig = {
    url,
    method: upperMethod,
    ...restOptions,
  };

  if (data !== null && data !== undefined) {
    requestConfig.data = data;
  } else if (upperMethod !== 'DELETE' && upperMethod !== 'GET') {
    requestConfig.data = data;
  }

  return requestConfig;
};

const requestWithLegacyAxios = async (url, options = {}) => {
  const requestConfig = buildLegacyAxiosConfig(url, options);
  try {
    const response = await api(requestConfig);
    return response.data;
  } catch (error) {
    if (error?.response?.status === 401) {
      clearAuthToken();
    }
    const errorMessage =
      parseErrorMessage(error?.response?.data) || error?.message || 'An error occurred';
    console.error(`[API Error ${requestConfig.method}]: ${errorMessage}`, error);
    throw new Error(errorMessage);
  }
};

const requestWithMethodUrlSignature = async (method, url, body = undefined, customHeaders = {}) => {
  const upperMethod = String(method).toUpperCase();
  const orgId = localStorage.getItem('currentOrganizationId');
  const authToken = getAuthToken();

  const headers = {
    'Content-Type': 'application/json',
    ...(orgId ? { 'x-organization-id': orgId } : {}),
    ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    ...(customHeaders || {}),
  };

  const options = {
    method: upperMethod,
    headers,
    credentials: 'include',
  };

  if (body !== undefined && body !== null && upperMethod !== 'GET') {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);

  if (!response.ok && response.status !== 401) {
    let errorMessage = '';
    const contentType = response.headers.get('Content-Type') || '';
    if (contentType.includes('application/json')) {
      const payload = await response.json().catch(() => ({}));
      errorMessage = parseErrorMessage(payload);
    } else {
      errorMessage = await response.text().catch(() => '');
    }
    throw new Error(errorMessage || `API request failed with status ${response.status}`);
  }

  return response;
};

export const apiRequest = async (arg1, arg2 = undefined, arg3 = undefined, arg4 = undefined) => {
  // Modern signature used by TypeScript code: apiRequest('GET', '/api/path', body?, headers?)
  if (
    typeof arg1 === 'string' &&
    typeof arg2 === 'string' &&
    HTTP_METHODS.has(arg1.toUpperCase())
  ) {
    return requestWithMethodUrlSignature(arg1, arg2, arg3, arg4);
  }

  // Legacy shorthand still used in JS surfaces: apiRequest('/api/path', 'GET', data?, options?)
  if (
    typeof arg1 === 'string' &&
    typeof arg2 === 'string' &&
    HTTP_METHODS.has(arg2.toUpperCase())
  ) {
    const method = arg2.toUpperCase();
    const data = arg3 ?? null;
    const extraOptions = arg4 && typeof arg4 === 'object' ? arg4 : {};
    return requestWithLegacyAxios(arg1, { method, data, ...extraOptions });
  }

  // Existing legacy signature: apiRequest('/api/path', { method, data, ... })
  if (typeof arg1 === 'string') {
    const options = arg2 && typeof arg2 === 'object' ? arg2 : {};
    return requestWithLegacyAxios(arg1, options);
  }

  throw new Error('Invalid apiRequest arguments');
};
export const apiPost = async (url, data, options = {}) => {
  try {
    const response = await api.post(url, data, options);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
    console.error(`[API Error POST]: ${errorMessage}`, error);
    throw new Error(errorMessage);
  }
};

export const apiPut = async (url, data, options = {}) => {
  try {
    const response = await api.put(url, data, options);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
    console.error(`[API Error PUT]: ${errorMessage}`, error);
    throw new Error(errorMessage);
  }
};

export const apiDelete = async (url, options = {}) => {
  try {
    const response = await api.delete(url, options);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
    console.error(`[API Error DELETE]: ${errorMessage}`, error);
    throw new Error(errorMessage);
  }
};

// Create the query client with default settings
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: defaultQueryFn,
      staleTime: 1000 * 60 * 5, // 5 minutes
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

export default queryClient;
