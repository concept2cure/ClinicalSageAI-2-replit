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

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Extract tenant context from request headers
 */
const extractTenantContext = (req: Request, _res: Response, next: NextFunction) => {
  const organizationId = (req.headers['x-organization-id'] as string) || null;
  const clientWorkspaceId = (req.headers['x-client-workspace-id'] as string) || null;
  const module = (req.headers['x-module'] as string) || '510k';

  (req as any).tenantContext = {
    organizationId,
    clientWorkspaceId,
    module,
  };

  next();
};

// Apply tenant context to all routes
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
    const requirementsModule = await import('./510k-api-routes');
    router.use('/api', requirementsModule.default);
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
    const estarModule = await import('./510kEstarRoutes');
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
router.get('/docs', (_req: Request, res: Response) => {
  res.json({
    name: 'FDA 510(k) Unified API',
    version: '2.0.0',
    description: 'Consolidated API for FDA 510(k) submission management',
    baseUrl: '/api/fda510k-unified',
    endpoints: {
      health: {
        method: 'GET',
        path: '/health',
        description: 'Health check endpoint',
      },
      device: {
        prefix: '/device',
        description: 'Device profile management and predicate finder',
        endpoints: [
          { method: 'GET', path: '/health', description: 'Device module health' },
          { method: 'POST', path: '/device-profile', description: 'Create device profile' },
          { method: 'GET', path: '/device-profile/:id', description: 'Get device profile' },
          { method: 'POST', path: '/predicate-search', description: 'Search predicates' },
          { method: 'POST', path: '/pathway-analysis', description: 'Pathway analysis' },
        ],
      },
      api: {
        prefix: '/api',
        description: 'FDA requirements and device class data',
        endpoints: [
          {
            method: 'GET',
            path: '/requirements/:deviceClass',
            description: 'Get requirements by class',
          },
          { method: 'GET', path: '/device-types', description: 'List device types' },
          { method: 'GET', path: '/product-codes', description: 'Search product codes' },
        ],
      },
      compliance: {
        prefix: '/compliance',
        description: 'Compliance checking and validation',
        endpoints: [
          {
            method: 'GET',
            path: '/compliance-results/:projectId',
            description: 'Get compliance results',
          },
          { method: 'POST', path: '/run-checks', description: 'Run compliance checks' },
          { method: 'POST', path: '/auto-fix', description: 'Apply auto-fixes' },
        ],
      },
      literature: {
        prefix: '/literature',
        description: 'Literature search and citations',
        endpoints: [
          { method: 'POST', path: '/search', description: 'Search literature' },
          { method: 'POST', path: '/aggregate', description: 'Aggregate results' },
          { method: 'POST', path: '/summarize', description: 'Generate summaries' },
          { method: 'POST', path: '/citations', description: 'Format citations' },
        ],
      },
      projects: {
        prefix: '/projects',
        description: 'Project wizard and management',
        endpoints: [
          { method: 'GET', path: '/templates', description: 'Get project templates' },
          { method: 'POST', path: '/create', description: 'Create new project' },
          { method: 'GET', path: '/:id', description: 'Get project details' },
          { method: 'PUT', path: '/:id', description: 'Update project' },
          { method: 'GET', path: '/:id/progress', description: 'Get stage progress' },
        ],
      },
      fda: {
        prefix: '/fda',
        description: 'Production FDA API integration',
        endpoints: [
          { method: 'GET', path: '/search', description: 'Search FDA database' },
          { method: 'GET', path: '/device/:k_number', description: 'Get device by K number' },
          { method: 'GET', path: '/predicates/:productCode', description: 'Find predicates' },
          { method: 'GET', path: '/recalls/:productCode', description: 'Get recall history' },
        ],
      },
      estar: {
        prefix: '/estar',
        description: 'eSTAR package generation',
        endpoints: [
          { method: 'POST', path: '/validate', description: 'Validate for eSTAR' },
          { method: 'POST', path: '/build', description: 'Build eSTAR package' },
          { method: 'GET', path: '/status/:packageId', description: 'Get build status' },
        ],
      },
    },
    deprecation: {
      notice: 'Legacy endpoints at /api/510k/*, /api/fda510k/* will be deprecated in v3.0.0',
      migrationGuide: '/api/fda510k-unified/migration',
    },
  });
});

export default router;
