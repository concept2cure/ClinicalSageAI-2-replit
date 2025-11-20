/**
 * Enhanced QueryClient with Security Features
 * This module extends the standard queryClient with enhanced security features:
 * - Request signing
 * - Rate limiting
 * - CSRF protection
 * - Error handling with audit logging
 * - Secure headers
 */

import { QueryClient } from '@tanstack/react-query';
import { generateSecureHeaders, checkRateLimit, validateResponseSecurity } from './api-security';
import { encryptData, decryptData, sanitizeInput } from './security';

// Create a secure query client with enhanced security
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 1,
      refetchOnWindowFocus: false,
      // Secure response data sanitization
      select: data => {
        if (typeof data === 'string') {
          return sanitizeInput(data);
        }
        return data;
      },
    },
  },
});

// Default query options
const defaultOptions = {
  credentials: 'include',
  // Always include security headers
  headers: {
    'Content-Type': 'application/json',
    'X-Client-Version': '1.0',
    'X-Requested-With': 'XMLHttpRequest',
  },
};

/**
 * Enhanced API request function with security features
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} url - API endpoint
 * @param {object} body - Request body (for POST, PUT, etc.)
 * @param {object} customOptions - Additional fetch options
 * @returns {Promise} - Fetch promise
 */
export async function apiRequest(method, url, body = null, customOptions = {}) {
  // Apply rate limiting
  if (!checkRateLimit(url)) {
    throw new Error('Rate limit exceeded for this endpoint. Please try again later.');
  }

  // Get secure headers with request signing
  const securityHeaders = generateSecureHeaders(method, url, body);

  // Prepare options with security enhancements
  const options = {
    ...defaultOptions,
    method,
    headers: {
      ...defaultOptions.headers,
      ...securityHeaders,
      ...customOptions.headers,
    },
  };

  // Add body if present (and not GET)
  if (body && method !== 'GET') {
    options.body = JSON.stringify(body);
  }

  // Log sensitive API requests (anonymized for security)
  if (url.includes('/auth') || url.includes('/user') || url.includes('/profile')) {
    console.info(
      `Secure API request [${new Date().toISOString()}]: ` +
        `${method} ${url.replace(/\/[^\/]+$/, '/*')} | ` +
        `Headers: ${Object.keys(options.headers).length} | ` +
        `Body: ${body ? '✓' : '✗'}`
    );
  }

  try {
    // Make the request with enhanced security
    const response = await fetch(`/api${url}`, options);

    // Validate response security headers
    validateResponseSecurity(response);

    // Handle common response patterns
    if (!response.ok) {
      // Secure error handling - avoid leaking sensitive information
      const error = await response.json().catch(() => ({}));

      const safeError = {
        status: response.status,
        message: error.message || response.statusText,
        // Remove potentially sensitive fields
        ...(error.code ? { code: error.code } : {}),
      };

      throw safeError;
    }

    return response;
  } catch (error) {
    // Enhanced error handling with security auditing
    console.error(`API Request Error [${method} ${url}]:`, error.message || 'Unknown error');

    // Rethrow with sanitized information
    throw {
      message: error.message || 'An error occurred while processing your request',
      status: error.status || 500,
    };
  }
}

/**
 * Create a queryFn with enhanced security
 * @param {object} options - Query options
 * @returns {function} - Query function
 */
export function getQueryFn(options = {}) {
  return async ({ queryKey }) => {
    try {
      const response = await apiRequest('GET', queryKey[0]);

      if (options.rawResponse) {
        return response;
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error.status === 401 && options.on401 === 'returnNull') {
        return null;
      }
      throw error;
    }
  };
}

// Export default secure client configuration
export default { queryClient, apiRequest, getQueryFn };
