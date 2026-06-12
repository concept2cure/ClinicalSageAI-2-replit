/**
 * Effort Certification (add-on; the ISU brief's #1 pain — time-&-effort at scale)
 *
 * Per-person, per-period certification of committed vs. actual effort across
 * sponsored awards (the ~900-certs-per-run manual pain). An effort statement has
 * one line per award; total effort across all activity must not exceed 100%, and
 * a material deviation between committed and actual effort triggers recertification.
 *
 * Grounded in 2 CFR 200.430 (compensation / personnel-effort) and Uniform
 * Guidance effort-reporting. Conventions match the platform; status/type columns
 * are CHECK-constrained.
 *
 * @module shared/schema/effort-certification
 */

import { index, integer, pgTable, serial, text, date, numeric, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { researchPersonnel } from './research-compliance';
import { grantAwards } from './grants';

export type EffortStatementStatus = 'draft' | 'pending_certification' | 'certified' | 'recertify_required' | 'superseded';

// ─── Effort statements (one per person per period) ───────────────────────────

export const effortCertifications = pgTable(
  'effort_certifications',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    personnelId: integer('personnel_id').notNull().references(() => researchPersonnel.id),
    periodStart: date('period_start').notNull(),
    periodEnd: date('period_end').notNull(),
    status: text('status').$type<EffortStatementStatus>().notNull().default('draft'),
    certifiedBy: integer('certified_by').references(() => users.id),
    certifiedAt: timestamp('certified_at', { withTimezone: true }),
    /** sha256 of the certified snapshot (e-sign binding; recert clears it). */
    contentHash: text('content_hash'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_effort_certifications_org').on(t.organizationId),
    personnelIdx: index('idx_effort_certifications_personnel').on(t.personnelId),
  })
);

export type EffortCertification = typeof effortCertifications.$inferSelect;
export type NewEffortCertification = typeof effortCertifications.$inferInsert;

// ─── Effort lines (one per award, plus non-sponsored) ────────────────────────

export const effortLines = pgTable(
  'effort_lines',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    certificationId: integer('certification_id').notNull().references(() => effortCertifications.id),
    /** Null = non-sponsored / institutional effort. */
    awardId: integer('award_id').references(() => grantAwards.id),
    activityLabel: text('activity_label').notNull(),
    committedPct: numeric('committed_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    actualPct: numeric('actual_pct', { precision: 5, scale: 2 }).notNull().default('0'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_effort_lines_org').on(t.organizationId),
    certIdx: index('idx_effort_lines_cert').on(t.certificationId),
  })
);

export type EffortLine = typeof effortLines.$inferSelect;
export type NewEffortLine = typeof effortLines.$inferInsert;
