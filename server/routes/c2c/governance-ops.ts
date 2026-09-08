/**
 * Governed decisions per project (list, summary, artifact trace, transition,
 * history, review queue) and the platform operations behind them —
 * governance health, the maintenance run and the startup-invariant report.
 * Ledger L53, slice 13: moved verbatim out of routes/concept2cure.ts and
 * mounted at the same prefix ahead of it with the same middleware chain; the
 * dynamic service imports re-pointed one directory up.
 *
 * @module server/routes/c2c/governance-ops
 */

import { Router, type Request, type Response } from 'express';
import { createScopedLogger } from '../../utils/logger';
import { authMiddleware } from '../../auth';
import { requireOrganizationContext, tenantContextMiddleware } from '../../middleware/tenantContext';
import {
  concept2cureRateLimiter,
  getOrganizationId,
  getUserId,
  paramStr,
  sendError,
  sendSuccess,
} from './shared';
import { verifyProjectAccess } from './project-access';

const logger = createScopedLogger('concept2cure-governance-ops');
const router = Router();

// The same chain the main router applies, in the same order.
router.use(concept2cureRateLimiter);
router.use(authMiddleware);
router.use(tenantContextMiddleware);
router.use(requireOrganizationContext);

/**
 * GET /api/concept2cure/projects/:projectId/governance/decisions
 * Client-safe: returns governed decisions for a project.
 * Uses durable storage, not admin-only control-plane.
 */
router.get('/projects/:projectId/governance/decisions', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const { getRecentGovernedDecisions } = await import(
      '../../services/governed-decision-repository.js'
    );
    const entries = await getRecentGovernedDecisions({
      organizationId: String(organizationId),
      projectId: paramStr(req.params.projectId),
      limit,
    });

    return sendSuccess(res, { entries, count: entries.length });
  } catch (error: any) {
    logger.error('Failed to load governance decisions', { error: error.message });
    return sendError(res, 500, 'Failed to load governance decisions');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/summary
 * Client-safe governance decision summary.
 */
router.get('/projects/:projectId/governance/summary', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { getGovernedDecisionSummary } = await import(
      '../../services/governed-decision-repository.js'
    );
    const summary = await getGovernedDecisionSummary({
      organizationId: String(organizationId),
      projectId: paramStr(req.params.projectId),
    });

    return sendSuccess(res, { summary });
  } catch (error: any) {
    logger.error('Failed to load governance summary', { error: error.message });
    return sendError(res, 500, 'Failed to load governance summary');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/artifacts/:artifactId/trace
 * Client-safe artifact decision trace.
 */
router.get('/projects/:projectId/governance/artifacts/:artifactId/trace', async (req: Request, res: Response) => {
  try {
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { getArtifactDecisionTrace } = await import(
      '../../services/governed-decision-repository.js'
    );
    const trace = await getArtifactDecisionTrace(
      paramStr(req.params.projectId),
      paramStr(req.params.artifactId)
    );

    return sendSuccess(res, { trace, count: trace.length });
  } catch (error: any) {
    logger.error('Failed to load artifact decision trace', { error: error.message });
    return sendError(res, 500, 'Failed to load artifact decision trace');
  }
});

/**
 * POST /api/concept2cure/projects/:projectId/governance/decisions/:decisionId/transition
 * Transition a governed decision through its lifecycle.
 * Body: { action: 'review'|'approve'|'reject'|'escalate'|'defer'|'execute'|'supersede', reason?, escalatedTo?, executedArtifactId?, executedArtifactVersion?, workflowRunId?, supersededByDecisionId? }
 */
router.post('/projects/:projectId/governance/decisions/:decisionId/transition', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const userId = getUserId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { action } = req.body;
    if (!action || typeof action !== 'string') {
      return sendError(res, 400, 'Missing required field: action');
    }

    const validActions = ['review', 'approve', 'reject', 'escalate', 'defer', 'execute', 'supersede'];
    if (!validActions.includes(action)) {
      return sendError(res, 400, `Invalid action: ${action}. Must be one of: ${validActions.join(', ')}`);
    }

    const { handleTransition } = await import('../../controllers/governance-controller.js');
    const result = await handleTransition({
      decisionId: paramStr(req.params.decisionId),
      organizationId,
      projectId: Number(req.params.projectId),
      actorId: String(userId),
      action,
      reason: req.body.reason,
      escalatedTo: req.body.escalatedTo,
      executedArtifactId: req.body.executedArtifactId,
      supersededByDecisionId: req.body.supersededByDecisionId,
    });

    if (result && !result.success) {
      return sendError(res, 400, result.error || 'Transition failed');
    }

    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Failed to transition governed decision', { error: error.message });
    return sendError(res, 500, 'Failed to transition governed decision');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/decisions/:decisionId/history
 * Get lifecycle transition history for a decision.
 */
router.get('/projects/:projectId/governance/decisions/:decisionId/history', async (req: Request, res: Response) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { handleGetHistory } = await import('../../controllers/governance-controller.js');
    const result = await handleGetHistory(paramStr(req.params.decisionId), organizationId);

    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Failed to load decision lifecycle history', { error: error.message });
    return sendError(res, 500, 'Failed to load decision lifecycle history');
  }
});

/**
 * GET /api/concept2cure/projects/:projectId/governance/review-queue
 * Returns the project's governed decision review queue — decisions requiring action.
 */
router.get('/projects/:projectId/governance/review-queue', async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const hasAccess = await verifyProjectAccess(req, req.params.projectId);
    if (!hasAccess) return sendError(res, 404, 'Project not found');

    const { handleGetReviewQueue } = await import('../../controllers/governance-controller.js');
    const result = await handleGetReviewQueue(organizationId, Number(req.params.projectId));

    return sendSuccess(res, result);
  } catch (error) {
    return sendError(res, 500, 'Failed to load review queue');
  }
});

