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
import { serverError } from '../lib/api-response';
import { createScopedLogger } from '../utils/logger';

const router = Router();

const logger = createScopedLogger('operating-system');

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
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = AssumptionRegistryService.getInstance() as any;

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
    return serverError(res, logger, 'loading assumptions', error);
  }
});

/**
 * GET /api/operating-system/assumptions/:id
 * Get a single assumption by ID.
 */
router.get('/assumptions/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance() as any;

    const record = await service.getById(String(req.params.id), orgId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Assumption not found' });
    }

    res.json({ success: true, data: record });
  } catch (error: any) {
    return serverError(res, logger, 'loading assumptions', error);
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
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = AssumptionRegistryService.getInstance() as any;

    const record = await service.getById(String(req.params.id), orgId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Assumption not found' });
    }
    const history = [record];
    res.json({ success: true, data: history });
  } catch (error: any) {
    return serverError(res, logger, 'loading history', error);
  }
});

/**
 * POST /api/operating-system/assumptions/:id/link-artifact
 * Link an assumption to an artifact.
 */
router.post('/assumptions/:id/link-artifact', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = AssumptionRegistryService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    return serverError(res, logger, 'loading decisions', error);
  }
});

/**
 * GET /api/operating-system/decisions/:id
 * Get a single decision by ID.
 */
router.get('/decisions/:id', async (req: Request, res: Response) => {
  try {
    const orgId = getOrgId(req);
    const service = DecisionRecordService.getInstance() as any;

    const record = await service.getById(String(req.params.id), orgId);
    if (!record) {
      return res.status(404).json({ success: false, error: 'Decision not found' });
    }

    res.json({ success: true, data: record });
  } catch (error: any) {
    return serverError(res, logger, 'loading decisions', error);
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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    const service = DecisionRecordService.getInstance() as any;

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
    return serverError(res, logger, 'saving validate governance', error);
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
    return serverError(res, logger, 'loading rules', error);
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
    return serverError(res, logger, 'loading transitions', error);
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
    const service = AssumptionRegistryService.getInstance() as any;

    const { projectId, sourceType, sourceId, targetType, targetId, comparisonType, ...options } = req.body;
    if (!projectId || !sourceType || !sourceId || !targetType || !targetId || !comparisonType) {
      return res.status(400).json({
        success: false,
        error: 'projectId, sourceType, sourceId, targetType, targetId, and comparisonType are required',
      });
    }

    // ── Actually persists, as of 2026-09-10 (WO-2) ──────────────────────────
    // This used to call `service.createContradictionLink()` with NO ARGUMENTS —
    // against a method that returns null unless six of them are present — and
    // then answer HTTP 201 Created with a `data` object built by echoing the
    // caller's own request back. Nothing was written, and GET below answered
    // `[]`, which reads as "this project has no contradictions" rather than
    // "this endpoint stores nothing". A 201 for a record that does not exist is
    // worse than a 500: the client is told the write succeeded and handed a
    // plausible representation of it.
    //
    // It was a shim because `contradiction_links` did not exist on any
    // provisioned database — its only creator, migrations/0010, was retired in
    // 9a47438b6 and had been reachable on install-fresh alone. The table is now
    // created by db/migrations/20260910_contradiction_links_port.sql, on
    // C2C_MIGRATION_FILES so RULE 1's replay reaches existing databases too, and
    // the canonical sweep policies it (verified: dropped the table, one
    // deploy-migrate pass recreated it and reported "tenant_isolation_policy
    // applied to 1 newly-provisioned table(s)").
    //
    // So the arguments the handler already validated are now passed through, and
    // the response reports what was STORED rather than what was sent.
    const link = await service.createContradictionLink(
      orgId,
      projectId,
      sourceType,
      sourceId,
      targetType,
      targetId,
      comparisonType,
      { ...options, createdById: userId },
    );

    // The service still swallows a write failure and returns null (its catch
    // logs "table unavailable (non-blocking)"). Until that is tightened, treat
    // null as the failure it is rather than reporting success over it.
    if (!link) {
      return res.status(500).json({
        success: false,
        error: {
          code: 'CONTRADICTION_LINK_NOT_STORED',
          message: 'The contradiction link could not be stored. Nothing was written.',
        },
      });
    }

    res.status(201).json({ success: true, data: link });
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
    const service = AssumptionRegistryService.getInstance() as any;

    const projectId = parseInt(req.query.projectId as string, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ success: false, error: 'projectId is required and must be a number' });
    }

    // ── Actually reads, as of 2026-09-10 (WO-2) ─────────────────────────────
    // This returned `{ success: true, data: [], count: 0 }` without looking at
    // anything, which asserts "we checked and this project has none". An empty
    // result is a claim about the data, and it was the more dangerous direction
    // here: "no contradictions found" is exactly the answer a reviewer wants.
    // The table now exists (see the POST above), so this queries it.
    const links = await service.getContradictionLinks(projectId, orgId);
    res.json({ success: true, data: links, count: links.length });
  } catch (error: any) {
    return serverError(res, logger, 'loading contradiction links', error);
  }
});

export default router;
