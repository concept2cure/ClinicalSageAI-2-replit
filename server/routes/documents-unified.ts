/**
 * Unified Document Routes
 *
 * Consolidates all document related routes into a single entry point.
 *
 * Consolidated from:
 * - document-routes.ts (core document operations)
 * - documentOrchestrationRoutes.ts (document orchestration)
 * - document_qc_routes.ts (document QC)
 * - document-data-center.ts (document data center)
 * - authoring.router.ts (authoring workflows)
 * - dossier_routes.ts (dossier management)
 *
 * @version 2.0.0
 * @module server/routes/documents-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('documents-unified');
const router = Router();

// Rate limiting for document operations
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 200; // Higher limit for document operations

const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

const rateLimiter = (req: Request, res: Response, next: NextFunction) => {
  const clientId = String((req as any).user?.organizationId || (req as any).tenantId || req.ip || 'anonymous');
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
    logger.warn(`Rate limit exceeded for document client: ${clientId}`);
    return res.status(429).json({
      error: 'Too many document requests',
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
  const organizationId = String((req as any).user?.organizationId || '') || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;

  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module: 'documents',
  };
  next();
};

const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('Document route error:', { error: err.message, path: req.path });
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
    service: 'documents-unified-api',
    version: '2.0.0',
    modules: ['core', 'authoring', 'orchestration', 'qc', 'data-center', 'dossier'],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Documents Unified API',
    version: '2.0.0',
    description: 'Consolidated API for all document operations',
    endpoints: {
      '/core': {
        description: 'Core document CRUD operations',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        legacyPath: '/api/documents/*',
      },
      '/orchestration': {
        description: 'Document workflow orchestration',
        methods: ['GET', 'POST'],
        legacyPath: '/api/document-orchestration/*',
      },
      '/qc': {
        description: 'Document quality control',
        methods: ['GET', 'POST'],
        legacyPath: '/api/document-qc/*',
      },
      '/data-center': {
        description: 'Document data center operations',
        methods: ['GET', 'POST'],
        legacyPath: '/api/document-data-center/*',
      },
      '/dossier': {
        description: 'Regulatory dossier management',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        legacyPath: '/api/dossier/*',
      },
    },
    rateLimit: {
      limit: 200,
      windowMs: 60000,
      description: '200 requests per minute per organization',
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER MOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

async function mountSubRouters() {
  // Core document routes
  try {
    const coreModule = await import('./document-routes');
    router.use('/core', coreModule.default);
    logger.info('Mounted: /core (document CRUD)');
  } catch (error) {
    logger.error('Failed to mount core document routes:', error);
  }

  // Document orchestration
  try {
    const orchestrationModule = await import('./documentOrchestrationRoutes');
    router.use('/orchestration', orchestrationModule.default);
    logger.info('Mounted: /orchestration (document orchestration)');
  } catch (error) {
    logger.error('Failed to mount orchestration routes:', error);
  }

  // Document QC
  try {
    const qcModule = await import('./document_qc_routes');
    router.use('/qc', qcModule.default);
    logger.info('Mounted: /qc (document QC)');
  } catch (error) {
    logger.error('Failed to mount QC routes:', error);
  }

  // Document data center
  try {
    const dataCenterModule = await import('./document-data-center');
    router.use('/data-center', dataCenterModule.default);
    logger.info('Mounted: /data-center (document data center)');
  } catch (error) {
    logger.error('Failed to mount data center routes:', error);
  }

  // Dossier routes
  try {
    const dossierModule = await import('./dossier_routes');
    router.use('/dossier', dossierModule.default);
    logger.info('Mounted: /dossier (dossier management)');
  } catch (error) {
    logger.error('Failed to mount dossier routes:', error);
  }
}

// Initialize sub-routers
mountSubRouters().catch(error => {
  logger.error('Failed to initialize documents unified router:', error);
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
