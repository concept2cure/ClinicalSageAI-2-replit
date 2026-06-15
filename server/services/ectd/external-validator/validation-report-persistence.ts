/**
 * External eCTD validation-report persistence service.
 *
 * Durable, tenant-scoped, audited storage for external-validator runs, so the
 * dispatch path can fold the LATEST report's error count into the hard gate and
 * a program's validation history is auditable. Every read/write is scoped to the
 * caller's organizationId (never request input); creation is audited — mirroring
 * server/services/ind-lifecycle/ind-dispatch-snapshot-service.ts.
 *
 * @module server/services/ectd/external-validator/validation-report-persistence
 */

import { eq, and, desc } from 'drizzle-orm';
import { db } from '../../../db';
import {
  submissionValidationReports,
  type SubmissionValidationReportRow,
} from '../../../../shared/schema/ectd-validation-reports';
import auditService from '../../auditService';
import { createScopedLogger } from '../../../utils/logger';
import type { ExternalValidationReport } from './types';

const logger = createScopedLogger('ectd-validation-report-persistence');

export type ValidationReportCtx = { organizationId: number; userId: number };

export interface CreateValidationReportInput {
  submissionId: number;
  sequenceId: number;
  report: ExternalValidationReport;
}

/** Persist an external validation report as an audited, point-in-time record. */
export async function createValidationReport(
  input: CreateValidationReportInput,
  ctx: ValidationReportCtx,
): Promise<SubmissionValidationReportRow> {
  const { report } = input;
  const [row] = await db
    .insert(submissionValidationReports)
    .values({
      organizationId: ctx.organizationId,
      submissionId: input.submissionId,
      sequenceId: input.sequenceId,
      validatorName: report.validatorName,
      validatorVersion: report.validatorVersion,
      errorCount: report.errorCount,
      warningCount: report.warningCount,
      report: report as unknown as Record<string, unknown>,
      createdBy: ctx.userId,
    })
    .returning();

  await auditService.logAction({
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    action: 'ECTD_VALIDATION_REPORT_CREATED',
    resourceType: 'submission_validation_report',
    resourceId: row.id,
    details: {
      sequenceId: input.sequenceId,
      validatorName: report.validatorName,
      errorCount: report.errorCount,
    },
  });

  logger.info('Recorded external eCTD validation report', {
    sequenceId: input.sequenceId,
    validatorName: report.validatorName,
    errorCount: report.errorCount,
    organizationId: ctx.organizationId,
  });
  return row as SubmissionValidationReportRow;
}

/** List a sequence's validation reports, newest first (org-scoped). */
export async function listValidationReports(
  sequenceId: number,
  ctx: { organizationId: number },
): Promise<SubmissionValidationReportRow[]> {
  const rows = await db
    .select()
    .from(submissionValidationReports)
    .where(
      and(
        eq(submissionValidationReports.sequenceId, sequenceId),
        eq(submissionValidationReports.organizationId, ctx.organizationId),
      ),
    )
    .orderBy(desc(submissionValidationReports.createdAt));
  return rows as SubmissionValidationReportRow[];
}

/** The most recent validation report for a sequence, or null (org-scoped). */
export async function getLatestValidationReport(
  sequenceId: number,
  ctx: { organizationId: number },
): Promise<SubmissionValidationReportRow | null> {
  const [row] = await db
    .select()
    .from(submissionValidationReports)
    .where(
      and(
        eq(submissionValidationReports.sequenceId, sequenceId),
        eq(submissionValidationReports.organizationId, ctx.organizationId),
      ),
    )
    .orderBy(desc(submissionValidationReports.createdAt))
    .limit(1);
  return (row as SubmissionValidationReportRow) ?? null;
}

export default { createValidationReport, listValidationReports, getLatestValidationReport };
