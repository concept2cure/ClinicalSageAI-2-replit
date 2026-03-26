/**
 * AnA RI Routes — Regulatory Intelligence Copilot API
 *
 * Endpoints for the AnA 1.0 RI intelligence layer:
 * - POST /api/ana-ri/chat — Main AnA RI chat with orchestrated intelligence
 * - GET  /api/ana-ri/deficiencies — Deficiency taxonomy queries
 * - GET  /api/ana-ri/actions — Available document actions
 * - GET  /api/ana-ri/rubric — Evaluation rubric
 * - POST /api/ana-ri/evaluate — Evaluate response quality
 *
 * @module server/routes/ana-ri
 */

import { Router, Request, Response } from 'express';
import { getGateway } from '../services/ai-gateway/index.js';
import type { GatewayMessage } from '../services/ai-gateway/types.js';
import {
  orchestrate,
  type OrchestratorInput,
  type IntentLens,
  type UserRole,
} from '../services/ana-ri/index.js';
import {
  DEFICIENCY_TAXONOMY,
  getDeficienciesBySubmissionType,
  getCriticalDeficiencies,
  getDeficiencyCategories,
  type SubmissionType,
} from '../services/ana-ri/deficiency-taxonomy.js';
import { getAllActions, getActionsForLens } from '../services/ana-ri/document-actions.js';
import { evaluateResponse, getFullRubric } from '../services/ana-ri/evaluation.js';
import { inferRole } from '../services/ana-ri/role-adapter.js';
import {
  logGeneration,
  getGenerationLog,
  getGenerationStats,
  checkEvidenceDiscipline,
  validateResponseStructure,
} from '../services/ana-ri/enforcement.js';
import {
  getOrCreateThread,
  saveChatMessage as saveMessage,
} from '../services/chat-thread-helpers.js';
import { logKernelDecision } from '../services/kernel-decision-record.js';
import { planKernelExecution } from '../services/kernel-router.js';
import { buildGoalPlan, replanGoalPlan } from '../services/kernel-goal-planner.js';
import {
  createGoalPlanRun,
  getGoalPlanRun,
  advanceGoalPlanStep,
  executeNextGoalPlanStep,
  listGoalPlanEvents,
} from '../services/kernel-plan-runtime.js';
import {
  recordProtocolEvent,
  listProtocolEvents,
  validateProtocolEvent,
} from '../services/kernel-agent-protocol.js';
import { getKernelMetrics } from '../services/kernel-observability.js';
import { getKernelBetaReadiness } from '../services/kernel-beta-readiness.js';
import {
  buildKernelExecutionContext,
  recordKernelSuccess,
} from '../services/ana-kernel-orchestrator.js';

const router = Router();

