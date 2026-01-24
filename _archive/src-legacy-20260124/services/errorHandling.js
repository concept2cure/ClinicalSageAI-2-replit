/**
 * Error Handling Service
 *
 * This service provides consistent error handling for API requests
 * with appropriate logging and toast notifications.
 */

/**
 * Handle API errors consistently across the application
 *
 * @param {Error} error - The error object
 * @param {Object} options - Configuration options
 * @param {string} options.context - The context where the error occurred (e.g., 'CER History')
 * @param {string} options.endpoint - The API endpoint that was called
 * @param {Function} options.toast - The toast function from useToast hook
 * @param {Function} options.onError - Optional callback for additional error handling
 */
export function handleApiError(error, { context, endpoint, toast, onError }) {
  console.error(`API Error in ${context} (${endpoint}):`, error);

  let errorMessage = 'An unexpected error occurred.';

  // Parse error response if available
  if (error.response) {
    try {
      const responseData = error.response.data;
      if (typeof responseData === 'string') {
        errorMessage = responseData;
      } else if (responseData.message) {
        errorMessage = responseData.message;
      } else if (responseData.error) {
        errorMessage = responseData.error;
      }
    } catch (e) {
      console.error('Error parsing error response:', e);
    }
  } else if (error.message) {
    errorMessage = error.message;
  }

  // Show toast notification
  if (toast) {
    toast({
      title: `${context} Error`,
      description: errorMessage,
      variant: 'destructive',
    });
  }

  // Call additional error handler if provided
  if (onError && typeof onError === 'function') {
    onError(error, errorMessage);
  }

  return errorMessage;
}

/**
 * Format API validation errors from server
 *
 * @param {Object} errors - Validation errors object from server
 * @returns {string} - Formatted error message
 */
export function formatValidationErrors(errors) {
  if (!errors) return 'Validation failed';

  // If errors is already a string, return it
  if (typeof errors === 'string') return errors;

  // If errors is an array of strings, join them
  if (Array.isArray(errors)) {
    return errors.join(', ');
  }

  // If errors is an object with field-specific errors
  if (typeof errors === 'object') {
    return Object.entries(errors)
      .map(([field, message]) => `${field}: ${message}`)
      .join(', ');
  }

  return 'Validation failed';
}

/**
 * Check if an error is a network error
 *
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's a network error
 */
export function isNetworkError(error) {
  return (
    error.message === 'Network Error' ||
    (error.request && !error.response) ||
    error.message.includes('Failed to fetch')
  );
}

/**
 * Check if an error is an authentication error
 *
 * @param {Error} error - The error to check
 * @returns {boolean} - True if it's an authentication error
 */
export function isAuthError(error) {
  return (
    error.response?.status === 401 ||
    error.response?.status === 403 ||
    error.message?.toLowerCase().includes('unauthorized') ||
    error.message?.toLowerCase().includes('forbidden')
  );
}
