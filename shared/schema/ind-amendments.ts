/**
 * IND amendments (21 CFR 312.30 / 312.31) — durable, per-submission records.
 *
 * Persists each protocol/information amendment plan as a tracked draft so an RA
 * team has an auditable history of every amendment (draft → filed), its
 * amendment classes, planned leaves and any advisory warnings. Amendments are
 * event-driven (no statutory deadline), so there is no overdue feed — but the
 * record gives draft/filed state, leaf counts and the eCTD sequence link.
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

    /** Amendment classes present (protocol / information / …). */
    amendmentClasses: jsonb('amendment_classes').notNull().default([]),

    /** draft | filed. */
    status: text('status').notNull().default('draft'),
    sequenceId: integer('sequence_id'),
    filedAt: timestamp('filed_at', { withTimezone: true }),

    leafCount: integer('leaf_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    /** Full IndAmendmentPlan (planned leaves + warnings). */
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
});
export type InsertIndAmendment = z.infer<typeof insertIndAmendmentSchema>;

export const IND_AMENDMENT_TABLES = ['ind_amendments'] as const;
