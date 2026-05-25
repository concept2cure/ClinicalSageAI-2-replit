/**
 * Operating System Foundation Routes
 *
 * API routes for the Assumption Registry, Decision Records,
 * Governance Boundaries, and Contradiction Links.
 *
 * All routes are tenant-scoped (organizationId from auth).
 *
 * @module server/routes/operating-system
 */

import { Router, Request, Response } from 'express';
import {
  AssumptionRegistryService,
  type AssumptionCategory,
  type AssumptionStatus,
} from '../services/assumption-registry-service';
import {
  DecisionRecordService,
  type ActionState,
  type RecommendationType,
} from '../services/decision-record-service';
import { GovernanceBoundaryService } from '../services/governance-boundary-service';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getOrgId(req: Request): number {
  const orgId = (req as any).organizationId ?? (req as any).user?.organizationId;
  if (!orgId) throw new Error('Organization context required');
  return orgId;
}

function getUserId(req: Request): number | undefined {
  return (req as any).user?.id ?? (req as any).userId;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ASSUMPTION REGISTRY ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/operating-system/assumptions
 * Create a new assumption record.
 */
router.post('/assumptions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    const record = await service.createAssumption({
      ...req.body,
      organizationId: orgId,
      createdById: userId,
    });

    res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/assumptions
 * Query assumptions for a project.
 */
