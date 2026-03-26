import { buildGoalPlan } from './kernel-goal-planner.js';
import { getKernelPolicyHint, recordKernelPolicyOutcome } from './kernel-adaptive-policy.js';
import { logKernelDecision } from './kernel-decision-record.js';
import { planKernelExecution } from './kernel-router.js';

interface BaseCtx {
  route: string;
  message: string;
  organizationId?: number | null;
  threadId?: string | null;
  projectId?: number | null;
  intentLens: string;
  intentConfidence: number;
  submissionType?: string | null;
  hasEvidence?: boolean;
  requestedMaxTokens?: number;
}

export async function buildKernelExecutionContext(input: BaseCtx) {
  const routingPlan = planKernelExecution({
    route: input.route,
    messageLength: input.message.length,
    intentLens: input.intentLens,
    intentConfidence: input.intentConfidence,
    submissionType: input.submissionType,
    hasEvidence: input.hasEvidence,
    requestedMaxTokens: input.requestedMaxTokens,
  });
  const policyHint = await getKernelPolicyHint({
    organizationId: input.organizationId || null,
    route: input.route,
    taskType: routingPlan.taskType,
  });
  const selectedStrategy = policyHint?.preferredStrategy || routingPlan.strategy;
  const goalPlan = buildGoalPlan({
    message: input.message,
    intentLens: input.intentLens,
    riskTier: routingPlan.riskTier,
    submissionType: input.submissionType,
  });

  return { routingPlan, selectedStrategy, goalPlan, policyHint };
}

export async function recordKernelSuccess(input: {
  route: string;
  threadId?: string | null;
  projectId?: number | null;
  organizationId?: number | null;
  userId?: number | string | null;
  intentLens: string;
  intentConfidence: number;
  submissionType?: string | null;
  routingPlan: ReturnType<typeof planKernelExecution>;
  selectedStrategy: string;
  provider?: string | null;
  model?: string | null;
  latencyMs?: number | null;
  estimatedCostUsd?: number | null;
  qualityScore?: number;
  metadata?: Record<string, unknown>;
}) {
  await logKernelDecision({
    requestId: `kernel-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
    threadId: input.threadId || null,
    route: input.route,
    organizationId: input.organizationId || null,
    userId: input.userId ?? null,
    projectId: input.projectId || null,
    plannerVersion: input.routingPlan.plannerVersion,
    orchestratorName: input.routingPlan.orchestratorName,
    intentLens: input.intentLens,
    intentConfidence: input.intentConfidence,
    submissionType: input.submissionType || null,
    selectedTaskType: input.routingPlan.taskType,
    selectedProvider: input.provider || null,
    selectedModel: input.model || null,
    routingStrategy: input.selectedStrategy,
    selectedTools: [],
    constraints: {
      ...input.routingPlan.constraints,
      maxTokens: input.routingPlan.maxTokens,
      temperature: input.routingPlan.temperature,
    },
    decisionRationale: input.routingPlan.decisionRationale,
    estimatedCostUsd: input.estimatedCostUsd ?? null,
    latencyMs: input.latencyMs ?? null,
    outcome: 'success',
  });

  if (typeof input.qualityScore === 'number') {
    await recordKernelPolicyOutcome({
      organizationId: input.organizationId || null,
      route: input.route,
      taskType: input.routingPlan.taskType,
      strategy: input.selectedStrategy as any,
      threadId: input.threadId || null,
      modelProvider: input.provider || null,
      modelName: input.model || null,
      qualityScore: input.qualityScore,
      latencyMs: input.latencyMs ?? null,
      estimatedCostUsd: input.estimatedCostUsd ?? null,
      success: true,
      metadata: input.metadata || {},
    });
  }
}

