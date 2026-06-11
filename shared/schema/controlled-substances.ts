/**
 * Controlled Substances Tracking (DEA) (Capability C2C-15)
 *
 * DEA registration tracking, a controlled-substances inventory, and a perpetual
 * transaction ledger (receipt / dispense / use / disposal / transfer). Closes the
 * "DEA scheduling and usage logs outside the compliance system" gap for research
 * operations.
 *
 * Grounded in the Controlled Substances Act and 21 CFR 1300-series (schedules
 * 1308; registration 1301; recordkeeping/inventory 1304). Conventions match the
 * platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/controlled-substances
 */

import { index, integer, pgTable, serial, text, date, numeric, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type DeaSchedule = 'I' | 'II' | 'III' | 'IV' | 'V';
export type BusinessActivity = 'researcher' | 'analytical_lab' | 'manufacturer' | 'distributor' | 'practitioner' | 'teaching_institution' | 'other';
export type RegistrationStatus = 'active' | 'expired' | 'surrendered' | 'revoked';
export type CsTransactionType = 'receipt' | 'dispense' | 'use' | 'disposal' | 'transfer' | 'adjustment';

// ─── DEA registrations ───────────────────────────────────────────────────────

export const deaRegistrations = pgTable(
  'dea_registrations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    registrantName: text('registrant_name').notNull(),
    deaNumber: text('dea_number').notNull(),
    businessActivity: text('business_activity').$type<BusinessActivity>().notNull(),
    /** Authorized schedules, e.g. ['II','III','IV','V']. */
    schedules: text('schedules').array().notNull().default([]),
    expirationDate: date('expiration_date'),
    status: text('status').$type<RegistrationStatus>().notNull().default('active'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ orgIdx: index('idx_dea_registrations_org').on(t.organizationId) })
);

export type DeaRegistration = typeof deaRegistrations.$inferSelect;
export type NewDeaRegistration = typeof deaRegistrations.$inferInsert;

// ─── Controlled substances (inventory) ───────────────────────────────────────

export const controlledSubstances = pgTable(
  'controlled_substances',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    deaRegistrationId: integer('dea_registration_id').references(() => deaRegistrations.id),
    substanceName: text('substance_name').notNull(),
    deaSchedule: text('dea_schedule').$type<DeaSchedule>().notNull(),
    unit: text('unit').notNull().default('g'),
    currentBalance: numeric('current_balance', { precision: 14, scale: 4 }).notNull().default('0'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_controlled_substances_org').on(t.organizationId),
    regIdx: index('idx_controlled_substances_registration').on(t.deaRegistrationId),
  })
);

export type ControlledSubstance = typeof controlledSubstances.$inferSelect;
export type NewControlledSubstance = typeof controlledSubstances.$inferInsert;

// ─── Transaction ledger (perpetual inventory) ────────────────────────────────

export const csTransactions = pgTable(
  'cs_transactions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    substanceId: integer('substance_id').notNull().references(() => controlledSubstances.id),
    transactionType: text('transaction_type').$type<CsTransactionType>().notNull(),
    quantity: numeric('quantity', { precision: 14, scale: 4 }).notNull(),
    /** Running balance after this transaction (perpetual inventory). */
    balanceAfter: numeric('balance_after', { precision: 14, scale: 4 }).notNull(),
    transactionDate: date('transaction_date'),
    /** Second-person witness for disposals/destructions (21 CFR 1304). */
    witnessedBy: text('witnessed_by'),
    reference: text('reference'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_cs_transactions_org').on(t.organizationId),
    substanceIdx: index('idx_cs_transactions_substance').on(t.substanceId),
  })
);

export type CsTransaction = typeof csTransactions.$inferSelect;
export type NewCsTransaction = typeof csTransactions.$inferInsert;
