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
import { serverError } from '../lib/api-response';
import { z } from 'zod';
import { reverifySigner } from '../services/part11/reverify-signer';
import { signerReverificationDeps } from '../services/part11/reverify-signer-deps';
import { resolveSignerOrgRole } from '../services/part11/resolve-signer-role';
import { isSigningAuthorized } from '../services/part11/signing-authority';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('pccp');
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
      return serverError(res, logger, 'loading plans', err);
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
        programId: String(req.params.programId ?? ""),
        createdBy,
        updatedBy: createdBy,
      });
      res.status(201).json(plan);
    } catch (err: any) {
      return serverError(res, logger, 'saving plans', err);
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
    const updated = await updatePlan(orgId, String(req.params.planId), req.body, updatedBy);
    if (!updated) return res.status(404).json({ error: 'Plan not found' });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'PCCP_LOCKED') return res.status(409).json({ error: 'Plan is locked' });
    return serverError(res, logger, 'updating plans', err);
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
      return serverError(res, logger, 'loading modifications', err);
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
      return serverError(res, logger, 'saving modifications', err);
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
    return serverError(res, logger, 'updating modifications', err);
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
    return serverError(res, logger, 'validating plans', err);
  }
});

/* Approving a PCCP locks it: the plan becomes the device's authorized change
   envelope. That is a Part 11 signed act, and this route used to treat it as a
   field update:
     - `approvedBy` fell back to the literal 'system' when no user was on the
       request, so a plan could be locked "approved by system";
     - `signatureId` was whatever string the client sent, stored on the locked
       plan and never checked — a signature reference to nothing;
     - no password, second factor, signing authority or reason was required.
   It now follows the platform's one signing ceremony, as the RBM approve route
   does: the signer re-authenticates server-side (§11.200), must hold signing
   authority (§11.10(g)), and states a reason; the approver recorded is that
   verified user. No client-supplied signature id is stored. */
const approvePlanBody = z.object({
  reason: z.string().min(3).max(2000),
  password: z.string().min(1),
  mfaToken: z.string().optional(),
});

router.post('/plans/:planId/approve', requirePlanAccess, async (req: Request, res: Response) => {
  const orgId = getOrgId(req)!;
  const parsed = approvePlanBody.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(422).json({
      error: 'A reason for approval and the signer\'s password are required',
      details: parsed.error.flatten().fieldErrors,
    });
  }
  const signerRaw = (req as any).user?.id;
  const signerId = typeof signerRaw === 'number' ? signerRaw : Number.parseInt(String(signerRaw ?? ''), 10);
  if (!Number.isFinite(signerId)) {
    return res.status(401).json({ error: 'An authenticated signer is required to approve' });
  }
  const signoff = await reverifySigner(
    signerId,
    { password: parsed.data.password, mfaToken: parsed.data.mfaToken },
    signerReverificationDeps(),
  );
  if (!signoff.ok) return res.status(signoff.status).json({ error: signoff.error, code: signoff.code });
  const signerRole = await resolveSignerOrgRole(signerId, orgId);
  if (!isSigningAuthorized(signerRole)) {
    return res.status(403).json({
      error: 'Your role does not permit approving this plan (21 CFR Part 11 §11.10(g)).',
      code: 'PCCP_NO_SIGNING_AUTHORITY',
    });
  }
  try {
    const result = await approvePlan({
      organizationId: orgId,
      planId: String(req.params.planId),
      approvedBy: String(signerId),
      reason: parsed.data.reason,
    });
    if ('error' in result) {
      if (result.error === 'NOT_FOUND') return res.status(404).json({ error: 'Plan not found' });
      if (result.error === 'ALREADY_LOCKED') return res.status(409).json({ error: 'Already locked' });
      if (result.error === 'AUDIT_WRITE_FAILED') {
        return res.status(500).json({ error: 'The approval could not be recorded, so it was not applied', code: 'AUDIT_WRITE_FAILED' });
      }
      if (result.error === 'GATE_BLOCKED') {
        return res.status(409).json({
          error: 'Validation gate blocked approval',
          validation: result.validation,
        });
      }
    }
    res.json(result);
  } catch (err: any) {
    return serverError(res, logger, 'approving plans', err);
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
    return serverError(res, logger, 'saving supersede', err);
  }
});

export default router;
