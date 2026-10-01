/**
 * Truth Engine service (spec §6.4)
 *
 *  - traceProvenance:   deterministic read of the provenance graph for a section
 *    (submission_evidence_links), tenant-scoped. The LLM never invents sources;
 *    the graph is data.
 *  - runConsistencyCheck: cross-document consistency of labelled figures by the
 *    deterministic reconciliation engine (figure-consistency.ts), persisting
 *    verdicts into consistency_findings, audited. Until 2026-10-01 a model
 *    labelled each pair match/conflict and its JSON was persisted as the
 *    verdict (CLAUDE.md Rule 2).
 *  - listConsistencyFindings: tenant-scoped read of stored findings.
 *
 * All reads/writes are tenant-scoped from the caller's organizationId; the
 * check is audited as CONSISTENCY_CHECK.
 *
 * @module server/services/truth-engine/truth-engine-service
 */

import { eq, and, isNull, desc } from 'drizzle-orm';
import { db } from '../../db';
import { submissions } from '../../../shared/schema';
import { submissionEvidenceLinks, consistencyFindings } from '../../../shared/schema/evidence';
import type { SubmissionEvidenceLink, ConsistencyFinding } from '../../../shared/types/database';
import type { GatewayErrorCode } from '../ai-gateway/gateway-error-map';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import { compareLabelledFigures } from './figure-consistency';

const logger = createScopedLogger('truth-engine-service');

export class TruthEngineError extends Error {
  constructor(
    public code: 'NOT_FOUND' | GatewayErrorCode,
    message: string
  ) {
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

// ── Consistency check (deterministic + persistence) ─────────────────────────

export interface RunConsistencyCheckParams {
  submissionId: number;
  /** What the caller is checking, recorded with each finding. */
  dimension: string;
  left: { ref: string; text: string };
  right: Array<{ ref: string; text: string }>;
}

export interface ConsistencyCheckResult {
  findings: ConsistencyFinding[];
  /**
   * Sources that shared no labelled figure with the claim, so nothing was
   * compared. No finding is recorded for them — which is not a finding of
   * consistency, and the caller says so.
   */
  notCompared: string[];
  /**
   * Whether the §11.10(e) row for this check exists. The findings are
   * persisted either way; the caller is told, and says so.
   */
  auditTrail: AuditRowOutcome;
}

/** Compare the claim's labelled figures with each source's and persist the verdicts. */
export async function runConsistencyCheck(
  params: RunConsistencyCheckParams,
  ctx: TruthCtx
): Promise<ConsistencyCheckResult> {
  await assertOwnedSubmission(params.submissionId, ctx.organizationId);

  const { findings, notCompared } = compareLabelledFigures(params.left, params.right);
  const inserted: ConsistencyFinding[] = [];
  for (const f of findings) {
    const [row] = await db
      .insert(consistencyFindings)
      .values({
        submissionId: params.submissionId,
        dimension: params.dimension,
        leftRef: f.leftRef,
        rightRef: f.rightRef,
        status: f.status,
        detail: f.detail,
        organizationId: ctx.organizationId,
        createdBy: ctx.userId,
      })
      .returning();
    inserted.push(row as ConsistencyFinding);
  }

  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'CONSISTENCY_CHECK',
    resourceType: 'submission',
    resourceId: params.submissionId,
    details: {
      task: 'consistency-check',
      engine: 'dossier-number-reconciliation',
      dimension: params.dimension,
      findingCount: inserted.length,
      conflicts: inserted.filter((f) => f.status === 'conflict').length,
      notCompared,
    },
  });
  logger.info('Ran consistency check', {
    submissionId: params.submissionId,
    organizationId: ctx.organizationId,
    findings: inserted.length,
    notCompared: notCompared.length,
  });
  return { findings: inserted, notCompared, auditTrail };
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
