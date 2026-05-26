/**
 * GCC Platform API Routes Index
 *
 * Registers all GxP-compliant API routes for:
 * - eCTD Module Structure & Seeder
 * - E-Signature Workflows (21 CFR Part 11)
 * - Site Intelligence & Scorecards
 * - Label Impact Simulator
 * - Defensible Drafting (Chain of Verification)
 *
 * The Evidence Vault is served by the governed mdx-vault surface
 * (concept2cure_artifacts), which is organization-scoped. The earlier
 * gcc/vault prototype was removed: its schema and route columns had
 * diverged (uploads failed), it had no tenant scoping and no consumers,
 * and it duplicated the canonical vault.
 */
import { Router } from 'express';
import ectdRoutes from './ectd/routes.js';
import signingRoutes from './signing/routes.js';
import siteIntelRoutes from './site-intel/routes.js';
import labelingRoutes from './labeling/routes.js';
import draftingRoutes from '../drafting/routes.js';

const router = Router();

// Mount all GCC platform routes
router.use('/ectd', ectdRoutes);
router.use('/signing', signingRoutes);
router.use('/site-intel', siteIntelRoutes);
router.use('/labeling', labelingRoutes);
router.use('/drafting', draftingRoutes);

// Platform health check
router.get('/health', async (req, res) => {
  try {
    res.json({
      status: 'healthy',
      platform: 'GCC Enterprise',
      version: '3.0.0',
      services: {
        ectd: 'operational',
        signing: 'operational',
        siteIntel: 'operational',
        labeling: 'operational',
        drafting: 'operational'
      },
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    res.status(500).json({
      status: 'unhealthy',
      error: error.message
    });
  }
});

export default router;
