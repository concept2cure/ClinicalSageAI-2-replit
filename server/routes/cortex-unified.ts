/**
 * Unified Cortex Routes
 *
 * Consolidates all Cortex (AI advisory) routes into a single entry point.
 *
 * Consolidated from:
 * - cortexRoutes.ts (main Cortex operations)
 * - cortexAdvisoryRoutes.ts (advisory features)
 * - cortexManagementRoutes.ts (management features)
 * - cortexQueryRoutes.ts (query operations)
 * - lumen-cortex.ts (Lumen integration)
 *
 * @version 2.0.0
 * @module server/routes/cortex-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('cortex-unified');
const router = Router();

// Security constants
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 50; // Lower limit for AI queries

// Rate limiter for expensive AI operations
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const clientId = (req.headers['x-organization-id'] as string) || req.ip || 'anonymous';
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
    logger.warn(`Rate limit exceeded for Cortex client: ${clientId}`);
    return res.status(429).json({
      error: 'Too many AI requests',
      retryAfter: Math.ceil((record.resetTime + RATE_LIMIT_WINDOW_MS - now) / 1000),
    });
  }

  res.setHeader('X-RateLimit-Limit', RATE_LIMIT_MAX_REQUESTS);
  res.setHeader('X-RateLimit-Remaining', Math.max(0, RATE_LIMIT_MAX_REQUESTS - record.count));
  next();
};

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const organizationId = (req.headers['x-organization-id'] as string) || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;

  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module: 'cortex',
  };
  next();
};

const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Cortex route error:', { error: err.message, path: req.path });
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.headers['x-request-id'] || 'unknown',
  });
};

router.use(rateLimiter);
router.use(extractTenantContext);

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'cortex-unified-api',
    version: '2.0.0',
    modules: ['advisory', 'management', 'query', 'lumen'],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Cortex AI Advisory Unified API',
    version: '2.0.0',
    description: 'Consolidated API for all AI advisory and assistance operations',
    endpoints: {
      '/main': {
        description: 'Core Cortex operations',
        methods: ['GET', 'POST'],
        legacyPath: '/api/cortex/*',
      },
      '/advisory': {
        description: 'AI advisory features',
        methods: ['GET', 'POST'],
        legacyPath: '/api/cortex/advisory/*',
      },
      '/management': {
        description: 'Cortex session and configuration management',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        legacyPath: '/api/cortex/management/*',
      },
      '/query': {
        description: 'AI query operations',
        methods: ['POST'],
        legacyPath: '/api/cortex/query/*',
      },
      '/lumen': {
        description: 'Lumen integration features',
        methods: ['GET', 'POST'],
        legacyPath: '/api/lumen-cortex/*',
      },
    },
    rateLimit: {
      limit: 50,
      windowMs: 60000,
      description: '50 AI requests per minute per organization',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER MOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

async function mountSubRouters() {
  // Main Cortex routes
  try {
    const cortexModule = await import('./cortexRoutes');
    router.use('/main', cortexModule.default);
    logger.info('Mounted: /main (core Cortex)');
  } catch (error) {
    logger.error('Failed to mount core Cortex routes:', error);
  }

  // Advisory routes
  try {
    const advisoryModule = await import('./cortexAdvisoryRoutes');
    router.use('/advisory', advisoryModule.default);
    logger.info('Mounted: /advisory (AI advisory)');
  } catch (error) {
    logger.error('Failed to mount advisory routes:', error);
  }

  // Management routes (from cortexManagementRoutes.ts)
  // Note: This route exports a factory function requiring a database pool.
  // Skipping auto-mount - must be initialized at application startup.
  // try {
  //   const managementModule = await import('./cortexManagementRoutes');
  //   router.use('/management', managementModule.createCortexManagementRoutes(pool));
  //   logger.info('Mounted: /management (Cortex management)');
  // } catch (error) {
  //   logger.error('Failed to mount management routes:', error);
  // }
  logger.warn('Cortex management routes require explicit initialization with database pool');

  // Query routes
  try {
    const queryModule = await import('./cortexQueryRoutes');
    router.use('/query', queryModule.default);
    logger.info('Mounted: /query (AI queries)');
  } catch (error) {
    logger.error('Failed to mount query routes:', error);
  }

  // Lumen integration
  try {
    const lumenModule = await import('./lumen-cortex');
    router.use('/lumen', lumenModule.default);
    logger.info('Mounted: /lumen (Lumen integration)');
  } catch (error) {
    logger.error('Failed to mount Lumen routes:', error);
  }
}

// Initialize sub-routers
mountSubRouters().catch(error => {
  logger.error('Failed to initialize Cortex unified router:', error);
});

// Cleanup interval for rate limiter
setInterval(
  () => {
    const now = Date.now();
    const windowStart = now - RATE_LIMIT_WINDOW_MS;
    Array.from(rateLimitMap.entries()).forEach(([key, value]) => {
      if (value.resetTime < windowStart) {
        rateLimitMap.delete(key);
      }
    });
  },
  5 * 60 * 1000
);

router.use(errorHandler);

export default router;
