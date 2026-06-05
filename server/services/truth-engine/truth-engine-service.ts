/**
 * Truth Engine service (spec §6.4)
 *
 *  - traceProvenance:   deterministic read of the provenance graph for a section
 *    (submission_evidence_links), tenant-scoped. The LLM never invents sources;
 *    the graph is data.
 *  - runConsistencyCheck: cross-document consistency via the consistency-check
 *    gateway task, persisting verdicts into consistency_findings, audited.
 *  - listConsistencyFindings: tenant-scoped read of stored findings.
 *
 * All reads/writes are tenant-scoped from the caller's organizationId; the AI
 * call is audited as AI_GENERATE.
 *
 * @module server/services/truth-engine/truth-engine-service
 */

import { promises as fs } from 'fs';
import path from 'path';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../db';
import { submissions } from '../../../shared/schema';
import { submissionEvidenceLinks, consistencyFindings } from '../../../shared/schema/evidence';
import type { SubmissionEvidenceLink, ConsistencyFinding } from '../../../shared/types/database';
import { getGateway } from '../ai-gateway';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('truth-engine-service');
const PROMPTS_DIR = path.join(__dirname, '..', 'ai-gateway', 'prompts');

export class TruthEngineError extends Error {
  constructor(public code: 'NOT_FOUND' | 'INVALID_AI_RESPONSE' | 'PROVIDER_UNAVAILABLE', message: string) {
    super(message);
    this.name = 'TruthEngineError';
  }
}

export interface TruthCtx {
  organizationId: number;
  userId: number;
}

async function assertOwnedSubmission(submissionId: number, organizationId: number): Promise<void> {
  const [row] = await db
    .select({ id: submissions.id })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.organizationId, organizationId), isNull(submissions.deletedAt)))
    .limit(1);
  if (!row) throw new TruthEngineError('NOT_FOUND', 'Submission not found for this organization.');
}

// ── Provenance (deterministic read) ─────────────────────────────────────────

export interface ProvenanceTrace {
  submissionId: number;
  targetSectionCode: string;
  links: SubmissionEvidenceLink[];
}

/** Read the provenance links for a section (tenant-scoped). Pure data, no LLM. */
export async function traceProvenance(
  params: { submissionId: number; targetSectionCode: string },
  ctx: TruthCtx
): Promise<ProvenanceTrace> {
  await assertOwnedSubmission(params.submissionId, ctx.organizationId);
  const links = await db
    .select()
    .from(submissionEvidenceLinks)
    .where(
      and(
        eq(submissionEvidenceLinks.submissionId, params.submissionId),
        eq(submissionEvidenceLinks.targetSectionCode, params.targetSectionCode),
        eq(submissionEvidenceLinks.organizationId, ctx.organizationId),
        isNull(submissionEvidenceLinks.deletedAt)
      )
    )
    .orderBy(desc(submissionEvidenceLinks.confidence));
  return { submissionId: params.submissionId, targetSectionCode: params.targetSectionCode, links: links as SubmissionEvidenceLink[] };
}

// ── Consistency check (AI + persistence) ────────────────────────────────────

let consistencyPrompt: string | null = null;
async function loadConsistencyPrompt(): Promise<string> {
  if (consistencyPrompt) return consistencyPrompt;
  consistencyPrompt = await fs.readFile(path.join(PROMPTS_DIR, 'consistency-check', 'v1.0.md'), 'utf8');
  return consistencyPrompt;
}

interface ConsistencyAiResult {
  findings: Array<{ leftRef: string; rightRef: string; status: 'match' | 'conflict'; detail?: string }>;
}

export interface RunConsistencyCheckParams {
  submissionId: number;
  dimension: string;
  left: { ref: string; text: string };
  right: Array<{ ref: string; text: string }>;
}

/** Run a consistency check via the gateway and persist the verdicts. */
export async function runConsistencyCheck(
  params: RunConsistencyCheckParams,
  ctx: TruthCtx
): Promise<ConsistencyFinding[]> {
  await assertOwnedSubmission(params.submissionId, ctx.organizationId);

  const systemPrompt = await loadConsistencyPrompt();
  let result: ConsistencyAiResult;
  try {
    const response = await getGateway().route({
      taskType: 'regulatory_review',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: JSON.stringify({ dimension: params.dimension, left: params.left, right: params.right }) },
      ],
      jsonMode: true,
      temperature: 0.1,
      maxTokens: 3000,
      promptVersion: 'consistency-check@v1.0',
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      callerModule: 'truth-engine-service',
      metadata: { task: 'consistency-check', submissionId: params.submissionId },
    });
    const cleaned = response.content.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
    result = JSON.parse(cleaned) as ConsistencyAiResult;
  } catch (err) {
    if (err instanceof SyntaxError) throw new TruthEngineError('INVALID_AI_RESPONSE', 'The AI response was not valid JSON.');
    throw new TruthEngineError('PROVIDER_UNAVAILABLE', `The AI request could not be completed: ${err instanceof Error ? err.message : String(err)}`);
  }

  const findings = Array.isArray(result.findings) ? result.findings : [];
  const inserted: ConsistencyFinding[] = [];
  for (const f of findings) {
    const status = f.status === 'conflict' ? 'conflict' : 'match';
    const [row] = await db
      .insert(consistencyFindings)
      .values({
        submissionId: params.submissionId,
        dimension: params.dimension,
        leftRef: f.leftRef ?? params.left.ref,
        rightRef: f.rightRef ?? '',
        status,
        detail: f.detail ?? null,
        organizationId: ctx.organizationId,
        createdBy: ctx.userId,
      })
      .returning();
    inserted.push(row as ConsistencyFinding);
  }

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'AI_GENERATE',
    resourceType: 'submission',
    resourceId: params.submissionId,
    details: {
      task: 'consistency-check',
      promptVersion: 'consistency-check@v1.0',
      dimension: params.dimension,
      findingCount: inserted.length,
      conflicts: inserted.filter((f) => f.status === 'conflict').length,
    },
  });
  logger.info('Ran consistency check', { submissionId: params.submissionId, organizationId: ctx.organizationId, findings: inserted.length });
  return inserted;
}

export async function listConsistencyFindings(
  submissionId: number,
  ctx: { organizationId: number }
): Promise<ConsistencyFinding[]> {
  const rows = await db
    .select()
    .from(consistencyFindings)
    .where(
      and(
        eq(consistencyFindings.submissionId, submissionId),
        eq(consistencyFindings.organizationId, ctx.organizationId),
        isNull(consistencyFindings.deletedAt)
      )
    )
    .orderBy(desc(consistencyFindings.createdAt));
  return rows as ConsistencyFinding[];
}

export default { traceProvenance, runConsistencyCheck, listConsistencyFindings, TruthEngineError };
