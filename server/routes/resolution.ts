/**
 * Resolution Orchestration API Routes — Sprint 4
 *
 * POST /api/resolution/plans                  — Create a resolution plan
 * GET  /api/resolution/plans/:projectId       — List project resolution plans
 * GET  /api/resolution/plans/:projectId/:id   — Get a specific resolution plan
 * POST /api/resolution/plans/:id/transition   — Transition plan state
 * POST /api/resolution/plans/:id/explain      — Get AnA explanation of plan
 *
 * POST /api/resolution/bundles                — Create a resolution bundle
 * GET  /api/resolution/bundles/:projectId     — List project bundles
 * GET  /api/resolution/bundles/:projectId/:id — Get a specific bundle with items
 * POST /api/resolution/bundles/:id/transition — Transition bundle state
 * POST /api/resolution/bundles/:id/items      — Add item to bundle
 * PUT  /api/resolution/bundles/:bundleId/items/:itemId — Update item status
 * POST /api/resolution/bundles/from-plan      — Create bundle from plan
 * POST /api/resolution/bundles/:id/explain    — Get AnA summary of bundle
 * POST /api/resolution/bundles/:id/execute    — Execute bundle and return receipt
 *
 * POST /api/resolution/supersessions          — Record a supersession
 * GET  /api/resolution/supersessions/:projectId — List project supersessions
 * POST /api/resolution/supersessions/:id/confirm — Confirm supersession
 * POST /api/resolution/supersessions/:id/revert  — Revert supersession
 * GET  /api/resolution/supersessions/chain/:objectType/:objectId — Get chain
 * GET  /api/resolution/supersessions/check/:objectType/:objectId — Check if superseded
 *
 * POST /api/resolution/reapproval/check       — Check reapproval requirements
 * POST /api/resolution/promotion-block/check  — Check promotion blocking
 *
 * POST /api/resolution/cluster                — Cluster affected objects
 * POST /api/resolution/rewrite-targets        — Identify rewrite targets
 * POST /api/resolution/harmonization-actions  — Prepare harmonization actions
 */

import { Router, Request, Response } from 'express';
import type { BundleExecutionReceipt } from '../../shared/types/resolution';
import {
  createResolutionPlan,
  getResolutionPlan,
  getProjectResolutionPlans,
  getUnresolvedPlans,
  clusterAffectedObjects,
  createResolutionBundle,
  getResolutionBundle,
  getProjectBundles,
  transitionBundleState,
  updateBundleItemStatus,
  addBundleItem,
  createBundleFromPlan,
  recordSupersession,
  confirmSupersession,
  revertSupersession,
  getObjectSupersessions,
  getSupersessionChain,
  isSuperseded,
  getProjectSupersessions,
  determineReapprovalRequirements,
  checkPromotionBlock,
  transitionResolutionState,
  identifyRewriteTargets,
  prepareHarmonizationActions,
  explainResolutionPlan,
  summarizeResolutionBundle,
  executeBundle,
} from '../services/resolution';

const router = Router();

// ---------------------------------------------------------------------------
// Auth helpers (same pattern as orchestration routes)
// ---------------------------------------------------------------------------

function getOrganizationId(req: Request): number {
  if ((req as any).tenantContext?.organizationId) {
    const orgId = typeof (req as any).tenantContext.organizationId === 'number'
      ? (req as any).tenantContext.organizationId
      : parseInt((req as any).tenantContext.organizationId as string, 10);
    if (!isNaN(orgId)) return orgId;
  }
  if ((req as any).organizationId) {
    return typeof (req as any).organizationId === 'number'
      ? (req as any).organizationId
      : parseInt((req as any).organizationId as string, 10);
  }
  if (req.user?.organizationId) return req.user.organizationId;
  throw new Error('Organization context required');
}

function getUserId(req: Request): number {
  if (req.userId) return req.userId;
  if (req.user?.id) return req.user.id;
  throw new Error('Authentication required');
}

// ---------------------------------------------------------------------------
// RESOLUTION PLANS
// ---------------------------------------------------------------------------

