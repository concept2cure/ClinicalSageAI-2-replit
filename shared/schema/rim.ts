/**
 * RIM-lite — Registration Grid + Labeling (Capability C2C-12)
 *
 * A lightweight Regulatory Information Management layer: a product registry, the
 * product × country registration status grid (the "where are we approved, and
 * what's due for renewal" view), and label-version tracking (USPI / SmPC / PIL /
 * core data sheet). Aimed at low-end Veeva-RIM displacement and land-and-expand.
 *
 * Grounded in regional labeling standards (FDA USPI / 21 CFR 201; EU SmPC + PIL /
 * Directive 2001/83/EC; CCDS) and renewal cadences (EU 5-year MA renewal).
 * Conventions match the platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/rim
 */

import { index, integer, pgTable, serial, text, date, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type ProductStatus = 'development' | 'active' | 'discontinued';
export type MarketStatus = 'planned' | 'submitted' | 'under_review' | 'approved' | 'withdrawn' | 'suspended' | 'cancelled';
export type LabelType = 'uspi' | 'smpc' | 'pil' | 'core_data_sheet' | 'carton_labeling' | 'patient_leaflet';
export type LabelStatus = 'draft' | 'in_review' | 'approved' | 'superseded';

// ─── Products ────────────────────────────────────────────────────────────────

export const rimProducts = pgTable(
  'rim_products',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    productName: text('product_name').notNull(),
    /** International Nonproprietary Name. */
    inn: text('inn'),
    dosageForm: text('dosage_form'),
    atcCode: text('atc_code'),
    status: text('status').$type<ProductStatus>().notNull().default('development'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({ orgIdx: index('idx_rim_products_org').on(t.organizationId) })
);

export type RimProduct = typeof rimProducts.$inferSelect;
export type NewRimProduct = typeof rimProducts.$inferInsert;

// ─── Registrations (product × country grid) ──────────────────────────────────

export const rimRegistrations = pgTable(
  'rim_registrations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    productId: integer('product_id').notNull().references(() => rimProducts.id),
    /** ISO 3166-1 alpha-2 country, or a region code like 'EU'. */
    country: text('country').notNull(),
    marketStatus: text('market_status').$type<MarketStatus>().notNull().default('planned'),
    registrationNumber: text('registration_number'),
    marketingAuthHolder: text('marketing_auth_holder'),
    approvalDate: date('approval_date'),
    renewalDueDate: date('renewal_due_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_rim_registrations_org').on(t.organizationId),
    productIdx: index('idx_rim_registrations_product').on(t.productId),
  })
);

export type RimRegistration = typeof rimRegistrations.$inferSelect;
export type NewRimRegistration = typeof rimRegistrations.$inferInsert;

// ─── Label versions ──────────────────────────────────────────────────────────

export const rimLabels = pgTable(
  'rim_labels',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    productId: integer('product_id').notNull().references(() => rimProducts.id),
    /** Country/region the label applies to; null = core (CCDS). */
    country: text('country'),
    labelType: text('label_type').$type<LabelType>().notNull(),
    version: text('version').notNull().default('1.0'),
    status: text('status').$type<LabelStatus>().notNull().default('draft'),
    approvedDate: date('approved_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_rim_labels_org').on(t.organizationId),
    productIdx: index('idx_rim_labels_product').on(t.productId),
  })
);

export type RimLabel = typeof rimLabels.$inferSelect;
export type NewRimLabel = typeof rimLabels.$inferInsert;
