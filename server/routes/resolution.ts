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
 *
 * POST /api/resolution/orchestrate            — AnA full orchestration (detect → decide → plan → execute → prove)
 * POST /api/resolution/rewrite-targets        — Identify rewrite targets
 * POST /api/resolution/harmonization-actions  — Prepare harmonization actions
 *
 * Contradiction → Resolution Bridge (Pass 9):
 * POST /api/resolution/contradiction/resolve  — Full contradiction → resolution with authority + overlay + receipt
 * POST /api/resolution/contradiction/plan     — Plan resolution for a contradiction (no execution)
 * POST /api/resolution/contradiction/execute  — Execute a planned contradiction resolution
 * POST /api/resolution/contradiction/explain  — Explain resolution plan (structured, no LLM)
 * GET  /api/resolution/contradiction/status/:projectId — Project resolution status summary
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
  orchestrateResolution,
  resolveContradiction,
  planContradictionResolution,
  executeContradictionResolution,
  explainContradictionResolution,
  getProjectResolutionStatus,
} from '../services/resolution';

const router = Router();

// ---------------------------------------------------------------------------
// Auth helpers (same pattern as orchestration routes)
// ---------------------------------------------------------------------------

function getOrganizationId(req: Request): number {
  if ((req as any).tenantContext?.organizationId) {
    const orgId =
      typeof (req as any).tenantContext.organizationId === 'number'
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
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { status } = req.body;
    if (!status || !['pending', 'in_progress', 'completed', 'skipped', 'failed'].includes(status)) {
      return res
        .status(400)
        .json({
          success: false,
          error: 'Invalid status. Must be one of: pending, in_progress, completed, skipped, failed',
        });
    }
    const item = await updateBundleItemStatus(
      orgId,
      req.params.bundleId,
      req.params.itemId,
      status,
      userId
    );
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
    if (!reason)
      return res.status(400).json({ success: false, error: 'Reason required for revert' });
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
      orgId,
      projectId,
      affectedObjects,
      triggerType,
      confidence
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
      orgId,
      projectId,
      affectedObjects,
      recommendedPath,
      triggerDescription
    );
    res.json({ success: true, targets });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/harmonization-actions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, affectedObjects, triggerObjectType, triggerObjectId, triggerDescription } =
      req.body;
    const actions = await prepareHarmonizationActions(
      orgId,
      projectId,
      affectedObjects,
      triggerObjectType,
      triggerObjectId,
      triggerDescription
    );
    res.json({ success: true, actions });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// ANA RESOLUTION ORCHESTRATOR
// ---------------------------------------------------------------------------

router.post('/orchestrate', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const {
      projectId,
      triggerType,
      triggerId,
      triggerDescription,
      affectedObjects,
      forceConfidence,
    } = req.body;

    if (!projectId || !triggerType || !triggerId || !triggerDescription) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, triggerType, triggerId, triggerDescription',
      });
    }

    const result = await orchestrateResolution(orgId, userId, {
      projectId,
      triggerType,
      triggerId,
      triggerDescription,
      affectedObjects,
      forceConfidence,
    });

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// CONTRADICTION-AWARE RESOLUTION ORCHESTRATION (Pass 9)
// ---------------------------------------------------------------------------

router.post('/orchestrate/contradiction', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const {
      projectId,
      contradictionIds,
      regulatorBody,
      submissionType,
      workflowStage,
      autoExecute,
    } = req.body;

    if (
      !projectId ||
      !contradictionIds ||
      !Array.isArray(contradictionIds) ||
      contradictionIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, contradictionIds (non-empty array)',
      });
    }

    const { orchestrateContradictionResolution } = await import('../services/resolution');
    const result = await orchestrateContradictionResolution(orgId, userId, {
      projectId,
      contradictionIds,
      regulatorBody,
      submissionType,
      workflowStage,
      autoExecute,
    });

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

