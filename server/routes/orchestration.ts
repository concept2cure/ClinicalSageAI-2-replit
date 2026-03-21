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
  type ApprovalRecord as ApprovalRecordType,
} from '../../shared/schema/orchestration.js';
import { OrchestrationEngine, type EngineEventListener } from '../services/orchestration-engine.js';
import { getFirebasePublisher } from '../services/firebase-projection.js';
import { evaluateReadiness, seedDefaultRules } from '../services/readiness-evaluation-service.js';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ═══════════════════════════════════════════════════════════════════════════════
// ENGINE SINGLETON
// ═══════════════════════════════════════════════════════════════════════════════

let _engine: OrchestrationEngine | null = null;

function getEngine(): OrchestrationEngine {
  if (!_engine) {
    _engine = new OrchestrationEngine();
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
  const user = (req as unknown as Record<string, Record<string, unknown>>).user;
  return String(user?.id ?? user?.userId ?? 'unknown');
}

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/runs — Start a new workflow run
// ═══════════════════════════════════════════════════════════════════════════════

const startRunSchema = z.object({
  workflowType: z.string().min(1),
  projectId: z.number().int().positive().optional(),
  programId: z.string().optional(),
  moduleScope: z.string().optional(),
  triggerSource: z.enum(['user_action', 'schedule', 'api_call', 'event_hook', 'ai_recommendation']).default('user_action'),
  input: z.record(z.unknown()).optional(),
});

router.post('/runs', async (req: Request, res: Response) => {
  let firebaseListener: EngineEventListener | null = null;
  const engine = getEngine();

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
    const correlationId = uuidv4();

    // Wire Firebase projection publisher for this run (scoped listener, removed after run)
    const publisher = getFirebasePublisher();
    if (projectId) {
      firebaseListener = publisher.createEngineEventHandler({
        tenantId,
        projectId,
        correlationId,
      });
      engine.addEventListener(firebaseListener);
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

    // Remove the per-request listener to prevent unbounded accumulation
    if (firebaseListener) {
      engine.removeEventListener(firebaseListener);
      firebaseListener = null;
    }

    // Derive values from RunResult (context holds accumulated state)
    const stepsExecuted = result.stepsExecuted;
    const totalSteps = stepsExecuted.length + (result.status === 'completed' ? 0 : 1); // approximate from executed
    const completedCount = stepsExecuted.filter(s => s.status === 'executed').length;

    // Persist the run record to PostgreSQL (source of truth)
    // Schema PK is `id` (UUID) — we pass the engine's runId as the id
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Drizzle JSON column types are strict; engine types are readonly
      const values: any = {
        id: result.runId,
        organizationId: tenantId,
        projectId: projectId ?? null,
        programId: programId ?? null,
        workflowType,
        displayName: workflowType,
        triggerSource,
        triggeredBy: userId,
        status: result.status,
        stepsExecuted: [...stepsExecuted],
        objectsTouched: [...result.context.objectsTouched],
        outputsCreated: [...result.context.outputsCreated],
        blockers: [...result.context.blockers],
        recommendations: [...result.context.recommendations],
        diffSummaries: [...result.context.diffSummaries],
        currentStepIndex: stepsExecuted.length > 0 ? stepsExecuted.length - 1 : 0,
        startedAt: new Date(),
        completedAt: result.status === 'completed' || result.status === 'failed' ? new Date() : null,
        errorMessage: result.errorMessage ?? null,
        errorStepIndex: result.errorStepIndex ?? null,
        metadata: { correlationId },
      };
      await db.insert(workflowRuns).values(values);
    } catch (dbErr) {
      console.error('[orchestration] Failed to persist run record:', dbErr);
    }

    // If paused at an approval gate, persist the approval checkpoint
    if (result.status === 'awaiting_approval' && result.awaitingApprovalAtStep !== undefined) {
      const stepIdx = result.awaitingApprovalAtStep;
      const gate = result.approvalGate;
      try {
        await db.insert(approvalCheckpoints).values({
          workflowRunId: result.runId,
          stepIndex: stepIdx,
          stepName: stepsExecuted[stepIdx]?.stepName ?? `Step ${stepIdx + 1}`,
          gateType: (gate?.gateType ?? 'manual') as 'manual' | 'role_based' | 'quorum' | 'auto_on_pass',
          status: 'awaiting_review',
          requiredApproverRoles: gate?.requiredRoles ?? [],
          requiredApproverCount: gate?.requiredCount ?? 1,
          protectedAction: gate?.protectedAction ?? 'workflow_step',
          reviewStartedAt: new Date(),
        });
      } catch (gateErr) {
        console.error('[orchestration] Failed to persist approval checkpoint:', gateErr);
      }
    }

    return res.status(201).json({
      runId: result.runId,
      status: result.status,
      workflowType: result.context.workflowType,
      totalSteps,
      stepsCompleted: completedCount,
      blockerCount: result.context.blockers.length,
      outputCount: result.context.outputsCreated.length,
    });
  } catch (err) {
    // Clean up listener on error path too
    if (firebaseListener) {
      engine.removeEventListener(firebaseListener);
    }
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
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.organizationId, tenantId)))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Build projections from persisted data for REST polling clients
    const steps = Array.isArray(run.stepsExecuted) ? (run.stepsExecuted as unknown as Record<string, unknown>[]).map((s, i) => ({
      stepIndex: i,
      stepName: (s.stepName as string) ?? `Step ${i + 1}`,
      stepType: (s.stepType as string) ?? 'deterministic',
      status: (s.status as string) ?? 'proposed',
      durationMs: s.durationMs as number | undefined,
      error: s.error as string | undefined,
    })) : [];

    // Fetch approval gates for this run (FK is workflowRunId → workflowRuns.id)
    const gates = await db
      .select()
      .from(approvalCheckpoints)
      .where(eq(approvalCheckpoints.workflowRunId, runId));

    const approvalGates = gates.map(g => ({
      gateId: g.id,
      stepIndex: g.stepIndex,
      stepName: g.stepName,
      gateType: g.gateType,
      status: g.status,
      protectedAction: g.protectedAction,
      requiredApproverRoles: Array.isArray(g.requiredApproverRoles) ? g.requiredApproverRoles : [],
      approvalsReceived: Array.isArray(g.approvals) ? (g.approvals as unknown[]).length : 0,
      approvalsRequired: g.requiredApproverCount ?? 1,
    }));

    // Compute totalSteps from stepsExecuted array length
    const stepsExecuted = Array.isArray(run.stepsExecuted) ? run.stepsExecuted as unknown[] : [];

    return res.json({
      run: {
        runId: run.id,
        workflowType: run.workflowType,
        displayName: run.displayName,
        status: run.status,
        currentStepIndex: run.currentStepIndex,
        totalSteps: stepsExecuted.length,
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
        runId: workflowRuns.id,
        workflowType: workflowRuns.workflowType,
        displayName: workflowRuns.displayName,
        status: workflowRuns.status,
        triggeredBy: workflowRuns.triggeredBy,
        triggerSource: workflowRuns.triggerSource,
        currentStepIndex: workflowRuns.currentStepIndex,
        stepsExecuted: workflowRuns.stepsExecuted,
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

    // Schema stores findings in three separate columns by evidence class
    const rulesFindings = Array.isArray(evaluation.rulesBasedFindings) ? evaluation.rulesBasedFindings as unknown as Record<string, unknown>[] : [];
    const validationFindings = Array.isArray(evaluation.validationFindings) ? evaluation.validationFindings as unknown as Record<string, unknown>[] : [];
    const aiFindings = Array.isArray(evaluation.aiInferredFindings) ? evaluation.aiInferredFindings as unknown as Record<string, unknown>[] : [];
    const allFindings = [...rulesFindings, ...validationFindings, ...aiFindings];

    // Use persisted aggregate counts if available, otherwise compute from findings
    const blockerCount = evaluation.blockerCount ?? allFindings.filter(f => f.severity === 'blocker').length;
    const warningCount = evaluation.warningCount ?? allFindings.filter(f => f.severity === 'warning').length;
    const advisoryCount = evaluation.advisoryCount ?? allFindings.filter(f => f.severity === 'advisory').length;
    const passedCount = evaluation.passedCount ?? allFindings.filter(f => f.findingType === 'passed').length;

    return res.json({
      overallScore: evaluation.overallScore ? Number(evaluation.overallScore) : 0,
      isReady: evaluation.isReady,
      blockerCount,
      warningCount,
      advisoryCount,
      passedCount,
      evaluatedAt: evaluation.evaluatedAt?.toISOString() ?? null,
      evaluationId: evaluation.id,
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
    const workflows = Array.isArray(summary.lastWorkflowOutcomes) ? summary.lastWorkflowOutcomes as unknown as Record<string, unknown>[] : [];

    const lastWorkflow = workflows.length > 0 ? workflows[0] : null;

    return res.json({
      blockerCount: blockers.length,
      unresolvedRiskCount: risks.length,
      lastWorkflowStatus: lastWorkflow?.status ?? null,
      lastWorkflowAt: lastWorkflow?.completedAt ?? null,
      nextActionCount: actions.length,
      version: summary.version,
      updatedAt: summary.lastUpdatedAt?.toISOString() ?? null,
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

    // Fetch the checkpoint (PK is `id`, FK is `workflowRunId`)
    const [checkpoint] = await db
      .select()
      .from(approvalCheckpoints)
      .where(and(
        eq(approvalCheckpoints.id, checkpointId),
        eq(approvalCheckpoints.workflowRunId, runId),
      ))
      .limit(1);

    if (!checkpoint) {
      return res.status(404).json({ error: 'Checkpoint not found' });
    }

    if (checkpoint.status !== 'awaiting_review') {
      return res.status(409).json({ error: `Checkpoint is in "${checkpoint.status}" state, not awaiting_review` });
    }

    // Record the approval (schema column is `approvals`, typed as ApprovalRecord[])
    const existingRecords = Array.isArray(checkpoint.approvals)
      ? checkpoint.approvals as unknown as ApprovalRecordType[]
      : [];

    const newRecord: ApprovalRecordType = {
      approverId: userId,
      approverName: userId,
      approverRole: 'user',
      decision: decision as 'approved' | 'rejected',
      comment: comment ?? undefined,
      decidedAt: new Date().toISOString(),
    };

    // Map decision to schema enum: approved stays, rejected → failed
    const newStatus: 'approved' | 'failed' = decision === 'approved' ? 'approved' : 'failed';

    await db
      .update(approvalCheckpoints)
      .set({
        status: newStatus,
        approvals: [...existingRecords, newRecord],
        resolvedAt: new Date(),
        rejectionReason: decision === 'rejected' ? (comment ?? null) : null,
      })
      .where(eq(approvalCheckpoints.id, checkpointId));

    // Publish event to Firebase
    const publisher = getFirebasePublisher();
    const [run] = await db
      .select({ projectId: workflowRuns.projectId })
      .from(workflowRuns)
      .where(eq(workflowRuns.id, runId))
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

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/runs/:runId/resume — Resume a paused/approved workflow
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/runs/:runId/resume', async (req: Request, res: Response) => {
  let firebaseListener: EngineEventListener | null = null;
  const engine = getEngine();

  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const { runId } = req.params;
    const userId = getUserId(req);

    // Fetch the run record
    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.organizationId, tenantId)))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'awaiting_approval' && run.status !== 'paused' && run.status !== 'failed') {
      return res.status(409).json({ error: `Run is in "${run.status}" state — only awaiting_approval, paused, or failed runs can be resumed` });
    }

    // Determine resume point: last successful step + 1
    const stepsArr = Array.isArray(run.stepsExecuted) ? run.stepsExecuted as unknown as Record<string, unknown>[] : [];
    const fromStep = (run.lastSuccessfulStepIndex ?? -1) + 1;
    const correlationId = uuidv4();

    // Rebuild execution context from persisted run
    const ctx = {
      runId: run.id,
      workflowType: run.workflowType,
      organizationId: run.organizationId,
      projectId: run.projectId ?? undefined,
      programId: run.programId ?? undefined,
      moduleScope: run.moduleScope ?? undefined,
      triggeredBy: run.triggeredBy,
      triggerSource: run.triggerSource as 'user_action' | 'schedule' | 'api_call' | 'event_hook' | 'ai_recommendation',
      stepOutputs: stepsArr.reduce((acc, s) => Object.assign(acc, s.output as Record<string, unknown> ?? {}), {} as Record<string, unknown>),
      objectsTouched: [] as unknown[],
      outputsCreated: [] as unknown[],
      blockers: [] as unknown[],
      recommendations: [] as unknown[],
      diffSummaries: [] as unknown[],
    };

    // Wire Firebase listener
    const publisher = getFirebasePublisher();
    if (run.projectId) {
      firebaseListener = publisher.createEngineEventHandler({ tenantId, projectId: run.projectId, correlationId });
      engine.addEventListener(firebaseListener);
    }

    const result = await engine.resumeRun({
      context: ctx as Parameters<typeof engine.resumeRun>[0]['context'],
      fromStepIndex: fromStep,
      updatedInput: req.body.input,
    });

    if (firebaseListener) {
      engine.removeEventListener(firebaseListener);
      firebaseListener = null;
    }

    // Update the run record (eslint-disable: Drizzle JSON columns are strict about readonly arrays)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const updateValues: any = {
      status: result.status,
      stepsExecuted: [...result.stepsExecuted],
      currentStepIndex: result.stepsExecuted.length > 0 ? result.stepsExecuted.length - 1 : 0,
      lastSuccessfulStepIndex: result.lastSuccessfulStepIndex ?? null,
      resumedAt: new Date(),
      completedAt: result.status === 'completed' || result.status === 'failed' ? new Date() : null,
      errorMessage: result.errorMessage ?? null,
      errorStepIndex: result.errorStepIndex ?? null,
      updatedAt: new Date(),
    };
    await db.update(workflowRuns).set(updateValues).where(eq(workflowRuns.id, runId));

    return res.json({
      runId,
      status: result.status,
      stepsCompleted: result.stepsExecuted.filter(s => s.status === 'executed').length,
    });
  } catch (err) {
    if (firebaseListener) engine.removeEventListener(firebaseListener);
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] resume failed:', message);
    return res.status(500).json({ error: 'Resume failed', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/runs/:runId/cancel — Cancel a running or paused workflow
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/runs/:runId/cancel', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const { runId } = req.params;
    const userId = getUserId(req);

    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.organizationId, tenantId)))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status === 'completed' || run.status === 'cancelled') {
      return res.status(409).json({ error: `Run is already "${run.status}" — cannot cancel` });
    }

    await db.update(workflowRuns).set({
      status: 'cancelled',
      cancelledAt: new Date(),
      updatedAt: new Date(),
      metadata: { ...(run.metadata as Record<string, unknown> ?? {}), cancelledBy: userId },
    }).where(eq(workflowRuns.id, runId));

    // Reject any pending approval checkpoints
    await db.update(approvalCheckpoints).set({
      status: 'skipped',
      skipReason: `Run cancelled by ${userId}`,
      skippedBy: userId,
      resolvedAt: new Date(),
    }).where(and(
      eq(approvalCheckpoints.workflowRunId, runId),
      eq(approvalCheckpoints.status, 'awaiting_review'),
    ));

    // Publish cancel event
    const publisher = getFirebasePublisher();
    if (run.projectId) {
      void publisher.publishWorkflowEvent({
        tenantId,
        projectId: run.projectId,
        workflowRunId: runId,
        eventType: 'workflow.run.cancelled',
        actorType: 'user',
        actorId: userId,
        correlationId: uuidv4(),
        payload: {
          workflowType: run.workflowType,
          displayName: run.displayName,
          status: 'cancelled',
          triggerSource: run.triggerSource,
        },
      });
    }

    return res.json({ runId, status: 'cancelled' });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] cancel failed:', message);
    return res.status(500).json({ error: 'Cancel failed', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/runs/:runId/retry — Retry from a specific failed step
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/runs/:runId/retry', async (req: Request, res: Response) => {
  let firebaseListener: EngineEventListener | null = null;
  const engine = getEngine();

  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const { runId } = req.params;
    const stepIndex = req.body.stepIndex as number | undefined;

    const [run] = await db
      .select()
      .from(workflowRuns)
      .where(and(eq(workflowRuns.id, runId), eq(workflowRuns.organizationId, tenantId)))
      .limit(1);

    if (!run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    if (run.status !== 'failed') {
      return res.status(409).json({ error: `Run is in "${run.status}" state — only failed runs can be retried` });
    }

    const retryFrom = stepIndex ?? run.errorStepIndex ?? 0;
    const correlationId = uuidv4();

    // Rebuild context
    const stepsArr = Array.isArray(run.stepsExecuted) ? run.stepsExecuted as unknown as Record<string, unknown>[] : [];
    const ctx = {
      runId: run.id,
      workflowType: run.workflowType,
      organizationId: run.organizationId,
      projectId: run.projectId ?? undefined,
      programId: run.programId ?? undefined,
      moduleScope: run.moduleScope ?? undefined,
      triggeredBy: run.triggeredBy,
      triggerSource: run.triggerSource as 'user_action' | 'schedule' | 'api_call' | 'event_hook' | 'ai_recommendation',
      stepOutputs: stepsArr.slice(0, retryFrom).reduce((acc, s) => Object.assign(acc, s.output as Record<string, unknown> ?? {}), {} as Record<string, unknown>),
      objectsTouched: [] as unknown[],
      outputsCreated: [] as unknown[],
      blockers: [] as unknown[],
      recommendations: [] as unknown[],
      diffSummaries: [] as unknown[],
    };

    const publisher = getFirebasePublisher();
    if (run.projectId) {
      firebaseListener = publisher.createEngineEventHandler({ tenantId, projectId: run.projectId, correlationId });
      engine.addEventListener(firebaseListener);
    }

    const result = await engine.retryStep({
      context: ctx as Parameters<typeof engine.retryStep>[0]['context'],
      stepIndex: retryFrom,
    });

    if (firebaseListener) {
      engine.removeEventListener(firebaseListener);
      firebaseListener = null;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const retryUpdateValues: any = {
      status: result.status,
      stepsExecuted: [...result.stepsExecuted],
      currentStepIndex: result.stepsExecuted.length > 0 ? result.stepsExecuted.length - 1 : 0,
      lastSuccessfulStepIndex: result.lastSuccessfulStepIndex ?? null,
      errorMessage: result.errorMessage ?? null,
      errorStepIndex: result.errorStepIndex ?? null,
      completedAt: result.status === 'completed' || result.status === 'failed' ? new Date() : null,
      updatedAt: new Date(),
      metadata: { ...(run.metadata as Record<string, unknown> ?? {}), correlationId, retryCount: ((run.metadata as Record<string, unknown>)?.retryCount as number ?? 0) + 1 },
    };
    await db.update(workflowRuns).set(retryUpdateValues).where(eq(workflowRuns.id, runId));

    return res.json({
      runId,
      status: result.status,
      stepsCompleted: result.stepsExecuted.filter(s => s.status === 'executed').length,
    });
  } catch (err) {
    if (firebaseListener) engine.removeEventListener(firebaseListener);
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] retry failed:', message);
    return res.status(500).json({ error: 'Retry failed', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/projects/:projectId/readiness/evaluate — Run readiness evaluation
// ═══════════════════════════════════════════════════════════════════════════════

const evaluateReadinessSchema = z.object({
  programType: z.string().min(1),
  moduleType: z.string().optional(),
  workflowRunId: z.string().uuid().optional(),
});

router.post('/projects/:projectId/readiness/evaluate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const projectId = parseInt(req.params.projectId, 10);
    if (isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const parsed = evaluateReadinessSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Validation failed', details: parsed.error.errors });
    }

    const userId = getUserId(req);
    const { programType, moduleType, workflowRunId } = parsed.data;

    const result = await evaluateReadiness(
      {
        organizationId: tenantId,
        projectId,
        programType,
        moduleType,
      },
      {
        workflowRunId,
        evaluatedBy: userId,
      },
    );

    // Update Firebase projection
    const publisher = getFirebasePublisher();
    if (publisher.isEnabled) {
      void publisher.updateReadinessProjection(tenantId, projectId, publisher.buildReadinessProjection({
        projectId,
        programId: null,
        scope: programType,
        overallScore: result.overallScore,
        isReady: result.isReady,
        blockers: result.rulesBasedFindings
          .filter(f => f.severity === 'blocker' && f.findingType !== 'passed')
          .map(f => ({
            blockerId: f.ruleId ?? uuidv4(),
            description: f.expectedItem,
            severity: 'blocker' as const,
            source: 'rules_based' as const,
          })),
        missingItems: result.rulesBasedFindings
          .filter(f => f.findingType === 'missing')
          .map(f => ({
            ruleCode: f.ruleCode ?? '',
            expectedItem: f.expectedItem,
            severity: f.severity,
          })),
        nextActions: result.rulesBasedFindings
          .filter(f => f.recommendation)
          .slice(0, 10)
          .map(f => ({
            actionId: f.ruleId ?? uuidv4(),
            title: f.recommendation ?? '',
            priority: f.severity === 'blocker' ? 'critical' : f.severity === 'warning' ? 'high' : 'medium',
            evidenceClass: 'rules_based',
          })),
        evaluationId: result.evaluationId,
      }));
    }

    return res.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] readiness evaluation failed:', message);
    return res.status(500).json({ error: 'Readiness evaluation failed', message });
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// POST /api/orchestration/readiness/seed-rules — Seed default readiness rules
// ═══════════════════════════════════════════════════════════════════════════════

router.post('/readiness/seed-rules', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      return res.status(401).json({ error: 'Tenant context required' });
    }

    const seeded = await seedDefaultRules(tenantId);
    return res.json({ seeded, message: `Seeded ${seeded} default readiness rules` });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[orchestration] seed rules failed:', message);
    return res.status(500).json({ error: 'Seed rules failed', message });
  }
});

export default router;