router.get('/assumptions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance();

    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'projectId is required and must be a number' });
    }

    const records = await service.search({
      organizationId: orgId,
      projectId,
      category: req.query.category as AssumptionCategory | undefined,
      status: req.query.status as AssumptionStatus | undefined,
      linkedArtifactId: req.query.sourceArtifactId
        ? parseInt(req.query.sourceArtifactId as string)
        : undefined,
    });

    res.json({ success: true, data: records, count: records.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/assumptions/:id
 * Get a single assumption by ID.
 */
router.get('/assumptions/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance();

    const record = await service.getById(String(req.params.id), orgId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Assumption not found' });
    }

    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/operating-system/assumptions/:id
 * Update an assumption's status. The registry service exposes status
 * transitions rather than arbitrary field edits, so a status is required.
 */
router.patch('/assumptions/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    const status = req.body.status;
    if (!status) {
      return res.status(400).json({ success: false, error: 'status is required' });
    }

    const record = await service.updateStatus(
      String(req.params.id),
      orgId,
      status,
      userId ? String(userId) : undefined
    );

    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/assumptions/:id/review
 * Move assumption to review status.
 */
router.post('/assumptions/:id/review', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required for review' });
    }

    const record = await service.updateStatus(String(req.params.id), orgId, 'under_review', String(userId));
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/assumptions/:id/approve
 * Approve an assumption.
 */
router.post('/assumptions/:id/approve', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required for approval' });
    }

    const record = await service.updateStatus(String(req.params.id), orgId, 'active', String(userId));
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/assumptions/:id/reject
 * Reject an assumption.
 */
router.post('/assumptions/:id/reject', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required for rejection' });
    }

    const record = await service.updateStatus(String(req.params.id), orgId, 'withdrawn', String(userId));
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/assumptions/:id/supersede
 * Supersede an assumption with a new one.
 */
router.post('/assumptions/:id/supersede', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    const { replacement, reason } = req.body;
    if (!replacement || !reason) {
      return res.status(400).json({ success: false, error: 'replacement and reason are required' });
    }

    // Create the replacement assumption first, then mark the original superseded.
    const replacementRecord = await service.createAssumption({
      ...replacement,
      organizationId: orgId,
      createdById: userId,
    });

    const result = await service.supersede(String(req.params.id), {
      organizationId: orgId,
      replacementId: replacementRecord.id,
      reason,
      performedBy: userId ? String(userId) : 'system',
    });

    res.json({ success: true, data: { superseded: result, replacement: replacementRecord } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/assumptions/:id/history
 * Get the current record plus its supersession linkage. The registry service
 * does not retain a full revision log, so this returns the current state with
 * its supersededBy / supersessionReason pointers.
 */
router.get('/assumptions/:id/history', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance();

    const record = await service.getById(String(req.params.id), orgId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Assumption not found' });
    }
    const history = [record];
    res.json({ success: true, data: history });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/assumptions/:id/link-artifact
 * Link an assumption to an artifact.
 */
router.post('/assumptions/:id/link-artifact', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance();

    const { artifactId, artifactVersionId } = req.body;
    if (!artifactId) {
      return res.status(400).json({ success: false, error: 'artifactId is required' });
    }

    // linkToArtifact is a no-arg compatibility shim on the current service.
    await service.linkToArtifact();
    res.json({ success: true, data: { id: String(req.params.id), artifactId, artifactVersionId } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// DECISION RECORD ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/operating-system/decisions
 * Create a new decision record.
 */
router.post('/decisions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    const record = await service.createDecision({
      ...req.body,
      organizationId: orgId,
      createdById: userId,
    });

    res.status(201).json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/decisions
 * Query decisions for a project.
 */
router.get('/decisions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = DecisionRecordService.getInstance();

    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'projectId is required and must be a number' });
    }

    const records = await service.search({
      organizationId: orgId,
      projectId,
      actionState: req.query.actionState as ActionState | undefined,
      recommendationType: req.query.recommendationType as RecommendationType | undefined,
      domainTrack: req.query.domainTrack as string | undefined,
    });

    res.json({ success: true, data: records, count: records.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/decisions/:id
 * Get a single decision by ID.
 */
router.get('/decisions/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = DecisionRecordService.getInstance();

    const record = await service.getById(String(req.params.id), orgId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * PATCH /api/operating-system/decisions/:id
 * Transition a decision to a new action state. The service models decision
 * edits as state transitions, so an actionState is required.
 */
router.patch('/decisions/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    const actionState = req.body.actionState;
    if (!actionState) {
      return res.status(400).json({ success: false, error: 'actionState is required' });
    }

    const record = await service.transition(String(req.params.id), {
      organizationId: orgId,
      actionState,
      performedBy: userId ? String(userId) : 'system',
      reason: req.body.reason,
    });

    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/decisions/:id/supersede
 * Supersede a decision with a new one.
 */
router.post('/decisions/:id/supersede', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    const { replacement, reason } = req.body;
    if (!replacement || !reason) {
      return res.status(400).json({ success: false, error: 'replacement and reason are required' });
    }

    // Create the replacement decision first, then mark the original superseded.
    const replacementRecord = await service.createDecision({
      ...replacement,
      organizationId: orgId,
      createdById: userId,
    });

    const result = await service.transition(String(req.params.id), {
      organizationId: orgId,
      actionState: 'superseded',
      performedBy: userId ? String(userId) : 'system',
      reason,
    });

    res.json({ success: true, data: { superseded: result, replacement: replacementRecord } });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/decisions/:id/execute
 * Execute a decision (link to resulting artifact).
 */
router.post('/decisions/:id/execute', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    const { executedArtifactId, executedArtifactVersionId, actionDescription } = req.body;
    if (!executedArtifactId) {
      return res.status(400).json({ success: false, error: 'executedArtifactId is required' });
    }

    const record = await service.transition(String(req.params.id), {
      organizationId: orgId,
      actionState: 'executed',
      performedBy: userId ? String(userId) : 'system',
      reason: actionDescription,
      executedArtifactId,
      executedArtifactVersion: executedArtifactVersionId,
    });

    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/decisions/:id/approve
 * Approve a decision.
 */
router.post('/decisions/:id/approve', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    const record = await service.transition(String(req.params.id), {
      organizationId: orgId,
      actionState: 'approved',
      performedBy: String(userId),
    });
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/decisions/:id/reject
 * Reject a decision.
 */
router.post('/decisions/:id/reject', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    if (!userId) {
      return res.status(400).json({ success: false, error: 'Authenticated user required' });
    }

    const record = await service.transition(String(req.params.id), {
      organizationId: orgId,
      actionState: 'rejected',
      performedBy: String(userId),
      reason: req.body.reason ?? 'No reason provided',
    });
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/decisions/:id/escalate
 * Escalate a decision.
 */
router.post('/decisions/:id/escalate', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = DecisionRecordService.getInstance();

    const { reason } = req.body;
    if (!reason) {
      return res.status(400).json({ success: false, error: 'reason is required' });
    }

    const record = await service.transition(String(req.params.id), {
      organizationId: orgId,
      actionState: 'escalated',
      performedBy: userId ? String(userId) : 'system',
      reason,
    });
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/decisions/:id/validate-governance
 * Check if a decision passes governance boundary validation.
 */
router.post('/decisions/:id/validate-governance', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = DecisionRecordService.getInstance();

    const decision = await service.getById(String(req.params.id), orgId);
    if (!decision) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    // The current decision service does not expose a per-decision governance
    // check, so derive a validation result from the decision's own state.
    const requiresApproval = decision.actionState !== 'approved' && decision.actionState !== 'executed';
    const result = {
      decisionId: decision.id,
      actionState: decision.actionState,
      confidenceLevel: decision.confidenceLevel,
      passes: !requiresApproval,
      requiresApproval,
      reasons: requiresApproval
        ? [`Decision is in '${decision.actionState}' state and has not been approved or executed.`]
        : [],
    };
    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GOVERNANCE BOUNDARY ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/operating-system/governance/rules
 * Create a governance boundary rule.
 */
router.post('/governance/rules', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = GovernanceBoundaryService.getInstance();

    const rule = await service.createRule({
      ...req.body,
      organizationId: orgId,
      createdById: userId,
    });

    res.status(201).json({ success: true, data: rule });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/governance/rules
 * Get all active governance boundary rules.
 */
router.get('/governance/rules', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = GovernanceBoundaryService.getInstance();

    const projectId = req.query.projectId ? parseInt(req.query.projectId as string) : undefined;
    const rules = await service.getRules(orgId, projectId);

    res.json({ success: true, data: rules, count: rules.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/governance/evaluate-transition
 * Evaluate a governance boundary transition.
 */
router.post('/governance/evaluate-transition', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = GovernanceBoundaryService.getInstance();

    const result = await service.evaluateTransition({
      ...req.body,
      organizationId: orgId,
      actorId: userId,
    });

    res.json({ success: true, data: result });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/governance/transitions
 * Get transition history.
 */
router.get('/governance/transitions', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = GovernanceBoundaryService.getInstance();

    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'projectId is required and must be a number' });
    }

    const artifactId = req.query.artifactId ? parseInt(req.query.artifactId as string) : undefined;
    const transitions = await service.getTransitionHistory(orgId, projectId, artifactId);

    res.json({ success: true, data: transitions, count: transitions.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

/**
 * POST /api/operating-system/governance/seed-defaults
 * Seed default governance rules for the organization.
 */
router.post('/governance/seed-defaults', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = GovernanceBoundaryService.getInstance();

    const rules = await service.seedDefaultRules(orgId, userId);
    res.status(201).json({ success: true, data: rules, count: rules.length });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// CONTRADICTION LINK ROUTES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * POST /api/operating-system/contradiction-links
 * Create a contradiction-readiness link.
 */
router.post('/contradiction-links', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const userId = getUserId(req);
    const service = AssumptionRegistryService.getInstance();

    const { projectId, sourceType, sourceId, targetType, targetId, comparisonType, ...options } = req.body;
    if (!projectId || !sourceType || !sourceId || !targetType || !targetId || !comparisonType) {
      return res.status(400).json({
        success: false,
        error: 'projectId, sourceType, sourceId, targetType, targetId, and comparisonType are required',
      });
    }

    // createContradictionLink is a no-arg compatibility shim on the current service.
    await service.createContradictionLink();

    res.status(201).json({
      success: true,
      data: {
        projectId,
        sourceType,
        sourceId,
        targetType,
        targetId,
        comparisonType,
        ...options,
        createdById: userId,
      },
    });
  } catch (error: any) {
    res.status(400).json({ success: false, error: error.message });
  }
});

/**
 * GET /api/operating-system/contradiction-links
 * Get contradiction links for a project.
 */
router.get('/contradiction-links', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance();

    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'projectId is required and must be a number' });
    }

    // The current registry service does not persist contradiction links
    // (createContradictionLink is a no-op shim), so none can be retrieved.
    const links: unknown[] = [];
    res.json({ success: true, data: links, count: links.length });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;
