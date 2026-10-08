/**
 * Submission AI tasks (gateway-backed)
 *
 * The three remaining pure-input AI tasks the spec §6 calls for that take
 * structured input and return structured output (no new tables, no streaming):
 *   - submission-plan   (§6.1) NARRATIVE (gaps, dependencies) over the deterministic structure
 *                        (sections, forms and clocks come from the reasoning engine — see generateSubmissionPlan)
 *   - validation-explain (§6.6) plain-language causes + fixes for validator errors
 *   (cross-region-gap, §6.7, was retired 2026-10-08: a model's list of Module 1
 *    deltas rendered as a regulatory verdict, against CLAUDE.md Rule 2.
 *    FILING_SPINE.md F21; what another market needs is now stated
 *    deterministically by services/regulatory/market-support.ts.)
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
import type { SubmissionStructure } from '../reasoning-engine/index.js';
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
async function auditAiOutcome(
  task: string,
  ctx: AiTaskCtx,
  outcome: 'success' | 'failed',
  extra?: Record<string, unknown>,
  version = 'v1.0',
) {
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
    details: { task, promptVersion: `${task}@${version}`, outcome, ...extra },
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
  { maxTokens, version = 'v1.0' }: { maxTokens: number; version?: string },
): Promise<T> {
  const systemPrompt = await loadPrompt(task, version);
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
      promptVersion: `${task}@${version}`,
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      callerModule: 'submission-ai-service',
      metadata: { task, submissionId: ctx.submissionId },
    });
    const result = parseJson<T>(response.content);
    await auditAiOutcome(task, ctx, 'success', undefined, version);
    logger.info('Ran submission AI task', { task, organizationId: ctx.organizationId, submissionId: ctx.submissionId });
    return result;
  } catch (err) {
    // Always audit the failed attempt with its true code, then rethrow mapped.
    if (err instanceof SubmissionAiError) {
      await auditAiOutcome(task, ctx, 'failed', { code: err.code }, version);
      throw err;
    }
    const { code, message } = classifyGatewayError(err);
    await auditAiOutcome(task, ctx, 'failed', { code }, version);
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
export const SUBMISSION_PLAN_PROMPT_VERSION = 'v1.1';

export const SUBMISSION_PLAN_NARRATIVE_LABEL =
  'Model narrative — advisory only. The plan is deterministicStructure: the required sections, Module 1 forms ' +
  'and review clocks the reasoning engine resolves by rule. The model adds gaps and dependencies as prose, and no figure.';

/** Model prose about the plan. Labelled as such; never an input to it. */
export interface SubmissionPlanNarrative {
  source: 'model';
  label: string;
  promptVersion: string;
  gaps: Array<{ sectionCode: string; description: string }>;
  dependencies: Array<{ before: string; after: string }>;
}

export interface SubmissionPlanResult {
  /** The plan: the reasoning engine's structure, computed by rule (WO-5). */
  deterministicStructure: SubmissionStructure;
  /** null when no provider is configured or the model call failed; the plan is unaffected. */
  narrative: SubmissionPlanNarrative | null;
  narrativeUnavailable: { code: string; message: string } | null;
}

const asList = <T>(v: unknown, keep: (x: Record<string, unknown>) => T | null): T[] =>
  Array.isArray(v) ? v.flatMap((x) => (x && typeof x === 'object' ? [keep(x as Record<string, unknown>)] : [])).filter((x): x is T => x !== null) : [];

/**
 * A submission plan (spec §6.1). The STRUCTURE is the plan, and it is
 * deterministic: required sections, Module 1 forms and review clocks resolved by
 * the reasoning engine (WO-5). The model narrates on top of it: the gaps it sees
 * and the order work depends on, as prose.
 *
 * Until 2026-10-05 the model also returned its own module map, forms and a
 * timeline of day offsets keyed to PDUFA, 210-day or PMDA clocks, spread beside
 * the engine's structure, and the two could disagree (Rule 2: a tool that asks a
 * model for a figure is a defect; work-orders item 21). Prompt v1.1 asks for none
 * of them, any it returns is dropped, and the model is given the engine's
 * structure to narrate. The plan stands when the model is unavailable.
 */
