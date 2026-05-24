/**
 * AI/ML PCCP Routes
 *
 *   GET    /api/pccp/programs/:programId/plans
 *   POST   /api/pccp/programs/:programId/plans                  (draft a plan)
 *   GET    /api/pccp/plans/:planId
 *   PATCH  /api/pccp/plans/:planId
 *   POST   /api/pccp/plans/:planId/modifications
 *   PATCH  /api/pccp/modifications/:modificationId
 *   GET    /api/pccp/plans/:planId/modifications
 *   POST   /api/pccp/plans/:planId/validate
 *   POST   /api/pccp/plans/:planId/approve                       (gated by validator)
 *   POST   /api/pccp/plans/:planId/supersede                     (creates new draft version)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { and, eq } from 'drizzle-orm';

import { db } from '../db';
import { regulatoryPrograms } from '../../shared/schema/programs';
import { aiMlPccpPlans, aiMlModifications } from '../../shared/schema/ai-ml-pccp';
import { authenticateToken } from '../middleware/auth';
import {
  addModification,
  approvePlan,
  createPlan,
  getModifications,
  getPlan,
  listProgramPlans,
  supersedePlan,
  updateModification,
  updatePlan,
  validatePlan,
} from '../services/ai-ml-pccp/pccp.service';

const router = Router();
router.use(authenticateToken);

function getOrgId(req: Request): number | null {
  const raw = (req as any).user?.organizationId;
  if (raw === undefined || raw === null) return null;
  const n = typeof raw === 'string' ? parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

async function requireProgramAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const [row] = await db
    .select({ id: regulatoryPrograms.id })
    .from(regulatoryPrograms)
    .where(and(eq(regulatoryPrograms.id, String(req.params.programId)), eq(regulatoryPrograms.organizationId, orgId)))
    .limit(1);
  if (!row) {
    res.status(403).json({ error: 'Access denied' });
    return;
  }
  next();
}

async function requirePlanAccess(req: Request, res: Response, next: NextFunction): Promise<void> {
  const orgId = getOrgId(req);
  if (orgId === null) {
    res.status(403).json({ error: 'Organization context required' });
    return;
  }
  const plan = await getPlan(orgId, String(req.params.planId));
  if (!plan) {
    res.status(404).json({ error: 'Plan not found' });
    return;
  }
  (req as any).pccpPlan = plan;
  next();
}

// ── Plans ────────────────────────────────────────────────────────────────────

router.get(
  '/programs/:programId/plans',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    try {
      const plans = await listProgramPlans(orgId, String(req.params.programId));
      res.json({ programId: req.params.programId, plans, count: plans.length });
    } catch (err: any) {
      res.status(500).json({ error: 'List failed', detail: err?.message });
    }
  }
);

router.post(
  '/programs/:programId/plans',
  requireProgramAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const userIdRaw = (req as any).user?.id;
    const createdBy =
      typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
    const body = req.body ?? {};
    if (!body.code || !body.title) {
      return res.status(422).json({ error: 'code and title are required' });
    }
    try {
      const plan = await createPlan({
        ...body,
        organizationId: orgId,
        programId: req.params.programId,
        createdBy,
        updatedBy: createdBy,
      });
      res.status(201).json(plan);
    } catch (err: any) {
      res.status(500).json({ error: 'Create failed', detail: err?.message });
    }
  }
);

router.get('/plans/:planId', requirePlanAccess, async (req: Request, res: Response) => {
  res.json((req as any).pccpPlan);
});

router.patch('/plans/:planId', requirePlanAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req)!;
  const userIdRaw = (req as any).user?.id;
  const updatedBy =
    typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
  try {
    const updated = await updatePlan(orgId, String(req.params.planId), {
      ...req.body,
      updatedBy,
    });
    if (!updated) return res.status(404).json({ error: 'Plan not found' });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'PCCP_LOCKED') return res.status(409).json({ error: 'Plan is locked' });
    res.status(500).json({ error: 'Update failed', detail: err?.message });
  }
});

// ── Modifications ────────────────────────────────────────────────────────────

router.get(
  '/plans/:planId/modifications',
  requirePlanAccess,
  async (req: Request, res: Response) => {
    try {
      const mods = await getModifications(String(req.params.planId));
      res.json({ planId: req.params.planId, modifications: mods, count: mods.length });
    } catch (err: any) {
      res.status(500).json({ error: 'Fetch failed', detail: err?.message });
    }
  }
);

router.post(
  '/plans/:planId/modifications',
  requirePlanAccess,
  async (req: Request, res: Response) => {
    const orgId = getOrgId(req)!;
    const body = req.body ?? {};
    if (!body.code || !body.title || !body.modificationType || !body.boundary || !body.rationale || !body.rollbackStrategy) {
      return res.status(422).json({
        error:
          'code, title, modificationType, boundary, rationale, and rollbackStrategy are required',
      });
    }
    try {
      const mod = await addModification(orgId, String(req.params.planId), body);
      if (!mod) return res.status(404).json({ error: 'Plan not found' });
      res.status(201).json(mod);
    } catch (err: any) {
      if (err?.code === 'PCCP_LOCKED') return res.status(409).json({ error: 'Plan is locked' });
      res.status(500).json({ error: 'Create failed', detail: err?.message });
    }
  }
);

router.patch('/modifications/:modificationId', async (req: Request, res: Response) => {
  const orgId = getOrgId(req);
  if (orgId === null) return res.status(403).json({ error: 'Organization context required' });

  // Org-access check via the parent plan
  const [mod] = await db
    .select()
    .from(aiMlModifications)
    .where(eq(aiMlModifications.id, String(req.params.modificationId)))
    .limit(1);
  if (!mod) return res.status(404).json({ error: 'Modification not found' });

  const [plan] = await db
    .select({ id: aiMlPccpPlans.id, organizationId: aiMlPccpPlans.organizationId, locked: aiMlPccpPlans.locked })
    .from(aiMlPccpPlans)
    .where(eq(aiMlPccpPlans.id, mod.planId))
    .limit(1);
  if (!plan || plan.organizationId !== orgId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  if (plan.locked) return res.status(409).json({ error: 'Plan is locked' });

  try {
    const updated = await updateModification(String(req.params.modificationId), req.body ?? {});
    res.json(updated);
  } catch (err: any) {
    res.status(500).json({ error: 'Update failed', detail: err?.message });
  }
});

// ── Validation + lifecycle ──────────────────────────────────────────────────

router.post('/plans/:planId/validate', requirePlanAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req)!;
  try {
    const result = await validatePlan(orgId, String(req.params.planId));
    if (!result) return res.status(404).json({ error: 'Plan not found' });
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Validate failed', detail: err?.message });
  }
});

router.post('/plans/:planId/approve', requirePlanAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req)!;
  const userIdRaw = (req as any).user?.id;
  const approvedBy =
    typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
  const signatureId = typeof req.body?.signatureId === 'string' ? req.body.signatureId : undefined;
  try {
    const result = await approvePlan({
      organizationId: orgId,
      planId: String(req.params.planId),
      approvedBy,
      signatureId,
    });
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'Plan not found' });
      if (result.error === 'ALREADY_LOCKED') return res.status(409).json({ error: 'Already locked' });
      if (result.error === 'GATE_BLOCKED') {
        return res.status(409).json({
          error: 'Validation gate blocked approval',
          validation: result.validation,
        });
      }
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Approve failed', detail: err?.message });
  }
});

router.post('/plans/:planId/supersede', requirePlanAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req)!;
  const userIdRaw = (req as any).user?.id;
  const createdBy =
    typeof userIdRaw === 'string' ? userIdRaw : userIdRaw != null ? String(userIdRaw) : 'system';
  try {
    const result = await supersedePlan({
      organizationId: orgId,
      oldPlanId: String(req.params.planId),
      newTitle: typeof req.body?.newTitle === 'string' ? req.body.newTitle : undefined,
      createdBy,
    });
    if (!result) return res.status(404).json({ error: 'Plan not found' });
    res.status(201).json(result);
  } catch (err: any) {
    res.status(500).json({ error: 'Supersede failed', detail: err?.message });
  }
});

export default router;
