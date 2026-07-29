/**
 * IND annual reports (21 CFR 312.33) — durable, per-submission records.
 *
 * Persists each IND Annual Report / DSUR as a tracked draft so an RA team can
 * follow it through its lifecycle (draft → filed), see the open-gap count, and
 * surface ones whose 60-day anniversary deadline has passed. The assembled
 * section model is stored so the record is the source of truth; the sequence id
 * is set when the report is filed as an `annual` eCTD sequence.
 *
 * Conventions mirror shared/schema/ind-safety-reports.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ind-annual-reports'` to shared/schema/index.ts.
 *   2. Run migrations/20260615_ind_annual_reports.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const indAnnualReports = pgTable(
  'ind_annual_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    submissionId: integer('submission_id').notNull(),
    indNumber: text('ind_number').notNull(),
    productName: text('product_name').notNull(),

    reportingPeriodStart: timestamp('reporting_period_start', { withTimezone: true }),
    reportingPeriodEnd: timestamp('reporting_period_end', { withTimezone: true }),
    /** 60-day post-anniversary filing deadline (312.33); used to surface overdue. */
    dueDate: timestamp('due_date', { withTimezone: true }),

    /** draft | filed. */
    status: text('status').notNull().default('draft'),
    sequenceId: integer('sequence_id'),
    filedAt: timestamp('filed_at', { withTimezone: true }),

    /** Number of incomplete sections at draft time (from the model's gaps). */
    gapCount: integer('gap_count').notNull().default(0),
    /** Full IndAnnualReportModel (section tree + gaps). */
    model: jsonb('model').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ind_annual_reports_org_idx').on(t.organizationId),
    submissionIdx: index('ind_annual_reports_submission_idx').on(t.submissionId),
  }),
);

export type IndAnnualReportRow = InferSelectModel<typeof indAnnualReports>;

export const insertIndAnnualReportSchema = createInsertSchema(indAnnualReports, {
  indNumber: z.string().min(1),
  productName: z.string().min(1),
});
export type InsertIndAnnualReport = z.infer<typeof insertIndAnnualReportSchema>;

export const IND_ANNUAL_REPORT_TABLES = ['ind_annual_reports'] as const;
