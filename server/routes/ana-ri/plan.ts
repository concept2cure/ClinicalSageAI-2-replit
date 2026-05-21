/**
 * Goal-plan + protocol-event endpoints under /api/ana-ri/plan/*.
 *
 * Extracted from ana-ri.ts as a behaviour-preserving move. Mounted onto the
 * parent router via {@link mountPlanRoutes}. Nothing about request handling,
 * persistence, or the response envelope changed in the move.
 *
 * @module server/routes/ana-ri/plan
 */

import type { Request, Response, Router } from 'express';

import { orchestrate } from '../../services/ana-ri/index.js';
import { planKernelExecution } from '../../services/kernel-router.js';
import { buildGoalPlan } from '../../services/kernel-goal-planner.js';
import {
  createGoalPlanRun,
  getGoalPlanRun,
  advanceGoalPlanStep,
  executeNextGoalPlanStep,
  listGoalPlanEvents,
} from '../../services/kernel-plan-runtime.js';
import {
  recordProtocolEvent,
  listProtocolEvents,
  validateProtocolEvent,
} from '../../services/kernel-agent-protocol.js';
import { sendSuccess, sendError } from './shared.js';

/** Register the goal-plan + protocol-event endpoints on the given router. */
export function mountPlanRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/plan — Return planner preview without generation
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/plan', async (req: Request, res: Response) => {
    try {
      const { message, intent_lens, submission_type, persist, thread_id } = req.body || {};
      if (!message || typeof message !== 'string') {
        return sendError(res, 400, 'Message is required', null, 'INVALID_MESSAGE');
      }

      const orchestration = orchestrate({
        message,
        intentLens: intent_lens,
        submissionType: submission_type,
      });
      const routingPlan = planKernelExecution({
        route: '/api/ana-ri/chat',
        messageLength: message.length,
        intentLens: orchestration.detectedIntent.lens,
        intentConfidence: orchestration.detectedIntent.confidence,
        submissionType: orchestration.detectedSubmissionType,
        requestedMaxTokens: 4096,
      });
      const goalPlan = buildGoalPlan({
        message,
        intentLens: orchestration.detectedIntent.lens,
        riskTier: routingPlan.riskTier,
        submissionType: orchestration.detectedSubmissionType,
      });

      let planRunId: string | null = null;
      if (persist) {
        const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
        const persisted = await createGoalPlanRun({
          organizationId: orgId ? Number(orgId) : null,
          threadId: thread_id || null,
          route: '/api/ana-ri/plan',
          goalPlan,
          metadata: {
            intentLens: orchestration.detectedIntent.lens,
            submissionType: orchestration.detectedSubmissionType,
          },
        });
        planRunId = persisted.id;
      }

      return sendSuccess(res, {
        routingPlan,
        goalPlan,
        planRunId,
        orchestration: {
          detectedIntent: orchestration.detectedIntent,
          detectedSubmissionType: orchestration.detectedSubmissionType,
        },
      });
    } catch (error: any) {
      return sendError(res, 500, error?.message || 'Failed to compute plan', null, 'PLANNER_ERROR');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/plan/:planRunId — Fetch persisted goal plan run
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/plan/:planRunId', async (req: Request, res: Response) => {
    const planRun = await getGoalPlanRun(String(req.params.planRunId));
    if (!planRun) {
      return sendError(res, 404, 'Plan run not found', null, 'PLAN_NOT_FOUND');
    }
    return sendSuccess(res, planRun);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/plan/:planRunId/advance — Advance step status
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/plan/:planRunId/advance', async (req: Request, res: Response) => {
    const { stepId, nextStatus } = req.body || {};
    if (!stepId || !nextStatus) {
      return sendError(res, 400, 'stepId and nextStatus are required', null, 'INVALID_INPUT');
    }
    const allowedStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'replanned'] as const;
    if (!allowedStatuses.includes(nextStatus)) {
      return sendError(res, 400, 'Invalid nextStatus', null, 'INVALID_STATUS');
    }

    const result = await advanceGoalPlanStep({
      planRunId: String(req.params.planRunId),
      stepId,
      nextStatus,
    });
    if (!result.ok) {
      return sendError(res, 400, result.message ?? 'plan advance failed', null, 'PLAN_ADVANCE_FAILED');
    }
    return sendSuccess(res, { ok: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/plan/:planRunId/execute-next — Execute next runnable step
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/plan/:planRunId/execute-next', async (req: Request, res: Response) => {
    const result = await executeNextGoalPlanStep(String(req.params.planRunId));
    if (!result.ok) {
      return sendError(res, 400, result.message ?? 'plan execution failed', null, 'PLAN_EXECUTION_FAILED');
    }
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    await recordProtocolEvent({
      planRunId: String(req.params.planRunId),
      organizationId: orgId ? Number(orgId) : null,
      actorType: 'system',
      actorId: 'kernel-runtime',
      messageType: 'decision',
      payload: {
        decision: 'execute_next_step',
        rationale: 'Automatically executed next dependency-satisfied step',
        stepId: result.executedStepId,
      },
    });
    return sendSuccess(res, result);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/plan/:planRunId/events — Step event audit trail
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/plan/:planRunId/events', async (req: Request, res: Response) => {
    const events = await listGoalPlanEvents(String(req.params.planRunId));
    return sendSuccess(res, { events });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/plan/:planRunId/protocol — Append protocol event
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
    const { actorType, actorId, messageType, payload, metadata } = req.body || {};
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const event = {
      planRunId: String(req.params.planRunId),
      organizationId: orgId ? Number(orgId) : null,
      actorType,
      actorId,
      messageType,
      payload,
      metadata,
    };
    const validation = validateProtocolEvent(event as any);
    if (!validation.ok) {
      return sendError(res, 400, validation.message ?? 'invalid protocol event', null, 'INVALID_PROTOCOL_EVENT');
    }

    const recorded = await recordProtocolEvent(event as any);
    if (!recorded.ok) {
      return sendError(res, 500, 'Failed to record protocol event', null, 'PROTOCOL_WRITE_FAILED');
    }
    return sendSuccess(res, { ok: true });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // GET /api/ana-ri/plan/:planRunId/protocol — List protocol events
  // ─────────────────────────────────────────────────────────────────────────
  router.get('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
    const events = await listProtocolEvents(String(req.params.planRunId));
    return sendSuccess(res, { events });
  });
}
