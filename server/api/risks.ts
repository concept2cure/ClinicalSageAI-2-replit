import { Router } from 'express';
import { db } from '../../lib/database.js';
import { authenticate } from '../middleware/auth.js';
import { logEvent } from './system.js';

const router = Router();

router.use(authenticate);

router.post('/create-from-lumen', async (req, res) => {
  const { projectId, source, title, description, mitigation_plan, severity } = req.body || {};
  const userId = req.user?.id || null;
  const organizationId = req.user?.organizationId || Number(req.headers['x-organization-id'] || req.headers['x-tenant-id']);

  if (!organizationId) {
    return res.status(400).json({ error: 'Missing tenant context' });
  }
  if (!projectId || !title || !description || !severity || !source) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    const result = await db.query(
      `
      INSERT INTO project_risks (
        organization_id,
        project_id,
        title,
        description,
        status,
        priority,
        source,
        created_by,
        mitigation_steps,
        created_at,
        updated_at
      ) VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, $8, NOW(), NOW())
      RETURNING id
      `,
      [
        Number(organizationId),
        Number(projectId),
        title,
        description,
        String(severity).toUpperCase(),
        source,
        userId,
        JSON.stringify(mitigation_plan || []),
      ]
    );

    await logEvent(
      'SYSTEM_LUMEN',
      'WAR_ROOM_TRIGGER',
      String(projectId),
      {
        riskId: result.rows[0]?.id,
        title,
        severity: String(severity).toUpperCase(),
        source,
      },
      {
        tenantId: Number(organizationId),
        userId: userId ? Number(userId) : null,
        ipAddress: req.ip || null,
        userAgent: req.headers['user-agent'] || null,
        resourceType: 'project',
        severity: String(severity).toUpperCase(),
      }
    );

    return res.json({ status: 'SUCCESS', riskId: result.rows[0]?.id });
  } catch (error) {
    console.error('Failed to persist risk:', error);
    return res.status(500).json({ error: 'Database Write Failed' });
  }
});

export default router;