export async function generateSubmissionPlan(input: SubmissionPlanInput, ctx: AiTaskCtx): Promise<SubmissionPlanResult> {
  const { buildSubmissionStructure } = await import('../reasoning-engine/index.js');
  const deterministicStructure = buildSubmissionStructure(input.regions ?? [], input.applicationType);
  try {
    const narration = await runJsonTask<Record<string, unknown>>(
      'submission-plan',
      'regulatory_review',
      { ...input, deterministicStructure },
      ctx,
      { maxTokens: 8000, version: SUBMISSION_PLAN_PROMPT_VERSION },
    );
    const text = (v: unknown) => (typeof v === 'string' ? v : '');
    return {
      deterministicStructure,
      narrative: {
        source: 'model',
        label: SUBMISSION_PLAN_NARRATIVE_LABEL,
        promptVersion: `submission-plan@${SUBMISSION_PLAN_PROMPT_VERSION}`,
        gaps: asList(narration.gaps, (g) => (text(g.description) ? { sectionCode: text(g.sectionCode), description: text(g.description) } : null)),
        dependencies: asList(narration.dependencies, (d) => (text(d.before) && text(d.after) ? { before: text(d.before), after: text(d.after) } : null)),
      },
      narrativeUnavailable: null,
    };
  } catch (err) {
    const code = err instanceof SubmissionAiError ? err.code : 'PROVIDER_UNAVAILABLE';
    const message = err instanceof Error ? err.message : String(err);
    return { deterministicStructure, narrative: null, narrativeUnavailable: { code, message } };
  }
}

export interface ValidationExplainInput {
  /** The deterministic validator's findings. `rule_id` is AnA's tool spelling of `ruleId`. */
  findings: Array<{ ruleId?: string; rule_id?: string; severity: string; message: string; leaf?: string }>;
  region: string;
}
export const VALIDATION_EXPLAIN_PROMPT_VERSION = 'v1.1';

export const VALIDATION_EXPLAIN_NARRATIVE_LABEL =
  "Model narrative — advisory only. The findings and their severities are the deterministic validator's; the model " +
  'explains each one in plain language, changes none, and decides nothing about dispatch.';

/** The model's explanation of one given finding. The finding's rule, severity and
 *  leaf are copied from the validator's finding at `index`, never from the model. */
export interface ValidationExplainRow {
  index: number;
  ruleId: string | null;
  severity: string;
  leaf: string | null;
  cause: string;
  fix: string;
}

export interface ValidationExplainResult {
  /** null when no provider is configured or the model call failed; the findings are unaffected. */
  narrative: {
    source: 'model';
    label: string;
    promptVersion: string;
    summary: string;
    explained: ValidationExplainRow[];
  } | null;
  narrativeUnavailable: { code: string; message: string } | null;
}

/**
 * Validation explain (spec §6.6) under CLAUDE.md Rule 2: the findings are the
 * deterministic validator's, and the model only explains them.
 *
 * Until 2026-10-08 this returned the model's JSON as it came: prompt v1.0 asked
 * the model to decide `blocking` and to echo each finding's ruleId, severity and
 * leaf, and the Validation tab printed "Blocking." and a severity chip from that
 * reply with no model label (filing-spine design review, open item 2). Now each
 * finding is numbered, the model returns prose keyed to those numbers (prompt
 * v1.1), and only that prose is taken: a row for a number not given, a second
 * row for the same finding, and any verdict, severity or rule the model states
 * are dropped. The findings stand when the model is unavailable.
 */
export async function explainValidation(input: ValidationExplainInput, ctx: AiTaskCtx): Promise<ValidationExplainResult> {
  const findings = input.findings.map((f, index) => ({
    index,
    ruleId: f.ruleId ?? f.rule_id ?? null,
    severity: f.severity,
    message: f.message,
    leaf: f.leaf ?? null,
  }));
  try {
    const reply = await runJsonTask<Record<string, unknown>>(
      'validation-explain',
      'document_analysis',
      { region: input.region, findings },
      ctx,
      { maxTokens: 4000, version: VALIDATION_EXPLAIN_PROMPT_VERSION },
    );
    const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
    const seen = new Set<number>();
    const explained = asList(reply.explained, (r): ValidationExplainRow | null => {
      const finding = typeof r.index === 'number' && Number.isInteger(r.index) ? findings[r.index] : undefined;
      if (!finding || seen.has(finding.index) || !text(r.cause)) return null;
      seen.add(finding.index);
      return { index: finding.index, ruleId: finding.ruleId, severity: finding.severity, leaf: finding.leaf, cause: text(r.cause), fix: text(r.fix) };
    }).sort((x, y) => x.index - y.index);
    return {
      narrative: {
        source: 'model',
        label: VALIDATION_EXPLAIN_NARRATIVE_LABEL,
        promptVersion: `validation-explain@${VALIDATION_EXPLAIN_PROMPT_VERSION}`,
        summary: text(reply.summary),
        explained,
      },
      narrativeUnavailable: null,
    };
  } catch (err) {
    const code = err instanceof SubmissionAiError ? err.code : 'PROVIDER_UNAVAILABLE';
    const message = err instanceof Error ? err.message : String(err);
    return { narrative: null, narrativeUnavailable: { code, message } };
  }
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
      { maxTokens: 4000 },
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

export default { generateSubmissionPlan, explainValidation, runDispatchQc };
