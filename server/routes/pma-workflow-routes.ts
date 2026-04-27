/**
 * PMA Workflow Routes — task state persistence for PMA workspace.
 *
 * Stores PMA task progress in the projectCharters.pmaConfig JSON column.
 * Minimal API: save phase/task state and load it back.
 */

import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import { createScopedLogger } from '../utils/logger';

const logger = createScopedLogger('pma-workflow');

export function createPMAWorkflowRoutes(pool: Pool): Router {
  const router = Router();

  // POST /:projectId — save PMA task state
  router.post('/:projectId', async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const organizationId =
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      (req as any).user?.organizationId;
    const { phases } = req.body;

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organizationId' });
    }

    try {
      // Upsert pmaConfig on the project charter
      const result = await pool.query(
        `UPDATE project_charters
         SET pma_config = $1, updated_at = NOW()
         WHERE project_id = $2 AND organization_id = $3
         RETURNING id`,
        [JSON.stringify({ phases, savedAt: new Date().toISOString() }), projectId, organizationId]
      );

      if (result.rowCount === 0) {
        // No charter exists — create one
        await pool.query(
          `INSERT INTO project_charters (organization_id, project_id, submission_type, regulatory_region, product_name, pma_config)
           VALUES ($1, $2, 'PMA', 'FDA', 'PMA Device', $3)`,
          [organizationId, projectId, JSON.stringify({ phases, savedAt: new Date().toISOString() })]
        );
      }

      logger.info(`PMA workflow saved for project ${projectId}`);
      return res.json({ success: true, savedAt: new Date().toISOString() });
    } catch (error: any) {
      logger.error(`PMA workflow save failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to save PMA workflow' });
    }
  });

  // GET /:projectId — load PMA task state
  router.get('/:projectId', async (req: Request, res: Response) => {
    const { projectId } = req.params;
    const organizationId =
      (req as any).tenantId ||
      (req as any).tenantContext?.organizationId ||
      (req as any).user?.organizationId;

    if (!projectId || !organizationId) {
      return res.status(400).json({ error: 'Missing projectId or organizationId' });
    }

    try {
      const result = await pool.query(
        `SELECT pma_config FROM project_charters
         WHERE project_id = $1 AND organization_id = $2
         LIMIT 1`,
        [projectId, organizationId]
      );

      if (result.rows.length === 0 || !result.rows[0].pma_config) {
        return res.json({ phases: null });
      }

      return res.json(result.rows[0].pma_config);
    } catch (error: any) {
      logger.error(`PMA workflow load failed: ${error.message}`);
      return res.status(500).json({ error: 'Failed to load PMA workflow' });
    }
  });

  return router;
}
