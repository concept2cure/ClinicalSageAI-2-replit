import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';

// Create axios instance with default config
export const api = axios.create({
  baseURL: '/',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add interceptor to include organization ID header from localStorage
api.interceptors.request.use(
  (config) => {
    // Get organization ID from localStorage (set by TenantContext)
    const orgId = localStorage.getItem('currentOrganizationId');
    if (orgId) {
      config.headers['x-organization-id'] = orgId;
    }
    const accessToken =
      localStorage.getItem('accessToken') ||
      localStorage.getItem('token') ||
      localStorage.getItem('authToken') ||
      localStorage.getItem('auth_token');
    if (accessToken) {
      config.headers['Authorization'] = `Bearer ${accessToken}`;
    }
    // DO NOT fallback to default - let server validate and reject if missing
    // This ensures proper multi-tenant isolation
    return config;
  },
  (error) => {
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
export const apiRequest = async (url, options = {}) => {
  // options can include method, data, headers, etc.
  const { method = 'GET', data = null, ...restOptions } = options;

  // For DELETE requests, don't send a body if data is null/undefined
  const requestConfig = {
    url,
    method,
    ...restOptions,
  };

  // Only add data to the request if it's not null and not a GET/DELETE method with null data
  if (data !== null && data !== undefined) {
    requestConfig.data = data;
  } else if (method === 'DELETE' || method === 'GET') {
    // For DELETE and GET requests, don't include data property at all
    // This prevents sending "null" as the request body
  } else {
    // For other methods (POST, PATCH, PUT), include data even if null
    requestConfig.data = data;
  }

  try {
    const response = await api(requestConfig);
    return response.data;
  } catch (error) {
    const errorMessage = error.response?.data?.error || error.message || 'An error occurred';
    console.error(`[API Error ${method}]: ${errorMessage}`, error);
    throw new Error(errorMessage);
  }
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
