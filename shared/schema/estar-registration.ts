/**
 * eSTAR client registration (persistence)
 *
 * Records a client's (organization's) FDA eSTAR registration state — the
 * prerequisites CDRH/CBER require before a client can transmit eSTAR
 * submissions. The pure eligibility model
 * (server/services/pathway-engines/estar/estar-registration.ts) computes
 * per-submission eligibility from an `EstarClientRegistration`; THIS table is
 * the persisted source of truth the service layer bridges into that model, so a
 * client registers once and files many submissions instead of hand-constructing
 * a registration payload per request.
 *
 * One row per organization (unique organization_id). The four boolean columns
 * mirror the pure model's `EstarRegistrationRequirement` union so the bridge is
 * mechanical.
 *
 * Conventions copied from shared/schema/ind-master-data.ts: uuid PK,
 * drizzle-zod inserts, and the canonical integer `organization_id` tenant
 * column the service layer scopes every query by.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * INTEGRATION NOTES (action required by a human — NOT done here):
 *   1. Add  `export * from './estar-registration'`  to shared/schema/index.ts.
 *   2. Run the migration  migrations/20260730_estar_registration.sql  against
 *      the database (or via the project's migration runner).
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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

export const estarRegistrations = pgTable(
  'estar_registrations',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Tenant — never trusted from request input; set by the service layer.
    organizationId: integer('organization_id').notNull(),

    // The four FDA eSTAR prerequisites — whether the client currently holds each.
    // Mirrors EstarRegistrationRequirement in the pure eligibility model.
    fdaEsgAccount: boolean('fda_esg_account').notNull().default(false),
    cdrhPortalAccount: boolean('cdrh_portal_account').notNull().default(false),
    organizationIdentity: boolean('organization_identity').notNull().default(false),
    mdufaFeeAccount: boolean('mdufa_fee_account').notNull().default(false),

    // Supporting identifiers captured for the eSTAR administrative page (optional).
    esgAccountId: varchar('esg_account_id', { length: 128 }),
    cdrhPortalEmail: varchar('cdrh_portal_email', { length: 256 }),
    duns: varchar('duns', { length: 16 }),
    fei: varchar('fei', { length: 16 }),
    mdufaOrgId: varchar('mdufa_org_id', { length: 64 }),
    // 'standard' | 'small_business' — MDUFA fee tier.
    mdufaFeeTier: varchar('mdufa_fee_tier', { length: 32 }),

    // Device variants the client is set up to file: subset of ['device','ivd'].
    variants: jsonb('variants').$type<Array<'device' | 'ivd'>>().notNull().default(['device', 'ivd']),

    notes: text('notes'),

    // Org-level facts the official eSTAR's Correspondent Information section
    // and Declaration of Conformity page ask for (WO-8 Phase 3;
    // migrations/20260903_estar_registration_correspondent.sql). The eSTAR
    // administrative-data projection reads them as governed sources
    // (estar_registrations.<column>). Nullable: blank is reported, never guessed.
    correspondentCompanyName: varchar('correspondent_company_name', { length: 256 }),
    correspondentContactEmail: varchar('correspondent_contact_email', { length: 256 }),
    correspondentTelephone: varchar('correspondent_telephone', { length: 64 }),
    // The Declaration of Conformity is signed by ONE legal entity, so its
    // company name pairs with declaration_company_address on this same row
    // (migrations/20260904_estar_registration_declaration_company_name.sql).
    // Blank falls back to the applicant workspace / organization name, which is
    // what the DoC name resolved to before this column existed.
    declarationCompanyName: varchar('declaration_company_name', { length: 256 }),
    declarationCompanyAddress: text('declaration_company_address'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdBy: integer('created_by'),
  },
  (t) => ({
    // One registration per organization.
    byOrg: uniqueIndex('estar_registrations_org_uq').on(t.organizationId),
  }),
);

export type EstarRegistrationRow = InferSelectModel<typeof estarRegistrations>;

export const insertEstarRegistrationSchema = createInsertSchema(estarRegistrations, {
  variants: z.array(z.enum(['device', 'ivd'])).optional(),
});
export type InsertEstarRegistration = z.infer<typeof insertEstarRegistrationSchema>;