// AI Gateway instance
let gateway: ReturnType<typeof getGateway> | null = null;
function ensureGateway() {
  if (!gateway) {
    try {
      gateway = getGateway();
    } catch (e: any) {
      console.error('[AnA RI] AI Gateway initialization failed:', e?.message);
    }
  }
  return gateway;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/chat — Main AnA RI Chat
// ─────────────────────────────────────────────────────────────────────────────

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const {
      message,
      thread_id,
      intent_lens,
      user_role,
      project_context,
      document_context,
      submission_type,
      conversation_history,
    } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
    }

    // Validate intent_lens if provided
    const VALID_LENSES: IntentLens[] = ['auto', 'audit', 'improve', 'risk', 'strategy', 'compare'];
    const validatedLens: IntentLens | undefined =
      intent_lens && VALID_LENSES.includes(intent_lens) ? (intent_lens as IntentLens) : undefined;

    // Validate user_role if provided
    const VALID_ROLES: UserRole[] = [
      'ceo',
      'ra_lead',
      'medical_writer',
      'clinical_lead',
      'cmc_lead',
      'investor',
      'general',
    ];
    const validatedRole: UserRole | undefined =
      user_role && VALID_ROLES.includes(user_role) ? (user_role as UserRole) : undefined;

    // Resolve org/user context
    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const userId = (req as any).userId || (req as any).user?.id || 'anonymous';

    // Infer role if not provided
    const effectiveRole: UserRole =
      validatedRole ||
      inferRole({
        screenName: req.body.context?.screenName,
        title: req.body.context?.userTitle,
        department: req.body.context?.department,
      });

    // Orchestrate — build the complete system prompt
    const orchestratorInput: OrchestratorInput = {
      message,
      intentLens: validatedLens,
      userRole: effectiveRole,
      projectContext: project_context,
      documentContext: document_context,
      submissionType: submission_type as SubmissionType | undefined,
      conversationHistory: conversation_history,
    };

    const orchestration = orchestrate(orchestratorInput);
    const executionCtx = await buildKernelExecutionContext({
      route: '/api/ana-ri/chat',
      message,
      organizationId: orgId ? Number(orgId) : null,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      requestedMaxTokens: 4096,
    });
    const routingPlan = executionCtx.routingPlan;
    const selectedStrategy = executionCtx.selectedStrategy;
    let goalPlan = executionCtx.goalPlan;

    // Build message history for the AI gateway
    const messages: GatewayMessage[] = [{ role: 'system', content: orchestration.systemPrompt }];

    // Add conversation history
    if (conversation_history && Array.isArray(conversation_history)) {
      for (const msg of conversation_history.slice(-20)) {
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current message
    messages.push({ role: 'user', content: message });

    // Call AI Gateway
    const gw = ensureGateway();
    if (!gw) {
      return res.status(503).json({
        error: 'AI services unavailable',
        code: 'GATEWAY_UNAVAILABLE',
      });
    }

    const response = await gw.route({
      taskType: routingPlan.taskType,
      messages,
      maxTokens: routingPlan.maxTokens,
      temperature: routingPlan.temperature,
      strategy: selectedStrategy,
    });

    if (!response.content) {
      return res.status(502).json({
        error: 'No response from AI provider',
        code: 'EMPTY_RESPONSE',
      });
    }

    // Evaluate response quality (async, non-blocking)
    const evaluation = evaluateResponse(response.content, {
      userRole: effectiveRole,
      intentLens: orchestration.detectedIntent.lens,
      hasStructuredOutput: /##|###/.test(response.content),
      hasDocumentActions: /create|generate|memo|brief/i.test(response.content),
      hasEvidenceLabels: /KNOWN|INFERRED|MISSING/i.test(response.content),
      hasRiskRanking: /critical|major|minor|severity/i.test(response.content),
      hasCitations: /ICH|CFR|FDA|EMA|ISO/i.test(response.content),
      hasRewrite: /rewrite|revised|improved version/i.test(response.content),
    });

    // Persist message and response if we have org context
    let threadId = thread_id;
    let persistenceFailed = false;
    if (orgId) {
      try {
        // getOrCreateThread(threadId, userId?, prefix?) — returns thread ID string
        threadId = await getOrCreateThread(
          thread_id || null,
          typeof userId === 'number' ? userId : undefined,
          'ana-ri'
        );
        await saveMessage(threadId, 'user', message);
        await saveMessage(threadId, 'assistant', response.content);
      } catch (e: any) {
        console.error('[AnA RI] Thread persistence failed:', e?.message);
        persistenceFailed = true;
      }
    }

    // Check evidence discipline and structure
    const evidenceCheck = checkEvidenceDiscipline(response.content);
    const structureCheck = validateResponseStructure(response.content);
    if (!evidenceCheck.compliant) {
      goalPlan = replanGoalPlan(goalPlan, 'evidence_failure');
    } else if (!structureCheck.valid) {
      goalPlan = replanGoalPlan(goalPlan, 'structure_failure');
    }

    // Log generation event for observability
    logGeneration({
      timestamp: new Date().toISOString(),
      route: '/api/ana-ri/chat',
      action: 'chat',
      projectId: req.body.project_context?.projectId,
      organizationId: orgId ? Number(orgId) : undefined,
      userId,
      artifactCreated: false,
      anaRiOrchestrated: true,
      evidenceCompliant: evidenceCheck.compliant,
      structureScore: structureCheck.score,
      provider: response.provider,
      model: response.model,
    });

    // Unified kernel success recording (KDR + adaptive-policy outcome)
    void recordKernelSuccess({
      route: '/api/ana-ri/chat',
      threadId: threadId || null,
      projectId: req.body.project_context?.projectId
        ? Number(req.body.project_context.projectId)
        : null,
      organizationId: orgId ? Number(orgId) : null,
      userId,
      intentLens: orchestration.detectedIntent.lens,
      intentConfidence: orchestration.detectedIntent.confidence,
      submissionType: orchestration.detectedSubmissionType,
      routingPlan,
      selectedStrategy,
      provider: response.provider,
      model: response.model,
      latencyMs: response.latencyMs ?? null,
      estimatedCostUsd: response.usage?.estimatedCostUsd ?? null,
      qualityScore: evaluation.overallScore / Math.max(evaluation.maxOverallScore, 1),
      metadata: {
        evidenceCompliant: evidenceCheck.compliant,
      },
    });

    return res.json({
      response: response.content,
      thread_id: threadId,
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
        appliedRole: orchestration.appliedRole,
        suggestedActions: orchestration.suggestedActions,
        meta: orchestration.orchestrationMeta,
        goalPlan,
      },
      evaluation: {
        grade: evaluation.grade,
        overallScore: evaluation.overallScore,
        maxScore: evaluation.maxOverallScore,
      },
      evidence: {
        compliant: evidenceCheck.compliant,
        labels: evidenceCheck.totalLabels,
      },
      structure: {
        valid: structureCheck.valid,
        score: structureCheck.score,
        maxScore: structureCheck.maxScore,
      },
      provider: response.provider,
      model: response.model,
      usage: response.usage,
    });
  } catch (error: any) {
    console.error('[AnA RI] Chat error:', error);
    void logKernelDecision({
      requestId: `ana-ri-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
      route: '/api/ana-ri/chat',
      orchestratorName: 'kernel-router-v1',
      selectedTaskType: 'regulatory_review',
      routingStrategy: 'quality_optimized',
      selectedTools: [],
      outcome: 'failed',
      errorMessage: error?.message || 'unknown error',
      decisionRationale: 'AnA RI route failed before completion.',
    });
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error?.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan — Return planner preview without generation
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan', async (req: Request, res: Response) => {
  try {
    const { message, intent_lens, submission_type, persist, thread_id } = req.body || {};
    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'Message is required', code: 'INVALID_MESSAGE' });
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

    return res.json({
      routingPlan,
      goalPlan,
      planRunId,
      orchestration: {
        detectedIntent: orchestration.detectedIntent,
        detectedSubmissionType: orchestration.detectedSubmissionType,
      },
    });
  } catch (error: any) {
    return res.status(500).json({
      error: 'Failed to compute plan',
      code: 'PLANNER_ERROR',
      message: error?.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId — Fetch persisted goal plan run
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId', async (req: Request, res: Response) => {
  const planRun = await getGoalPlanRun(req.params.planRunId);
  if (!planRun) {
    return res.status(404).json({ error: 'Plan run not found', code: 'PLAN_NOT_FOUND' });
  }
  return res.json(planRun);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/advance — Advance step status
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/advance', async (req: Request, res: Response) => {
  const { stepId, nextStatus } = req.body || {};
  if (!stepId || !nextStatus) {
    return res
      .status(400)
      .json({ error: 'stepId and nextStatus are required', code: 'INVALID_INPUT' });
  }
  const allowedStatuses = ['pending', 'in_progress', 'completed', 'blocked', 'replanned'] as const;
  if (!allowedStatuses.includes(nextStatus)) {
    return res.status(400).json({ error: 'Invalid nextStatus', code: 'INVALID_STATUS' });
  }

  const result = await advanceGoalPlanStep({
    planRunId: req.params.planRunId,
    stepId,
    nextStatus,
  });
  if (!result.ok) {
    return res.status(400).json({ error: result.message, code: 'PLAN_ADVANCE_FAILED' });
  }
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/execute-next — Execute next runnable step
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/execute-next', async (req: Request, res: Response) => {
  const result = await executeNextGoalPlanStep(req.params.planRunId);
  if (!result.ok) {
    return res.status(400).json({ error: result.message, code: 'PLAN_EXECUTION_FAILED' });
  }
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  await recordProtocolEvent({
    planRunId: req.params.planRunId,
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
  return res.json(result);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId/events — Step event audit trail
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId/events', async (req: Request, res: Response) => {
  const events = await listGoalPlanEvents(req.params.planRunId);
  return res.json({ events });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/plan/:planRunId/protocol — Append protocol event
// ─────────────────────────────────────────────────────────────────────────────
router.post('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
  const { actorType, actorId, messageType, payload, metadata } = req.body || {};
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const event = {
    planRunId: req.params.planRunId,
    organizationId: orgId ? Number(orgId) : null,
    actorType,
    actorId,
    messageType,
    payload,
    metadata,
  };
  const validation = validateProtocolEvent(event as any);
  if (!validation.ok) {
    return res.status(400).json({ error: validation.message, code: 'INVALID_PROTOCOL_EVENT' });
  }

  const recorded = await recordProtocolEvent(event as any);
  if (!recorded.ok) {
    return res
      .status(500)
      .json({ error: 'Failed to record protocol event', code: 'PROTOCOL_WRITE_FAILED' });
  }
  return res.json({ ok: true });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/plan/:planRunId/protocol — List protocol events
// ─────────────────────────────────────────────────────────────────────────────
router.get('/plan/:planRunId/protocol', async (req: Request, res: Response) => {
  const events = await listProtocolEvents(req.params.planRunId);
  return res.json({ events });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/kernel/metrics — Kernel observability summary
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kernel/metrics', async (req: Request, res: Response) => {
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
  const windowDays = req.query.window_days ? Number(req.query.window_days) : 7;
  const metrics = await getKernelMetrics({
    organizationId: orgId ? Number(orgId) : null,
    windowDays: Number.isFinite(windowDays) && windowDays > 0 ? windowDays : 7,
  });
  return res.json(metrics);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/kernel/readiness — Beta launch readiness checks
// ─────────────────────────────────────────────────────────────────────────────
router.get('/kernel/readiness', async (_req: Request, res: Response) => {
  const readiness = await getKernelBetaReadiness();
  return res.json(readiness);
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/generate — Generate Governed Artifact
// ─────────────────────────────────────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const {
      action_type,
      conversation_context,
      project_id,
      title,
      section_code,
      user_role,
      intent_lens,
    } = req.body;

    const VALID_ACTIONS = [
      'risk_memo',
      'deficiency_preemption_memo',
      'evidence_memo',
      'strategy_note',
      'reviewer_question_brief',
      'rewritten_section',
      'revised_artifact',
      'attach_to_dossier',
    ];
    if (!action_type || typeof action_type !== 'string' || !VALID_ACTIONS.includes(action_type)) {
      return res.status(400).json({
        error: `Invalid action_type. Must be one of: ${VALID_ACTIONS.join(', ')}`,
        code: 'INVALID_ACTION',
      });
    }

    if (
      !conversation_context ||
      !Array.isArray(conversation_context) ||
      conversation_context.length === 0
    ) {
      return res
        .status(400)
        .json({ error: 'conversation_context is required', code: 'INVALID_CONTEXT' });
    }

    if (!project_id) {
      return res.status(400).json({ error: 'project_id is required', code: 'MISSING_PROJECT' });
    }

    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const userId = (req as any).userId || (req as any).user?.id;

    if (!orgId) {
      return res.status(403).json({ error: 'Organization context required', code: 'NO_ORG' });
    }

    const { generateArtifact } = await import('../services/ana-ri/artifact-generator.js');

    const result = await generateArtifact({
      actionType: action_type,
      conversationContext: conversation_context,
      projectId: Number(project_id),
      organizationId: Number(orgId),
      userId: userId ? Number(userId) : undefined,
      userRole: user_role,
      intentLens: intent_lens,
      title,
      sectionCode: section_code,
    });

    if (!result.success) {
      return res.status(502).json({
        error: result.error || 'Artifact generation failed',
        code: 'GENERATION_FAILED',
      });
    }

    return res.json({
      content: result.content,
      title: result.title,
      artifactId: result.artifactId,
      isNew: result.isNew,
      provider: result.provider,
      model: result.model,
    });
  } catch (error: any) {
    console.error('[AnA RI] Generate error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      message: error?.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/deficiencies — Query Deficiency Taxonomy
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deficiencies', (_req: Request, res: Response) => {
  const { submission_type, category, severity } = _req.query;

  let results = [...DEFICIENCY_TAXONOMY];

  if (submission_type) {
    results = getDeficienciesBySubmissionType(submission_type as SubmissionType);
  }

  if (category) {
    results = results.filter(d => d.category.toLowerCase() === (category as string).toLowerCase());
  }

  if (severity) {
    results = results.filter(d => d.severity === severity);
  }

  return res.json({
    count: results.length,
    deficiencies: results,
    categories: getDeficiencyCategories(),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/deficiencies/critical — Critical deficiencies only
// ─────────────────────────────────────────────────────────────────────────────

router.get('/deficiencies/critical', (_req: Request, res: Response) => {
  const { submission_type } = _req.query;
  const type = (submission_type as SubmissionType) || 'general';
  const critical = getCriticalDeficiencies(type);

  return res.json({
    count: critical.length,
    submissionType: type,
    deficiencies: critical,
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/actions — Available Document Actions
// ─────────────────────────────────────────────────────────────────────────────

router.get('/actions', (_req: Request, res: Response) => {
  const { lens } = _req.query;

  const actions = lens ? getActionsForLens(lens as IntentLens) : getAllActions();

  return res.json({
    count: actions.length,
    actions: actions.map(a => ({
      type: a.type,
      label: a.label,
      description: a.description,
      icon: a.icon,
      template: a.template,
    })),
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/rubric — Evaluation Rubric
// ─────────────────────────────────────────────────────────────────────────────

router.get('/rubric', (_req: Request, res: Response) => {
  const rubric = getFullRubric();
  return res.json({ dimensions: rubric });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/evaluate — Evaluate a response
// ─────────────────────────────────────────────────────────────────────────────

router.post('/evaluate', (req: Request, res: Response) => {
  const { response, context } = req.body;

  if (!response || typeof response !== 'string') {
    return res.status(400).json({ error: 'Response text is required' });
  }

  const evaluation = evaluateResponse(response, context || {});
  return res.json(evaluation);
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/observability — Runtime generation stats and log
// ─────────────────────────────────────────────────────────────────────────────

router.get('/observability', (_req: Request, res: Response) => {
  const stats = getGenerationStats();
  return res.json(stats);
});

router.get('/observability/log', (_req: Request, res: Response) => {
  const { route, artifact, orchestrated, limit } = _req.query;
  const log = getGenerationLog({
    route: route as string | undefined,
    artifactCreated: artifact === 'true' ? true : artifact === 'false' ? false : undefined,
    anaRiOrchestrated:
      orchestrated === 'true' ? true : orchestrated === 'false' ? false : undefined,
    limit: limit ? Number(limit) : 100,
  });
  return res.json({ count: log.length, events: log });
});

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/ana-ri/execute — Execute AnA commands (project/doc/task ops)
// ─────────────────────────────────────────────────────────────────────────────

router.post('/execute', async (req: Request, res: Response) => {
  try {
    const { command, params } = req.body;

    if (!command || typeof command !== 'string') {
      return res.status(400).json({ error: 'command is required', code: 'INVALID_COMMAND' });
    }

    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const userId = (req as any).userId || (req as any).user?.id;

    if (!orgId || !userId) {
      return res.status(403).json({ error: 'Authentication required', code: 'NO_AUTH' });
    }

    const { CommandContext } = await import('../services/ana-ri/command-executor.js');
    const executor = await import('../services/ana-ri/command-executor.js');

    const ctx = {
      userId: Number(userId),
      organizationId: Number(orgId),
      activeProjectId: params?.projectId ? Number(params.projectId) : undefined,
      userName: (req as any).user?.name,
      userRole: (req as any).user?.title,
    };

    let result;
    switch (command) {
      case 'create_project':
        result = await executor.createProject(ctx, params || {});
        break;
      case 'list_projects':
        result = await executor.listProjects(ctx);
        break;
      case 'update_project':
        result = await executor.updateProject(ctx, params?.projectId, params?.updates || {});
        break;
      case 'create_artifact':
        result = await executor.createArtifact(ctx, params || {});
        break;
      case 'update_artifact':
        result = await executor.updateArtifact(ctx, params || {});
        break;
      case 'update_artifact_status':
        result = await executor.updateArtifactStatus(ctx, params || {});
        break;
      case 'list_artifacts':
        result = await executor.listArtifacts(ctx, params?.projectId, params?.filters);
        break;
      case 'place_in_dossier':
        result = await executor.placeInDossier(ctx, params || {});
        break;
      case 'create_task':
        result = await executor.createTask(ctx, params || {});
        break;
      case 'update_task':
        result = await executor.updateTask(ctx, params || {});
        break;
      case 'list_tasks':
        result = await executor.listTasks(ctx, params?.projectId, params?.filters);
        break;
      case 'check_dossier_readiness':
        result = await executor.checkDossierReadiness(ctx, params?.projectId);
        break;
      case 'create_submission_package':
        result = await executor.createSubmissionPackage(ctx, params || {});
        break;
      case 'create_review_thread':
        result = await executor.createReviewThread(ctx, params || {});
        break;
      case 'add_review_comment':
        result = await executor.addReviewComment(ctx, params || {});
        break;
      case 'list_artifact_versions':
        result = await executor.listArtifactVersions(ctx, params || {});
        break;
      case 'run_compliance_scan':
        result = await executor.runComplianceScan(ctx, params || {});
        break;
      case 'export_artifact':
        result = await executor.exportArtifact(ctx, params || {});
        break;
      case 'compare_versions':
        result = await executor.compareVersions(ctx, params || {});
        break;
      case 'review_version_impact':
        result = await executor.reviewVersionImpact(ctx, params || {});
        break;
      case 'create_milestone':
        result = await executor.createMilestone(ctx, params || {});
        break;
      case 'update_milestone':
        result = await executor.updateMilestone(ctx, params || {});
        break;
      case 'list_milestones':
        result = await executor.listMilestones(ctx, params?.packageId);
        break;
      case 'revert_to_version':
        result = await executor.revertToVersion(ctx, params || {});
        break;
      case 'search_artifacts':
        result = await executor.searchArtifacts(ctx, params || {});
        break;
      case 'list_team_members':
        result = await executor.listTeamMembers(ctx);
        break;
      case 'load_user_context':
        result = await executor.loadUserContext(ctx);
        break;
      case 'load_conversation_history':
        result = await executor.loadConversationHistory(ctx, params);
        break;
      default:
        return res.status(400).json({
          error: `Unknown command: ${command}`,
          code: 'UNKNOWN_COMMAND',
          availableCommands: executor.COMMAND_REGISTRY.map((c: any) => c.name),
        });
    }

    return res.json(result);
  } catch (error: any) {
    console.error('[AnA RI] Command execution error:', error);
    return res.status(500).json({
      error: 'Command execution failed',
      code: 'EXECUTION_ERROR',
      message: error?.message,
    });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/ana-ri/commands — List available commands
// ─────────────────────────────────────────────────────────────────────────────

router.get('/commands', async (_req: Request, res: Response) => {
  const { COMMAND_REGISTRY } = await import('../services/ana-ri/command-executor.js');
  return res.json({ commands: COMMAND_REGISTRY });
});

export default router;
