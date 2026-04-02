/**
 * Unified CER (Clinical Evaluation Report) Routes
 *
 * Consolidates all CER related routes into a single entry point.
 *
 * Consolidated from:
 * - cer-routes.ts (main CER operations)
 * - cerRoutes.ts (legacy CER routes)
 * - cerDeviceProfileRoutes.ts (device profiles for CER)
 * - cer-analytics-routes.ts (CER analytics)
 *
 * @version 2.0.0
 * @module server/routes/cer-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { create510kDeprecationNotice } from '../middleware/deprecation';

const logger = createScopedLogger('cer-unified');
const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract tenant context from headers
 */
const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const organizationId = String((req as any).user?.organizationId || '') || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;

  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module: 'cer',
  };
  next();
};

/**
 * Error handler for CER routes
 */
const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('CER route error:', { error: err.message, path: req.path });
  res.status(500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message,
    requestId: req.headers['x-request-id'] || 'unknown',
  });
};

router.use(extractTenantContext);

// ═══════════════════════════════════════════════════════════════════════════════
// HEALTH CHECK
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'cer-unified-api',
    version: '2.0.0',
    modules: ['reports', 'device-profiles', 'analytics', 'legacy'],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Clinical Evaluation Report (CER) Unified API',
    version: '2.0.0',
    description: 'Consolidated API for all CER operations',
    endpoints: {
      '/reports': {
        description: 'CER report generation and management',
        legacyPath: '/api/cer/*',
      },
      '/device-profiles': {
        description: 'Device profiles for CER',
        legacyPath: '/api/cer-device-profiles/*',
      },
      '/analytics': {
        description: 'CER analytics and metrics',
        legacyPath: '/api/cer-analytics/*',
      },
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER MOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

async function mountSubRouters() {
  // Main CER routes (from cer-routes.ts)
  try {
    const cerModule = await import('./cer-routes');
    router.use('/reports', cerModule.default);
    logger.info('Mounted: /reports (CER reports)');
  } catch (error) {
    logger.error('Failed to mount CER reports routes:', error);
  }

  // Device profiles (from cerDeviceProfileRoutes.ts)
  try {
    const deviceProfileModule = await import('./cerDeviceProfileRoutes');
    router.use('/device-profiles', deviceProfileModule.default);
    logger.info('Mounted: /device-profiles (CER device profiles)');
  } catch (error) {
    logger.error('Failed to mount device profile routes:', error);
  }

  // Analytics (from cer-analytics-routes.ts)
  try {
    const analyticsModule = await import('./cer-analytics-routes');
    router.use('/analytics', analyticsModule.default);
    logger.info('Mounted: /analytics (CER analytics)');
  } catch (error) {
    logger.error('Failed to mount analytics routes:', error);
  }

  // Legacy routes (from cerRoutes.ts) - with deprecation notice
  try {
    const legacyModule = await import('./cerRoutes');
    router.use('/legacy', legacyModule.default);
    logger.info('Mounted: /legacy (deprecated CER routes)');
  } catch (error) {
    logger.error('Failed to mount legacy routes:', error);
  }
}

// Initialize sub-routers
mountSubRouters().catch(error => {
  logger.error('Failed to initialize CER unified router:', error);
});

// Apply error handler
router.use(errorHandler);

export default router;
