import { Router, Request, Response } from 'express';
import { pool } from '../lib/db.js';
// @ts-ignore - JavaScript middleware file
import { authenticateToken, enforceTenant } from '../middleware/auth';

const router = Router();
router.use(authenticateToken);
router.use(enforceTenant);

interface AuthUser {
  id?: string | number;
  organizationId?: string | number;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

interface CmcSaveBody {
  id?: string;
  title?: string;
  type?: string;
  data?: Record<string, unknown>;
}

interface ImpurityEntry {
  name?: string;
  result?: string | number;
  identified?: boolean;
}

const UUID_PATTERN = /^[0-9a-f-]{36}$/i;
const MAX_TITLE_LENGTH = 255;
const VALID_MODULE_TYPES = ['3.2.S', '3.2.P'] as const;

const isValidModuleType = (value: string): value is (typeof VALID_MODULE_TYPES)[number] => {
  return (VALID_MODULE_TYPES as readonly string[]).includes(value);
};

router.get('/:id', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.user?.organizationId;
  const { id } = req.params;

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  if (!UUID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Invalid project id' });
  }

  try {
    const result = await pool.query(
      'SELECT * FROM cmc_submissions WHERE id = $1 AND tenant_id = $2',
      [id, String(tenantId)]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Project not found' });
    res.json(result.rows[0]);
  } catch (error) {
    console.error('[CMC LOAD ERROR]', error);
    res.status(500).json({ error: 'Failed to load project' });
  }
});

router.post('/save', async (req: Request, res: Response) => {
  const authReq = req as AuthRequest;
  const tenantId = authReq.user?.organizationId;
  const userId = authReq.user?.id || 'SYSTEM';
  const { id, title, type, data } = req.body as CmcSaveBody;

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  if (!title || typeof title !== 'string' || title.trim().length === 0) {
    return res.status(400).json({ error: 'Title and Module Type required' });
  }

  if (!type || typeof type !== 'string' || !isValidModuleType(type)) {
    return res.status(400).json({ error: 'Invalid module type' });
  }

  const normalizedTitle = title.trim().slice(0, MAX_TITLE_LENGTH);

  if (data && typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid data payload' });
  }

  if (id && !UUID_PATTERN.test(id)) {
    return res.status(400).json({ error: 'Invalid project id' });
  }

  try {
    let result;
    if (id) {
      const query = `
        UPDATE cmc_submissions
        SET data = $1, project_title = $2, module_type = $3, updated_at = NOW(), updated_by = $4
        WHERE id = $5 AND tenant_id = $6
        RETURNING id;
      `;
      result = await pool.query(query, [data ?? {}, normalizedTitle, type, String(userId), id, String(tenantId)]);
    } else {
      const query = `
        INSERT INTO cmc_submissions (tenant_id, project_title, module_type, data, updated_by)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id;
      `;
      result = await pool.query(query, [String(tenantId), normalizedTitle, type, data ?? {}, String(userId)]);
    }
    res.json({ success: true, id: result.rows[0]?.id });
  } catch (error) {
    console.error('[CMC SAVE ERROR]', error);
    res.status(500).json({ error: 'Failed to save project' });
  }
});

router.post('/audit', async (req: Request, res: Response) => {
  const { impurities } = req.body as { impurities?: ImpurityEntry[] };
  const issues: string[] = [];

  const REPORTING_THRESHOLD = 0.05;
  const ID_THRESHOLD = 0.1;
  const QUALIFICATION_THRESHOLD = 0.15;

  if (Array.isArray(impurities)) {
    impurities.forEach(impurity => {
      const rawValue = impurity.result;
      const result = typeof rawValue === 'number' ? rawValue : parseFloat(String(rawValue));
      if (!Number.isFinite(result)) return;

      if (result > ID_THRESHOLD && !impurity.identified) {
        issues.push(
          `⚠️ ${impurity.name || 'Unnamed impurity'} (${result}%) exceeds ICH Identification Threshold (${ID_THRESHOLD}%). Structure elucidation required.`
        );
      }

      if (result > QUALIFICATION_THRESHOLD) {
        issues.push(
          `🚨 ${impurity.name || 'Unnamed impurity'} (${result}%) exceeds Qualification Threshold. Tox studies required.`
        );
      }

      if (result > REPORTING_THRESHOLD && result <= ID_THRESHOLD) {
        issues.push(
          `⚠️ ${impurity.name || 'Unnamed impurity'} (${result}%) exceeds Reporting Threshold (${REPORTING_THRESHOLD}%).`
        );
      }
    });
  }

  res.json({
    compliant: issues.length === 0,
    issues,
    timestamp: new Date().toISOString(),
  });
});

export default router;