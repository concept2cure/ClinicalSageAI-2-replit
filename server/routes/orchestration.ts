/**
 * Orchestration API Routes — Phase 3
 *
 * Exposes the OrchestrationEngine via REST endpoints for:
 *   - Starting workflow runs
 *   - Resuming / retrying runs
 *   - Querying run status and history
 *   - Approval checkpoint actions
 *
 * All endpoints are tenant-scoped and require authentication.
 * The engine's event handler is wired to the Firebase projection publisher
 * for real-time UI updates.
 *
 * @module server/routes/orchestration
 */

import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { eq, and, desc } from 'drizzle-orm';
import {
  workflowRuns,
  approvalCheckpoints,
  readinessEvaluations,
  projectIntelligenceSummaries,
} from '../../shared/schema/orchestration.js';
import { OrchestrationEngine } from '../services/orchestration-engine.js';
import { getFirebasePublisher } from '../services/firebase-projection.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let _engine: OrchestrationEngine | null = null;

function getEngine(): OrchestrationEngine {
  if (!_engine) {
    _engine = new OrchestrationEngine();
    // Register pre-built workflow definitions will be done by domain modules
  }
  return _engine;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MIDDLEWARE — extract tenant from auth context
// ═══════════════════════════════════════════════════════════════════════════════

function getTenantId(req: Request): number | null {
  // @ts-expect-error — user is attached by auth middleware
  return req.user?.organizationId ?? req.user?.tenantId ?? null;
}

function getUserId(req: Request): string {
  // @ts-expect-error — user is attached by auth middleware
  return String(req.user?.id ?? req.user?.userId ?? 'unknown');
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/runs — Start a new workflow run
// ═══════════════════════════════════════════════════════════════════════════════

const startRunSchema = z.object({
  workflowType: z.string().min(1),
  projectId: z.number().int().positive().optional(),
  programId: z.string().optional(),
  moduleScope: z.string().optional(),
  triggerSource: z.enum(['user_initiated', 'scheduled', 'event_driven', 'api_call']).default('user_initiated'),
  input: z.record(z.unknown()).optional(),
});

router.post('/runs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const parsed = startRunSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const { workflowType, projectId, programId, moduleScope, triggerSource, input } = parsed.data;
    const userId = getUserId(req);
    const engine = getEngine();
    const correlationId = uuidv4();

    // Wire Firebase projection publisher for this run
    const publisher = getFirebasePublisher();
    if (projectId) {
      const handler = publisher.createEngineEventHandler({
        tenantId,
        projectId,
        correlationId,
      });
      engine.addEventListener(handler);
    }

    // Execute the workflow
    const result = await engine.startRun({
      workflowType,
      organizationId: tenantId,
      triggeredBy: userId,
      triggerSource,
      projectId,
      programId,
      moduleScope,
      initialInput: input,
    });

    // Persist the run record to PostgreSQL (source of truth)
    try {
      await db.insert(workflowRuns).values({
        runId: result.runId,
        organizationId: tenantId,
        projectId: projectId ?? null,
        programId: programId ?? null,
        workflowType,
        displayName: result.workflowType,
        triggerSource,
        triggeredBy: userId,
        status: result.status,
        stepsExecuted: result.steps as Record<string, unknown>[],
        objectsTouched: result.objectsTouched as Record<string, unknown>[],
        outputsCreated: result.outputsCreated as Record<string, unknown>[],
        blockers: result.blockers as Record<string, unknown>[],
        recommendations: result.recommendations as Record<string, unknown>[],
        diffSummaries: result.diffSummaries as Record<string, unknown>[],
        currentStepIndex: result.steps.length - 1,
        totalSteps: result.totalSteps,
        startedAt: new Date(),
        completedAt: result.status === 'completed' || result.status === 'failed' ? new Date() : null,
        errorMessage: result.errorMessage ?? null,
        errorStepIndex: result.errorStepIndex ?? null,
        retryCount: 0,
        correlationId,
      });
    } catch (dbErr) {
      console.error('[orchestration] Failed to persist run record:', dbErr);
      // Run still executed — log but don't fail the response
    }

    return res.status(201).json({
      runId: result.runId,
      status: result.status,
      workflowType: result.workflowType,
      totalSteps: result.totalSteps,
      stepsCompleted: result.steps.filter(s => s.status === 'executed').length,
      blockerCount: result.blockers.length,
      outputCount: result.outputsCreated.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] startRun failed:', message);
    return res.status(500).json({ error: 'Workflow execution failed', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/orchestration/runs/:runId — Get run status (for REST polling fallback)
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/runs/:runId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const { runId } = req.params;
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.runId, runId), eq(workflowRuns.organizationId, tenantId)))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Build projections from persisted data for REST polling clients
    const steps = Array.isArray(run.stepsExecuted) ? (run.stepsExecuted as Record<string, unknown>[]).map((s, i) => ({
      stepIndex: i,
      stepName: (s.stepName as string) ?? `Step ${i + 1}`,
      stepType: (s.stepType as string) ?? 'deterministic',
      status: (s.status as string) ?? 'proposed',
      durationMs: s.durationMs as number | undefined,
      error: s.error as string | undefined,
    })) : [];

    // Fetch approval gates for this run
    const gates = await db
      .select()
      .from(approvalCheckpoints)
      .where(eq(approvalCheckpoints.runId, runId));

    const approvalGates = gates.map(g => ({
      gateId: g.checkpointId,
      stepIndex: g.stepIndex,
      stepName: g.stepName,
      gateType: g.gateType,
      status: g.status,
      protectedAction: g.protectedAction,
      requiredApproverRoles: Array.isArray(g.requiredApproverRoles) ? g.requiredApproverRoles : [],
      approvalsReceived: Array.isArray(g.approvalRecords) ? (g.approvalRecords as Record<string, unknown>[]).length : 0,
      approvalsRequired: g.requiredCount ?? 1,
    }));

    return res.json({
      run: {
        runId: run.runId,
        workflowType: run.workflowType,
        displayName: run.displayName,
        status: run.status,
        currentStepIndex: run.currentStepIndex,
        totalSteps: run.totalSteps,
        triggeredBy: run.triggeredBy,
        startedAt: run.startedAt?.toISOString() ?? null,
        updatedAt: run.updatedAt?.toISOString() ?? new Date().toISOString(),
        errorMessage: run.errorMessage,
        blockerCount: Array.isArray(run.blockers) ? (run.blockers as unknown[]).length : 0,
        outputCount: Array.isArray(run.outputsCreated) ? (run.outputsCreated as unknown[]).length : 0,
      },
      steps,
      approvalGates,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] getRun failed:', message);
    return res.status(500).json({ error: 'Failed to fetch run', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/orchestration/projects/:projectId/runs — List runs for a project
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/projects/:projectId/runs', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const runs = await db
      .select({
        runId: workflowRuns.runId,
        workflowType: workflowRuns.workflowType,
        displayName: workflowRuns.displayName,
        status: workflowRuns.status,
        triggeredBy: workflowRuns.triggeredBy,
        triggerSource: workflowRuns.triggerSource,
        currentStepIndex: workflowRuns.currentStepIndex,
        totalSteps: workflowRuns.totalSteps,
        startedAt: workflowRuns.startedAt,
        completedAt: workflowRuns.completedAt,
        errorMessage: workflowRuns.errorMessage,
      })
      .from(workflowRuns)
      .where(and(
        eq(workflowRuns.organizationId, tenantId),
        eq(workflowRuns.projectId, projectId),
      ))
      .orderBy(desc(workflowRuns.createdAt))
      .limit(50);

    return res.json({ runs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Failed to list runs', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/orchestration/projects/:projectId/readiness — Get readiness snapshot
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/projects/:projectId/readiness', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const [evaluation] = await db
      .select()
      .from(readinessEvaluations)
      .where(and(
        eq(readinessEvaluations.organizationId, tenantId),
        eq(readinessEvaluations.projectId, projectId),
      ))
      .orderBy(desc(readinessEvaluations.evaluatedAt))
      .limit(1);

    if (!evaluation) {
      return res.json({
        overallScore: 0,
        isReady: false,
        blockerCount: 0,
        warningCount: 0,
        advisoryCount: 0,
        passedCount: 0,
        evaluatedAt: null,
        evaluationId: null,
      });
    }

    const findings = Array.isArray(evaluation.findings) ? evaluation.findings as Record<string, unknown>[] : [];
    const blockerCount = findings.filter(f => f.severity === 'blocker').length;
    const warningCount = findings.filter(f => f.severity === 'warning').length;
    const advisoryCount = findings.filter(f => f.severity === 'advisory').length;
    const passedCount = findings.filter(f => f.status === 'passed').length;

    return res.json({
      overallScore: evaluation.overallScore,
      isReady: evaluation.isReady,
      blockerCount,
      warningCount,
      advisoryCount,
      passedCount,
      evaluatedAt: evaluation.evaluatedAt?.toISOString() ?? null,
      evaluationId: evaluation.evaluationId,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Failed to fetch readiness', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// GET /api/orchestration/projects/:projectId/intelligence — Get project intelligence
// ═══════════════════════════════════════════════════════════════════════════════

router.get('/projects/:projectId/intelligence', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const [summary] = await db
      .select()
      .from(projectIntelligenceSummaries)
      .where(and(
        eq(projectIntelligenceSummaries.organizationId, tenantId),
        eq(projectIntelligenceSummaries.projectId, projectId),
      ))
      .limit(1);

    if (!summary) {
      return res.json({
        blockerCount: 0,
        unresolvedRiskCount: 0,
        lastWorkflowStatus: null,
        lastWorkflowAt: null,
        nextActionCount: 0,
        version: 0,
        updatedAt: null,
      });
    }

    const blockers = Array.isArray(summary.currentBlockers) ? summary.currentBlockers as unknown[] : [];
    const risks = Array.isArray(summary.unresolvedRisks) ? summary.unresolvedRisks as unknown[] : [];
    const actions = Array.isArray(summary.nextRecommendedActions) ? summary.nextRecommendedActions as unknown[] : [];
    const workflows = Array.isArray(summary.lastWorkflowOutcomes) ? summary.lastWorkflowOutcomes as Record<string, unknown>[] : [];

    const lastWorkflow = workflows.length > 0 ? workflows[0] : null;

    return res.json({
      blockerCount: blockers.length,
      unresolvedRiskCount: risks.length,
      lastWorkflowStatus: lastWorkflow?.status ?? null,
      lastWorkflowAt: lastWorkflow?.completedAt ?? null,
      nextActionCount: actions.length,
      version: summary.version,
      updatedAt: summary.updatedAt?.toISOString() ?? null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: 'Failed to fetch intelligence', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/runs/:runId/approve — Approve an approval checkpoint
// ═══════════════════════════════════════════════════════════════════════════════

const approveSchema = z.object({
  checkpointId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  comment: z.string().optional(),
  mfaToken: z.string().optional(),
});

router.post('/runs/:runId/approve', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const parsed = approveSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const { runId } = req.params;
    const { checkpointId, decision, comment } = parsed.data;
    const userId = getUserId(req);

    // Fetch the checkpoint
    const [checkpoint] = await db
      .select()
      .from(approvalCheckpoints)
      .where(and(
        eq(approvalCheckpoints.checkpointId, checkpointId),
        eq(approvalCheckpoints.runId, runId),
      ))
      .limit(1);

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    if (checkpoint.status !== 'awaiting_review') {
      return res.status(409).json({ error: `Checkpoint is in "${checkpoint.status}" state, not awaiting_review` });
    }

    // Record the approval
    const existingRecords = Array.isArray(checkpoint.approvalRecords)
      ? checkpoint.approvalRecords as Record<string, unknown>[]
      : [];

    const newRecord: Record<string, unknown> = {
      userId,
      decision,
      comment: comment ?? null,
      decidedAt: new Date().toISOString(),
    };

    const newStatus = decision === 'approved' ? 'approved' : 'rejected';

    await db
      .update(approvalCheckpoints)
      .set({
        status: newStatus,
        approvalRecords: [...existingRecords, newRecord],
        decidedAt: new Date(),
        decidedBy: userId,
      })
      .where(eq(approvalCheckpoints.checkpointId, checkpointId));

    // Publish event to Firebase
    const publisher = getFirebasePublisher();
    const [run] = await db
      .select({ projectId: workflowRuns.projectId })
      .from(workflowRuns)
      .where(eq(workflowRuns.runId, runId))
      .limit(1);

    if (run?.projectId) {
      void publisher.publishWorkflowEvent({
        tenantId,
        projectId: run.projectId,
        workflowRunId: runId,
        eventType: decision === 'approved' ? 'workflow.step.completed' : 'workflow.step.failed',
        actorType: 'user',
        actorId: userId,
        correlationId: uuidv4(),
        payload: {
          stepIndex: checkpoint.stepIndex,
          stepName: checkpoint.stepName,
          stepType: 'deterministic',
          status: newStatus,
        },
      });
    }

    return res.json({ checkpointId, status: newStatus });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] approve failed:', message);
    return res.status(500).json({ error: 'Approval failed', message });
  }
});

export default router;
