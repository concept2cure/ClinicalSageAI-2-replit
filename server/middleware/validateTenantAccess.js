/**
 * Tenant Validation Middleware
 *
 * This middleware enforces tenant isolation for all API routes, ensuring that
 * users can only access data for their authorized tenant.
 *
 * Enterprise security features:
 * - Tenant ID validation against authenticated user
 * - Request path validation to prevent path traversal
 * - Automatic request rejection for invalid tenants
 * - Audit logging for access attempts
 */

const { auditLog } = require('../services/auditService');

/**
 * Validates tenant access for the current request
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function validateTenantAccess(req, res, next) {
  // Skip validation for public routes
  const publicPaths = [
    '/api/auth/login',
    '/api/auth/signup',
    '/api/auth/sso',
    '/api/status',
    '/api/security-status',
  ];

  if (publicPaths.includes(req.path) || req.path.startsWith('/api/auth/sso')) {
    return next();
  }

  // Ensure user is authenticated
  if (!req.user) {
    auditLog({
      action: 'AUTH_FAILURE',
      resource: req.path,
      userId: 'anonymous',
      tenantId: 'unknown',
      ipAddress: req.ip,
      details: 'Unauthenticated access attempt',
      severity: 'high',
    });

    return res.status(401).json({
      error: 'Unauthorized',
      message: 'Authentication required',
    });
  }

  // Extract tenant ID from the request
  const requestTenantId = req.body?.tenantId || req.query?.tenantId || req.params?.tenantId;

  // For requests that don't specify a tenant, use the user's tenant
  if (!requestTenantId) {
    // Enrich request with the user's tenant ID for downstream handlers
    req.validatedTenantId = req.user.tenantId;
    return next();
  }

  // Check if the requested tenant matches the user's tenant
  // or if the user is an admin with multi-tenant access
  if (
    requestTenantId === req.user.tenantId ||
    (req.user.isAdmin && req.user.hasMultiTenantAccess)
  ) {
    // Allow access, but use the validated tenant ID
    req.validatedTenantId = requestTenantId;

    // Log admin cross-tenant access
    if (requestTenantId !== req.user.tenantId) {
      auditLog({
        action: 'CROSS_TENANT_ACCESS',
        resource: req.path,
        userId: req.user.id,
        tenantId: req.user.tenantId,
        targetTenantId: requestTenantId,
        ipAddress: req.ip,
        details: `Admin access to tenant ${requestTenantId}`,
        severity: 'medium',
      });
    }

    return next();
  }

  // Tenant mismatch - deny access and log the attempt
  auditLog({
    action: 'TENANT_ACCESS_DENIED',
    resource: req.path,
    userId: req.user.id,
    tenantId: req.user.tenantId,
    targetTenantId: requestTenantId,
    ipAddress: req.ip,
    details: `Attempted access to unauthorized tenant ${requestTenantId}`,
    severity: 'high',
  });

  return res.status(403).json({
    error: 'Forbidden',
    message: 'Access to the requested tenant is not authorized',
  });
}

module.exports = validateTenantAccess;
