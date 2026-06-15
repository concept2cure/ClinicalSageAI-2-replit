/**
 * IND amendment persistence service (21 CFR 312.30 / 312.31).
 *
 * Durable, tenant-scoped, audited storage for planned protocol / information
 * amendments, so an RA team can track each amendment through its lifecycle
 * (draft → filed). Every read/write is scoped to the caller's organizationId
 * (never request input); mutations are audited — mirroring
 * server/services/ind-lifecycle/ind-annual-report-persistence.ts.
 *
 * A draft is created by running the pure `planIndAmendment` planner over the
 * supplied changed documents; filing (via the existing /amendment/file flow)
 * marks the stored draft filed and links its `amendment` eCTD sequence.
 *
 * Unlike safety / annual reports, an amendment is event-driven (no statutory
 * clock), so there is no overdue feed.
 *
 * @module server/services/ind-lifecycle/ind-amendment-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { indAmendments, type IndAmendmentRow } from '../../../shared/schema/ind-amendments';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import { planIndAmendment, type IndAmendmentInput } from './ind-amendment-service';

const logger = createScopedLogger('ind-amendment-persistence');

export type AmendmentCtx = { organizationId: number; userId: number };

export class AmendmentError extends Error {
  constructor(public code: 'NOT_FOUND', message: string) {
    super(message);
    this.name = 'AmendmentError';
  }
}

export interface CreateAmendmentDraftInput {
  submissionId: number;
  /** The 312.30/.31 plan inputs (projectId, indNumber, changedDocuments). */
  amendment: Omit<IndAmendmentInput, 'organizationId'>;
}

/** Plan an amendment and persist it as a tracked draft (audited). */
export async function createAmendmentDraft(
  input: CreateAmendmentDraftInput,
  ctx: AmendmentCtx,
): Promise<IndAmendmentRow> {
  const plan = planIndAmendment({ ...input.amendment, organizationId: String(ctx.organizationId) });

  const [row] = await db
    .insert(indAmendments)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      indNumber: plan.indNumber,
      projectId: plan.projectId,
      amendmentClasses: plan.amendmentClasses,
      status: 'draft',
      leafCount: plan.leaves.length,
      warningCount: plan.warnings.length,
      plan: plan as unknown as Record<string, unknown>,
      createdBy: ctx.userId,
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_AMENDMENT_DRAFTED',
    resourceType: 'ind_amendment',
    resourceId: row.id,
    details: {
      submissionId: input.submissionId,
      indNumber: plan.indNumber,
      amendmentClasses: plan.amendmentClasses,
      leafCount: plan.leaves.length,
    },
  });
  logger.info('Drafted IND amendment', {
    submissionId: input.submissionId,
    amendmentClasses: plan.amendmentClasses,
    leafCount: plan.leaves.length,
    organizationId: ctx.organizationId,
  });
  return row as IndAmendmentRow;
}

/** List a submission's amendments (org-scoped, stable order). */
export async function listAmendments(
  submissionId: number,
  ctx: { organizationId: number },
): Promise<IndAmendmentRow[]> {
  return (await db
    .select()
    .from(indAmendments)
    .where(and(eq(indAmendments.organizationId, ctx.organizationId), eq(indAmendments.submissionId, submissionId)))
    .orderBy(asc(indAmendments.createdAt))) as IndAmendmentRow[];
}

/** Fetch one amendment (org-scoped). */
export async function getAmendment(id: string, ctx: { organizationId: number }): Promise<IndAmendmentRow> {
  const [row] = await db
    .select()
    .from(indAmendments)
    .where(and(eq(indAmendments.id, id), eq(indAmendments.organizationId, ctx.organizationId)));
  if (!row) throw new AmendmentError('NOT_FOUND', 'Amendment not found.');
  return row as IndAmendmentRow;
}

/** Mark a stored draft filed and link its `amendment` eCTD sequence (audited). */
export async function markAmendmentFiled(
  id: string,
  sequenceId: number,
  ctx: AmendmentCtx,
): Promise<IndAmendmentRow> {
  const [row] = await db
    .update(indAmendments)
    .set({ status: 'filed', sequenceId, filedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(indAmendments.id, id), eq(indAmendments.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new AmendmentError('NOT_FOUND', 'Amendment not found.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_AMENDMENT_FILED',
    resourceType: 'ind_amendment',
    resourceId: row.id,
    details: { sequenceId },
  });
  return row as IndAmendmentRow;
}
