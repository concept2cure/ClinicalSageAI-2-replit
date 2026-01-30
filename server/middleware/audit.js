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
 * Uses audit_logs table schema (tenant_id, table_name, record_id)
 */
async function logAuditEvent({
  userId,
  tenantId,  // Using tenantId to match database schema
  action,
  tableName,
  recordId = null,
  oldValues = null,
  newValues = null,
  ipAddress = null,
  userAgent = null,
}) {
  try {
    const safeTableName = tableName || 'unknown';
    const safeRecordId = recordId || 'unknown';

    // Use raw SQL to insert audit log
    await db.execute(sql`
      INSERT INTO audit_logs (
        user_id,
        tenant_id,
        action,
        table_name,
        record_id,
        old_values,
        new_values,
        ip_address,
        user_agent,
        created_at
      ) VALUES (
        ${userId},
        ${tenantId},
        ${action},
        ${safeTableName},
        ${safeRecordId},
        ${oldValues ? JSON.stringify(oldValues) : null},
        ${newValues ? JSON.stringify(newValues) : null},
        ${ipAddress},
        ${userAgent},
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
function auditMiddleware(tableName, action = null) {
  return async (req, res, next) => {
    // Store original send function
    const originalSend = res.send;

    // Override send to capture response status
    res.send = function (data) {
      // Determine action from HTTP method if not specified
      const auditAction = action || getActionFromMethod(req.method);

      // Extract resource ID from URL params
      const recordId = req.params.id || req.params.deviceId || req.params.reportId || null;

      // Get client IP
      const ipAddress = req.ip || req.connection.remoteAddress;

      // Log the audit event (async, don't block response)
      if (req.user) {
        logAuditEvent({
          userId: req.user.id,
          tenantId: req.user.tenantId,
          action: auditAction,
          tableName,
          recordId,
          newValues: {
            method: req.method,
            path: req.path,
            query: req.query,
            statusCode: res.statusCode,
          },
          ipAddress,
          userAgent: req.get('user-agent'),
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
    tenantId: req.user.tenantId,
    action,
    tableName: resourceType,
    recordId: details.recordId || details.resourceId || null,
    oldValues: details.oldValues || null,
    newValues: details.newValues || details || null,
    ipAddress,
    userAgent: req.get('user-agent'),
  });
}

module.exports = {
  auditMiddleware,
  auditLog,
  logAuditEvent,
  AUDIT_ACTIONS,
  AUDIT_LEVELS,
};
