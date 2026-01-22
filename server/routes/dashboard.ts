import { Router, Request, Response } from 'express';
import pool from '../lib/db.js';
// @ts-ignore - JavaScript middleware file
// @ts-ignore - JavaScript middleware file
import * as authMiddleware from '../middleware/auth.cjs';

const { authenticateToken, enforceTenant } = authMiddleware as {
  authenticateToken: (req: Request, res: Response, next: () => void) => void;
  enforceTenant: (req: Request, res: Response, next: () => void) => void;
};

const router = Router();
router.use(authenticateToken);
router.use(enforceTenant);

interface AuthRequest extends Request {
  user?: { organizationId?: string | number };
}

router.get('/summary', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.user?.organizationId;

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant required' });
  }

  try {
    console.log(`[DASHBOARD] 📊 Aggregating data for Tenant: ${tenantId}`);

    const [pharma, device, cmc] = await Promise.all([
      pool.query(
        `SELECT COUNT(*) as count, MAX(ingest_date) as last_active
         FROM csr_deep_vault
         WHERE deep_data->>'tenant_id' = $1`,
        [String(tenantId)]
      ),
      pool.query(
        'SELECT COUNT(*) as count, MAX(last_updated) as last_active FROM document_drafts WHERE tenant_id = $1',
        [String(tenantId)]
      ),
      pool.query(
        'SELECT COUNT(*) as count, MAX(updated_at) as last_active FROM cmc_submissions WHERE tenant_id = $1',
        [String(tenantId)]
      ),
    ]);

    res.json({
      pharma: {
        count: Number(pharma.rows[0]?.count || 0),
        lastActive: pharma.rows[0]?.last_active || null,
      },
      device: {
        count: Number(device.rows[0]?.count || 0),
        lastActive: device.rows[0]?.last_active || null,
      },
      cmc: {
        count: Number(cmc.rows[0]?.count || 0),
        lastActive: cmc.rows[0]?.last_active || null,
      },
    });
  } catch (error) {
    console.error('[DASHBOARD ERROR]', error);
    res.status(500).json({ error: 'Failed to aggregate dashboard' });
  }
});

export default router;