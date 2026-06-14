/**
 * IND safety-report persistence service (21 CFR 312.32).
 *
 * Durable, tenant-scoped, audited storage for expedited IND Safety Reports, so a
 * PV/RA team can track each report through its lifecycle (draft → filed) and
 * surface overdue ones. Every read/write is scoped to the caller's
 * organizationId (never request input); mutations are audited — mirroring
 * server/services/ind-lifecycle/ind-cross-reference-persistence.ts.
 *
 * A draft is created from an intake AdverseEvent by classifying it (312.32(c))
 * and building its document model; only expedited (7-/15-day) events are
 * persisted as reports (a NOT_REPORTABLE event has no expedited report). Filing
 * the report (via the existing /safety-report/file flow) marks the stored draft
 * filed and links its eCTD sequence.
 *
 * @module server/services/ind-lifecycle/ind-safety-report-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { indSafetyReports, type IndSafetyReportRow } from '../../../shared/schema/ind-safety-reports';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import {
  assembleIndSafetyReport,
  type AggregateContext,
} from './ind-safety-report-service';
import type { AdverseEvent, ICSR } from '../compliance/pharmacovigilanceService';

const logger = createScopedLogger('ind-safety-report-persistence');

export type SafetyReportCtx = { organizationId: number; userId: number };

export class SafetyReportError extends Error {
  constructor(public code: 'NOT_FOUND' | 'NOT_REPORTABLE', message: string) {
    super(message);
    this.name = 'SafetyReportError';
  }
}

export interface CreateSafetyReportDraftInput {
  submissionId: number;
  event: AdverseEvent;
  icsr?: ICSR | null;
  aggregateContext?: AggregateContext;
  now?: Date;
}

/**
 * Classify an event, assemble its report, and persist it as a tracked draft.
 * Throws NOT_REPORTABLE when the event is not an expedited IND Safety Report.
 */
export async function createSafetyReportDraft(
  input: CreateSafetyReportDraftInput,
  ctx: SafetyReportCtx,
): Promise<IndSafetyReportRow> {
  const { classification, document } = assembleIndSafetyReport(input.event, {
    icsr: input.icsr ?? null,
    aggregateContext: input.aggregateContext,
    now: input.now,
  });
  if (classification.obligation === 'NOT_REPORTABLE') {
    throw new SafetyReportError('NOT_REPORTABLE', 'Event is not an expedited IND Safety Report; nothing to persist.');
  }

  const [row] = await db
    .insert(indSafetyReports)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      adverseEventId: input.event.id,
      obligation: classification.obligation,
      reportingWindowDays: classification.reportingWindowDays,
      deadline: classification.deadline,
      regulatoryBasis: classification.regulatoryBasis,
      status: 'draft',
      classification: classification as unknown as Record<string, unknown>,
      document: document as unknown as Record<string, unknown>,
      createdBy: ctx.userId,
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_SAFETY_REPORT_DRAFTED',
    resourceType: 'ind_safety_report',
    resourceId: row.id,
    details: { submissionId: input.submissionId, obligation: classification.obligation, adverseEventId: input.event.id },
  });
  logger.info('Drafted IND safety report', { submissionId: input.submissionId, obligation: classification.obligation, organizationId: ctx.organizationId });
  return row as IndSafetyReportRow;
}

/** List a submission's safety reports (org-scoped, stable order). */
export async function listSafetyReports(
  submissionId: number,
  ctx: { organizationId: number },
): Promise<IndSafetyReportRow[]> {
  return (await db
    .select()
    .from(indSafetyReports)
    .where(and(eq(indSafetyReports.organizationId, ctx.organizationId), eq(indSafetyReports.submissionId, submissionId)))
    .orderBy(asc(indSafetyReports.createdAt))) as IndSafetyReportRow[];
}

/** Fetch one safety report (org-scoped). */
export async function getSafetyReport(id: string, ctx: { organizationId: number }): Promise<IndSafetyReportRow> {
  const [row] = await db
    .select()
    .from(indSafetyReports)
    .where(and(eq(indSafetyReports.id, id), eq(indSafetyReports.organizationId, ctx.organizationId)));
  if (!row) throw new SafetyReportError('NOT_FOUND', 'Safety report not found.');
  return row as IndSafetyReportRow;
}

/** Mark a stored draft filed and link its eCTD sequence (audited, org-scoped). */
export async function markSafetyReportFiled(
  id: string,
  sequenceId: number,
  ctx: SafetyReportCtx,
): Promise<IndSafetyReportRow> {
  const [row] = await db
    .update(indSafetyReports)
    .set({ status: 'filed', sequenceId, filedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(indSafetyReports.id, id), eq(indSafetyReports.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new SafetyReportError('NOT_FOUND', 'Safety report not found.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_SAFETY_REPORT_FILED',
    resourceType: 'ind_safety_report',
    resourceId: row.id,
    details: { sequenceId },
  });
  return row as IndSafetyReportRow;
}

/**
 * List a submission's safety reports that are not yet filed and whose deadline
 * has passed (the overdue-report compliance feed). Org-scoped; pure filtering
 * over the stored rows.
 */
export async function listOverdueSafetyReports(
  submissionId: number,
  ctx: { organizationId: number },
  asOf: Date = new Date(),
): Promise<IndSafetyReportRow[]> {
  const rows = await listSafetyReports(submissionId, ctx);
  return rows.filter((r) => r.status !== 'filed' && r.deadline != null && new Date(r.deadline).getTime() < asOf.getTime());
}
