/**
 * Unified IND (Investigational New Drug) Routes
 *
 * Consolidates all IND related routes into a single entry point.
 *
 * Consolidated from:
 * - ind_automation_routes.ts (IND automation)
 * - ind-database.routes.ts (IND database operations)
 * - ind-submissions.routes.ts (IND submissions)
 * - ind-templates.ts (IND templates)
 * - preIndRoutes.ts (Pre-IND operations)
 *
 * @version 2.0.0
 * @module server/routes/ind-unified
 */

import { Router, Request, Response, NextFunction } from 'express';
import { createScopedLogger } from '../utils/logger';
import { getPool } from '../db';
import createINDKpiRoutes from './ind-kpi.routes';

const logger = createScopedLogger('ind-unified');
const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const organizationId = String((req as any).user?.organizationId || '') || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;

  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module: 'ind',
  };
  next();
};

const errorHandler = (err: Error, req: Request, res: Response, _next: NextFunction) => {
  logger.error('IND route error:', { error: err.message, path: req.path });
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
    service: 'ind-unified-api',
    version: '2.0.0',
    modules: ['automation', 'database', 'submissions', 'templates', 'pre-ind', 'kpi'],
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// API DOCUMENTATION
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    title: 'Investigational New Drug (IND) Unified API',
    version: '2.0.0',
    description: 'Consolidated API for all IND operations',
    endpoints: {
      '/automation': {
        description: 'IND automation workflows',
        methods: ['GET', 'POST'],
        legacyPath: '/api/ind-automation/*',
      },
      '/database': {
        description: 'IND database operations',
        methods: ['GET', 'POST', 'PUT', 'DELETE'],
        legacyPath: '/api/ind-database/*',
      },
      '/submissions': {
        description: 'IND submission management',
        methods: ['GET', 'POST', 'PUT'],
        legacyPath: '/api/ind-submissions/*',
      },
      '/templates': {
        description: 'IND document templates',
        methods: ['GET', 'POST'],
        legacyPath: '/api/ind-templates/*',
      },
      '/pre-ind': {
        description: 'Pre-IND meeting and preparation',
        methods: ['GET', 'POST'],
        legacyPath: '/api/pre-ind/*',
      },
      '/kpi': {
        description: 'KPI event recording and aggregation (database-backed)',
        methods: ['GET', 'POST'],
        endpoints: [
          'POST /kpi/record-event',
          'GET /kpi/aggregate?windowDays=N',
          'GET /kpi/success-rate?windowDays=N',
        ],
      },
    },
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-ROUTER MOUNTS
// ═══════════════════════════════════════════════════════════════════════════════

async function mountSubRouters() {
  // IND Automation
  try {
    const automationModule = await import('./ind_automation_routes');
    router.use('/automation', automationModule.default);
    logger.info('Mounted: /automation (IND automation)');
  } catch (error) {
    logger.error('Failed to mount automation routes:', error);
  }

  // IND Database
  try {
    const databaseModule = await import('./ind-database.routes');
    router.use('/database', databaseModule.default);
    logger.info('Mounted: /database (IND database)');
  } catch (error) {
    logger.error('Failed to mount database routes:', error);
  }

  // IND Submissions
  try {
    const submissionsModule = await import('./ind-submissions.routes');
    router.use('/submissions', submissionsModule.default);
    logger.info('Mounted: /submissions (IND submissions)');
  } catch (error) {
    logger.error('Failed to mount submissions routes:', error);
  }

  // IND Templates
  try {
    const templatesModule = await import('./ind-templates');
    router.use('/templates', templatesModule.default);
    logger.info('Mounted: /templates (IND templates)');
  } catch (error) {
    logger.error('Failed to mount templates routes:', error);
  }

  // Pre-IND
  try {
    const preIndModule = await import('./preIndRoutes');
    router.use('/pre-ind', preIndModule.default);
    logger.info('Mounted: /pre-ind (Pre-IND operations)');
  } catch (error) {
    logger.error('Failed to mount pre-IND routes:', error);
  }

  // IND KPI (database-backed event recording & aggregation)
  try {
    const pool = getPool();
    const kpiRouter = createINDKpiRoutes(pool);
    router.use('/kpi', kpiRouter);
    logger.info('Mounted: /kpi (IND KPI aggregation)');
  } catch (error) {
    logger.error('Failed to mount KPI routes:', error);
  }
}

// Initialize sub-routers
mountSubRouters().catch(error => {
  logger.error('Failed to initialize IND unified router:', error);
});

router.use(errorHandler);

export default router;
