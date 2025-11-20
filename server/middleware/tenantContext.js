/**
 * Tenant Context Middleware
 *
 * This middleware sets the current organization ID for each request based on
 * the authenticated user's context, enabling Row-Level Security in the database.
 */

const { pool } = require('../db'); // Adjust to your actual database connection module

/**
 * Sets the tenant context for the current database connection
 * This allows Row-Level Security policies to work correctly by setting
 * the app.current_org variable in PostgreSQL session
 */
const setTenantContext = async (req, res, next) => {
  // Skip for non-authenticated routes
  if (req.path.startsWith('/auth/') || req.path === '/api/health' || req.path === '/health/live') {
    return next();
  }

  try {
    // Get organization ID from authenticated request
    const organizationId =
      req.headers['x-organization-id'] ||
      req.query.organizationId ||
      (req.user && req.user.organizationId);

    if (!organizationId) {
      // If no organization context, proceed without setting tenant context
      // This will likely result in no data being returned due to RLS policies
      console.warn('No organization context for request:', req.path);
      return next();
    }

    // Get a client from pool
    const client = await pool.connect();

    try {
      // Set the tenant context for this connection
      await client.query('SELECT set_tenant_context($1)', [organizationId]);

      // Attach the client to the request so it can be used by route handlers
      req.dbClient = client;

      // Make the organization ID easily accessible
      req.organizationId = organizationId;

      // Logging for debugging
      console.debug('Tenant Context:', { organizationId, path: req.path });

      next();
    } catch (error) {
      // Release client on error
      client.release();
      console.error('Failed to set tenant context:', error);
      next(error);
    }
  } catch (error) {
    console.error('Tenant context middleware error:', error);
    next(error);
  }
};

/**
 * Cleanup middleware to release database client after request
 */
const releaseTenantContext = (req, res, next) => {
  // Clean up database client after response sent
  res.on('finish', () => {
    if (req.dbClient) {
      req.dbClient.release();
      req.dbClient = null;
    }
  });

  next();
};

module.exports = {
  setTenantContext,
  releaseTenantContext,
};
