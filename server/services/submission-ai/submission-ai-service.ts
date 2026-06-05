/**
 * Submission AI tasks (gateway-backed)
 *
 * The four remaining pure-input AI tasks the spec §6 calls for that take
 * structured input and return structured output (no new tables, no streaming):
 *   - submission-plan   (§6.1) module/section map + forms + timeline + gaps
 *   - validation-explain (§6.6) plain-language causes + fixes for validator errors
 *   - cross-region-gap   (§6.7) deltas to file region A's submission in B/C
 *   - dispatch-qc        (§6.8) final adversarial pre-transmit checklist
 *
 * All go through the AI gateway (no direct SDK), load a versioned prompt template
 * from disk (no inline prompt logic), are tenant-scoped from the caller's
 * organizationId, and audit every call as AI_GENERATE.
 *
 * (section-generation needs SSE streaming; consistency-check needs the Phase-3
 * consistency_findings table — those have prompt templates but are wired later.)
 *
 * @module server/services/submission-ai/submission-ai-service
 */

import { promises as fs } from 'fs';
import path from 'path';
import { getGateway } from '../ai-gateway';
import { classifyGatewayError } from '../ai-gateway/gateway-error-map';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('submission-ai-service');
const PROMPTS_DIR = path.join(__dirname, '..', 'ai-gateway', 'prompts');

export class SubmissionAiError extends Error {
  constructor(
    public code: 'INVALID_AI_RESPONSE' | 'PROVIDER_UNAVAILABLE' | 'RATE_LIMITED' | 'TOKEN_LIMIT_EXCEEDED',
    message: string
  ) {
    super(message);
    this.name = 'SubmissionAiError';
  }
}

/** Audit an AI invocation outcome (best-effort; never masks the real error). */
async function auditAiOutcome(task: string, ctx: AiTaskCtx, outcome: 'success' | 'failed', extra?: Record<string, unknown>) {
  try {
    await auditService.logAction({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      action: 'AI_GENERATE',
      resourceType: 'submission',
      resourceId: ctx.submissionId,
      details: { task, promptVersion: `${task}@v1.0`, outcome, ...extra },
    });
  } catch {
    /* audit must never block the response */
  }
}

const promptCache = new Map<string, string>();
async function loadPrompt(task: string, version = 'v1.0'): Promise<string> {
  const key = `${task}@${version}`;
  const cached = promptCache.get(key);
  if (cached) return cached;
  const content = await fs.readFile(path.join(PROMPTS_DIR, task, `${version}.md`), 'utf8');
  promptCache.set(key, content);
  return content;
}

function parseJson<T>(raw: string): T {
  const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    throw new SubmissionAiError('INVALID_AI_RESPONSE', 'The AI response was not valid JSON.');
  }
}

export interface AiTaskCtx {
  organizationId: number;
  userId: number;
  /** Optional submission this task is about, recorded on the audit entry. */
  submissionId?: number;
}

type GatewayTaskType = 'regulatory_review' | 'document_analysis';

async function runJsonTask<T>(
  task: string,
  taskType: GatewayTaskType,
  input: unknown,
  ctx: AiTaskCtx,
  maxTokens: number
): Promise<T> {
  const systemPrompt = await loadPrompt(task);
  try {
    const response = await getGateway().route({
      taskType,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify(input) },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens,
      promptVersion: `${task}@v1.0`,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      callerModule: 'submission-ai-service',
      metadata: { task, submissionId: ctx.submissionId },
    });
    const result = parseJson<T>(response.content);
    await auditAiOutcome(task, ctx, 'success');
    logger.info('Ran submission AI task', { task, organizationId: ctx.organizationId, submissionId: ctx.submissionId });
    return result;
  } catch (err) {
    // Always audit the failed attempt with its true code, then rethrow mapped.
    if (err instanceof SubmissionAiError) {
      await auditAiOutcome(task, ctx, 'failed', { code: err.code });
      throw err;
    }
    const { code, message } = classifyGatewayError(err);
    await auditAiOutcome(task, ctx, 'failed', { code });
    throw new SubmissionAiError(code, message);
  }
}

// ── Public task functions ─────────────────────────────────────────────────

export interface SubmissionPlanInput {
  applicationType: string;
  clientType: string;
  regions: string[];
  productProfile?: string;
}
export function generateSubmissionPlan<T = unknown>(input: SubmissionPlanInput, ctx: AiTaskCtx): Promise<T> {
  return runJsonTask<T>('submission-plan', 'regulatory_review', input, ctx, 8000);
}

export interface ValidationExplainInput {
  findings: Array<{ ruleId?: string; severity: string; message: string; leaf?: string }>;
  region: string;
}
export function explainValidation<T = unknown>(input: ValidationExplainInput, ctx: AiTaskCtx): Promise<T> {
  return runJsonTask<T>('validation-explain', 'document_analysis', input, ctx, 4000);
}

export interface CrossRegionGapInput {
  sourceRegion: string;
  targetRegions: string[];
  applicationType: string;
  sectionsPresent?: string[];
}
export function computeCrossRegionGap<T = unknown>(input: CrossRegionGapInput, ctx: AiTaskCtx): Promise<T> {
  return runJsonTask<T>('cross-region-gap', 'regulatory_review', input, ctx, 4000);
}

export interface DispatchQcInput {
  region: string;
  validationErrors: number;
  unresolvedShadowCriticals: number;
  leaves: Array<{ sectionCode: string; operation: string }>;
}
export function runDispatchQc<T = unknown>(input: DispatchQcInput, ctx: AiTaskCtx): Promise<T> {
  return runJsonTask<T>('dispatch-qc', 'regulatory_review', input, ctx, 4000);
}

export default { generateSubmissionPlan, explainValidation, computeCrossRegionGap, runDispatchQc };
