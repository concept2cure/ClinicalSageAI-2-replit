/**
 * Submission AI tasks (gateway-backed)
 *
 * The four remaining pure-input AI tasks the spec §6 calls for that take
 * structured input and return structured output (no new tables, no streaming):
 *   - submission-plan   (§6.1) module/section map + forms + timeline + gaps
 *   - validation-explain (§6.6) plain-language causes + fixes for validator errors
 *   - cross-region-gap   (§6.7) deltas to file region A's submission in B/C
 *   - dispatch-qc        (§6.8) NARRATIVE over the deterministic pre-transmit verdict
 *                        (the verdict itself never comes from the model — see runDispatchQc)
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
import { classifyGatewayError, type GatewayErrorCode } from '../ai-gateway/gateway-error-map';
import { evaluateDispatchGate } from '../ectd/dispatch-gate';
import type { DispatchReadinessAssessment } from '../ectd/assess-dispatch-readiness';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { PROMPTS_DIR } from '../ai-gateway/prompts-dir';

const logger = createScopedLogger('submission-ai-service');

export class SubmissionAiError extends Error {
  constructor(
    public code: GatewayErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'SubmissionAiError';
  }
}

/** Audit an AI invocation outcome (best-effort; never masks the real error). */
async function auditAiOutcome(task: string, ctx: AiTaskCtx, outcome: 'success' | 'failed', extra?: Record<string, unknown>) {
  // Audit must never block the response — and it does not. The try/catch this
  // replaced enforced nothing, because `logAction` resolves normally on a
  // persistence failure rather than rejecting; the catch was dead code. An
  // AI_GENERATE event on a submission is provenance for text that may reach a
  // regulator, so a lost row is worth a line even though it is not fatal here.
  const generateAudit = await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'AI_GENERATE',
    resourceType: 'submission',
    resourceId: ctx.submissionId,
    details: { task, promptVersion: `${task}@v1.0`, outcome, ...extra },
  });
  if (!generateAudit.persisted) {
    logger.warn('AI_GENERATE audit row was not persisted', {
      submissionId: ctx.submissionId,
      organizationId: ctx.organizationId,
      task,
      outcome,
      auditError: generateAudit.error ?? 'no durable store accepted the row',
    });
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
export async function generateSubmissionPlan<T = unknown>(input: SubmissionPlanInput, ctx: AiTaskCtx): Promise<T> {
  const narration = await runJsonTask<Record<string, unknown>>('submission-plan', 'regulatory_review', input, ctx, 8000);
  // Ground the plan's STRUCTURE deterministically via the reasoning-engine, so
  // required sections + review clocks are resolved by rule (not LLM-invented).
  // The LLM narration sits on top; this is the determinism boundary (WO-5).
  const { buildSubmissionStructure } = await import('../reasoning-engine/index.js');
  const deterministicStructure = buildSubmissionStructure(input.regions ?? [], input.applicationType);
  return { ...narration, deterministicStructure } as T;
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

export interface DispatchQcChecklistItem {
  item: string;
  pass: boolean;
}

/**
 * The deterministic part of a dispatch-QC answer. Every field here is computed
 * by the platform's own gates; none is read from a model.
 */
export interface DispatchQcVerdict {
  clearedToDispatch: boolean;
  blockers: string[];
  warnings: string[];
  checklist: DispatchQcChecklistItem[];
  /**
   * Which deterministic engine produced the verdict:
   *   'assess-dispatch-readiness' — the full server-computed assessment for a
   *     sequence (structural validation, Shadow Review, external validation,
   *     release signature), the same composition freeze/dispatch enforce;
   *   'dispatch-gate' — the pure hard gate over the two supplied counts only,
   *     when no sequence assessment was available (AnA tool path).
   */
  verdictSource: 'assess-dispatch-readiness' | 'dispatch-gate';
}

/** Model prose about the verdict. Labelled as such; never an input to it. */
export interface DispatchQcNarrative {
  source: 'model';
  /** Fixed reviewer-facing label so no surface can render this as a verdict. */
  label: string;
  promptVersion: string;
  summary: string;
  observations: string[];
  checklistNotes: DispatchQcChecklistItem[];
}

export interface DispatchQcResult extends DispatchQcVerdict {
  /** null when no provider is configured or the model call failed; the verdict is unaffected. */
  narrative: DispatchQcNarrative | null;
  narrativeUnavailable: { code: string; message: string } | null;
}

export const DISPATCH_QC_NARRATIVE_LABEL =
  'Model narrative — advisory only. It does not set or change the verdict; clearedToDispatch, blockers and checklist are computed by the deterministic dispatch gate.';

const NO_ASSESSMENT_WARNING =
  'Sequence-level checks (structural validation of the stored leaves, Shadow Review presence, external validation, release signature) were not run because no sequence assessment was supplied; this verdict covers only the supplied counts. Use the sequence dispatch-readiness assessment for the full gate.';

function hasFinding(a: DispatchReadinessAssessment, ...codes: string[]): boolean {
  return a.readiness.findings.some((f) => codes.includes(f.code));
}

/**
 * The deterministic dispatch-QC verdict. PURE: no DB, no network, no model.
 *
 * With a sequence assessment the verdict IS the assessment's dispatch gate —
 * the same composed gate `freezeSequence` / `dispatchSequence` enforce — and
 * the checklist is read off the assessment's parts. Without one, the verdict is
 * the hard gate over the two supplied counts, and the warnings say what was not
 * checked rather than letting the shorter checklist read as a fuller pass.
 */
export function computeDispatchQcVerdict(
  input: DispatchQcInput,
  assessment?: DispatchReadinessAssessment | null,
): DispatchQcVerdict {
  if (assessment) {
    const checklist: DispatchQcChecklistItem[] = [
      { item: 'No open error-severity validation findings on the stored leaves', pass: assessment.validationErrors === 0 },
      { item: 'No unacknowledged Shadow Review criticals', pass: assessment.unacknowledgedShadowCriticals === 0 },
      { item: 'At least one completed Shadow Review has run for this sequence', pass: assessment.shadowReviewRunCount > 0 },
      { item: 'External agency-grade validation gate clear', pass: assessment.externalValidation.cleared },
      { item: 'Release signature gate clear (21 CFR Part 11 §11.70)', pass: assessment.releaseSignature.cleared },
      { item: 'Required Module 1 sections present for the region', pass: !hasFinding(assessment, 'MISSING_REQUIRED_SECTION') },
      { item: 'Lifecycle operations coherent (new/replace/append/delete; original sequence carries only new)', pass: !hasFinding(assessment, 'INVALID_LIFECYCLE_OP', 'LIFECYCLE_OP_IN_ORIGINAL', 'DUPLICATE_NEW_SECTION') },
    ];
    return {
      clearedToDispatch: assessment.gate.cleared,
      blockers: [...assessment.gate.blockers],
      warnings: assessment.readiness.findings.filter((f) => f.severity === 'warning').map((f) => f.message),
      checklist,
      verdictSource: 'assess-dispatch-readiness',
    };
  }
  const gate = evaluateDispatchGate({
    validationErrors: input.validationErrors,
    unacknowledgedShadowCriticals: input.unresolvedShadowCriticals,
  });
  return {
    clearedToDispatch: gate.cleared,
    blockers: [...gate.blockers],
    warnings: [NO_ASSESSMENT_WARNING],
    checklist: [
      { item: 'No open error-severity validation findings', pass: input.validationErrors === 0 },
      { item: 'No unacknowledged Shadow Review criticals', pass: input.unresolvedShadowCriticals === 0 },
    ],
    verdictSource: 'dispatch-gate',
  };
}

const asStringList = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => String(x)).filter((x) => x.trim().length > 0) : [];

/** A live provider is enabled, or the operator opted into deterministic fixtures. */
function narrationProviderAvailable(): boolean {
  try {
    const gw = getGateway();
    return gw.isDeterministic?.() === true || (gw.getEnabledProviders?.() ?? []).length > 0;
  } catch {
    return false;
  }
}

/**
 * Ask the configured model to narrate the deterministic verdict. Returns
 * `narrative: null` — never throws — when no provider is enabled or the call
 * fails, so a missing model can never turn a computed verdict into a 502.
 * Only prose is taken from the model; its own `clearedToDispatch` is discarded.
 */
async function narrateDispatchQc(
  input: DispatchQcInput,
  verdict: DispatchQcVerdict,
  ctx: AiTaskCtx,
): Promise<Pick<DispatchQcResult, 'narrative' | 'narrativeUnavailable'>> {
  if (!narrationProviderAvailable()) {
    return {
      narrative: null,
      narrativeUnavailable: {
        code: 'PROVIDER_UNAVAILABLE',
        message: 'No AI provider is configured; the deterministic verdict stands without a narrative.',
      },
    };
  }
  try {
    const ai = await runJsonTask<Record<string, unknown>>(
      'dispatch-qc',
      'regulatory_review',
      { ...input, deterministicVerdict: verdict },
      ctx,
      4000,
    );
    const observations = [...asStringList(ai?.blockers), ...asStringList(ai?.warnings)];
    const checklistNotes: DispatchQcChecklistItem[] = Array.isArray(ai?.checklist)
      ? (ai.checklist as unknown[]).flatMap((c) => {
          const item = (c as { item?: unknown })?.item;
          const pass = (c as { pass?: unknown })?.pass;
          return typeof item === 'string' && typeof pass === 'boolean' ? [{ item, pass }] : [];
        })
      : [];
    return {
      narrative: {
        source: 'model',
        label: DISPATCH_QC_NARRATIVE_LABEL,
        promptVersion: 'dispatch-qc@v1.0',
        summary: observations[0] ?? 'The model raised no observations beyond the deterministic verdict.',
        observations,
        checklistNotes,
      },
      narrativeUnavailable: null,
    };
  } catch (err) {
    const code = err instanceof SubmissionAiError ? err.code : 'NARRATIVE_FAILED';
    const message = err instanceof Error ? err.message : String(err);
    logger.warn('dispatch-qc narrative unavailable; deterministic verdict returned without it', {
      organizationId: ctx.organizationId, submissionId: ctx.submissionId, code,
    });
    return { narrative: null, narrativeUnavailable: { code, message } };
  }
}

/**
 * Dispatch QC (spec §6.8) under CLAUDE.md Rule 2: the verdict comes from the
 * deterministic engines and the model, when one is configured, only narrates.
 *
 * VSR-001 F-9 (OQ-SRDY-03): this used to call the model FIRST and floor its
 * verdict on the structural gate, so with no provider the route answered 502
 * INVALID_AI_RESPONSE — a QC verdict that depended on a model. Now
 * `computeDispatchQcVerdict` decides, then `narrateDispatchQc` may add prose
 * under `narrative`, clearly labelled, or `null` when it cannot. The verdict is
 * byte-identical with and without a provider (pinned by test).
 *
 * `opts.assessment` is the server-computed sequence assessment when the caller
 * has one (the HTTP route always does when `sequenceId` is supplied); the AnA
 * tool path passes none and gets the counts-only gate with an honest warning.
 */
export async function runDispatchQc(
  input: DispatchQcInput,
  ctx: AiTaskCtx,
  opts: { assessment?: DispatchReadinessAssessment | null } = {},
): Promise<DispatchQcResult> {
  const verdict = computeDispatchQcVerdict(input, opts.assessment ?? null);
  const narrated = await narrateDispatchQc(input, verdict, ctx);
  return { ...verdict, ...narrated };
}

export default { generateSubmissionPlan, explainValidation, computeCrossRegionGap, runDispatchQc };
