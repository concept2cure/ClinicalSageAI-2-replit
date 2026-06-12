/**
 * Research Security / COI-FCOI Disclosure (add-on; NOT-OD-26-017 / NSPM-33)
 *
 * Institutional conflict-of-interest and research-security disclosure — distinct
 * from the 21 CFR 54 clinical-investigator module (C2C-01): outside activities,
 * financial interests, foreign appointments / support / "other support", and
 * gifts, with committee review and a management-plan disposition.
 *
 * Grounded in PHS FCOI (42 CFR 50 Subpart F / 45 CFR 94), NSPM-33 research
 * security, and NIH NOT-OD-26-017 / Other Support disclosure. Conventions match
 * the platform; status/type columns are CHECK-constrained.
 *
 * @module shared/schema/research-security
 */

import { index, integer, pgTable, serial, text, date, numeric, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { researchPersonnel } from './research-compliance';

export type CoiDisclosureType = 'financial_interest' | 'outside_activity' | 'foreign_appointment' | 'foreign_support' | 'other_support' | 'gift' | 'intellectual_property' | 'other';
export type CoiStatus = 'submitted' | 'under_review' | 'no_conflict' | 'managed' | 'conflict' | 'denied';

export const coiDisclosures = pgTable(
  'coi_disclosures',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    personnelId: integer('personnel_id').notNull().references(() => researchPersonnel.id),
    disclosureType: text('disclosure_type').$type<CoiDisclosureType>().notNull(),
    entityName: text('entity_name').notNull(),
    /** ISO country for foreign appointments/support (research-security flag). */
    country: text('country'),
    description: text('description'),
    monetaryValue: numeric('monetary_value', { precision: 14, scale: 2 }),
    relatedToResearch: text('related_to_research'), // narrative: relationship to funded research
    status: text('status').$type<CoiStatus>().notNull().default('submitted'),
    reviewedBy: integer('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    managementPlan: text('management_plan'),
    disclosedDate: date('disclosed_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_coi_disclosures_org').on(t.organizationId),
    personnelIdx: index('idx_coi_disclosures_personnel').on(t.personnelId),
  })
);

export type CoiDisclosure = typeof coiDisclosures.$inferSelect;
export type NewCoiDisclosure = typeof coiDisclosures.$inferInsert;
