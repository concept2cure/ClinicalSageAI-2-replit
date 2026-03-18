/**
 * CMC Dashboard Routes
 * Chemistry, Manufacturing, and Controls dashboard
 */
import { Router, Response } from 'express';
import { eq, sql, and } from 'drizzle-orm';
import { db } from '../db';
import { cmcChangeControl } from '../../shared/schema';
import { authMiddleware } from '../auth';

const router = Router();

const resolveOrganizationId = (req: any): number | null => {
  const headerOrg = req.header('x-organization-id') || req.header('x-org-id');
  const tenantOrg = req.tenantContext?.organizationId;
  const userOrg = req.user?.organizationId || req.tenantId;
  const raw = headerOrg || tenantOrg || userOrg;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};

const sendSuccess = <T>(res: Response, data: T) => res.json({ success: true, data });

router.get('/status', (_req, res) => {
  return sendSuccess(res, {
    status: 'ready',
    message: 'CMC dashboard service ready',
  });
});

router.get('/metrics', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return sendSuccess(res, {
        metrics: { totalProjects: 0, activeProjects: 0, completedProjects: 0 },
      });
    }

    const [counts] = await db
      .select({
        total: sql<number>`count(*)::int`,
        active: sql<number>`count(*) filter (where ${cmcChangeControl.status} in ('draft', 'in_review', 'pending', 'open'))::int`,
        completed: sql<number>`count(*) filter (where ${cmcChangeControl.status} in ('approved', 'completed', 'closed', 'implemented'))::int`,
      })
      .from(cmcChangeControl)
      .where(eq(cmcChangeControl.organizationId, organizationId));

    return sendSuccess(res, {
      metrics: {
        totalProjects: counts?.total ?? 0,
        activeProjects: counts?.active ?? 0,
        completedProjects: counts?.completed ?? 0,
      },
    });
  } catch (error: any) {
    console.error('[CMC Dashboard] Metrics error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch CMC metrics', message: error.message });
  }
});

router.get('/projects', authMiddleware, async (req: any, res) => {
  try {
    const organizationId = resolveOrganizationId(req);
    if (!organizationId) {
      return sendSuccess(res, { projects: [], total: 0 });
    }

    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const projects = await db
      .select()
      .from(cmcChangeControl)
      .where(eq(cmcChangeControl.organizationId, organizationId))
      .orderBy(sql`${cmcChangeControl.updatedAt} desc`)
      .limit(limit);

    return sendSuccess(res, {
      projects,
      total: projects.length,
    });
  } catch (error: any) {
    console.error('[CMC Dashboard] Projects error:', error);
    return res.status(500).json({ success: false, error: 'Failed to fetch CMC projects', message: error.message });
  }
});

export default router;
