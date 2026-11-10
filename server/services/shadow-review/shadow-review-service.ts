/**
 * Shadow Review service (the moat — spec §6.5)
 *
 * Runs an assembled sequence through a simulated-reviewer lens via the AI
 * gateway, persists the run + severity-scored findings, and audits the call.
 * Tenant-scoped from the caller's organizationId. The deterministic risk
 * aggregation is a pure function (testable without a DB or the gateway).
 *
 * @module server/services/shadow-review/shadow-review-service
 */

import { promises as fs } from 'fs';
import path from 'path';
import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { ectdSequences, submissionLeaves, shadowReviewRuns, shadowReviewFindings } from '../../../shared/schema';
import { getGateway } from '../ai-gateway';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import { PROMPTS_DIR } from '../ai-gateway/prompts-dir';
import {
  classifyShadowReviewFailure,
  describeShadowReviewFailure,
  isWaivableShadowReviewFailure,
  type ClassifiedShadowReviewFailure,
  type ShadowReviewFailureErrorCode,
} from './shadow-review-failure';
import { reviewedLeavesDigest } from './shadow-review-coverage';
import {
  buildReviewerInput,
  readLeafTextsForReview,
  titlesOnlyInput,
  type ReviewInputCoverage,
  type ReviewLeaf,
  type ReviewerLeaf,
} from './shadow-review-input';
import { queryableFromDrizzle } from '../../db/drizzle-queryable.js';

const logger = createScopedLogger('shadow-review-service');

export type ReviewLens = 'fda_filing' | 'ema_d120' | 'pmda' | 'nb_mdr' | 'nb_ivdr';
export type FindingSeverity = 'critical' | 'major' | 'minor' | 'info';

export interface ShadowFinding {
  dimension: 'rtf' | 'crl' | 'format' | 'nb';
  severity: FindingSeverity;
  title: string;
  detail?: string | null;
  basis?: string | null;
  recommendation?: string | null;
  leafRef?: string | null;
}

/**
 * What the model returns: findings and a one-line summary. No score. Until
 * 2026-10-05 it also returned rtf/crl "likelihoods" in [0,1], and the run kept
 * the higher of those and the severity aggregate; Rule 2 says the model
 * narrates, so a figure it reports is no longer read (prompt v1.1 stops asking).
 */
export interface ShadowReviewOutput {
  summary: string;
  findings: ShadowFinding[];
}

/** Where a run's RTF/CRL score comes from. v1.0 runs recorded the model's own figure. */
export type ShadowScoreBasis = 'severity_aggregate' | 'model_reported';

export const SHADOW_REVIEW_PROMPT_VERSION = 'shadow-review@v1.2';

/** The basis of a stored run's score, by the prompt version that produced it. */
export function scoreBasisOf(promptVersion: string | null | undefined): ShadowScoreBasis {
  return promptVersion === 'shadow-review@v1.0' ? 'model_reported' : 'severity_aggregate';
}

const SEVERITIES: ReadonlySet<string> = new Set<FindingSeverity>(['critical', 'major', 'minor', 'info']);
const DIMENSIONS: ReadonlySet<string> = new Set<ShadowFinding['dimension']>(['rtf', 'crl', 'format', 'nb']);

/**
 * The model's reply as an assessment the dispatch gate can count, or the reason
 * it is not one. 2026-09-22 (W5/D7).
 *
 * Only a JSON syntax error used to fail a run. A reply with no `findings` array
 * became an empty list and a 'complete' run — no assessment, read by transmit
 * Gate 2 as a clean one. Severity was stored verbatim while the gate counts
 * `severity = 'critical'` exactly, so 'Critical' never blocked. Now `findings`
 * must be an array (an explicit empty list is a real "none found"), and every
 * finding's dimension and severity must be one the gate knows, compared
 * case-insensitively and stored in canonical lowercase. Anything else fails
 * the run: an assessment that cannot be counted is not a completed review.
 */
