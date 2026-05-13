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
 * - Recursive, case-insensitive request-body sanitization
 * - Response status tracking
 */

const { auditLog } = require('../services/auditService');

// Field-name fragments that indicate sensitive content. Matched
// case-insensitively against object keys, recursively, so e.g.
// `clientSecret`, `accessToken`, `Authorization`, `creditCardNumber`,
// `ssn` are all caught — the previous list only removed four
// top-level keys verbatim, so anything nested or named differently
// landed in audit rows in clear.
const SENSITIVE_KEY_FRAGMENTS = [
  'password',
  'token',
  'secret',
  'apikey',
  'api_key',
  'authorization',
  'cookie',
  'creditcard',
  'credit_card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'pin',
  'privatekey',
  'private_key',
];

function isSensitiveKey(key) {
  if (typeof key !== 'string') return false;
  const lower = key.toLowerCase();
  return SENSITIVE_KEY_FRAGMENTS.some(fragment => lower.includes(fragment));
}

function scrubSensitive(value, depth = 0) {
  if (depth > 8 || value == null) return value;
  if (Array.isArray(value)) return value.map(item => scrubSensitive(item, depth + 1));
  if (typeof value !== 'object') return value;
  const out = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (isSensitiveKey(key)) {
      out[key] = '[REDACTED]';
    } else {
      out[key] = scrubSensitive(v, depth + 1);
    }
  }
  return out;
}

/**
 * Match a path against an exclude entry. Exact path matches or strict
 * subpath matches (entry + '/') only — never bare prefix, so a crafted
 * path like '/api/healthEvil' cannot slip past the exclude list.
 */
function pathMatches(path, entry) {
  if (path === entry) return true;
  return path.startsWith(entry + '/');
}

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
    if (excludePaths.some(entry => pathMatches(req.path, entry))) {
      return next();
    }

    const startTime = Date.now();
    let capturedChunk;

    // Wrap res.end so we observe the response without altering its
    // signature. Node's res.end has several overloads
    // ((), (chunk), (chunk, cb), (chunk, encoding), (chunk, encoding, cb)).
    // We forward ALL arguments via rest-spread so callbacks and
    // encoding hints are preserved — the previous implementation only
    // forwarded `(chunk, encoding)` and dropped the callback overload.
    const originalEnd = res.end.bind(res);
    res.end = function (...args) {
      capturedChunk = args[0];
      return originalEnd(...args);
    };

    res.on('finish', () => {
      const duration = Date.now() - startTime;
      const userId = req.user?.id || 'anonymous';
      const tenantId = req.user?.tenantId || 'unknown';

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

      if (logRequestBody && req.body && typeof req.body === 'object') {
        logEntry.requestBody = scrubSensitive(req.body);
      }

      if (logResponseData && capturedChunk) {
        try {
          const text =
            typeof capturedChunk === 'string'
              ? capturedChunk
              : capturedChunk.toString('utf8');
          const parsed = JSON.parse(text);
          const scrubbed = scrubSensitive(parsed);
          const serialized = JSON.stringify(scrubbed);
          logEntry.responseData =
            serialized.length > 1000 ? serialized.slice(0, 1000) + '...' : serialized;
        } catch {
          // Non-JSON response: skip the body entirely rather than log
          // raw bytes that may contain binary or sensitive content.
        }
      }

      if (res.statusCode >= 500) {
        logEntry.severity = 'high';
      } else if (res.statusCode >= 400) {
        logEntry.severity = 'medium';
      } else {
        logEntry.severity = 'low';
      }

      try {
        auditLog(logEntry);
      } catch (err) {
        console.error('[auditLogger] failed to write audit entry', err);
      }
    });

    next();
  };
}

module.exports = createAuditLogger;
module.exports.scrubSensitive = scrubSensitive;
module.exports.isSensitiveKey = isSensitiveKey;
