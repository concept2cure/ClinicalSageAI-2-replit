/**
 * Kernel Router (Planner v1)
 *
 * Central routing policy for selecting task type + strategy + generation constraints.
 * This is the first step toward unifying orchestration policy into a single contract.
 */

import type { RoutingStrategy, TaskType } from './ai-gateway/types.js';

export type KernelRiskTier = 'low' | 'medium' | 'high';

export interface KernelRoutingInput {
  route: string;
  messageLength: number;
  intentLens?: string | null;
  intentConfidence?: number | null;
  submissionType?: string | null;
  hasEvidence?: boolean;
  requestedMaxTokens?: number;
  requiresStructuredOutput?: boolean;
  contradictionCount?: number;
  criticalContradictionCount?: number;
  toolRequestCount?: number;
}

export interface KernelRoutingPlan {
  plannerVersion: string;
  orchestratorName: 'kernel-router-v1';
  taskType: TaskType;
  strategy: RoutingStrategy;
  riskTier: KernelRiskTier;
  maxTokens: number;
  temperature: number;
  decisionRationale: string;
  constraints: Record<string, unknown>;
  allowToolExecution: boolean;
  maxToolCalls: number;
  maxToolChainDepth: number;
}

const DEFAULT_MAX_TOKENS = 4096;
const DEFAULT_CHAT_TEMPERATURE = 0.7;
const DEFAULT_REG_REVIEW_TEMPERATURE = 0.3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function planKernelExecution(input: KernelRoutingInput): KernelRoutingPlan {
  const isRegulatorySurface = input.route.includes('/ana-ri') || input.route.includes('/cortex');
  const hasSubmissionSignal = !!input.submissionType;
  const highRiskIntent = input.intentLens === 'risk' || input.intentLens === 'audit';
  const lowIntentConfidence =
    typeof input.intentConfidence === 'number' && input.intentConfidence < 0.35;
  const longMessage = input.messageLength > 6000;
  const contradictionCount = input.contradictionCount || 0;
  const criticalContradictions = input.criticalContradictionCount || 0;

  let taskType: TaskType = 'chat';
  let strategy: RoutingStrategy = 'quality_optimized';
  let temperature = DEFAULT_CHAT_TEMPERATURE;
  let riskTier: KernelRiskTier = 'low';
  const rationale: string[] = [];

  if (input.requiresStructuredOutput) {
    taskType = 'structured_output';
    strategy = 'quality_optimized';
    temperature = 0.2;
    riskTier = 'medium';
    rationale.push('Structured output requested');
  }

  if (isRegulatorySurface || hasSubmissionSignal || highRiskIntent) {
    taskType = 'regulatory_review';
    strategy = 'quality_optimized';
    temperature = DEFAULT_REG_REVIEW_TEMPERATURE;
    riskTier = highRiskIntent ? 'high' : 'medium';
    rationale.push('Regulatory context detected');
  }

  if (input.hasEvidence) {
    strategy = 'quality_optimized';
    rationale.push('Evidence grounding available');
  }

  if (lowIntentConfidence) {
    strategy = 'quality_optimized';
    temperature = Math.min(temperature, 0.3);
    rationale.push('Low intent confidence -> conservative generation');
  }

  if (criticalContradictions > 0) {
    taskType = 'regulatory_review';
    strategy = 'quality_optimized';
    riskTier = 'high';
    temperature = Math.min(temperature, 0.2);
    rationale.push('Critical contradiction signals detected');
  } else if (contradictionCount > 0) {
    riskTier = riskTier === 'low' ? 'medium' : riskTier;
    temperature = Math.min(temperature, 0.3);
    rationale.push('Contradiction signals detected');
  }

  const requestedMax = input.requestedMaxTokens || DEFAULT_MAX_TOKENS;
  const maxTokens = clamp(longMessage ? Math.max(requestedMax, 5000) : requestedMax, 512, 8192);
  if (longMessage) rationale.push('Long prompt -> increased max token budget');
  const allowToolExecution = riskTier !== 'high' || (input.toolRequestCount || 0) <= 1;
  const maxToolCalls = riskTier === 'high' ? 1 : 3;
  const maxToolChainDepth = riskTier === 'high' ? 1 : 2;
  if (!allowToolExecution) rationale.push('Tool execution constrained by risk policy');

  return {
    plannerVersion: 'kernel-router-v1',
    orchestratorName: 'kernel-router-v1',
    taskType,
    strategy,
    riskTier,
    maxTokens,
    temperature,
    decisionRationale: rationale.join('; ') || 'Default kernel routing policy applied',
    constraints: {
      route: input.route,
      messageLength: input.messageLength,
      hasEvidence: !!input.hasEvidence,
      intentLens: input.intentLens || null,
      intentConfidence: input.intentConfidence ?? null,
      submissionType: input.submissionType || null,
      contradictionCount,
      criticalContradictionCount: criticalContradictions,
    },
    allowToolExecution,
    maxToolCalls,
    maxToolChainDepth,
  };
}
