/**
 * Concept2Cure Cookie Management Module
 *
 * Provides secure cookie management functions with enhanced security features
 * for storing session data, tokens, and user preferences.
 */

/**
 * Set a cookie with the provided name, value, and options
 *
 * @param {string} name - Cookie name
 * @param {string} value - Cookie value
 * @param {Object} options - Cookie options
 * @param {number} options.days - Days until expiration
 * @param {string} options.path - Cookie path
 * @param {boolean} options.secure - Whether cookie should only be sent over HTTPS
 * @param {string} options.sameSite - SameSite attribute (strict, lax, none)
 */
export function setCookie(name, value, options = {}) {
  // Default options
  const defaultOptions = {
    days: 7,
    path: '/',
    secure: window.location.protocol === 'https:',
    sameSite: 'lax',
  };

  // Merge options
  const cookieOptions = { ...defaultOptions, ...options };

  // Set expiration
  const expirationDate = new Date();
  expirationDate.setDate(expirationDate.getDate() + cookieOptions.days);

  // Build cookie string
  let cookieString = `${encodeURIComponent(name)}=${encodeURIComponent(value)}`;
  cookieString += `; expires=${expirationDate.toUTCString()}`;
  cookieString += `; path=${cookieOptions.path}`;

  // Add secure flag if applicable
  if (cookieOptions.secure) {
    cookieString += '; secure';
  }

  // Add SameSite attribute
  cookieString += `; samesite=${cookieOptions.sameSite}`;

  // Set the cookie
  document.cookie = cookieString;
}

/**
 * Get a cookie by name
 *
 * @param {string} name - Cookie name
 * @returns {string|null} - Cookie value or null if not found
 */
export function getCookie(name) {
  const nameEQ = encodeURIComponent(name) + '=';
  const cookies = document.cookie.split(';');

  for (let i = 0; i < cookies.length; i++) {
    let cookie = cookies[i];
    while (cookie.charAt(0) === ' ') {
      cookie = cookie.substring(1, cookie.length);
    }

    if (cookie.indexOf(nameEQ) === 0) {
      return decodeURIComponent(cookie.substring(nameEQ.length, cookie.length));
    }
  }

  return null;
}

/**
 * Remove a cookie by name
 *
 * @param {string} name - Cookie name
 * @param {string} path - Cookie path
 */
export function removeCookie(name, path = '/') {
  // Set expiration to the past to delete the cookie
  document.cookie = `${encodeURIComponent(name)}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}; secure; samesite=strict`;
}

/**
 * Check if cookies are enabled in the browser
 *
 * @returns {boolean} - Whether cookies are enabled
 */
export function areCookiesEnabled() {
  const testCookieName = 'trialsage_cookie_test';
  const testCookieValue = 'test';

  // Try to set a test cookie
  setCookie(testCookieName, testCookieValue, { days: 1 });

  // Check if the test cookie was set successfully
  const cookieEnabled = getCookie(testCookieName) === testCookieValue;

  // Clean up the test cookie
  removeCookie(testCookieName);

  return cookieEnabled;
}

/**
 * Get all cookies as an object
 *
 * @returns {Object} - All cookies
 */
export function getAllCookies() {
  const cookies = {};
  const cookieArray = document.cookie.split(';');

  for (let i = 0; i < cookieArray.length; i++) {
    const cookiePair = cookieArray[i].trim().split('=');

    if (cookiePair[0]) {
      cookies[decodeURIComponent(cookiePair[0])] = cookiePair[1]
        ? decodeURIComponent(cookiePair[1])
        : '';
    }
  }

  return cookies;
}

/**
 * Clear all cookies
 */
export function clearAllCookies() {
  const cookies = getAllCookies();

  for (const name in cookies) {
    removeCookie(name);
  }
}

// Export default object
export default {
  setCookie,
  getCookie,
  removeCookie,
  areCookiesEnabled,
  getAllCookies,
  clearAllCookies,
};