export function parseShadowReviewOutput(
  raw: unknown,
): { ok: true; output: ShadowReviewOutput } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, reason: 'reply is not a JSON object' };
  const o = raw as Record<string, unknown>;
  if (!Array.isArray(o.findings)) return { ok: false, reason: 'reply has no findings array' };
  const findings: ShadowFinding[] = [];
  for (const [i, f] of o.findings.entries()) {
    if (!f || typeof f !== 'object') return { ok: false, reason: `finding ${i} is not an object` };
    const r = f as Record<string, unknown>;
    const severity = typeof r.severity === 'string' ? r.severity.trim().toLowerCase() : '';
    const dimension = typeof r.dimension === 'string' ? r.dimension.trim().toLowerCase() : '';
    const title = typeof r.title === 'string' ? r.title.trim() : '';
    if (!SEVERITIES.has(severity)) return { ok: false, reason: `finding ${i} has severity ${JSON.stringify(r.severity)}` };
    if (!DIMENSIONS.has(dimension)) return { ok: false, reason: `finding ${i} has dimension ${JSON.stringify(r.dimension)}` };
    if (!title) return { ok: false, reason: `finding ${i} has no title` };
    const text = (v: unknown) => (typeof v === 'string' ? v : null);
    findings.push({
      dimension: dimension as ShadowFinding['dimension'],
      severity: severity as FindingSeverity,
      title,
      detail: text(r.detail),
      basis: text(r.basis),
      recommendation: text(r.recommendation),
      leafRef: text(r.leafRef),
    });
  }
  return {
    ok: true,
    output: {
      findings,
      summary: typeof o.summary === 'string' ? o.summary : '',
    },
  };
}

/**
 * A run that did not complete. Since 2026-10-15 (P-34) a failure is answered
 * with the gateway's own classification of it (gateway-error-map.ts) — a
 * placement or governance refusal is no longer reported as "provider
 * unavailable" — and INTERNAL for a fault of ours. The run records the closed
 * failure code either way (shadow-review-failure.ts).
 */
