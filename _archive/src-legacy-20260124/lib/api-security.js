/**
 * API Security Module
 *
 * This module enhances API security with request signing, rate limiting,
 * and other security measures to protect against common API vulnerabilities.
 */

import { encryptData } from './security';

// Rate limiting implementation
const rateLimitStore = {};
const RATE_LIMIT_WINDOW = 60000; // 1 minute in milliseconds
const MAX_REQUESTS_PER_WINDOW = 100;

/**
 * Checks if the current request exceeds rate limits
 * @param {string} endpoint - API endpoint
 * @returns {boolean} - True if request should be allowed, false if rate limited
 */
export function checkRateLimit(endpoint) {
  const now = Date.now();
  const key = endpoint || 'global';

  if (!rateLimitStore[key]) {
    rateLimitStore[key] = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
    return true;
  }

  // Reset counter if window has passed
  if (now > rateLimitStore[key].resetTime) {
    rateLimitStore[key] = {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    };
    return true;
  }

  // Increment counter and check limit
  rateLimitStore[key].count += 1;
  return rateLimitStore[key].count <= MAX_REQUESTS_PER_WINDOW;
}

/**
 * Generates secure request headers with CSRF protection and request signing
 * @param {string} method - HTTP method
 * @param {string} url - API URL
 * @param {object} data - Request data
 * @returns {object} - Headers object
 */
export function generateSecureHeaders(method, url, data = null) {
  // Get CSRF token from meta tag or storage
  const csrfToken =
    document.querySelector('meta[name="csrf-token"]')?.getAttribute('content') ||
    localStorage.getItem('csrfToken');

  // Generate nonce for request signing
  const nonce = generateNonce();

  // Calculate timestamp for request freshness validation
  const timestamp = new Date().toISOString();

  // Create signature base string
  const signatureBase = `${method.toUpperCase()}:${url}:${timestamp}:${nonce}:${data ? JSON.stringify(data) : ''}`;

  // Sign the request
  const signature = encryptData(signatureBase).substring(0, 44);

  // Return security headers
  return {
    'X-CSRF-Token': csrfToken,
    'X-Request-Timestamp': timestamp,
    'X-Request-Nonce': nonce,
    'X-Request-Signature': signature,
    'X-API-Version': '1.0',
    'Content-Type': 'application/json',
  };
}

/**
 * Generate a cryptographically secure nonce
 * @returns {string} - Random nonce string
 */
function generateNonce() {
  const array = new Uint8Array(16);
  window.crypto.getRandomValues(array);
  return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
}

/**
 * Enhanced fetch function with security measures
 * @param {string} url - API URL
 * @param {object} options - Fetch options
 * @returns {Promise} - Fetch promise
 */
export async function secureFetch(url, options = {}) {
  const method = options.method || 'GET';
  const data = options.body ? JSON.parse(options.body) : null;

  // Check rate limiting
  if (!checkRateLimit(url)) {
    throw new Error('Rate limit exceeded. Please try again later.');
  }

  // Generate secure headers
  const securityHeaders = generateSecureHeaders(method, url, data);

  // Merge with existing headers
  const headers = {
    ...options.headers,
    ...securityHeaders,
  };

  // Execute fetch with enhanced security
  try {
    const response = await fetch(url, {
      ...options,
      headers,
      credentials: 'include', // Always send cookies for CSRF validation
    });

    // Check for security-related response headers
    const contentSecurityPolicy = response.headers.get('Content-Security-Policy');
    if (!contentSecurityPolicy) {
      console.warn('Server response missing Content-Security-Policy header');
    }

    return response;
  } catch (error) {
    console.error('Secure fetch error:', error);
    throw error;
  }
}

/**
 * Validates a server response for security issues
 * @param {Response} response - Fetch response
 * @returns {boolean} - True if response is secure
 */
export function validateResponseSecurity(response) {
  // Check for security headers
  const securityHeaders = [
    'Content-Security-Policy',
    'X-Content-Type-Options',
    'X-Frame-Options',
    'Strict-Transport-Security',
  ];

  const missingHeaders = securityHeaders.filter(header => !response.headers.get(header));
  if (missingHeaders.length > 0) {
    console.warn('Server response missing security headers:', missingHeaders);
    return false;
  }

  return true;
}

export default {
  secureFetch,
  checkRateLimit,
  generateSecureHeaders,
  validateResponseSecurity,
};
