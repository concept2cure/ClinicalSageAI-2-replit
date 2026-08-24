/**
 * Unified Document Routes
 *
 * Consolidates all document related routes into a single entry point.
 *
 * Mounts (the live set):
 * - document-routes.ts  -> /core     (core document CRUD; its only mount)
 * - dossier_routes.ts   -> /dossier  (dossier management; its only mount)
 *
 * NO LONGER MOUNTED HERE — see mountSubRouters() below for the full reasoning:
 * - documentAuthoring.routes.ts      DELETED (zero callers; the canonical
 *                                    path is /api/authoring)
 * - documentOrchestrationRoutes.ts   mounted at the app root
 * - document-data-center.ts          mounted at /api/device-data-center
 * - document_qc_routes.ts            DELETED (unreachable by construction)
 *
 * "Consolidated from" was the original framing, and it was inaccurate: nothing
 * was consolidated. Each router kept its own mount elsewhere and gained a
 * second one here, so this file multiplied the URL surface rather than reducing
 * it. authoring.router.ts was listed above but was never mounted here at all.
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
      '/authoring': {
        description: 'Document authoring (create, fetch) — 21 CFR Part 11',
        methods: ['GET', 'POST'],
        legacyPath: '/api/document-authoring/*',
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

  // ── REMOVED: three shadow mounts and one structurally unreachable router ────
  //
  // /authoring     -> documentAuthoring.routes — since DELETED outright
  //                   (zero callers; the canonical path is /api/authoring)
  // /orchestration -> documentOrchestrationRoutes, already mounted at the app
  //                   root by bootstrap/register-regulatory-routes.ts:26
  // /data-center   -> document-data-center, already mounted at
  //                   /api/device-data-center by
  //                   bootstrap/register-document-routes.ts:201
  //
  // Each router was reachable at two URLs with identical behaviour. The second
  // URL added no capability, doubled the surface a reviewer has to reason about,
  // and gave any future auth or rate-limit change two places to be applied
  // consistently — which is how a gate ends up on one path and not the other.
  //
  // The orchestration one could not have worked regardless: that router declares
  // ABSOLUTE paths (router.post('/api/510k/:projectId/generate-documents'), …),
  // so under a '/orchestration' prefix beneath '/api/documents' its URLs
  // concatenated to /api/documents/orchestration/api/510k/… — reachable only by
  // someone typing that by hand.
  //
  // /qc -> document_qc_routes.ts, DELETED. Same absolute-path problem with no
  // second mount to fall back on: its three endpoints are declared as
  // '/api/documents/bulk-approve', '/api/documents/:id/qc-complete' and
  // '/api/documents/builder-order' under this '/qc' prefix, so the only URLs
  // they ever answered on were /api/documents/qc/api/documents/… . The file
  // also opened with `const io = null`, making its websocket notifications
  // unconditional no-ops, and it wrote to no table.
  //
  // Nothing in client/src requests /api/documents/* at all — verified by
  // exhaustive grep — so no caller changes with any of this.

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
