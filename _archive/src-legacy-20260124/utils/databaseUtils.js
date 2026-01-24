/**
 * Database Utilities
 *
 * This module provides utility functions for database operations
 * and fallback mechanisms for handling database connection issues.
 */

/**
 * Attempt to perform a database operation with fallback handling
 *
 * @param {Function} operation - The database operation to attempt
 * @param {any} fallbackValue - The value to return if the operation fails
 * @param {Function} onError - Optional callback for error handling
 * @returns {Promise<any>} The result of the operation or the fallback value
 */
export async function withFallback(operation, fallbackValue, onError) {
  try {
    return await operation();
  } catch (error) {
    console.error('Database operation failed:', error);

    if (onError && typeof onError === 'function') {
      onError(error);
    }

    return fallbackValue;
  }
}

/**
 * Check if an error is related to a database connection issue
 *
 * @param {Error} error - The error to check
 * @returns {boolean} True if the error is related to a database connection
 */
export function isDatabaseConnectionError(error) {
  if (!error) return false;

  const errorStr = error.toString().toLowerCase();
  const message = error.message ? error.message.toLowerCase() : '';

  // Common database connection error patterns
  const connectionErrors = [
    'connection refused',
    'connection terminated',
    'timeout',
    'econnrefused',
    'database is not available',
    'connection error',
    'network error',
    'connection closed',
    'failed to connect',
    'cannot connect',
  ];

  return connectionErrors.some(pattern => errorStr.includes(pattern) || message.includes(pattern));
}

/**
 * Retry a database operation with exponential backoff
 *
 * @param {Function} operation - The operation to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} initialDelay - Initial delay in milliseconds
 * @param {number} maxDelay - Maximum delay in milliseconds
 * @returns {Promise<any>} The result of the operation
 */
export async function retryOperation(
  operation,
  maxRetries = 3,
  initialDelay = 500,
  maxDelay = 5000
) {
  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      console.warn(`Operation failed (attempt ${attempt + 1}/${maxRetries + 1}):`, error.message);
      lastError = error;

      if (attempt === maxRetries) {
        break;
      }

      // Only retry database connection errors
      if (!isDatabaseConnectionError(error)) {
        throw error;
      }

      // Wait with exponential backoff
      await new Promise(resolve => setTimeout(resolve, delay));

      // Increase delay for next attempt (with max limit)
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Creates a safe fetch function that handles database connection errors
 *
 * @param {Function} fetchFn - The fetch function to wrap
 * @param {any} fallbackData - Fallback data to return if the operation fails
 * @returns {Function} A wrapped fetch function with error handling
 */
export function createSafeFetch(fetchFn, fallbackData) {
  return async (...args) => {
    try {
      return await retryOperation(() => fetchFn(...args));
    } catch (error) {
      console.error('Safe fetch failed after retries:', error);
      return fallbackData;
    }
  };
}
