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
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../db';
import { ectdSequences, submissionLeaves, shadowReviewRuns, shadowReviewFindings } from '../../../shared/schema';
import { getGateway } from '../ai-gateway';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('shadow-review-service');
const PROMPTS_DIR = path.join(__dirname, '..', 'ai-gateway', 'prompts');

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

export interface ShadowReviewOutput {
  rtfRiskScore: number;
  crlRiskScore: number;
  summary: string;
  findings: ShadowFinding[];
}

export class ShadowReviewError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_AI_RESPONSE' | 'PROVIDER_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'ShadowReviewError';
  }
}

const SEVERITY_WEIGHT: Record<FindingSeverity, number> = { critical: 1, major: 0.6, minor: 0.25, info: 0 };

/**
 * Deterministic fallback risk from findings, used to sanity-bound the model's
 * self-reported scores. Pure. Returns 0..1 per dimension (rtf = administrative
 * gate: format + rtf findings; crl = substantive gate: crl + nb findings).
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

function clamp01(n: unknown, fallback: number): number {
  const v = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(0, Math.min(1, v));
}

async function loadPrompt(): Promise<string> {
  return fs.readFile(path.join(PROMPTS_DIR, 'shadow-review', 'v1.0.md'), 'utf8');
}

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

  const leaves = await db
    .select()
    .from(submissionLeaves)
    .where(and(eq(submissionLeaves.sequenceId, sequenceId), eq(submissionLeaves.organizationId, organizationId), isNull(submissionLeaves.deletedAt)));

  // Open the run row first so a failure is still recorded.
  const [run] = await db
    .insert(shadowReviewRuns)
    .values({
      sequenceId,
      region: sequence.region,
      lens,
      promptVersion: 'shadow-review@v1.0',
      status: 'running',
      organizationId,
      createdBy: userId,
    })
    .returning();

  const systemPrompt = await loadPrompt();
  const userPayload = JSON.stringify({
    lens,
    region: sequence.region,
    submissionType: sequence.type,
    leaves: leaves.map(l => ({ sectionCode: l.sectionCode, title: l.title, lifecycleOp: l.lifecycleOp })),
  });

  let output: ShadowReviewOutput;
  let model: string | undefined;
  try {
    const response = await getGateway().route({
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPayload },
      ],
      jsonMode: true,
      temperature: 0.2,
      maxTokens: 4096,
      promptVersion: 'shadow-review@v1.0',
      organizationId,
      userId,
      callerModule: 'shadow-review-service',
      metadata: { task: 'shadow-review', sequenceId, lens },
    });
    model = response.model;
    const cleaned = response.content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    output = JSON.parse(cleaned) as ShadowReviewOutput;
  } catch (err) {
    await db.update(shadowReviewRuns).set({ status: 'failed', updatedAt: new Date() }).where(eq(shadowReviewRuns.id, run.id));
    if (err instanceof SyntaxError) throw new ShadowReviewError('INVALID_AI_RESPONSE', 'Shadow review returned invalid JSON.');
    throw new ShadowReviewError('PROVIDER_UNAVAILABLE', 'Shadow review could not be completed.');
  }

  const findings = Array.isArray(output.findings) ? output.findings : [];
  // Bound the model's self-reported risk by the deterministic aggregate (use the higher).
  const agg = aggregateRisk(findings);
  const rtfRiskScore = Math.max(clamp01(output.rtfRiskScore, agg.rtf), agg.rtf);
  const crlRiskScore = Math.max(clamp01(output.crlRiskScore, agg.crl), agg.crl);

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
    .set({ status: 'complete', model, rtfRiskScore, crlRiskScore, summary: output.summary ?? null, updatedAt: new Date() })
    .where(eq(shadowReviewRuns.id, run.id));

  await auditService.logAction({
    organizationId,
    userId,
    action: 'AI_GENERATE',
    resourceType: 'shadow_review_run',
    resourceId: run.id,
    details: { task: 'shadow-review', promptVersion: 'shadow-review@v1.0', lens, sequenceId, findingCount: findings.length, rtfRiskScore, crlRiskScore },
  });

  logger.info('Shadow review complete', { runId: run.id, sequenceId, organizationId, findings: findings.length });
  return { runId: run.id, rtfRiskScore, crlRiskScore, summary: output.summary ?? '', findingCount: findings.length };
}

export default { runShadowReview, aggregateRisk, ShadowReviewError };

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
    .orderBy(shadowReviewFindings.severity);
}
