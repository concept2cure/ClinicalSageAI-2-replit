/**
 * Error Capture Utility
 *
 * Provides functions to capture, store, and retrieve error logs
 * for the System Health Panel to display.
 */

// Maximum number of errors to store
const MAX_ERROR_LOGS = 50;

/**
 * Capture and store an error in localStorage
 *
 * @param {Error|string} error - The error object or message
 * @param {Object} options - Additional options
 * @param {string} options.source - Source of the error (e.g., 'api', 'ui', 'workflow')
 * @param {Object} options.context - Additional context for the error
 */
export const captureError = (error, options = {}) => {
  try {
    const errorLogs = getErrorLogs();

    // Create new error entry
    const newError = {
      message: error instanceof Error ? error.message : String(error),
      details: error instanceof Error ? error.stack : undefined,
      source: options.source || 'application',
      context: options.context || {},
      timestamp: new Date().toISOString(),
    };

    // Add to beginning of array (newest first)
    errorLogs.unshift(newError);

    // Trim if exceeding max size
    if (errorLogs.length > MAX_ERROR_LOGS) {
      errorLogs.length = MAX_ERROR_LOGS;
    }

    // Save to localStorage
    localStorage.setItem('errorLogs', JSON.stringify(errorLogs));

    // Also log to console for debugging
    console.error(`[${newError.source}] ${newError.message}`, error);

    return newError;
  } catch (storageError) {
    // Fallback if localStorage is unavailable
    console.error('Failed to store error in localStorage:', storageError);
    console.error('Original error:', error);
  }
};

/**
 * Get all stored error logs
 *
 * @returns {Array} - Array of error log objects
 */
export const getErrorLogs = () => {
  try {
    const logs = localStorage.getItem('errorLogs');
    return logs ? JSON.parse(logs) : [];
  } catch (error) {
    console.error('Failed to retrieve error logs:', error);
    return [];
  }
};

/**
 * Clear all stored error logs
 */
export const clearErrorLogs = () => {
  try {
    localStorage.removeItem('errorLogs');
  } catch (error) {
    console.error('Failed to clear error logs:', error);
  }
};

/**
 * Initialize global error handler to capture unhandled errors
 */
export const initializeErrorCapture = () => {
  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    captureError(event.reason, {
      source: 'promise',
      context: { type: 'unhandledRejection' },
    });
  });

  // Capture global errors
  window.addEventListener('error', event => {
    captureError(event.error || event.message, {
      source: 'global',
      context: {
        lineNumber: event.lineno,
        columnNumber: event.colno,
        fileName: event.filename,
      },
    });
  });

  // Wrap console.error to capture manually logged errors
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Only capture actual errors, not strings
    const error = args.find(arg => arg instanceof Error);
    if (error) {
      captureError(error, { source: 'console' });
    }

    // Call original console.error
    originalConsoleError.apply(console, args);
  };

  console.log('Error capture initialized');
};

export default {
  captureError,
  getErrorLogs,
  clearErrorLogs,
  initializeErrorCapture,
};
