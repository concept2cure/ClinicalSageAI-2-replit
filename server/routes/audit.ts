import { Router, Request, Response } from 'express';
import { getPool } from '../db/pool';
// @ts-ignore - JavaScript middleware file
import * as authMiddleware from '../middleware/auth.cjs';

const { authenticateToken, enforceTenant } = authMiddleware as {
  authenticateToken: (req: Request, res: Response, next: () => void) => void;
  enforceTenant: (req: Request, res: Response, next: () => void) => void;
};

const router = Router();
const pool = getPool();

router.use(authenticateToken);
router.use(enforceTenant);

interface AuthenticatedRequest extends Request {
  organizationId?: string;
}

// GET /api/audit (Fetch latest 50 logs)
router.get('/', async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const tenantId = authReq.organizationId;

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  try {
    const result = await pool.query(
      `SELECT id, user_id, action, details, timestamp
       FROM audit_logs
       WHERE tenant_id = $1
       ORDER BY timestamp DESC
       LIMIT 50`,
      [tenantId]
    );
    res.json({ logs: result.rows });
  } catch (error) {
    console.error('[AUDIT READ ERROR]', error);
    res.status(500).json({ error: 'Failed to retrieve audit trail' });
  }
});

export default router;
