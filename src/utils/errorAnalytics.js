/**
 * Error Analytics Utility
 *
 * This module provides error tracking, analysis, pattern detection,
 * and automated reporting to help identify and fix stability issues.
 *
 * CRITICAL STABILITY COMPONENT - DO NOT MODIFY WITHOUT THOROUGH TESTING
 */

import { LOGGING_CONFIG } from '@/config/stabilityConfig';

// In-memory error store for pattern detection
const errorStore = {
  errors: [],
  patterns: {},
  lastReport: null,
  sessionStart: Date.now(),
  reportingSuspended: false,
};

// Error severity levels
const ERROR_SEVERITY = {
  LOW: 'low', // Minor issues, unlikely to affect user experience
  MEDIUM: 'medium', // Notable issues that might affect some functionality
  HIGH: 'high', // Serious issues affecting core functionality
  CRITICAL: 'critical', // Catastrophic issues affecting the entire application
};

/**
 * Initialize error analytics
 */
export function initErrorAnalytics() {
  // Set up global error handling
  setupGlobalErrorHandlers();

  // Periodically analyze error patterns
  setInterval(analyzeErrorPatterns, 60000); // Every minute

  // Periodically clean up old errors to prevent memory leaks
  setInterval(cleanupOldErrors, 1800000); // Every 30 minutes

  // Log initialization
  console.log('Error analytics initialized');

  return {
    sessionId: generateSessionId(),
    sessionStart: new Date(errorStore.sessionStart).toISOString(),
  };
}

/**
 * Generate a unique session ID
 */
function generateSessionId() {
  return 'session-' + Date.now() + '-' + Math.floor(Math.random() * 1000000).toString(16);
}

/**
 * Set up global error handlers
 */
function setupGlobalErrorHandlers() {
  // Capture uncaught errors
  window.addEventListener('error', event => {
    const { message, filename, lineno, colno, error } = event;

    trackError({
      type: 'uncaught',
      message,
      stack: error?.stack,
      location: {
        filename: extractRelativePath(filename),
        line: lineno,
        column: colno,
      },
      timestamp: Date.now(),
    });

    // Don't prevent the error from propagating
    return false;
  });

  // Capture unhandled promise rejections
  window.addEventListener('unhandledrejection', event => {
    const error = event.reason;

    trackError({
      type: 'unhandledrejection',
      message: error?.message || String(error),
      stack: error?.stack,
      timestamp: Date.now(),
    });

    // Don't prevent the error from propagating
    return false;
  });

  // Patch console.error to capture manual error logging
  const originalConsoleError = console.error;
  console.error = (...args) => {
    // Call the original console.error
    originalConsoleError.apply(console, args);

    // Extract error information
    const errorObjects = args.filter(arg => arg instanceof Error);
    if (errorObjects.length > 0) {
      errorObjects.forEach(error => {
        trackError({
          type: 'console.error',
          message: error.message,
          stack: error.stack,
          timestamp: Date.now(),
        });
      });
    } else if (args.length > 0) {
      // If no Error objects were found, log the first argument as the error message
      trackError({
        type: 'console.error',
        message: String(args[0]),
        arguments: args
          .slice(1)
          .map(arg => (typeof arg === 'object' ? JSON.stringify(arg) : String(arg))),
        timestamp: Date.now(),
      });
    }
  };
}

/**
 * Extract a relative path from an absolute path
 */
function extractRelativePath(filename) {
  // Try to extract just the relative path to avoid exposing full system paths
  try {
    const url = new URL(filename);
    return url.pathname;
  } catch (e) {
    // If parsing as URL fails, try to extract just the filename
    const parts = filename.split(/[/\\]/);
    return parts.slice(-2).join('/'); // Return last two parts of the path
  }
}

/**
 * Track an error for analytics
 *
 * @param {Object} errorData - Error information
 * @param {string} errorData.type - Type of error
 * @param {string} errorData.message - Error message
 * @param {string} errorData.stack - Error stack trace
 * @param {Object} errorData.location - Error location
 * @param {number} errorData.timestamp - Error timestamp
 * @param {Object} errorData.context - Additional context
 */
export function trackError(errorData) {
  if (errorStore.reportingSuspended) {
    return;
  }

  // Add additional metadata
  const enhancedErrorData = {
    ...errorData,
    url: window.location.href,
    userAgent: navigator.userAgent,
    viewportSize: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    // Assign a severity based on the error characteristics
    severity: determineSeverity(errorData),
    sessionDuration: Date.now() - errorStore.sessionStart,
    instanceId: Math.random().toString(36).substring(2, 15),
  };

  // Add to in-memory store
  errorStore.errors.push(enhancedErrorData);

  // If we've collected too many errors, analyze patterns immediately
  if (errorStore.errors.length > 10) {
    analyzeErrorPatterns();
  }

  // Log error to localStorage (if enabled)
  if (LOGGING_CONFIG.persistLogs) {
    persistError(enhancedErrorData);
  }

  // Check for rapid error bursts which might indicate a serious problem
  checkErrorBurst();
}