/**
 * GET /api/concept2cure/governance/health
 * Returns governance system health — DB reachability, table status, counters, failure rate.
 */
router.get('/governance/health', async (_req, res) => {
  try {
    const { governanceMetrics } = await import('../../services/governance-observability.js');
    const { getRevocationHealth } = await import('../../services/token-revocation.js');
    const { getBridgeHealth } = await import('../../services/artifact-document-bridge.js');

    const [governanceHealth, revocationHealth, bridgeHealth] = await Promise.all([
      governanceMetrics.getHealth(),
      getRevocationHealth(),
      getBridgeHealth(),
    ]);

    return sendSuccess(res, {
      governance: governanceHealth,
      tokenRevocation: revocationHealth,
      documentBridge: bridgeHealth,
    });
  } catch (error: any) {
    logger.error('Failed to check governance health', { error: error.message });
    return sendError(res, 500, 'Failed to check governance health');
  }
});

/**
 * POST /api/concept2cure/maintenance/run
 * Run platform maintenance tasks (token cleanup, bridge integrity, backfill).
 * Requires admin/operator access in production.
 */
router.post('/maintenance/run', async (req, res) => {
  try {
    const organizationId = getOrganizationId(req);
    const { runPlatformMaintenance } = await import('../../services/maintenance/platform-maintenance.js');
    const result = await runPlatformMaintenance(organizationId);
    return sendSuccess(res, result);
  } catch (error: any) {
    logger.error('Maintenance run failed', { error: error.message });
    return sendError(res, 500, 'Maintenance run failed');
  }
});

/**
 * GET /api/concept2cure/startup/invariants
 * Returns startup invariant check results.
 */
router.get('/startup/invariants', async (_req, res) => {
  try {
    const { runStartupInvariants } = await import('../../lib/startup-invariants.js');
    const report = await runStartupInvariants();
    return sendSuccess(res, report);
  } catch (error: any) {
    logger.error('Startup invariant check failed', { error: error.message });
    return sendError(res, 500, 'Startup invariant check failed');
  }
});

export default router;
