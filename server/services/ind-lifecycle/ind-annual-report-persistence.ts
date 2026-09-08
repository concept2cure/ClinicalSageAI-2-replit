/**
 * IND annual-report persistence service (21 CFR 312.33).
 *
 * Durable, tenant-scoped, audited storage for IND Annual Reports / DSURs, so an
 * RA team can track each report draft → filed, see its open-gap count, and
 * surface ones whose 60-day anniversary deadline has passed. Every read/write is
 * scoped to the caller's organizationId (never request input); mutations are
 * audited — mirroring server/services/ind-lifecycle/ind-safety-report-persistence.ts.
 *
 * A draft is created by assembling the section model from the supplied period
 * data; filing (via the existing /annual-report/file flow) marks the stored
 * draft filed and links its `annual` eCTD sequence.
 *
 * @module server/services/ind-lifecycle/ind-annual-report-persistence
 */

import { eq, and, asc } from 'drizzle-orm';
import { db } from '../../db';
import { indAnnualReports, type IndAnnualReportRow } from '../../../shared/schema/ind-annual-reports';
import auditService from '../auditService';
import { createScopedLogger } from '../../utils/logger';
import {
  assembleIndAnnualReport,
  computeAnnualReportDue,
  type IndAnnualReportInput,
} from './ind-annual-report-service';

const logger = createScopedLogger('ind-annual-report-persistence');

export type AnnualReportCtx = { organizationId: number; userId: number };

export class AnnualReportError extends Error {
  constructor(public code: 'NOT_FOUND' | 'VALIDATION', message: string) {
    super(message);
    this.name = 'AnnualReportError';
  }
}

const d = (v: unknown): Date | undefined => {
  if (!v) return undefined;
  const date = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(date.getTime()) ? undefined : date;
};

const requireDate = (v: unknown, field: string): Date => {
  const date = d(v);
  if (!date) throw new AnnualReportError('VALIDATION', `${field} must be a valid date.`);
  return date;
};

/**
 * Coerce the period-input dates (which arrive as ISO strings over HTTP) to Date
 * so the pure assembler's date arithmetic is safe.
 */
function coerceInput(raw: any): IndAnnualReportInput {
  return {
    ...raw,
    // An absent or unparsable date used to become 1 January 1970, so a
    // draft with no period dates assembled and persisted as a report covering
    // the epoch. Refuse instead.
    reportingPeriodStart: requireDate(raw.reportingPeriodStart, 'reportingPeriodStart'),
    reportingPeriodEnd: requireDate(raw.reportingPeriodEnd, 'reportingPeriodEnd'),
    safetyReportsInPeriod: (raw.safetyReportsInPeriod ?? []).map((r: any) => ({ ...r, submittedAt: requireDate(r.submittedAt, 'safetyReportsInPeriod[].submittedAt') })),
    ibChanges: (raw.ibChanges ?? []).map((c: any) => ({ ...c, effectiveDate: requireDate(c.effectiveDate, 'ibChanges[].effectiveDate') })),
    studyStatuses: raw.studyStatuses ?? [],
  };
}

export interface CreateAnnualReportDraftInput {
  submissionId: number;
  /** The 312.33 period data (dates may be ISO strings). */
  report: any;
  /** IND effective date — drives the 60-day anniversary due date (optional). */
  indEffectiveDate?: Date | string;
}

/** Assemble the annual report and persist it as a tracked draft (audited). */
export async function createAnnualReportDraft(
  input: CreateAnnualReportDraftInput,
  ctx: AnnualReportCtx,
): Promise<IndAnnualReportRow> {
  const coerced = coerceInput(input.report);
  const model = assembleIndAnnualReport({ ...coerced, organizationId: String(ctx.organizationId) });
  const effective = d(input.indEffectiveDate);
  const dueDate = effective ? computeAnnualReportDue(effective) : null;

  const [row] = await db
    .insert(indAnnualReports)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      indNumber: model.indNumber,
      productName: model.productName,
      reportingPeriodStart: model.reportingPeriod.start,
      reportingPeriodEnd: model.reportingPeriod.end,
      dueDate,
      status: 'draft',
      gapCount: model.gaps.length,
      model: model as unknown as Record<string, unknown>,
      createdBy: ctx.userId,
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ANNUAL_REPORT_DRAFTED',
    resourceType: 'ind_annual_report',
    resourceId: row.id,
    details: { submissionId: input.submissionId, indNumber: model.indNumber, gapCount: model.gaps.length },
  });
  logger.info('Drafted IND annual report', { submissionId: input.submissionId, gapCount: model.gaps.length, organizationId: ctx.organizationId });
  return row as IndAnnualReportRow;
}

/** List a submission's annual reports (org-scoped, stable order). */
export async function listAnnualReports(
  submissionId: number,
  ctx: { organizationId: number },
): Promise<IndAnnualReportRow[]> {
  return (await db
    .select()
    .from(indAnnualReports)
    .where(and(eq(indAnnualReports.organizationId, ctx.organizationId), eq(indAnnualReports.submissionId, submissionId)))
    .orderBy(asc(indAnnualReports.createdAt))) as IndAnnualReportRow[];
}

/** Fetch one annual report (org-scoped). */
export async function getAnnualReport(id: string, ctx: { organizationId: number }): Promise<IndAnnualReportRow> {
  const [row] = await db
    .select()
    .from(indAnnualReports)
    .where(and(eq(indAnnualReports.id, id), eq(indAnnualReports.organizationId, ctx.organizationId)));
  if (!row) throw new AnnualReportError('NOT_FOUND', 'Annual report not found.');
  return row as IndAnnualReportRow;
}

/** Mark a stored draft filed and link its `annual` eCTD sequence (audited). */
export async function markAnnualReportFiled(
  id: string,
  sequenceId: number,
  ctx: AnnualReportCtx,
): Promise<IndAnnualReportRow> {
  const [row] = await db
    .update(indAnnualReports)
    .set({ status: 'filed', sequenceId, filedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(indAnnualReports.id, id), eq(indAnnualReports.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new AnnualReportError('NOT_FOUND', 'Annual report not found.');
  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ANNUAL_REPORT_FILED',
    resourceType: 'ind_annual_report',
    resourceId: row.id,
    details: { sequenceId },
  });
  return row as IndAnnualReportRow;
}

/**
 * List a submission's annual reports that are not yet filed and whose 60-day
 * deadline has passed (the overdue feed). Org-scoped; pure filtering.
 */
export type OverdueAnnualReportRow = IndAnnualReportRow & {
  /**
   * 'overdue' — unfiled and past its 60-day deadline. 'deadline_unknown' —
   * unfiled with no due date because no IND effective date was recorded, so
   * whether it is overdue cannot be known. These used to be dropped from the
   * feed, reading identically to a report safely on schedule.
   */
  overdueState: 'overdue' | 'deadline_unknown';
};

export async function listOverdueAnnualReports(
  submissionId: number,
  ctx: { organizationId: number },
  asOf: Date = new Date(),
): Promise<OverdueAnnualReportRow[]> {
  const rows = await listAnnualReports(submissionId, ctx);
  const out: OverdueAnnualReportRow[] = [];
  for (const r of rows) {
    if (r.status === 'filed') continue;
    if (r.dueDate == null) out.push({ ...r, overdueState: 'deadline_unknown' });
    else if (new Date(r.dueDate).getTime() < asOf.getTime()) out.push({ ...r, overdueState: 'overdue' });
  }
  return out;
}