/**
 * Determine the severity of an error
 */
function determineSeverity(errorData) {
  // Critical errors are those that could crash the application
  if (errorData.type === 'uncaught' || errorData.type === 'unhandledrejection') {
    return ERROR_SEVERITY.CRITICAL;
  }

  // Check for known patterns in the error message or stack
  const message = errorData.message?.toLowerCase() || '';

  // Check for memory-related issues
  if (
    message.includes('out of memory') ||
    message.includes('memory limit exceeded') ||
    message.includes('allocation failed')
  ) {
    return ERROR_SEVERITY.CRITICAL;
  }

  // Check for network failures
  if (
    message.includes('network') ||
    message.includes('failed to fetch') ||
    message.includes('connection') ||
    message.includes('timeout')
  ) {
    return ERROR_SEVERITY.MEDIUM;
  }

  // Check for permission issues
  if (message.includes('permission denied') || message.includes('not allowed')) {
    return ERROR_SEVERITY.HIGH;
  }

  // Check for file and resource issues
  if (message.includes('not found') || message.includes('404') || message.includes('missing')) {
    return ERROR_SEVERITY.MEDIUM;
  }

  // Default to medium severity
  return ERROR_SEVERITY.MEDIUM;
}

/**
 * Check for error bursts (many errors in a short time)
 */
