/**
 * IND safety reports (21 CFR 312.32) — durable, per-submission records.
 *
 * Persists each expedited IND Safety Report (7-/15-day) as a tracked draft so a
 * PV/RA team can follow it through its lifecycle (draft → filed) and surface
 * overdue ones. The reporting obligation, deadline and document model are stored
 * so the record is the source of truth; the sequence id is set when the report
 * is filed as an eCTD amendment.
 *
 * Conventions mirror shared/schema/ind-cross-references.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ind-safety-reports'` to shared/schema/index.ts.
 *   2. Run migrations/20260614_ind_safety_reports.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const indSafetyReports = pgTable(
  'ind_safety_reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    submissionId: integer('submission_id').notNull(),
    /** The intake adverse-event id the report concerns. */
    adverseEventId: text('adverse_event_id').notNull(),

    /** SEVEN_DAY | FIFTEEN_DAY (NOT_REPORTABLE is never persisted as a report). */
    obligation: text('obligation').notNull(),
    reportingWindowDays: integer('reporting_window_days'),
    /** The expedited-reporting deadline (312.32(c)); used to surface overdue reports. */
    deadline: timestamp('deadline', { withTimezone: true }),
    regulatoryBasis: text('regulatory_basis').notNull(),

    /** draft | filed. */
    status: text('status').notNull().default('draft'),
    /** The eCTD sequence the report was filed under, once filed. */
    sequenceId: integer('sequence_id'),
    filedAt: timestamp('filed_at', { withTimezone: true }),

    /** Full classification { obligation, deadline, determinations, rationale }. */
    classification: jsonb('classification').notNull(),
    /** Full IndSafetyReportDocument model (narrative section tree). */
    document: jsonb('document').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ind_safety_reports_org_idx').on(t.organizationId),
    submissionIdx: index('ind_safety_reports_submission_idx').on(t.submissionId),
  }),
);

export type IndSafetyReportRow = InferSelectModel<typeof indSafetyReports>;

export const insertIndSafetyReportSchema = createInsertSchema(indSafetyReports, {
  obligation: z.enum(['SEVEN_DAY', 'FIFTEEN_DAY']),
  adverseEventId: z.string().min(1),
});
export type InsertIndSafetyReport = z.infer<typeof insertIndSafetyReportSchema>;

export const IND_SAFETY_REPORT_TABLES = ['ind_safety_reports'] as const;
