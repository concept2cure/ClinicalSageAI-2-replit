/**
 * IND amendments (21 CFR 312.30 / 312.31) — durable, per-submission records.
 *
 * Persists each planned protocol (312.30) or information (312.31) amendment as a
 * tracked draft so an RA team can follow it through its lifecycle (draft →
 * filed) and see the planned-leaf and advisory counts at a glance. The full
 * amendment plan (leaves + lifecycle ops + warnings) is stored so the record is
 * the source of truth; the sequence id is set when the amendment is filed as an
 * `amendment` eCTD sequence.
 *
 * Unlike safety reports (312.32) and annual reports (312.33), an amendment is
 * event-driven rather than deadline-driven — there is no statutory clock — so
 * this table has no `due_date` / overdue feed.
 *
 * Conventions mirror shared/schema/ind-annual-reports.ts (uuid PK + integer
 * organization_id tenant column + drizzle-zod insert), so the service scopes
 * every query by the caller's organizationId.
 *
 * INTEGRATION NOTES (human):
 *   1. Add `export * from './ind-amendments'` to shared/schema/index.ts.
 *   2. Run migrations/20260615_ind_amendments.sql.
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, jsonb, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const indAmendments = pgTable(
  'ind_amendments',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    submissionId: integer('submission_id').notNull(),
    indNumber: text('ind_number').notNull(),
    projectId: text('project_id').notNull(),

    /** ('protocol' | 'information')[] — the classes this single sequence carries. */
    amendmentClasses: jsonb('amendment_classes').notNull().default('[]'),

    /** draft | filed. */
    status: text('status').notNull().default('draft'),
    sequenceId: integer('sequence_id'),
    filedAt: timestamp('filed_at', { withTimezone: true }),

    /** Number of planned eCTD leaves (incl. the cover letter). */
    leafCount: integer('leaf_count').notNull().default(0),
    /** Number of non-fatal planner advisories (unmapped category, missing GUID). */
    warningCount: integer('warning_count').notNull().default(0),
    /** Full IndAmendmentPlan (leaves + lifecycle ops + warnings). */
    plan: jsonb('plan').notNull(),

    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgIdx: index('ind_amendments_org_idx').on(t.organizationId),
    submissionIdx: index('ind_amendments_submission_idx').on(t.submissionId),
  }),
);

export type IndAmendmentRow = InferSelectModel<typeof indAmendments>;

export const insertIndAmendmentSchema = createInsertSchema(indAmendments, {
  indNumber: z.string().min(1),
  projectId: z.string().min(1),
});
export type InsertIndAmendment = z.infer<typeof insertIndAmendmentSchema>;

export const IND_AMENDMENT_TABLES = ['ind_amendments'] as const;
