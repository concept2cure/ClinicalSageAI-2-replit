/**
 * External eCTD validation reports — durable, per-sequence records.
 *
 * Persists the normalized result of each external-validator run (the
 * `ExternalValidationReport` shape) for a submission sequence, so the dispatch
 * path can fold the latest report's error count into the hard gate and so a
 * program's validation history is auditable.
 *
 * Conventions mirror shared/schema/ind-safety-reports.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ectd-validation-reports'` to shared/schema/index.ts.
 *   2. Run migrations/20260615_ectd_validation_reports.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const submissionValidationReports = pgTable(
  'submission_validation_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    submissionId: integer('submission_id').notNull(),
    sequenceId: integer('sequence_id').notNull(),

    /** Validator that produced the report (e.g. 'internal-criteria'). */
    validatorName: text('validator_name').notNull(),
    validatorVersion: text('validator_version').notNull(),

    /** Error-severity finding count (the value folded into the dispatch gate). */
    errorCount: integer('error_count').notNull().default(0),
    /** Warning-severity finding count (non-blocking, for visibility). */
    warningCount: integer('warning_count').notNull().default(0),

    /** Full ExternalValidationReport ({ findings, errorCount, warningCount, ranAt, … }). */
    report: jsonb('report').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('submission_validation_reports_org_idx').on(t.organizationId),
    sequenceIdx: index('submission_validation_reports_sequence_idx').on(t.sequenceId),
  }),
);

export type SubmissionValidationReportRow = InferSelectModel<typeof submissionValidationReports>;

export const insertSubmissionValidationReportSchema = createInsertSchema(submissionValidationReports, {
  validatorName: z.string().min(1),
  validatorVersion: z.string().min(1),
});
export type InsertSubmissionValidationReport = z.infer<typeof insertSubmissionValidationReportSchema>;

export const ECTD_VALIDATION_REPORT_TABLES = ['submission_validation_reports'] as const;