export class ShadowReviewError extends Error {
  constructor(public code: 'NOT_FOUND' | ShadowReviewFailureErrorCode, message: string) {
    super(message);
    this.name = 'ShadowReviewError';
  }
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { critical: 1, major: 0.6, minor: 0.25, info: 0 };

/**
 * A run's RTF/CRL gate score, from its findings' severities. Pure, and the only
 * score a run records (Rule 2): 0..1 per dimension (rtf = administrative gate:
 * format + rtf findings; crl = substantive gate: crl + nb findings). The
 * severities are the reviewer model's; the arithmetic is not.
 */
export function aggregateRisk(findings: ShadowFinding[]): { rtf: number; crl: number } {
  const score = (dims: string[]): number => {
    const relevant = findings.filter(f => dims.includes(f.dimension));
    if (relevant.length === 0) return 0;
    // A single critical saturates; otherwise a weighted, diminishing sum.
    if (relevant.some(f => f.severity === 'critical')) return 1;
    const sum = relevant.reduce((acc, f) => acc + SEVERITY_WEIGHT[f.severity], 0);
    return Math.min(1, Number((sum / (relevant.length + 1) + 0.15 * Math.min(relevant.length, 3)).toFixed(3)));
  };
  return { rtf: score(['rtf', 'format']), crl: score(['crl', 'nb']) };
}

/**
 * A sequence with no leaves cannot be filed. That is a fact about the sequence,
 * so the server records it as a critical refuse-to-file finding of its own;
 * it used to rest on the prompt asking the model for scores "near 1.0", and a
 * model that answered 0 recorded an empty sequence as fileable.
 */
export const EMPTY_SEQUENCE_FINDING: ShadowFinding = {
  dimension: 'rtf',
  severity: 'critical',
  title: 'The sequence has no leaves',
  detail: 'An assembled sequence with no documents cannot be filed. Recorded by the server, not the reviewer model.',
  basis: null,
  recommendation: 'Place the sequence\'s documents before running a shadow review or dispatching it.',
  leafRef: null,
};

async function loadPrompt(): Promise<string> {
  return fs.readFile(path.join(PROMPTS_DIR, 'shadow-review', 'v1.2.md'), 'utf8');
}

/**
 * The gateway refusals that are about what was SENT (a placement or content
 * policy refusal), as distinct from an outage or a reply that was not an
 * assessment. With the leaves' text sent, a run answered with one of these is
 * retried once with titles only (2026-10-25), and the run records that the text
 * was withheld and why. Without the retry, a sequence whose text the placement
 * policy will not send could never be reviewed, and a policy refusal is not
 * waivable (P-34), so it could never be dispatched.
 */
const TEXT_REFUSALS: ReadonlySet<string> = new Set(['placement_refused', 'policy_blocked']);

export interface RunShadowReviewParams {
  sequenceId: number;
  lens?: ReviewLens;
  organizationId: number;
  userId: number;
}

export interface RunShadowReviewResult {
  runId: number;
  rtfRiskScore: number;
  crlRiskScore: number;
  summary: string;
  findingCount: number;
  /** Always 'severity_aggregate' for a new run (Rule 2). */
  scoreBasis: ShadowScoreBasis;
  /** Whether the run's §11.10(e) AI_GENERATE row was written. The run stands
   *  either way; the route answers this result verbatim, so the caller sees it. */
  auditTrail: AuditRowOutcome;
  /** What the reviewer was given to read (2026-10-25). */
  inputCoverage: ReviewInputCoverage;
  /** False when the leaves changed while the run read them: it covers no
   *  current leaves and the dispatch gate does not count it. */
  coversCurrentLeaves: boolean;
}

export async function runShadowReview(params: RunShadowReviewParams): Promise<RunShadowReviewResult> {
  const { sequenceId, organizationId, userId } = params;
  const lens: ReviewLens = params.lens ?? 'fda_filing';

  const [sequence] = await db
    .select()
    .from(ectdSequences)
    .where(and(eq(ectdSequences.id, sequenceId), eq(ectdSequences.organizationId, organizationId), isNull(ectdSequences.deletedAt)))
    .limit(1);
  if (!sequence) throw new ShadowReviewError('NOT_FOUND', 'Sequence not found for this organization.');

  // The leaves' digest before and after they are read (shadow-review-coverage.ts).
  // A run records the digest only when both agree, so it never claims to cover
  // leaves that changed while it read them.
  const reads = queryableFromDrizzle(db);
  const digestBefore = await reviewedLeavesDigest(reads, sequenceId, organizationId);
  const leaves = await db
    .select()
    .from(submissionLeaves)
    .where(and(eq(submissionLeaves.sequenceId, sequenceId), eq(submissionLeaves.organizationId, organizationId), isNull(submissionLeaves.deletedAt)))
    .orderBy(submissionLeaves.sectionCode, submissionLeaves.id);

  // Open the run row first so a failure is still recorded.
  const [run] = await db
    .insert(shadowReviewRuns)
    .values({
      sequenceId,
      region: sequence.region,
      lens,
      promptVersion: SHADOW_REVIEW_PROMPT_VERSION,
      status: 'running',
      organizationId,
      createdBy: userId,
    })
    .returning({ id: shadowReviewRuns.id });

  const reviewLeaves: ReviewLeaf[] = leaves.map(l => ({
    id: l.id, sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp,
    documentTable: l.documentTable, documentId: l.documentId, documentUuid: l.documentUuid,
  }));
  let input = await reviewerInputFor(reviewLeaves, { runId: run.id, organizationId, sequenceId });
  const digestAfter = await reviewedLeavesDigest(reads, sequenceId, organizationId);
  const leafManifestDigest = digestBefore && digestBefore === digestAfter ? digestBefore : null;

  let output: ShadowReviewOutput;
  let model: string | undefined;
  try {
    const reply = await askReviewerWithTextFallback(input, reviewLeaves, { lens, sequence, organizationId, userId, sequenceId, runId: run.id });
    ({ output, model, input } = reply);
  } catch (err) {
    const failure = classifyShadowReviewFailure(err);
    await recordRunFailure(run.id, failure, { organizationId, userId, lens, sequenceId, model, err, inputCoverage: input.coverage });
    throw new ShadowReviewError(failure.errorCode, failure.message);
  }
  input.coverage.leafDigest = leafManifestDigest ? 'recorded'
    : digestBefore && digestAfter ? 'changed_during_read' : 'not_derivable';

  const findings = leaves.length === 0 ? [EMPTY_SEQUENCE_FINDING, ...output.findings] : output.findings;
  // The gate score is the severity aggregate and nothing else (Rule 2).
  const { rtf: rtfRiskScore, crl: crlRiskScore } = aggregateRisk(findings);

  if (findings.length > 0) {
    await db.insert(shadowReviewFindings).values(
      findings.map(f => ({
        runId: run.id,
        dimension: f.dimension,
        severity: f.severity,
        title: f.title,
        detail: f.detail ?? null,
        basis: f.basis ?? null,
        recommendation: f.recommendation ?? null,
        leafRef: f.leafRef ?? null,
        organizationId,
        createdBy: userId,
      }))
    );
  }

  await db
    .update(shadowReviewRuns)
    .set({
      status: 'complete', model, rtfRiskScore, crlRiskScore, summary: output.summary ?? null,
      leafManifestDigest, inputCoverage: input.coverage, updatedAt: new Date(),
    })
    .where(eq(shadowReviewRuns.id, run.id));

  // WO-16C: was `await auditService.logAction(…)` with its outcome discarded.
  const auditTrail = await recordAuditRow({
    organizationId,
    userId,
    action: 'AI_GENERATE',
    resourceType: 'shadow_review_run',
    resourceId: run.id,
    details: {
      task: 'shadow-review', promptVersion: SHADOW_REVIEW_PROMPT_VERSION, lens, sequenceId, findingCount: findings.length, rtfRiskScore, crlRiskScore,
      leafManifestDigest, textSent: input.coverage.textSent, charsSent: input.coverage.charsSent,
    },
  });

  logger.info('Shadow review complete', { runId: run.id, sequenceId, organizationId, findings: findings.length });
  const summary = output.summary ?? '';
  return {
    runId: run.id, rtfRiskScore, crlRiskScore, summary, findingCount: findings.length, scoreBasis: 'severity_aggregate', auditTrail,
    inputCoverage: input.coverage, coversCurrentLeaves: leafManifestDigest !== null,
  };
}

type ReviewerInput = ReturnType<typeof buildReviewerInput>;
type AskContext = { lens: ReviewLens; sequence: { region: string; type: string | null }; organizationId: number; userId: number; sequenceId: number };

/** The leaves as the reviewer reads them, or their titles when the text cannot be read. */
async function reviewerInputFor(
  leaves: ReviewLeaf[],
  at: { runId: number; organizationId: number; sequenceId: number },
): Promise<ReviewerInput> {
  try {
    return buildReviewerInput(leaves, await readLeafTextsForReview(leaves, at));
  } catch (err) {
    logger.warn('Shadow review could not read the leaves\' text; reviewing titles only', {
      runId: at.runId, sequenceId: at.sequenceId, err: err instanceof Error ? err.message : String(err),
    });
    return titlesOnlyInput(leaves, 'The leaves\' text could not be read on the server.');
  }
}

/**
 * Ask the reviewer; when the gateway refuses the text it was sent (TEXT_REFUSALS),
 * ask once more with titles only. Returns the input the answer was given.
 */
async function askReviewerWithTextFallback(
  input: ReviewerInput,
  leaves: ReviewLeaf[],
  at: AskContext & { runId: number },
): Promise<{ output: ShadowReviewOutput; model?: string; input: ReviewerInput }> {
  try {
    return { ...(await askReviewer(input.leaves, at)), input };
  } catch (err) {
    const refusal = classifyShadowReviewFailure(err);
    if (!input.coverage.textSent || !TEXT_REFUSALS.has(refusal.failureCode)) throw err;
    logger.warn('Shadow review text was refused by the gateway; reviewing titles only', {
      runId: at.runId, sequenceId: at.sequenceId, failureCode: refusal.failureCode,
    });
    const titles = titlesOnlyInput(
      leaves,
      `The AI gateway refused the leaves' text (${describeShadowReviewFailure(refusal.failureCode)}), so the reviewer was sent section codes and titles only.`,
    );
    return { ...(await askReviewer(titles.leaves, at)), input: titles };
  }
}

/** One reviewer call through the gateway, and its reply as a countable assessment. */
async function askReviewer(leaves: ReviewerLeaf[], at: AskContext): Promise<{ output: ShadowReviewOutput; model?: string }> {
  // Inside the caller's try (P-34): a prompt that could not be read used to leave
  // the run 'running' for ever, which also hid it from every "newest run" read.
  const systemPrompt = await loadPrompt();
  const response = await getGateway().route({
    taskType: 'regulatory_review',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: JSON.stringify({ lens: at.lens, region: at.sequence.region, submissionType: at.sequence.type, leaves }) },
    ],
    jsonMode: true,
    temperature: 0.2,
    maxTokens: 4096,
    promptVersion: SHADOW_REVIEW_PROMPT_VERSION,
    organizationId: at.organizationId,
    userId: at.userId,
    callerModule: 'shadow-review-service',
    metadata: { task: 'shadow-review', sequenceId: at.sequenceId, lens: at.lens },
  });
  // The gateway's fixed demo-mode reply (no provider configured) is not a
  // model's reply: record it as what it is, not as an invalid assessment (J4
  // human test, 2026-11-06). Named, not constructed from the gateway class, so
  // failureCodeOf tells it apart the way it tells every gateway error apart.
  if ((response as { deterministic?: boolean }).deterministic === true || response.model === 'demo-mode') {
    throw Object.assign(new Error('No AI provider is configured on this deployment, so no review was performed.'), { name: 'GatewayNoProviderError' });
  }
  const cleaned = response.content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  const parsed = parseShadowReviewOutput(JSON.parse(cleaned));
  if (!parsed.ok) {
    throw new ShadowReviewError('INVALID_AI_RESPONSE', `Shadow review returned no countable assessment (${parsed.reason}).`);
  }
  return { output: parsed.output, model: response.model };
}

