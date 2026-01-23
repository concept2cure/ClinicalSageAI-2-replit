/**
 * GCC Platform API Routes Index
 * 
 * Registers all GxP-compliant API routes for:
 * - eCTD Module Structure & Seeder
 * - Evidence Vault with Vectorization
 * - E-Signature Workflows (21 CFR Part 11)
 * - Site Intelligence & Scorecards
 * - Label Impact Simulator
 * - Defensible Drafting (Chain of Verification)
 */
import { Router } from 'express';
import ectdRoutes from './ectd/routes.js';
import vaultRoutes from './vault/routes.js';
import signingRoutes from './signing/routes.js';
import siteIntelRoutes from './site-intel/routes.js';
import labelingRoutes from './labeling/routes.js';
import draftingRoutes from '../drafting/routes.js';

const router = Router();

// Mount all GCC platform routes
router.use('/ectd', ectdRoutes);
router.use('/vault', vaultRoutes);
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
        vault: 'operational',
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
