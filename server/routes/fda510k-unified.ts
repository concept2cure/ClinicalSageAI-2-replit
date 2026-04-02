/**
 * Unified FDA 510(k) Routes
 *
 * This file consolidates all 510(k) related routes into a single entry point.
 * Sub-routes are organized by domain while maintaining backwards compatibility.
 *
 * Consolidated from:
 * - 510kRoutes.ts (device profiles, predicate finder)
 * - 510k-api-routes.ts (requirements, device classes)
 * - 510k-compliance-routes.ts (compliance checks)
 * - 510k-literature-routes.ts (literature search)
 * - 510k-project.routes.ts (project wizard)
 * - fda510k-routes.ts (production FDA API)
 * - 510kEstarRoutes.ts (eSTAR integration)
 *
 * @version 2.0.0
 * @module server/routes/fda510k-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('fda510k-unified');
const router = Router();

// Security constants
const MAX_REQUEST_SIZE = '10mb';
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX_REQUESTS = 100;

// Simple in-memory rate limiter (use Redis in production)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

/**
 * Rate limiting middleware
 */
const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const clientId = String(
    (req as any).user?.organizationId || (req as any).tenantId || req.ip || 'anonymous'
  );
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let record = rateLimitMap.get(clientId);

  if (!record || record.resetTime < windowStart) {
    record = { count: 1, resetTime: now };
    rateLimitMap.set(clientId, record);
  } else {
    record.count++;
  }

  if (record.count > RATE_LIMIT_MAX_REQUESTS) {
    logger.warn(`Rate limit exceeded for client: ${clientId}`);
    return res.status(429).json({
      error: 'Too many requests',
      retryAfter: Math.ceil((record.resetTime + RATE_LIMIT_WINDOW_MS - now) / 1000),
    });
  }

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count));
  next();
};

/**
 * Input sanitization helper
 */
function sanitizeInput(input: unknown): unknown {
  if (typeof input === 'string') {
    // Remove potential XSS vectors
    return input
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/javascript:/gi, '')
      .replace(/on\w+=/gi, '')
      .trim()
      .slice(0, 10000); // Limit string length
  }
  if (Array.isArray(input)) {
    return input.slice(0, 1000).map(sanitizeInput); // Limit array size
  }
  if (input && typeof input === 'object') {
    const sanitized: Record<string, unknown> = {};
    const entries = Object.entries(input as Record<string, unknown>).slice(0, 100); // Limit keys
    for (const [key, value] of entries) {
      sanitized[sanitizeInput(key) as string] = sanitizeInput(value);
    }
    return sanitized;
  }
  return input;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract and validate tenant context from request headers
 */
const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  // Validate UUID format for IDs
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const organizationId = String((req as any).user?.organizationId || '') || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;
  const module = (req.headers['x-module'] as string) || '510k';

  // Validate organization ID format if provided
  if (
    organizationId &&
    !uuidRegex.test(organizationId) &&
    !/^[a-z0-9-_]{1,64}$/i.test(organizationId)
  ) {
    logger.warn(`Invalid organization ID format: ${organizationId}`);
  }

  (req as any).tenantContext = {
    organizationId: organizationId ? String(organizationId).slice(0, 64) : null,
    clientWorkspaceId: clientWorkspaceId ? String(clientWorkspaceId).slice(0, 64) : null,
    module: String(module).slice(0, 32),
  };

  // Sanitize request body
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeInput(req.body) as Record<string, unknown>;
  }

  next();
};

/**
 * Global error handler for this router
 */
const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Route error:', { error: err.message, path: req.path, method: req.method });

  // Don't leak internal error details in production
  const isProduction = process.env.NODE_ENV === 'production';

  res.status(500).json({
    error: isProduction ? 'Internal server error' : err.message,
    requestId: req.headers['x-request-id'] || 'unknown',
    timestamp: new Date().toISOString(),
  });
};

// Apply middleware chain
router.use(rateLimiter);
router.use(extractTenantContext);

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/fda510k-unified/health
 * @desc Health check for unified 510(k) API
 */
router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'fda510k-unified-api',
    version: '2.0.0',
    modules: [
      'device-profiles',
      'requirements',
      'compliance',
      'literature',
      'projects',
      'fda-api',
      'estar',
    ],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/fda510k-unified/docs
 * @desc API documentation and migration guide
 */
