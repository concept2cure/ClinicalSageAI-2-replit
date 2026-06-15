/**
 * Regulatory assessment persistence service.
 *
 * Durable, tenant-scoped, audited storage for the verdict snapshots produced by
 * the deterministic RI/CDISC/eTMF services (strategy brief, package readiness,
 * TMF completeness, market readiness, …). Every read/write is scoped to the
 * caller's organizationId (never request input); creation is audited — mirroring
 * server/services/ind-lifecycle/ind-dispatch-snapshot-service.ts. Append-only.
 *
 * This gives a program an auditable history of its regulatory posture over time,
 * and a one-query "latest verdict of type X" for dashboards.
 *
 * @module server/services/regulatory-assessments/regulatory-assessment-persistence
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../db';
import { regulatoryAssessments, type RegulatoryAssessment } from '../../../shared/schema/regulatory-assessments';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('regulatory-assessment-persistence');

export type AssessmentCtx = { organizationId: number; userId: number };

export class AssessmentError extends Error {
  constructor(public code: 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'AssessmentError';
  }
}

export interface CreateAssessmentInput {
  submissionId: number;
  assessmentType: string;
  /** Headline verdict (optional — some assessments have no boolean readiness). */
  ready?: boolean | null;
  /** Small summary for listing. */
  summary?: Record<string, unknown>;
  /** Full assessment result. */
  result: Record<string, unknown>;
}

/** Persist an assessment result as an audited, point-in-time snapshot. */
export async function createAssessment(input: CreateAssessmentInput, ctx: AssessmentCtx): Promise<RegulatoryAssessment> {
  const [row] = await db
    .insert(regulatoryAssessments)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      assessmentType: input.assessmentType,
      ready: input.ready ?? null,
      summary: input.summary ?? {},
      result: input.result,
      createdBy: ctx.userId,
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'REGULATORY_ASSESSMENT_RECORDED',
    resourceType: 'regulatory_assessment',
    resourceId: row.id,
    details: { submissionId: input.submissionId, assessmentType: input.assessmentType, ready: input.ready ?? null },
  });
  logger.info('Recorded regulatory assessment', { submissionId: input.submissionId, assessmentType: input.assessmentType, organizationId: ctx.organizationId });
  return row as RegulatoryAssessment;
}

/** List a submission's assessments, newest first; optionally filtered by type. */
export async function listAssessments(
  submissionId: number,
  ctx: { organizationId: number },
  opts: { assessmentType?: string } = {},
): Promise<RegulatoryAssessment[]> {
  const where = opts.assessmentType
    ? and(
        eq(regulatoryAssessments.organizationId, ctx.organizationId),
        eq(regulatoryAssessments.submissionId, submissionId),
        eq(regulatoryAssessments.assessmentType, opts.assessmentType),
      )
    : and(eq(regulatoryAssessments.organizationId, ctx.organizationId), eq(regulatoryAssessments.submissionId, submissionId));

  return (await db.select().from(regulatoryAssessments).where(where).orderBy(desc(regulatoryAssessments.createdAt))) as RegulatoryAssessment[];
}

/** The latest assessment of a given type for a submission (or null). Org-scoped. */
export async function getLatestAssessment(
  submissionId: number,
  assessmentType: string,
  ctx: { organizationId: number },
): Promise<RegulatoryAssessment | null> {
  const [row] = await db
    .select()
    .from(regulatoryAssessments)
    .where(
      and(
        eq(regulatoryAssessments.organizationId, ctx.organizationId),
        eq(regulatoryAssessments.submissionId, submissionId),
        eq(regulatoryAssessments.assessmentType, assessmentType),
      ),
    )
    .orderBy(desc(regulatoryAssessments.createdAt))
    .limit(1);
  return (row as RegulatoryAssessment) ?? null;
}

/** Fetch one assessment by id (org-scoped). */
export async function getAssessment(id: string, ctx: { organizationId: number }): Promise<RegulatoryAssessment> {
  const [row] = await db
    .select()
    .from(regulatoryAssessments)
    .where(and(eq(regulatoryAssessments.id, id), eq(regulatoryAssessments.organizationId, ctx.organizationId)));
  if (!row) throw new AssessmentError('NOT_FOUND', 'Assessment not found.');
  return row as RegulatoryAssessment;
}
