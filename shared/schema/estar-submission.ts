/**
 * eSTAR submission tracking (persistence)
 *
 * The program-agnostic filing-tracking spine: one row per submission a client
 * files, for ANY eSTAR catalog key (510(k)/De Novo/PMA + supplements/Q-Sub/IDE/
 * 513(g)). It records what was filed, its lifecycle status, the FDA tracking
 * number, and the review clock (from the catalog's reviewGoalDays) so the
 * decision-due date is tracked. This closes the "a filing is never tracked; PMA/
 * IDE/513(g) have no tracker" break — the readiness/catalog engine feeds it.
 *
 * It is deliberately additive and does NOT replace the rich Q-Sub interaction
 * tables (shared/schema/q-sub.ts: meetings/questions/commitments/timeline). For a
 * Q-Sub, this top-level record can link to that detail via qSubmissionId; the
 * two abstractions coexist (program-agnostic status + clock here, Q-Sub-specific
 * interaction detail there).
 *
 * One row per filing. Tenant column is the canonical integer organization_id.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTEGRATION NOTES:
 *   1. `export * from './estar-submission'` in shared/schema/index.ts.
 *   2. Run migrations/20260730_estar_submission.sql.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { InferSelectModel } from 'drizzle-orm';
import { integer, pgTable, text, timestamp, uuid, varchar, index } from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

/** Filing lifecycle status, in order. `decision` and `withdrawn` are terminal. */
export const ESTAR_SUBMISSION_STATUSES = [
  'draft',
  'filed',
  'under_review',
  'additional_info',
  'decision',
  'withdrawn',
] as const;
export type EstarSubmissionStatus = (typeof ESTAR_SUBMISSION_STATUSES)[number];

export const estarSubmissions = pgTable(
  'estar_submissions',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    // What was filed — the EstarCatalogKey and its program type (denormalized so
    // tracking survives independent of the catalog module).
    catalogKey: varchar('catalog_key', { length: 64 }).notNull(),
    programType: varchar('program_type', { length: 16 }).notNull(),
    variant: varchar('variant', { length: 16 }).notNull().default('device'),

    title: text('title'),

    // Lifecycle status + (optional) final decision string once reached.
    status: varchar('status', { length: 24 }).notNull().default('draft'),
    decision: varchar('decision', { length: 40 }),

    // FDA-assigned tracking number (K/DEN/P/Q/G number) once acknowledged.
    fdaTrackingNumber: varchar('fda_tracking_number', { length: 64 }),

    // Review clock. reviewGoalDays is denormalized from the catalog at file time;
    // decisionDueAt = filedAt + reviewGoalDays.
    filedAt: timestamp('filed_at', { withTimezone: true }),
    reviewGoalDays: integer('review_goal_days'),
    decisionDueAt: timestamp('decision_due_at', { withTimezone: true }),

    // Optional link to the rich Q-Sub interaction record (Q-Sub types only).
    qSubmissionId: uuid('q_submission_id'),

    notes: text('notes'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by'),
  },
  (t) => ({
    byOrg: index('estar_submissions_org_idx').on(t.organizationId),
    byStatus: index('estar_submissions_status_idx').on(t.status),
  }),
);

export type EstarSubmissionRow = InferSelectModel<typeof estarSubmissions>;

export const insertEstarSubmissionSchema = createInsertSchema(estarSubmissions, {
  status: z.enum(ESTAR_SUBMISSION_STATUSES),
});
export type InsertEstarSubmission = z.infer<typeof insertEstarSubmissionSchema>;
