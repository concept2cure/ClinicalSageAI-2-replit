import { Router, Request, Response } from 'express';
import pool from '../lib/db.js';
// @ts-ignore - JavaScript middleware file
import * as authMiddleware from '../middleware/auth.cjs';

const { authenticateToken, enforceTenant } = authMiddleware as {
  authenticateToken: (req: Request, res: Response, next: () => void) => void;
  enforceTenant: (req: Request, res: Response, next: () => void) => void;
};

const router = Router();

router.use(authenticateToken);
router.use(enforceTenant);

interface AuthUser {
  id?: string | number;
  organizationId?: string | number;
  appUserId?: string | number;
}

interface AuthRequest extends Request {
  user?: AuthUser;
}

interface DraftParams {
  sectionId: string;
}

interface DraftBody {
  content: string;
}

const SECTION_ID_PATTERN = /^[\w.-]{1,50}$/;
const MAX_CONTENT_LENGTH = 200000;

const sanitizeSectionId = (sectionId: string): string | null => {
  const trimmed = sectionId.trim();
  if (!SECTION_ID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
};

const sanitizeContent = (content: string): string => {
  return content.replace(/\u0000/g, '');
};

// GET /api/drafts/:sectionId
router.get('/:sectionId', async (req: Request<DraftParams>, res: Response) => {
  const authReq = req as AuthRequest;
  const sectionId = sanitizeSectionId(req.params.sectionId || '');
  const tenantId = authReq.user?.organizationId;

  if (!sectionId) {
    return res.status(400).json({ error: 'Invalid section id' });
  }

  if (!tenantId) {
    console.error('[SECURITY] ⛔ Blocked read attempt without TenantID');
    return res.status(403).json({ error: 'Tenant context required' });
  }

  try {
    const result = await pool.query(
      'SELECT content, last_updated, updated_by FROM document_drafts WHERE section_id = $1 AND tenant_id = $2',
      [sectionId, String(tenantId)]
    );

    res.json({
      found: result.rows.length > 0,
      content: result.rows[0]?.content || '',
      metadata: {
        lastUpdated: result.rows[0]?.last_updated || null,
        author: result.rows[0]?.updated_by || null,
      },
    });
  } catch (error) {
    console.error('[DB ERROR]', error);
    res.status(500).json({ error: 'Internal system error' });
  }
});

// POST /api/drafts/:sectionId
router.post('/:sectionId', async (req: Request<DraftParams, {}, DraftBody>, res: Response) => {
  const authReq = req as AuthRequest;
  const sectionId = sanitizeSectionId(req.params.sectionId || '');
  const tenantId = authReq.user?.organizationId;
  const userId = authReq.user?.id || 'SYSTEM';
  const content = req.body?.content;

  if (!sectionId) {
    return res.status(400).json({ error: 'Invalid section id' });
  }

  if (content === undefined) {
    return res.status(400).json({ error: 'Content body is missing' });
  }

  if (typeof content !== 'string') {
    return res.status(400).json({ error: 'Content must be a string' });
  }

  if (content.length > MAX_CONTENT_LENGTH) {
    return res.status(400).json({ error: 'Content exceeds maximum length' });
  }

  if (!tenantId) {
    return res.status(403).json({ error: 'Tenant context required' });
  }

  try {
    const query = `
      INSERT INTO document_drafts (section_id, tenant_id, content, last_updated, updated_by)
      VALUES ($1, $2, $3, NOW(), $4)
      ON CONFLICT (section_id, tenant_id)
      DO UPDATE SET content = $3, last_updated = NOW(), updated_by = $4;
    `;

    await pool.query(query, [sectionId, String(tenantId), sanitizeContent(content), String(userId)]);
    res.json({ success: true, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[DB ERROR]', error);
    res.status(500).json({ error: 'Persistence failure' });
  }
});

export default router;