router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'FDA 510(k) Unified API',
    version: '2.0.0',
    description: 'Consolidated API for all 510(k) related operations',
    sunsetDate: '2026-06-30',
    migrationGuide: '/docs/MIGRATION_510K_API.md',
    endpoints: {
      '/device': {
        description: 'Device profiles and predicate finder',
        methods: ['GET', 'POST'],
        legacyPath: '/api/510k/*',
        examples: [
          'GET /api/fda510k-unified/device/device-profile/:id',
          'POST /api/fda510k-unified/device/predicate-search',
        ],
      },
      '/api': {
        description: 'Requirements by device class',
        methods: ['GET'],
        legacyPath: '/api/fda510k/requirements/*',
        examples: ['GET /api/fda510k-unified/api/requirements/:deviceClass'],
      },
      '/compliance': {
        description: 'Compliance checks and validation',
        methods: ['GET', 'POST'],
        legacyPath: '/api/fda510k/compliance/*',
        examples: [
          'GET /api/fda510k-unified/compliance/compliance-results/:projectId',
          'POST /api/fda510k-unified/compliance/run-checks',
        ],
      },
      '/literature': {
        description: 'Literature search and management',
        methods: ['GET', 'POST'],
        legacyPath: '/api/510k/literature/*',
        examples: ['POST /api/fda510k-unified/literature/search'],
      },
      '/projects': {
        description: 'Project wizard and management',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        legacyPath: '/api/510k-projects/*',
        examples: [
          'GET /api/fda510k-unified/projects/templates',
          'POST /api/fda510k-unified/projects/create',
        ],
      },
      '/fda': {
        description: 'FDA database queries',
        methods: ['GET'],
        legacyPath: '/api/fda510k/*',
        examples: [
          'GET /api/fda510k-unified/fda/search',
          'GET /api/fda510k-unified/fda/device/:k_number',
        ],
      },
      '/estar': {
        description: 'eSTAR package generation',
        methods: ['GET', 'POST'],
        legacyPath: '/api/510k-estar/*',
        examples: [
          'POST /api/fda510k-unified/estar/validate',
          'POST /api/fda510k-unified/estar/build',
        ],
      },
    },
    headers: {
      required: {
        'X-Organization-Id': 'Your organization identifier',
      },
      optional: {
        'X-Client-Workspace-Id': 'Workspace identifier for multi-tenant isolation',
        'X-Module': 'Module name (defaults to "510k")',
      },
    },
    rateLimit: {
      limit: 100,
      windowMs: 60000,
      description: '100 requests per minute per organization',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER IMPORTS (Lazy loading for performance)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Mount sub-routers with error handling
 */
async function mountSubRouters() {
  // Device Profiles & Predicate Finder (from 510kRoutes.ts)
  try {
    const deviceProfilesModule = await import('./510kRoutes');
    router.use('/device', deviceProfilesModule.default);
    logger.info('Mounted: /device (device profiles, predicates)');
  } catch (error) {
    logger.error('Failed to mount device routes:', error);
  }

  // Requirements by Device Class (from 510k-api-routes.ts)
  try {
    const requirementsModule = (await import('./510k-api-routes')) as any;
    router.use('/api', requirementsModule.router || requirementsModule.default);
    logger.info('Mounted: /api (requirements, device classes)');
  } catch (error) {
    logger.error('Failed to mount api routes:', error);
  }

  // Compliance Checks (from 510k-compliance-routes.ts)
  try {
    const complianceModule = await import('./510k-compliance-routes');
    router.use('/compliance', complianceModule.default);
    logger.info('Mounted: /compliance (compliance checks)');
  } catch (error) {
    logger.error('Failed to mount compliance routes:', error);
  }

  // Literature Search (from 510k-literature-routes.ts)
  try {
    const literatureModule = await import('./510k-literature-routes');
    router.use('/literature', literatureModule.default);
    logger.info('Mounted: /literature (literature search)');
  } catch (error) {
    logger.error('Failed to mount literature routes:', error);
  }

  // Project Wizard (from 510k-project.routes.ts)
  try {
    const projectModule = await import('./510k-project.routes');
    router.use('/projects', projectModule.default);
    logger.info('Mounted: /projects (project wizard)');
  } catch (error) {
    logger.error('Failed to mount project routes:', error);
  }

  // Production FDA API (from fda510k-routes.ts)
  try {
    const fdaApiModule = await import('./fda510k-routes');
    router.use('/fda', fdaApiModule.default);
    logger.info('Mounted: /fda (production FDA API)');
  } catch (error) {
    logger.error('Failed to mount FDA API routes:', error);
  }

  // eSTAR Integration (from 510kEstarRoutes.ts)
  try {
    const estarModule = (await import('./510kEstarRoutes')) as any;
    router.use('/estar', estarModule.router || estarModule.default);
    logger.info('Mounted: /estar (eSTAR integration)');
  } catch (error) {
    logger.error('Failed to mount eSTAR routes:', error);
  }
}

// Mount sub-routers on import
mountSubRouters().catch(err => {
  logger.error('Failed to mount sub-routers:', err);
});

// ═══════════════════════════════════════════════════════════════════════════════
// DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @route GET /api/fda510k-unified/docs
 * @desc API documentation for unified 510(k) endpoints
 */
// Apply error handler as last middleware
router.use(errorHandler);

// Cleanup rate limit map periodically (every 5 minutes)
setInterval(() => {
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  Array.from(rateLimitMap.entries()).forEach(([key, value]) => {
    if (value.resetTime < windowStart) {
      rateLimitMap.delete(key);
    }
  });
}, 5 * 60 * 1000);

export default router;
