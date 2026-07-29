/**
 * Lifecycle Obligation Tracking (Capability C2C-11)
 *
 * The post-approval recurring-obligation engine: variations (EU IA/IB/II),
 * supplements (FDA PAS / CBE-0 / CBE-30 / Annual Report), periodic safety
 * reports (PSUR/PBRER cadence), pediatric obligations (PREA/PIP), and renewals.
 * A recurring obligation spawns dated occurrences (events) so the calendar never
 * slips — the sticky post-approval anchor.
 *
 * Grounded in EU Regulation 1234/2008 (variations), 21 CFR 314.70 (US
 * supplements/annual report), GVP Module VII / ICH E2C (PSUR/PBRER), and
 * PREA / EU PIP. Conventions match the platform; status/type columns are
 * CHECK-constrained.
 *
 * @module shared/schema/lifecycle
 */

import { index, integer, pgTable, serial, text, date, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { submissions } from './submissions';
import { rimProducts } from './rim';

export type ObligationType = 'variation' | 'supplement' | 'periodic_report' | 'pediatric' | 'renewal' | 'annual_report';
export type ObligationRegion = 'fda' | 'eu' | 'jp' | 'mhra' | 'other';
export type ObligationStatus = 'planned' | 'in_preparation' | 'submitted' | 'approved' | 'rejected' | 'overdue' | 'closed';
export type EventStatus = 'pending' | 'in_preparation' | 'submitted' | 'approved' | 'overdue';

// ─── Obligations ─────────────────────────────────────────────────────────────

export const lifecycleObligations = pgTable(
  'lifecycle_obligations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    productId: integer('product_id').references(() => rimProducts.id),
    submissionId: integer('submission_id').references(() => submissions.id),
    obligationType: text('obligation_type').$type<ObligationType>().notNull(),
    region: text('region').$type<ObligationRegion>().notNull(),
    /** e.g. 'IA','IB','II','PAS','CBE-30','PSUR','annual_report','PREA','PIP'. */
    classification: text('classification'),
    title: text('title').notNull(),
    status: text('status').$type<ObligationStatus>().notNull().default('planned'),
    dueDate: date('due_date'),
    submittedDate: date('submitted_date'),
    /** For periodic obligations: cadence in months (e.g. 6 or 12 for PSUR). */
    recurrenceMonths: integer('recurrence_months'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_lifecycle_obligations_org').on(t.organizationId),
    productIdx: index('idx_lifecycle_obligations_product').on(t.productId),
  })
);

export type LifecycleObligation = typeof lifecycleObligations.$inferSelect;
export type NewLifecycleObligation = typeof lifecycleObligations.$inferInsert;

// ─── Occurrences (recurring-obligation events) ───────────────────────────────

export const lifecycleObligationEvents = pgTable(
  'lifecycle_obligation_events',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    obligationId: integer('obligation_id').notNull().references(() => lifecycleObligations.id),
    periodStart: date('period_start'),
    periodEnd: date('period_end'),
    dueDate: date('due_date'),
    status: text('status').$type<EventStatus>().notNull().default('pending'),
    submittedDate: date('submitted_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_lifecycle_events_org').on(t.organizationId),
    obligationIdx: index('idx_lifecycle_events_obligation').on(t.obligationId),
  })
);

export type LifecycleObligationEvent = typeof lifecycleObligationEvents.$inferSelect;
export type NewLifecycleObligationEvent = typeof lifecycleObligationEvents.$inferInsert;
