/**
 * Protocol Budget & Feasibility (Capability C2C-22)
 *
 * Study-level budgeting for a protocol document: per-subject cost line items and
 * study-level parameters (target enrollment, sponsor payment per subject, F&A
 * rate) that drive a deterministic feasibility verdict — complements coverage
 * analysis (who pays each item) and the grants budget (award-level). Conventions
 * match the platform; status/type columns are CHECK-constrained. Mutations are
 * governed + audited.
 *
 * @module shared/schema/protocol-budget
 */

import { index, integer, numeric, pgTable, serial, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type BudgetCategory = 'personnel' | 'procedure' | 'lab' | 'imaging' | 'overhead' | 'equipment' | 'patient_stipend' | 'other';
export type BudgetPayer = 'sponsor' | 'institution' | 'other';

export const protocolBudgetItems = pgTable(
  'protocol_budget_items',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull(),
    category: text('category').$type<BudgetCategory>().notNull().default('other'),
    description: text('description').notNull(),
    unitCost: numeric('unit_cost', { precision: 14, scale: 2 }).notNull().default('0'),
    quantityPerSubject: numeric('quantity_per_subject', { precision: 10, scale: 2 }).notNull().default('1'),
    payer: text('payer').$type<BudgetPayer>().notNull().default('sponsor'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_protocol_budget_items_org').on(t.organizationId),
    docIdx: index('idx_protocol_budget_items_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolBudgetItem = typeof protocolBudgetItems.$inferSelect;
export type NewProtocolBudgetItem = typeof protocolBudgetItems.$inferInsert;

export const protocolBudgetParams = pgTable(
  'protocol_budget_params',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolDocumentId: integer('protocol_document_id').notNull(),
    targetEnrollment: integer('target_enrollment').notNull().default(0),
    sponsorPaymentPerSubject: numeric('sponsor_payment_per_subject', { precision: 14, scale: 2 }),
    indirectRatePct: numeric('indirect_rate_pct', { precision: 6, scale: 2 }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_protocol_budget_params_org').on(t.organizationId),
    docUnique: uniqueIndex('uq_protocol_budget_params_doc').on(t.protocolDocumentId),
  }),
);

export type ProtocolBudgetParams = typeof protocolBudgetParams.$inferSelect;
export type NewProtocolBudgetParams = typeof protocolBudgetParams.$inferInsert;
