/**
 * IND Master-Data Registries — sponsor, US agent, investigator
 *
 * Reusable master data for IND submissions (FDA Form 1571 / 1572). These are
 * org-scoped registries the IND assembly flow draws from so the same sponsor,
 * US agent, and investigator records do not have to be re-keyed per submission.
 *
 *   sponsors            — the IND sponsor (Form 1571 §1, signatory block).
 *   regulatory_agents   — US agent for a foreign sponsor, per 21 CFR 312.3.
 *   investigators       — clinical investigators (Form 1572): site, IRB, sub-Is.
 *
 * Conventions copied from shared/schema/q-sub.ts (uuid PK + drizzle-zod inserts)
 * combined with the canonical integer `organization_id` tenant column used by
 * the core (shared/schema.ts) so the service layer can scope every query by the
 * caller's organizationId exactly as submission-service does.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTEGRATION NOTES (action required by a human — NOT done here):
 *   1. Add  `export * from './ind-master-data'`  to shared/schema/index.ts
 *      (alongside the other domain re-exports near the bottom of that file).
 *   2. Run the migration  migrations/20260609_ind_master_data.sql  against the
 *      database (or via the project's migration runner) to create the three
 *      tables and their organization_id indexes.
 * ────────────────────────────────────────────────────────────────────────────
 */

import { InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
  boolean,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────────────────
// Sponsors — IND sponsor (FDA Form 1571), incl. signatory block
// ─────────────────────────────────────────────────────────────────────────────

export const sponsors = pgTable(
  'ind_sponsors',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    // Legal sponsor name as it appears on the IND.
    name: text('name').notNull(),

    // Mailing address.
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: varchar('city', { length: 128 }),
    stateProvince: varchar('state_province', { length: 128 }),
    postalCode: varchar('postal_code', { length: 32 }),
    country: varchar('country', { length: 64 }),

    // Primary point of contact.
    contactName: text('contact_name'),
    contactPhone: varchar('contact_phone', { length: 64 }),
    contactEmail: varchar('contact_email', { length: 256 }),

    // Dun & Bradstreet number (FDA requires a DUNS for the sponsor).
    duns: varchar('duns', { length: 16 }),

    // Authorized signatory (signs Form 1571).
    signatoryName: text('signatory_name'),
    signatoryTitle: text('signatory_title'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by'),
  },
  (t) => ({
    byOrg: index('ind_sponsors_org_idx').on(t.organizationId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Regulatory agents — US agent for a foreign sponsor (21 CFR 312.3)
// ─────────────────────────────────────────────────────────────────────────────

export const regulatoryAgents = pgTable(
  'ind_regulatory_agents',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    organizationId: integer('organization_id').notNull(),

    // Agent name (person or firm).
    name: text('name').notNull(),

    // US address — a US agent must maintain a US place of business.
    addressLine1: text('address_line1'),
    addressLine2: text('address_line2'),
    city: varchar('city', { length: 128 }),
    stateProvince: varchar('state_province', { length: 128 }),
    postalCode: varchar('postal_code', { length: 32 }),
    country: varchar('country', { length: 64 }),

    // Contact.
    contactName: text('contact_name'),
    contactPhone: varchar('contact_phone', { length: 64 }),
    contactEmail: varchar('contact_email', { length: 256 }),

    // True when this record is acting as the 21 CFR 312.3 US agent for a
    // foreign sponsor (as opposed to a general regulatory contact).
    isUsAgent: boolean('is_us_agent').notNull().default(true),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by'),
  },
  (t) => ({
    byOrg: index('ind_regulatory_agents_org_idx').on(t.organizationId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Investigators — clinical investigators (FDA Form 1572)
// ─────────────────────────────────────────────────────────────────────────────

export const investigators = pgTable(
  'ind_investigators',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    organizationId: integer('organization_id').notNull(),

    firstName: text('first_name').notNull(),
    lastName: text('last_name').notNull(),

    // Degrees / qualifications (e.g. 'MD, PhD').
    credentials: varchar('credentials', { length: 128 }),

    // Investigational site (Form 1572 §1).
    siteName: text('site_name'),
    siteAddress: text('site_address'),

    // Reviewing IRB (Form 1572 §4).
    irbName: text('irb_name'),
    irbAddress: text('irb_address'),

    // Reference to the investigator's CV in the vault / document store.
    cvDocumentRef: text('cv_document_ref'),

    phone: varchar('phone', { length: 64 }),
    email: varchar('email', { length: 256 }),

    // Sub-investigators listed on Form 1572 §6. Free-shape so callers can carry
    // name/role/credentials per entry without a join table.
    subInvestigators: jsonb('sub_investigators').notNull().default([]),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by'),
  },
  (t) => ({
    byOrg: index('ind_investigators_org_idx').on(t.organizationId),
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type Sponsor          = InferSelectModel<typeof sponsors>;
export type RegulatoryAgent  = InferSelectModel<typeof regulatoryAgents>;
export type Investigator     = InferSelectModel<typeof investigators>;

// ─────────────────────────────────────────────────────────────────────────────
// drizzle-zod insert schemas + inferred insert types
// ─────────────────────────────────────────────────────────────────────────────

/** One sub-investigator entry (Form 1572 §6). */
export const subInvestigatorSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  credentials: z.string().optional(),
});
export type SubInvestigator = z.infer<typeof subInvestigatorSchema>;

export const insertSponsorSchema = createInsertSchema(sponsors, {
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
});

export const insertRegulatoryAgentSchema = createInsertSchema(regulatoryAgents, {
  name: z.string().min(1),
  contactEmail: z.string().email().optional(),
});

export const insertInvestigatorSchema = createInsertSchema(investigators, {
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  email: z.string().email().optional(),
  subInvestigators: z.array(subInvestigatorSchema).optional(),
});

export type InsertSponsor         = z.infer<typeof insertSponsorSchema>;
export type InsertRegulatoryAgent = z.infer<typeof insertRegulatoryAgentSchema>;
export type InsertInvestigator    = z.infer<typeof insertInvestigatorSchema>;

// ─────────────────────────────────────────────────────────────────────────────
// Table-name list — for migration verification / introspection tooling.
// ─────────────────────────────────────────────────────────────────────────────

export const IND_MASTER_DATA_TABLES = [
  'ind_sponsors',
  'ind_regulatory_agents',
  'ind_investigators',
] as const;

export type IndMasterDataTableName = (typeof IND_MASTER_DATA_TABLES)[number];
