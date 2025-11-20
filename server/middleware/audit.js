/**
 * Audit Logging Middleware
 * 
 * Tracks all data access and modifications for HIPAA/GDPR compliance
 * Logs: user, organization, action, resource, timestamp, IP address, changes
 */

const { db } = require('../db/index.js');
const { sql } = require('drizzle-orm');

// Audit severity levels
const AUDIT_LEVELS = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical',
};

// Audit action types
const AUDIT_ACTIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  LOGIN: 'login',
  LOGOUT: 'logout',
  ACCESS_DENIED: 'access_denied',
  EXPORT: 'export',
};

/**
 * Log audit event to database
 * Uses existing audit_logs table schema with tenant_id
 */
async function logAuditEvent({
  userId,
  tenantId,  // Using tenantId to match database schema
  action,
  resourceType,
  resourceId = null,
  details = null,
  ipAddress = null,
  userAgent = null,
  sessionId = null,
  severity = AUDIT_LEVELS.INFO,
}) {
  try {
    // Use raw SQL to insert audit log
    await db.execute(sql`
      INSERT INTO audit_logs (
        user_id,
        tenant_id,
        action,
        resource_type,
        resource_id,
        details,
        ip_address,
        user_agent,
        session_id,
        severity,
        timestamp
      ) VALUES (
        ${userId},
        ${tenantId},
        ${action},
        ${resourceType},
        ${resourceId},
        ${JSON.stringify(details)},
        ${ipAddress},
        ${userAgent},
        ${sessionId},
        ${severity},
        NOW()
      )
    `);
  } catch (error) {
    // Don't fail the request if audit logging fails, but log the error
    console.error('Audit logging failed:', error);
  }
}

/**
 * Middleware to automatically log API requests
 */
function auditMiddleware(resourceType, action = null) {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response status
    res.send = function (data) {
      // Determine action from HTTP method if not specified
      const auditAction = action || getActionFromMethod(req.method);

      // Extract resource ID from URL params
      const resourceId = req.params.id || req.params.deviceId || req.params.reportId || null;

      // Get client IP
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Log the audit event (async, don't block response)
      if (req.user) {
        logAuditEvent({
          userId: req.user.id,
          tenantId: req.user.organizationId, // Using organizationId from JWT as tenantId
          action: auditAction,
          resourceType,
          resourceId,
          details: {
            method: req.method,
            path: req.path,
            query: req.query,
            statusCode: res.statusCode,
          },
          ipAddress,
          userAgent: req.get('user-agent'),
          severity: res.statusCode >= 400 ? AUDIT_LEVELS.WARNING : AUDIT_LEVELS.INFO,
        }).catch(err => console.error('Audit log error:', err));
      }

      // Call original send
      originalSend.call(this, data);
    };

    next();
  };
}

/**
 * Map HTTP methods to audit actions
 */
function getActionFromMethod(method) {
  const methodMap = {
    POST: AUDIT_ACTIONS.CREATE,
    GET: AUDIT_ACTIONS.READ,
    PUT: AUDIT_ACTIONS.UPDATE,
    PATCH: AUDIT_ACTIONS.UPDATE,
    DELETE: AUDIT_ACTIONS.DELETE,
  };
  return methodMap[method] || 'unknown';
}

/**
 * Manual audit logging function for specific events
 */
async function auditLog(req, action, resourceType, details = {}) {
  if (!req.user) {
    console.warn('Audit log attempted without authenticated user');
    return;
  }

  const ipAddress = req.ip || req.connection.remoteAddress;

  return logAuditEvent({
    userId: req.user.id,
    tenantId: req.user.organizationId,
    action,
    resourceType,
    resourceId: details.resourceId || null,
    details,
    ipAddress,
    userAgent: req.get('user-agent'),
    severity: details.severity || AUDIT_LEVELS.INFO,
  });
}

module.exports = {
  auditMiddleware,
  auditLog,
  logAuditEvent,
  AUDIT_ACTIONS,
  AUDIT_LEVELS,
};
