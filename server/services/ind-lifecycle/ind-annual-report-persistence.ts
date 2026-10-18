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
import { recordAuditRow, type AuditRowOutcome } from '../audit/audit-write-outcome';
import { createScopedLogger } from '../../utils/logger';
import {
  assembleIndAnnualReport,
  computeAnnualReportDueForPeriod,
  parseAnnualReportInput,
} from './ind-annual-report-service';

const logger = createScopedLogger('ind-annual-report-persistence');

export type AuditedIndAnnualReportRow = IndAnnualReportRow & { auditTrail: AuditRowOutcome };

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

// The period input is parsed by the service's parseAnnualReportInput — the one
// boundary parser the preview, PDF and filing routes share (an absent or
// unparsable period date is refused; it once became 1 January 1970).

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
): Promise<AuditedIndAnnualReportRow> {
  const coerced = parseAnnualReportInput(input.report);
  const model = assembleIndAnnualReport({ ...coerced, organizationId: String(ctx.organizationId) });
  // A supplied effective date that does not parse is refused (2026-10-15: it
  // read as absent, so the draft silently had no due date).
  const effective =
    input.indEffectiveDate == null || input.indEffectiveDate === '' ? undefined : requireDate(input.indEffectiveDate, 'indEffectiveDate');
  // Due from this report's own period (2026-10-15; it was dated from the wall
  // clock, so an early draft read overdue and a year-late one read on time).
  const dueDate = effective ? computeAnnualReportDueForPeriod(effective, coerced.reportingPeriodEnd) : null;

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

  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ANNUAL_REPORT_DRAFTED',
    resourceType: 'ind_annual_report',
    resourceId: row.id,
    details: { submissionId: input.submissionId, indNumber: model.indNumber, gapCount: model.gaps.length },
  });
  logger.info('Drafted IND annual report', { submissionId: input.submissionId, gapCount: model.gaps.length, organizationId: ctx.organizationId });
  return { ...(row as IndAnnualReportRow), auditTrail };
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
): Promise<AuditedIndAnnualReportRow> {
  const [row] = await db
    .update(indAnnualReports)
    .set({ status: 'filed', sequenceId, filedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(indAnnualReports.id, id), eq(indAnnualReports.organizationId, ctx.organizationId)))
    .returning();
  if (!row) throw new AnnualReportError('NOT_FOUND', 'Annual report not found.');
  const auditTrail = await recordAuditRow({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'IND_ANNUAL_REPORT_FILED',
    resourceType: 'ind_annual_report',
    resourceId: row.id,
    details: { sequenceId },
  });
  return { ...(row as IndAnnualReportRow), auditTrail };
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