/**
 * Mark a run failed with its closed failure code, and write its §11.10(e) row:
 * AI_GENERATE_FAILED on the run, naming the code and whether it is waivable
 * (P-34). Before 2026-10-15 a failed run kept no reason and wrote no row, so
 * the failed run a waiver relies on was not in the audit chain. Neither write
 * may replace the failure the caller is about to be told, so each is logged
 * and passed over if it fails.
 */
async function recordRunFailure(
  runId: number,
  failure: ClassifiedShadowReviewFailure,
  at: { organizationId: number; userId: number; lens: ReviewLens; sequenceId: number; model?: string; err: unknown; inputCoverage?: ReviewInputCoverage },
): Promise<void> {
  const { failureCode } = failure;
  try {
    await db
      .update(shadowReviewRuns)
      .set({ status: 'failed', failureCode, model: at.model ?? null, inputCoverage: at.inputCoverage ?? null, updatedAt: new Date() })
      .where(eq(shadowReviewRuns.id, runId));
  } catch (writeErr) {
    logger.error('A failed shadow review could not be recorded as failed', {
      runId, failureCode, err: writeErr instanceof Error ? writeErr.message : String(writeErr),
    });
  }
  const audit = await recordAuditRow({
    organizationId: at.organizationId,
    userId: at.userId,
    action: 'AI_GENERATE_FAILED',
    resourceType: 'shadow_review_run',
    resourceId: runId,
    details: {
      task: 'shadow-review',
      promptVersion: SHADOW_REVIEW_PROMPT_VERSION,
      lens: at.lens,
      sequenceId: at.sequenceId,
      failureCode,
      waivable: isWaivableShadowReviewFailure(failureCode),
    },
  });
  // A waiver may later rely on this run (P-34): a failure the chain does not
  // hold is said, loudly, rather than passed over in silence.
  if (!audit.persisted) {
    logger.error('A failed shadow review has no §11.10(e) row: AI_GENERATE_FAILED was not persisted', {
      runId, sequenceId: at.sequenceId, organizationId: at.organizationId, failureCode, reason: audit.message,
    });
  }
  // The cause stays in the log; the caller gets the classified sentence.
  logger.warn('Shadow review failed', {
    runId, sequenceId: at.sequenceId, organizationId: at.organizationId, failureCode,
    err: at.err instanceof Error ? at.err.message : String(at.err),
  });
}

