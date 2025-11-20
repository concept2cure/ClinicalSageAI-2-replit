/**
 * TrialSage Error Handling Utilities
 *
 * This module provides enhanced error handling utilities for the TrialSage application,
 * ensuring production-ready error resilience, graceful failure modes, and proper
 * user feedback for API and service operations.
 */

/**
 * Default friendly messages for common error types
 */
export const defaultFriendlyMessages = {
  network: 'Network connection issue. Please check your internet connection and try again.',
  timeout: 'The operation timed out. The server might be experiencing high load.',
  unauthorized: 'Authentication error. Please sign in again.',
  forbidden: "You don't have permission to perform this action.",
  notFound: 'The requested resource was not found.',
  unavailable: 'This service is temporarily unavailable. Please try again later.',
  rateLimit: 'Too many requests. Please wait and try again later.',
  server: 'The server encountered an error. Our team has been notified.',
  unknown: 'An unexpected error occurred. Please try again.',
};

/**
 * Add a timeout to a Promise
 *
 * @param {Promise} promise - The promise to add timeout to
 * @param {number} timeoutMs - Timeout in milliseconds
 * @param {string} message - Custom timeout message
 * @returns {Promise} - Promise with timeout
 */
export const withTimeout = (promise, timeoutMs, message = 'Operation timed out') => {
  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(() => {
      reject(new Error(message));
    }, timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]);
};

/**
 * Format an error for display with consistent structure and friendly messages
 *
 * @param {Error} error - The error to format
 * @param {Object} options - Formatting options
 * @param {Object} options.friendlyMessages - Custom friendly messages for error types
 * @returns {Object} - Formatted error object
 */
export const formatErrorForDisplay = (error, options = {}) => {
  const { friendlyMessages = {} } = options;

  // Combine default and custom friendly messages
  const messages = {
    ...defaultFriendlyMessages,
    ...friendlyMessages,
  };

  // Default formatted error
  const formattedError = {
    message: messages.unknown,
    code: 'UNKNOWN_ERROR',
    technical: error?.message || 'Unknown error',
    timestamp: new Date().toISOString(),
    status: null,
  };

  // Extract HTTP status from Axios errors
  if (error?.response?.status) {
    formattedError.status = error.response.status;

    // Set error code and message based on status code
    switch (error.response.status) {
      case 400:
        formattedError.code = 'INVALID_REQUEST';
        formattedError.message =
          error.response.data?.message || 'The request was invalid. Please check your input.';
        break;
      case 401:
        formattedError.code = 'UNAUTHORIZED';
        formattedError.message = messages.unauthorized;
        break;
      case 403:
        formattedError.code = 'FORBIDDEN';
        formattedError.message = messages.forbidden;
        break;
      case 404:
        formattedError.code = 'NOT_FOUND';
        formattedError.message = messages.notFound;
        break;
      case 408:
        formattedError.code = 'REQUEST_TIMEOUT';
        formattedError.message = messages.timeout;
        break;
      case 429:
        formattedError.code = 'RATE_LIMITED';
        formattedError.message = messages.rateLimit;
        break;
      case 500:
        formattedError.code = 'SERVER_ERROR';
        formattedError.message = messages.server;
        break;
      case 503:
        formattedError.code = 'SERVICE_UNAVAILABLE';
        formattedError.message = messages.unavailable;
        break;
      default:
        if (error.response.status >= 500) {
          formattedError.code = 'SERVER_ERROR';
          formattedError.message = messages.server;
        } else {
          formattedError.code = 'CLIENT_ERROR';
          formattedError.message =
            error.response.data?.message || 'The request could not be completed.';
        }
    }

    // Include server error details for debugging if available
    if (error.response.data) {
      formattedError.serverDetails = error.response.data;
    }
  } else if (error.request) {
    // Network error (no response received)
    formattedError.code = 'NETWORK_ERROR';
    formattedError.message = messages.network;
  } else if (error.message?.includes('timeout')) {
    // Timeout error
    formattedError.code = 'TIMEOUT';
    formattedError.message = messages.timeout;
  }

  return formattedError;
};

