/**
 * Tenant enforcement middleware
 *
 * Production: requires JWT (Authorization: Bearer <token>) and derives organizationId from JWT claims.
 * Dev/demo: if JWT is absent, allows x-organization-id header to set tenant context.
 *
 * IMPORTANT: never allow header-only tenant selection in production.
 */

import { authenticateJWT } from './auth.js';

export const requireTenant = () => {
  return (req, res, next) => {
    const isProduction = process.env.NODE_ENV === 'production';
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authenticateJWT(req, res, next);
    }

    if (isProduction) {
      return res.status(401).json({
        status: 'error',
        message: 'Authentication required',
      });
    }

    const headerOrgId = req.get('x-organization-id') || req.get('X-Organization-Id');
    const fallbackOrgIdRaw = process.env.DEFAULT_ORGANIZATION_ID || process.env.DEV_DEFAULT_ORG_ID || '1';

    // In dev/demo, browsers typically can't send custom headers on initial SPA boot.
    // Default to a safe local tenant (org 1) unless explicitly overridden.
    // If a non-numeric header is provided (e.g. "demo"), ignore it and fall back.
    const parsedHeader = headerOrgId != null ? parseInt(String(headerOrgId), 10) : NaN;
    const parsedFallback = parseInt(String(fallbackOrgIdRaw), 10);
    const parsed = Number.isFinite(parsedHeader)
      ? parsedHeader
      : (Number.isFinite(parsedFallback) ? parsedFallback : 1);

    // Dev/demo tenant context
    req.organizationId = parsed;
    req.user = req.user || {
      id: null,
      email: null,
      roles: ['demo'],
      organizationId: parsed,
    };

    return next();
  };
};

export default requireTenant;