export default { runShadowReview, aggregateRisk, parseShadowReviewOutput, ShadowReviewError };

// ── Reads (tenant-scoped) ─────────────────────────────────────────────────

/** List shadow-review runs for a sequence (newest first). */
export async function listShadowReviewRuns(sequenceId: number, ctx: { organizationId: number }) {
  return db
    .select()
    .from(shadowReviewRuns)
    .where(
      and(
        eq(shadowReviewRuns.sequenceId, sequenceId),
        eq(shadowReviewRuns.organizationId, ctx.organizationId),
        isNull(shadowReviewRuns.deletedAt)
      )
    )
    .orderBy(desc(shadowReviewRuns.createdAt));
}

/** Get the findings of a shadow-review run (tenant-scoped). */
export async function getShadowReviewFindings(runId: number, ctx: { organizationId: number }) {
  return db
    .select()
    .from(shadowReviewFindings)
    .where(
      and(
        eq(shadowReviewFindings.runId, runId),
        eq(shadowReviewFindings.organizationId, ctx.organizationId),
        isNull(shadowReviewFindings.deletedAt)
      )
    )
    // Severity is text; order by explicit rank so critical → major → minor → info
    // (not alphabetical, which would surface "info" above "major").
    .orderBy(
      sql`CASE ${shadowReviewFindings.severity} WHEN 'critical' THEN 0 WHEN 'major' THEN 1 WHEN 'minor' THEN 2 ELSE 3 END`
    );
}