/**
 * Higher-order function that adds retry logic, fallbacks, and error handling
 *
 * @param {Function} fn - Async function to execute
 * @param {Object} options - Options for error handling
 * @param {Function} options.fallback - Fallback function to run if main function fails after retries
 * @param {number} options.retries - Number of retries (default: 0)
 * @param {number} options.retryDelay - Delay between retries in ms (default: 1000)
 * @param {Function} options.onError - Function to call when an error occurs
 * @returns {Function} - Wrapped function with error handling
 */
export const withErrorHandling = (fn, options = {}) => {
  const { fallback = null, retries = 0, retryDelay = 1000, onError = null } = options;

  return async (...args) => {
    let lastError;

    // Try the original function with retries
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        // Execute the function
        return await fn(...args);
      } catch (error) {
        lastError = error;

        // Call onError callback if provided
        if (onError && typeof onError === 'function') {
          onError(error, { attempt, isLastAttempt: attempt === retries });
        }

        // Don't wait on the last attempt
        if (attempt < retries) {
          // Wait for retry delay
          await new Promise(resolve => setTimeout(resolve, retryDelay));

          // Log retry attempt
          console.log(`Retrying operation (${attempt + 1}/${retries})...`);
        }
      }
    }

    // If we get here, all attempts failed

    // If fallback is provided, try it
    if (fallback && typeof fallback === 'function') {
      try {
        return await fallback(...args, lastError);
      } catch (fallbackError) {
        // If even fallback fails, throw enhanced error
        const enhancedError = new Error(
          `Main and fallback operations failed: ${lastError.message}; Fallback error: ${fallbackError.message}`
        );
        enhancedError.originalError = lastError;
        enhancedError.fallbackError = fallbackError;
        throw enhancedError;
      }
    }

    // No fallback, throw the last error
    throw lastError;
  };
};

/**
 * Safe JSON parsing with graceful fallback
 *
 * @param {string} jsonString - JSON string to parse
 * @param {*} fallbackValue - Value to return if parsing fails
 * @returns {*} - Parsed JSON or fallback value
 */
export const safeJsonParse = (jsonString, fallbackValue = null) => {
  try {
    return JSON.parse(jsonString);
  } catch (error) {
    console.warn('JSON parse error:', error.message);
    return fallbackValue;
  }
};

/**
 * Capture and log errors to console and optionally to monitoring service
 *
 * @param {Error} error - Error to capture
 * @param {Object} context - Additional context information
 * @param {boolean} sendToMonitoring - Whether to send to monitoring service
 */
export const captureError = (error, context = {}, sendToMonitoring = true) => {
  // Console logging for immediate visibility
  console.error('Error captured:', error.message, {
    error,
    context,
    timestamp: new Date().toISOString(),
  });

  // In a production app, would send to monitoring service
  if (sendToMonitoring && window.errorMonitoring) {
    window.errorMonitoring.captureException(error, { context });
  }
};

/**
 * Create a guard function that captures errors from event handlers
 *
 * @param {Function} fn - Function to guard
 * @param {Object} options - Error handling options
 * @returns {Function} - Guarded function
 */
export const guardEventHandler = (fn, options = {}) => {
  return (...args) => {
    try {
      const result = fn(...args);

      // Handle promise returns
      if (result instanceof Promise) {
        return result.catch(error => {
          captureError(error, { handler: fn.name, args }, options.sendToMonitoring);

          // Show user feedback if specified
          if (options.showFeedback) {
            // In a real app, would show a toast notification
            console.error('An error occurred:', formatErrorForDisplay(error).message);
          }
        });
      }

      return result;
    } catch (error) {
      captureError(error, { handler: fn.name, args }, options.sendToMonitoring);

      // Show user feedback if specified
      if (options.showFeedback) {
        // In a real app, would show a toast notification
        console.error('An error occurred:', formatErrorForDisplay(error).message);
      }
    }
  };
};
