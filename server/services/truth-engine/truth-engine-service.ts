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
 *    verdict (CLAUDE.md Rule 2). Until 2026-10-29 it compared whatever text the
 *    caller sent, so a finding recorded against a submission could describe
 *    text that was not in it. It now takes saved authoring sections by id and
 *    reads their text here, under the tenant and the submission's project
 *    (slice G4, docs/design/PARITY_WEAVE_VEEVA_BASICS_2026-10-29.md).
 *  - listConsistencyFindings: tenant-scoped read of stored findings.
 *
 * All reads/writes are tenant-scoped from the caller's organizationId; the
 * check is audited as CONSISTENCY_CHECK.
 *
 * @module server/services/truth-engine/truth-engine-service
 */

import { eq, and, isNull, desc, sql } from 'drizzle-orm';
import { db } from '../../db';
import { submissions } from '../../../shared/schema';
import { submissionEvidenceLinks, consistencyFindings } from '../../../shared/schema/evidence';
import type { SubmissionEvidenceLink, ConsistencyFinding } from '../../../shared/types/database';
import type { GatewayErrorCode } from '../ai-gateway/gateway-error-map';
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import { compareLabelledFigures, type FigureNotCompared } from './figure-consistency';
import { htmlToPlainText } from '../ectd/leaf-pdf-renderer';

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

/** The submission, in this organization; its project scopes what a check may read. */
async function assertOwnedSubmission(submissionId: number, organizationId: number): Promise<{ programId: string | null }> {
  const [row] = await db
    .select({ id: submissions.id, programId: submissions.programId })
    .from(submissions)
    .where(and(eq(submissions.id, submissionId), eq(submissions.organizationId, organizationId), isNull(submissions.deletedAt)))
    .limit(1);
  if (!row) throw new TruthEngineError('NOT_FOUND', 'Submission not found for this organization.');
  return { programId: (row as { programId?: string | null }).programId ?? null };
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

/** A saved part of the dossier, named by its authoring section id. Its text is
 *  read here, never taken from the caller. */
export interface ConsistencyRef { sectionId: string }

export interface RunConsistencyCheckParams {
  submissionId: number;
  /** What the caller is checking, recorded with each finding. */
  dimension: string;
  left: ConsistencyRef;
  right: ConsistencyRef[];
}

/**
 * The saved text of each named section, with the reference a finding records.
 * Tenant-scoped on both the section and its document. A section whose document
 * belongs to another project than the submission's is refused, as is one that
 * does not exist here: a finding must describe this submission's own text.
 */
async function readSavedSections(
  ids: string[], organizationId: number, programId: string | null,
): Promise<Map<string, { ref: string; text: string }>> {
  const unique = [...new Set(ids)];
  const res = await db.execute(sql`
    SELECT s.id::text AS id, s.code, s.title, s.content, to_jsonb(d)->>'client_program_id' AS program_id
      FROM authoring_sections s
      JOIN authoring_documents d ON d.id = s.doc_id
     WHERE s.id::text IN (${sql.join(unique.map((id) => sql`${id}`), sql`, `)})
       AND s.tenant_id = ${organizationId} AND d.tenant_id = ${organizationId}`);
  const rows = ((res as { rows?: unknown[] }).rows ?? (Array.isArray(res) ? res : [])) as Array<{
    id: string; code: string | null; title: string | null; content: string | null; program_id: string | null;
  }>;
  const out = new Map<string, { ref: string; text: string }>();
  for (const r of rows) {
    if (programId && r.program_id && r.program_id !== programId) {
      throw new TruthEngineError('NOT_FOUND', `Section ${r.id} is not in this submission's project.`);
    }
    const label = [r.code, r.title].filter(Boolean).join(' ') || 'Untitled section';
    out.set(r.id, { ref: `${label} [${r.id}]`, text: htmlToPlainText(r.content ?? '').trim() });
  }
  const missing = unique.filter((id) => !out.has(id));
  if (missing.length) throw new TruthEngineError('NOT_FOUND', `Section ${missing.join(', ')} was not found in this organization.`);
  return out;
}

export interface ConsistencyCheckResult {
  findings: ConsistencyFinding[];
  /**
   * Each figure of the claim that got no verdict against a source, and why
   * (not stated there, stated more than once, a bound, an arm-level count).
   * No finding is recorded for it — which is not a finding of consistency,
   * and the caller says so.
   */
  notCompared: FigureNotCompared[];
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
  const { programId } = await assertOwnedSubmission(params.submissionId, ctx.organizationId);
  const saved = await readSavedSections(
    [params.left.sectionId, ...params.right.map((r) => r.sectionId)], ctx.organizationId, programId,
  );
  const left = saved.get(params.left.sectionId)!;
  if (!left.text) throw new TruthEngineError('NOT_FOUND', `The claim section ${params.left.sectionId} has no saved text to compare.`);
  const right = params.right.map((r) => saved.get(r.sectionId)!);

  const { findings, notCompared } = compareLabelledFigures(left, right);
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
      claimSection: params.left.sectionId,
      sourceSections: params.right.map((r) => r.sectionId),
      findingCount: inserted.length,
      conflicts: inserted.filter((f) => f.status === 'conflict').length,
      notCompared: notCompared.length,
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