function checkErrorBurst() {
  const BURST_THRESHOLD = 5; // Number of errors
  const BURST_WINDOW = 10000; // 10 seconds

  const now = Date.now();
  const recentErrors = errorStore.errors.filter(error => now - error.timestamp < BURST_WINDOW);

  if (recentErrors.length >= BURST_THRESHOLD) {
    // Only report once per burst to avoid spamming
    if (!errorStore.lastBurstReport || now - errorStore.lastBurstReport > BURST_WINDOW) {
      errorStore.lastBurstReport = now;

      console.warn(
        `Error burst detected: ${recentErrors.length} errors in the last ${BURST_WINDOW / 1000} seconds`
      );

      // Group errors by type
      const errorsByType = recentErrors.reduce((acc, error) => {
        const type = error.type || 'unknown';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      console.warn('Error breakdown by type:', errorsByType);

      // Suggest emergency measures if we have a serious burst
      if (recentErrors.length > BURST_THRESHOLD * 2) {
        console.error(`Severe error burst detected. Consider refreshing the page.`);

        // Temporarily suspend error reporting to prevent feedback loops
        errorStore.reportingSuspended = true;
        setTimeout(() => {
          errorStore.reportingSuspended = false;
        }, BURST_WINDOW);
      }
    }
  }
}

/**
 * Analyze error patterns to detect recurring issues
 */
function analyzeErrorPatterns() {
  if (errorStore.errors.length === 0) {
    return;
  }

  // Group errors by message (simplified)
  const errorsByMessage = {};

  errorStore.errors.forEach(error => {
    // Create a simplified key for the error (first line of message)
    const key = (error.message || 'Unknown error').split('\\n')[0];

    if (!errorsByMessage[key]) {
      errorsByMessage[key] = [];
    }

    errorsByMessage[key].push(error);
  });

  // Find patterns
  const patterns = {};

  Object.keys(errorsByMessage).forEach(key => {
    const errors = errorsByMessage[key];

    if (errors.length >= 3) {
      // At least 3 occurrences to be a pattern
      patterns[key] = {
        count: errors.length,
        types: [...new Set(errors.map(e => e.type))],
        locations: [...new Set(errors.map(e => e.location?.filename).filter(Boolean))],
        firstSeen: Math.min(...errors.map(e => e.timestamp)),
        lastSeen: Math.max(...errors.map(e => e.timestamp)),
        samples: errors.slice(0, 3), // Keep a few samples
      };
    }
  });

  // Update the patterns store
  errorStore.patterns = patterns;

  // Log patterns if any were found
  const patternCount = Object.keys(patterns).length;
  if (patternCount > 0) {
    console.log(`Identified ${patternCount} error patterns`);

    // If we have high-frequency patterns, report them
    Object.entries(patterns)
      .filter(([_, pattern]) => pattern.count >= 5) // High frequency
      .sort((a, b) => b[1].count - a[1].count) // Sort by count descending
      .slice(0, 3) // Top 3
      .forEach(([key, pattern]) => {
        console.warn(`Frequent error pattern: "${key}" occurred ${pattern.count} times`);
      });
  }
}

/**
 * Persist error to localStorage
 */
function persistError(errorData) {
  try {
    const key = 'error_analytics_logs';

    // Get existing logs
    const existingLogs = JSON.parse(localStorage.getItem(key) || '[]');

    // Add new log
    existingLogs.push(errorData);

    // Keep only the specified number of logs
    if (existingLogs.length > LOGGING_CONFIG.maxPersistedLogs) {
      existingLogs.splice(0, existingLogs.length - LOGGING_CONFIG.maxPersistedLogs);
    }

    // Save back to localStorage
    localStorage.setItem(key, JSON.stringify(existingLogs));
  } catch (e) {
    // Ignore storage errors
    console.error('Failed to persist error to localStorage:', e);
  }
}

/**
 * Cleanup old errors to prevent memory leaks
 */
function cleanupOldErrors() {
  const MAX_AGE = 3600000; // 1 hour
  const now = Date.now();

  // Remove errors older than MAX_AGE
  errorStore.errors = errorStore.errors.filter(error => now - error.timestamp < MAX_AGE);

  // Clean up patterns that no longer have recent errors
  Object.keys(errorStore.patterns).forEach(key => {
    const pattern = errorStore.patterns[key];
    if (now - pattern.lastSeen > MAX_AGE) {
      delete errorStore.patterns[key];
    }
  });
}

/**
 * Get error analytics data
 */
export function getErrorAnalytics() {
  return {
    totalErrors: errorStore.errors.length,
    bySeverity: countBySeverity(),
    byType: countByType(),
    patterns: Object.keys(errorStore.patterns).length,
    topPatterns: getTopPatterns(3),
    sessionDuration: Date.now() - errorStore.sessionStart,
    timestamp: Date.now(),
  };
}

/**
 * Count errors by severity
 */
function countBySeverity() {
  return errorStore.errors.reduce((acc, error) => {
    const severity = error.severity || ERROR_SEVERITY.MEDIUM;
    acc[severity] = (acc[severity] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Count errors by type
 */
function countByType() {
  return errorStore.errors.reduce((acc, error) => {
    const type = error.type || 'unknown';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
}

/**
 * Get top error patterns
 *
 * @param {number} limit - Maximum number of patterns to return
 */
function getTopPatterns(limit = 3) {
  return Object.entries(errorStore.patterns)
    .sort((a, b) => b[1].count - a[1].count) // Sort by count descending
    .slice(0, limit) // Top N
    .map(([key, pattern]) => ({
      message: key,
      count: pattern.count,
      types: pattern.types,
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
    }));
}

/**
 * Get persisted error logs
 */
export function getPersistedErrorLogs() {
  try {
    const key = 'error_analytics_logs';
    return JSON.parse(localStorage.getItem(key) || '[]');
  } catch (e) {
    console.error('Failed to get persisted error logs:', e);
    return [];
  }
}

/**
 * Clear persisted error logs
 */
export function clearPersistedErrorLogs() {
  try {
    localStorage.removeItem('error_analytics_logs');
    return true;
  } catch (e) {
    console.error('Failed to clear persisted error logs:', e);
    return false;
  }
}

/**
 * Create a diagnostic report
 */
export function createDiagnosticReport() {
  // Collect system information
  const systemInfo = {
    userAgent: navigator.userAgent,
    language: navigator.language,
    platform: navigator.platform,
    cookiesEnabled: navigator.cookieEnabled,
    viewportSize: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    devicePixelRatio: window.devicePixelRatio,
    timestamp: new Date().toISOString(),
    url: window.location.href,
    sessionDuration: Date.now() - errorStore.sessionStart,
  };

  // Collect performance metrics
  const performanceMetrics = getPerformanceMetrics();

  // Create the report
  const report = {
    systemInfo,
    performanceMetrics,
    errorAnalytics: getErrorAnalytics(),
    errors: errorStore.errors.slice(-50), // Last 50 errors
    patterns: errorStore.patterns,
  };

  return report;
}

/**
 * Get performance metrics
 */
function getPerformanceMetrics() {
  if (!window.performance) {
    return { supported: false };
  }

  try {
    const perfData = window.performance;
    const memory = perfData.memory || {};
    const timing = perfData.timing || {};

    return {
      supported: true,
      memory: {
        jsHeapSizeLimit: memory.jsHeapSizeLimit,
        totalJSHeapSize: memory.totalJSHeapSize,
        usedJSHeapSize: memory.usedJSHeapSize,
      },
      timing: {
        navigationStart: timing.navigationStart,
        loadEventEnd: timing.loadEventEnd,
        domComplete: timing.domComplete,
        pageLoadTime: timing.loadEventEnd - timing.navigationStart,
      },
    };
  } catch (e) {
    return {
      supported: true,
      error: e.message,
    };
  }
}

export default {
  initErrorAnalytics,
  trackError,
  getErrorAnalytics,
  getPersistedErrorLogs,
  clearPersistedErrorLogs,
  createDiagnosticReport,
  ERROR_SEVERITY,
};
