/**
 * Read-only AnA MDX context snapshot.
 *
 *   GET /api/ana/mdx-context-snapshot?activeNav=pre-sub&activeProgramCode=OR-801
 *
 * Returns the same structured payload the chat-context-builder injects
 * into AnA's system prompt — for the Anya rail UI to render natively
 * (alerts as inline cards, milestone strip, etc.).
 *
 * Tenant-scoped via the caller's JWT organizationId. Read-only; no
 * confirmation. The endpoint itself is audit-logged so an auditor can
 * see when a UI surface pulled the proactive snapshot.
 */

import { Router, Request, Response } from 'express';

import { authenticateToken } from '../middleware/auth';
import { pool } from '../db';
import auditService from '../services/auditService';
import { buildMdxContextBlock } from '../services/ana-ri/mdx-context-resolver';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

router.get('/mdx-context-snapshot', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) {
    return res.status(403).json({ error: 'Organization context required' });
  }

  const activeNav =
    typeof req.query.activeNav === 'string' && req.query.activeNav.length > 0
      ? req.query.activeNav
      : undefined;
  const activeProgramCode =
    typeof req.query.activeProgramCode === 'string' && req.query.activeProgramCode.length > 0
      ? req.query.activeProgramCode
      : null;
  const includeProactive = req.query.includeProactive !== 'false';

  try {
    const result = await buildMdxContextBlock(pool, {
      organizationId: orgId,
      activeNav,
      activeProgramCode,
      includeProactive,
    });

    void auditService.logAction({
      tenantId: orgId,
      userId: (req as any).user?.id ?? null,
      action: 'mdx.context_snapshot.read',
      resourceType: 'mdx_context_snapshot',
      resourceId: `${orgId}:${activeNav ?? 'unknown'}`,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] as string | undefined,
      details: {
        activeNav: activeNav ?? null,
        activeProgramCode,
        includeProactive,
        alertCount: result.payload.alerts.length,
        milestoneId: result.payload.milestone?.id ?? null,
      },
    });

    res.json({
      organizationId: orgId,
      activeNav: activeNav ?? null,
      activeProgramCode,
      ...result.payload,
    });
  } catch (err) {
    res.status(500).json({
      error: 'Failed to build MDX context snapshot',
      detail: err instanceof Error ? err.message : 'unknown',
    });
  }
});

export default router;
