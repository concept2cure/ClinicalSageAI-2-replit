/**
 * API Routes Index
 *
 * This file centralizes all API route registrations.
 */
import { Router } from 'express';
import tenantsRoutes from './tenants';
import tenantConfigRoutes from './tenant-config';
import tenantUsersRoutes from './tenant-users';
import tenantStatsRoutes from './tenant-stats';
import tenantCtqFactorsRoutes from './tenant-ctq-factors';
import tenantSectionGatingRoutes from './tenant-section-gating';
import tenantTraceabilityRoutes from './tenant-traceability';
import documentRoutes from './document-routes';
import regulatorySubmissionsRoutes from './regulatorySubmissions';
import foresightAIAdvancedRoutes from './foresight-ai-advanced';
import foresightFeedbackRoutes from './foresight-feedback';
import regulatoryIntelligenceRoutes from './regulatory-intelligence-api';
import medicalDeviceRoutes from './medical-device-api';
import concept2cureRoutes from './concept2cure';
import productAuditRoutes from './product-audit';
import workflowRoutes from './workflow';
import cmcDashboardRoutes from './cmc-dashboard';
import anaFeaturesRoutes from './ana-features';
import { authMiddleware } from '../auth';

const router = Router();

// Health check route - no auth required
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public routes - no auth required
router.use('/public', (req, res, next) => {
  // Public endpoints would go here
  next();
});

// Routes that require authentication
router.use('/tenants', tenantsRoutes);
router.use('/tenant-config', tenantConfigRoutes);
router.use('/tenant-users', tenantUsersRoutes);
router.use('/tenant-stats', tenantStatsRoutes);
router.use('/tenant-ctq-factors', tenantCtqFactorsRoutes);
router.use('/tenant-section-gating', tenantSectionGatingRoutes);
router.use('/tenant-traceability', tenantTraceabilityRoutes);
router.use('/documents', documentRoutes);
router.use('/regulatory-submissions', regulatorySubmissionsRoutes);
router.use('/foresight-ai', foresightAIAdvancedRoutes);
router.use('/foresight-feedback', foresightFeedbackRoutes);

// Phase 52 Sherpa System Routes
router.use('/regulatory-intelligence', regulatoryIntelligenceRoutes);
router.use('/medical-device', medicalDeviceRoutes);

// Concept2Cure Core Routes
router.use('/concept2cure', concept2cureRoutes);
router.use('/product-audit', productAuditRoutes);

// Workflow & Proofs
router.use('/workflow', workflowRoutes);

// CMC Dashboard (base API)
router.use('/cmc', cmcDashboardRoutes);

// AnA Intelligence Features (Feed, Gap Analysis, Change Impact, Memory)
router.use('/ana', anaFeaturesRoutes);

// Mount API routes
export function mountApiRoutes(app: any) {
  app.use('/api', router);
  console.log('API routes mounted');
}

export default router;
