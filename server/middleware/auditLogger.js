/**
 * Audit Logger Middleware
 *
 * This middleware automatically logs all API requests for compliance
 * and security monitoring.
 *
 * Enterprise security features:
 * - Detailed request logging
 * - User and tenant tracking
 * - IP address capture
 * - Request body sanitization
 * - Response status tracking
 */

const { auditLog } = require('../services/auditService');

/**
 * Creates middleware for automatic API request logging
 *
 * @param {Object} options - Configuration options
 * @param {Array<string>} options.excludePaths - Paths to exclude from logging
 * @param {boolean} options.logRequestBody - Whether to log request bodies
 * @param {boolean} options.logResponseData - Whether to log response data
 * @returns {Function} Express middleware function
 */
function createAuditLogger(options = {}) {
  const {
    excludePaths = ['/api/status', '/api/health'],
    logRequestBody = false,
    logResponseData = false,
  } = options;

  return function auditLogger(req, res, next) {
    // Skip logging for excluded paths
    if (excludePaths.some(path => req.path.startsWith(path))) {
      return next();
    }

    // Capture original timestamp
    const startTime = Date.now();

    // Store original end method to wrap it
    const originalEnd = res.end;

    // Override response end method to capture status code
    res.end = function (chunk, encoding) {
      // Restore original end method
      res.end = originalEnd;

      // Call original end method
      res.end(chunk, encoding);

      // Calculate request duration
      const duration = Date.now() - startTime;

      // Extract user and tenant info from authenticated request
      const userId = req.user?.id || 'anonymous';
      const tenantId = req.user?.tenantId || 'unknown';

      // Prepare audit log entry
      const logEntry = {
        action: 'API_REQUEST',
        resource: req.path,
        method: req.method,
        userId,
        tenantId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        statusCode: res.statusCode,
        duration,
        timestamp: new Date().toISOString(),
      };

      // Optionally include request body (with sensitive data removed)
      if (logRequestBody && req.body) {
        // Create a sanitized copy of the request body
        const sanitizedBody = { ...req.body };

        // Remove sensitive fields
        delete sanitizedBody.password;
        delete sanitizedBody.token;
        delete sanitizedBody.apiKey;
        delete sanitizedBody.secret;

        logEntry.requestBody = sanitizedBody;
      }

      // Add response data if enabled and available
      if (logResponseData && chunk) {
        try {
          // Attempt to parse response as JSON
          const responseData = JSON.parse(chunk.toString());

          // Limit response data size
          logEntry.responseData = JSON.stringify(responseData).substring(0, 1000);
          if (logEntry.responseData.length === 1000) {
            logEntry.responseData += '...';
          }
        } catch (e) {
          // Not JSON or other error, skip response data
        }
      }

      // Set severity based on status code
      if (res.statusCode >= 500) {
        logEntry.severity = 'high';
      } else if (res.statusCode >= 400) {
        logEntry.severity = 'medium';
      } else {
        logEntry.severity = 'low';
      }

      // Log the API request
      auditLog(logEntry);
    };

    next();
  };
}

module.exports = createAuditLogger;
