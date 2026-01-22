// /server/routes/ectdSeeder.ts

import { Router } from 'express';
import { seedECTDHierarchy, getECTDHierarchy } from '../services/ectdSeederService.js';
import { checkAuth } from '../controllers/auth.js';

const router = Router();

router.use(checkAuth);

/**
 * POST /api/ectd-seeder/seed/:projectId
 * Seed eCTD hierarchy for a project
 */
router.post('/seed/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    console.log(`🌱 Seeding eCTD hierarchy for project ${projectId}...`);

    const nodeCount = await seedECTDHierarchy(projectId);

    res.json({
      success: true,
      message: 'eCTD hierarchy seeded successfully',
      data: {
        projectId,
        nodeCount,
      },
    });
  } catch (error) {
    console.error('Error seeding eCTD hierarchy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to seed eCTD hierarchy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /api/ectd-seeder/hierarchy/:projectId
 * Get eCTD hierarchy for a project
 */
router.get('/hierarchy/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    const hierarchy = await getECTDHierarchy(projectId);

    if (!hierarchy) {
      return res.status(404).json({
        success: false,
        error: 'No eCTD hierarchy found for this project',
      });
    }

    res.json({
      success: true,
      data: hierarchy,
    });
  } catch (error) {
    console.error('Error fetching eCTD hierarchy:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch eCTD hierarchy',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
