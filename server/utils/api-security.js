/**
 * API Security Utilities
 *
 * This module provides security-related utilities for API endpoints.
 */

/**
 * Sanitizes API input to prevent injection attacks
 *
 * @param {string} input - The input to sanitize
 * @returns {string} - The sanitized input
 */
export function sanitizeInput(input) {
  if (typeof input !== 'string') return input;
  // Basic sanitization - remove script tags and normalize
  return input
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]*>?/gm, '')
    .trim();
}

/**
 * Logs API usage for monitoring and analytics
 *
 * @param {Object} req - Express request object
 * @param {string} endpoint - API endpoint accessed
 * @param {Object} params - Parameters used in the request
 */
export function logApiUsage(req, endpoint, params = {}) {
  const timestamp = new Date().toISOString();
  const userId = req.user?.id || 'anonymous';
  const userIp = req.headers['x-forwarded-for'] || req.ip || 'unknown';

  // In a real implementation, this would write to a database or log service
  console.log(`[${timestamp}] API: ${endpoint} | User: ${userId} | IP: ${userIp}`);
}

/**
 * Handles API errors in a consistent way
 *
 * @param {Error} error - The error object
 * @param {Object} res - Express response object
 * @param {string} source - Source of the error (for logging)
 */
export function handleApiError(error, res, source = 'API') {
  console.error(`[${source} Error]`, error);

  // Determine if this is a known error type with a specific status code
  const statusCode = error.statusCode || 500;
  const message = error.message || 'An unexpected error occurred';

  return res.status(statusCode).json({
    error: true,
    message,
    code: error.code || 'INTERNAL_SERVER_ERROR',
  });
}

/**
 * Middleware to check if OpenAI API key is set
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function checkForOpenAIKey(req, res, next) {
  if (!process.env.OPENAI_API_KEY) {
    return res.status(500).json({
      error: 'OpenAI API key not configured',
      message: 'Please set the OPENAI_API_KEY environment variable to use this feature.',
    });
  }
  next();
}

/**
 * Middleware to check if API route requires authentication
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
export function requireAuth(req, res, next) {
  if (!req.isAuthenticated || !req.isAuthenticated()) {
    return res.status(401).json({
      error: 'Authentication required',
      message: 'You must be logged in to access this resource.',
    });
  }
  next();
}

/**
 * Middleware to check if user has required role
 *
 * @param {string|Array} roles - Required role(s)
 * @returns {Function} - Express middleware function
 */
export function requireRole(roles) {
  const roleList = Array.isArray(roles) ? roles : [roles];

  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(401).json({
        error: 'Authentication required',
        message: 'You must be logged in to access this resource.',
      });
    }

    if (!roleList.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Access denied',
        message: 'You do not have permission to access this resource.',
      });
    }

    next();
  };
}

export default {
  sanitizeInput,
  logApiUsage,
  handleApiError,
  checkForOpenAIKey,
  requireAuth,
  requireRole,
};