router.post('/orchestrate/contradiction/explain', async (req: Request, res: Response) => {
  try {
    const { result } = req.body;
    if (!result) {
      return res.status(400).json({ success: false, error: 'Missing result object' });
    }
    const { buildContradictionExplanation } = await import('../services/resolution');
    const explanation = buildContradictionExplanation(result);
    res.json({ success: true, explanation });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// Contradiction bundle plan preview (plan without execution)
router.post('/orchestrate/contradiction/plan', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, contradictionIds, regulatorBody, submissionType, workflowStage } = req.body;

    if (
      !projectId ||
      !contradictionIds ||
      !Array.isArray(contradictionIds) ||
      contradictionIds.length === 0
    ) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, contradictionIds (non-empty array)',
      });
    }

    const { contradictionEngineService } = await import('../services/contradiction-engine-service');
    const { buildContradictionBundlePlan, classifyPlanActions } =
      await import('../services/resolution');

    const findings = [];
    for (const id of contradictionIds) {
      const finding = await contradictionEngineService.getFinding(id, orgId);
      if (finding) findings.push(finding);
    }

    if (findings.length === 0) {
      return res
        .status(404)
        .json({ success: false, error: 'No valid contradiction findings found' });
    }

    // Fetch overlay rules
    const overlayRules = [];
    const bodies = new Set(findings.map(f => f.regulatorBody).filter(Boolean) as string[]);
    if (regulatorBody) bodies.add(regulatorBody);

    for (const body of bodies) {
      for (const finding of findings) {
        try {
          const rules = await contradictionEngineService.getOverlayRules(
            orgId,
            finding.contradictionType,
            body
          );
          overlayRules.push(...rules);
        } catch {
          /* overlay table may not exist */
        }
      }
    }

    const plan = buildContradictionBundlePlan({
      organizationId: orgId,
      projectId,
      findings,
      overlayRules,
      regulatorBody,
      submissionType,
      workflowStage,
    });

    const classification = classifyPlanActions(plan);

    res.json({
      success: true,
      plan,
      classification: {
        autoPreparable: classification.autoPreparable.length,
        requiresConfirmation: classification.requiresConfirmation.length,
        requiresApproval: classification.requiresApproval.length,
        requiresEscalation: classification.requiresEscalation.length,
        cannotExecute: classification.cannotExecute.length,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ---------------------------------------------------------------------------
// CONTRADICTION → RESOLUTION BRIDGE (Pass 9 — individual endpoints)
// ---------------------------------------------------------------------------

/**
 * POST /api/resolution/contradiction/plan
 * Plan (but don't execute) resolution for a contradiction.
 */
router.post('/contradiction/plan', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { projectId, findingId, finding, overlayRules } = req.body;

    if (!projectId || !findingId || !finding) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, findingId, finding',
      });
    }

    const result = await planContradictionResolution(
      orgId,
      userId,
      projectId,
      findingId,
      finding,
      overlayRules
    );

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/resolution/contradiction/execute
 * Execute a planned contradiction resolution (full orchestration with authority check).
 */
router.post('/contradiction/execute', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const userId = getUserId(req);
    const { projectId, findingId, finding, overlayRules, actorRole } = req.body;

    if (!projectId || !findingId || !finding) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, findingId, finding',
      });
    }

    const result = await executeContradictionResolution(
      orgId,
      userId,
      projectId,
      findingId,
      finding,
      overlayRules,
      actorRole
    );

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/resolution/contradiction/explain
 * Explain a contradiction resolution plan (structured, no LLM).
 */
router.post('/contradiction/explain', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const { projectId, findingId, finding, overlayRules } = req.body;

    if (!projectId || !findingId || !finding) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: projectId, findingId, finding',
      });
    }

    const result = await explainContradictionResolution(
      orgId,
      projectId,
      findingId,
      finding,
      overlayRules
    );

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/resolution/contradiction/status/:projectId
 * Get resolution status for a project (plans + bundles summary).
 */
router.get('/contradiction/status/:projectId', async (req: Request, res: Response) => {
  try {
    const orgId = getOrganizationId(req);
    const projectId = parseInt(req.params.projectId, 10);

    const result = await getProjectResolutionStatus(orgId, projectId);

    res.json({ success: true, result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

export default router;