router.post('/plans', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const plan = await createResolutionPlan(orgId, userId, req.body);
    res.status(201).json({ success: true, plan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/plans/:projectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.projectId, 10);
    const stateFilter = req.query.state as string | undefined;
    const plans = await getProjectResolutionPlans(orgId, projectId, stateFilter as any);
    res.json({ success: true, plans });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/plans/:projectId/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const plan = await getResolutionPlan(orgId, req.params.id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
    res.json({ success: true, plan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/plans/:id/transition', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { targetState, reason } = req.body;
    const plan = await transitionResolutionState(orgId, userId, req.params.id, targetState, reason);
    res.json({ success: true, plan });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/plans/:id/explain', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const plan = await getResolutionPlan(orgId, req.params.id);
    if (!plan) return res.status(404).json({ success: false, error: 'Plan not found' });
    const explanation = explainResolutionPlan(plan);
    res.json({ success: true, explanation });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// RESOLUTION BUNDLES
// ---------------------------------------------------------------------------

router.post('/bundles', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const result = await createResolutionBundle(orgId, userId, req.body);
    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/bundles/:projectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.projectId, 10);
    const stateFilter = req.query.state as string | undefined;
    const bundles = await getProjectBundles(orgId, projectId, stateFilter as any);
    res.json({ success: true, bundles });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/bundles/:projectId/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const result = await getResolutionBundle(orgId, req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Bundle not found' });
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/bundles/:id/transition', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { targetState, reason } = req.body;
    const bundle = await transitionBundleState(orgId, userId, req.params.id, targetState, reason);
    res.json({ success: true, bundle });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/bundles/:id/items', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const item = await addBundleItem(orgId, req.params.id, req.body);
    res.status(201).json({ success: true, item });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.put('/bundles/:bundleId/items/:itemId', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    const { status } = req.body;
    const item = await updateBundleItemStatus(req.params.bundleId, req.params.itemId, status, userId);
    res.json({ success: true, item });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/bundles/from-plan', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { planId } = req.body;
    const result = await createBundleFromPlan(orgId, userId, planId);
    res.status(201).json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/bundles/:id/explain', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const result = await getResolutionBundle(orgId, req.params.id);
    if (!result) return res.status(404).json({ success: false, error: 'Bundle not found' });
    const summary = summarizeResolutionBundle(result.bundle, result.items);
    res.json({ success: true, summary });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// BUNDLE EXECUTION
// ---------------------------------------------------------------------------

router.post('/bundles/:id/execute', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const bundleId = req.params.id;
    if (!bundleId || bundleId.trim().length === 0) {
      return res.status(400).json({ success: false, error: 'Bundle ID is required' });
    }
    const receipt = await executeBundle(orgId, userId, bundleId);
    res.json({ success: true, receipt });
  } catch (error: any) {
    const status = error.message?.includes('not found') ? 404 : 400;
    res.status(status).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// SUPERSESSIONS
// ---------------------------------------------------------------------------

router.post('/supersessions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const record = await recordSupersession(orgId, userId, req.body);
    res.status(201).json({ success: true, supersession: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/supersessions/:projectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.projectId, 10);
    const stateFilter = req.query.state as string | undefined;
    const records = await getProjectSupersessions(orgId, projectId, stateFilter as any);
    res.json({ success: true, supersessions: records });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/supersessions/:id/confirm', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const record = await confirmSupersession(orgId, userId, req.params.id);
    res.json({ success: true, supersession: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/supersessions/:id/revert', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { reason } = req.body;
    if (!reason) return res.status(400).json({ success: false, error: 'Reason required for revert' });
    const record = await revertSupersession(orgId, userId, req.params.id, reason);
    res.json({ success: true, supersession: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/supersessions/chain/:objectType/:objectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const chain = await getSupersessionChain(orgId, req.params.objectType, req.params.objectId);
    res.json({ success: true, chain });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.get('/supersessions/check/:objectType/:objectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const result = await isSuperseded(orgId, req.params.objectType, req.params.objectId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// REAPPROVAL & PROMOTION
// ---------------------------------------------------------------------------

router.post('/reapproval/check', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, affectedObjects, triggerType, confidence } = req.body;
    const determinations = await determineReapprovalRequirements(
      orgId, projectId, affectedObjects, triggerType, confidence
    );
    res.json({ success: true, determinations });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/promotion-block/check', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { objectType, objectId } = req.body;
    const result = await checkPromotionBlock(orgId, objectType, objectId);
    res.json({ success: true, ...result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// CLUSTERING & REWRITE
// ---------------------------------------------------------------------------

router.post('/cluster', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, triggerType, triggerId } = req.body;
    const cluster = await clusterAffectedObjects(orgId, projectId, triggerType, triggerId);
    res.json({ success: true, cluster });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/rewrite-targets', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, affectedObjects, recommendedPath, triggerDescription } = req.body;
    const targets = await identifyRewriteTargets(
      orgId, projectId, affectedObjects, recommendedPath, triggerDescription
    );
    res.json({ success: true, targets });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/harmonization-actions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, affectedObjects, triggerObjectType, triggerObjectId, triggerDescription } = req.body;
    const actions = await prepareHarmonizationActions(
      orgId, projectId, affectedObjects, triggerObjectType, triggerObjectId, triggerDescription
    );
    res.json({ success: true, actions });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
