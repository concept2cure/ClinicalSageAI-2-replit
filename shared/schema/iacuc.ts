/**
 * IACUC / Animal Study Governance (Capability C2C-05)
 *
 * Institutional Animal Care and Use Committee protocols, animal census, committee
 * review/determinations, amendments, and semi-annual facility inspections. The
 * IACUC protocol is the ORIGIN NODE of the preclinical provenance chain: an
 * approved protocol threads forward (provenance_links) to the nonclinical studies
 * it authorizes and into Module 4.
 *
 * Grounded in PHS Policy on Humane Care and Use of Laboratory Animals, the Animal
 * Welfare Act (9 CFR Ch. I), NIH OLAW, and the USDA pain/distress categories
 * (B/C/D/E). Conventions match the platform; status/type columns are
 * CHECK-constrained in the SQL migration. Mutations are governed + audited.
 *
 * @module shared/schema/iacuc
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { submissions } from './submissions';

/** USDA pain/distress categories (Annual Report column). */
export type UsdaPainCategory = 'B' | 'C' | 'D' | 'E';

export type IacucReviewType = 'designated_member_review' | 'full_committee_review';

export type IacucProtocolStatus =
  | 'draft'
  | 'submitted'
  | 'dmr' // under designated member review
  | 'fcr' // under full committee review
  | 'approved'
  | 'conditional' // approved pending modifications
  | 'tabled'
  | 'withdrawn'
  | 'expired';

export type CohortStatus = 'requested' | 'approved' | 'housed' | 'completed';
export type AmendmentStatus = 'submitted' | 'approved' | 'rejected';
export type InspectionStatus = 'scheduled' | 'completed';

// ─── IACUC protocols ─────────────────────────────────────────────────────────

export const iacucProtocols = pgTable(
  'iacuc_protocols',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Optional link to the marketing/IND submission this preclinical work feeds (Module 4). */
    submissionId: integer('submission_id').references(() => submissions.id),
    protocolNumber: text('protocol_number').notNull(),
    title: text('title').notNull(),
    /** Highest USDA pain category across the protocol's procedures. */
    painCategory: text('pain_category').$type<UsdaPainCategory>().notNull(),
    reviewType: text('review_type').$type<IacucReviewType>(),
    status: text('status').$type<IacucProtocolStatus>().notNull().default('draft'),
    /** The 3 Rs justifications (Replacement / Reduction / Refinement). */
    threeRsReplacement: text('three_rs_replacement'),
    threeRsReduction: text('three_rs_reduction'),
    threeRsRefinement: text('three_rs_refinement'),
    /** Scientific justification required for category E (unrelieved pain). */
    painJustification: text('pain_justification'),
    approvalDate: date('approval_date'),
    /** De novo review required every 3 years (PHS Policy IV.C.5). */
    expirationDate: date('expiration_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_iacuc_protocols_org').on(t.organizationId),
    submissionIdx: index('idx_iacuc_protocols_submission').on(t.submissionId),
  })
);

export type IacucProtocol = typeof iacucProtocols.$inferSelect;
export type NewIacucProtocol = typeof iacucProtocols.$inferInsert;

// ─── Animal cohorts (census / management) ────────────────────────────────────

export const iacucAnimalCohorts = pgTable(
  'iacuc_animal_cohorts',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolId: integer('protocol_id').notNull().references(() => iacucProtocols.id),
    species: text('species').notNull(),
    strain: text('strain'),
    plannedCount: integer('planned_count').notNull().default(0),
    housedCount: integer('housed_count').notNull().default(0),
    painCategory: text('pain_category').$type<UsdaPainCategory>().notNull(),
    housingLocation: text('housing_location'),
    status: text('status').$type<CohortStatus>().notNull().default('requested'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_iacuc_cohorts_org').on(t.organizationId),
    protocolIdx: index('idx_iacuc_cohorts_protocol').on(t.protocolId),
  })
);

export type IacucAnimalCohort = typeof iacucAnimalCohorts.$inferSelect;
export type NewIacucAnimalCohort = typeof iacucAnimalCohorts.$inferInsert;

// ─── Committee reviews / determinations ──────────────────────────────────────

export const iacucReviews = pgTable(
  'iacuc_reviews',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolId: integer('protocol_id').notNull().references(() => iacucProtocols.id),
    reviewType: text('review_type').$type<IacucReviewType>().notNull(),
    reviewerCount: integer('reviewer_count').notNull().default(1),
    outcome: text('outcome').$type<'approved' | 'conditional' | 'tabled' | 'withdrawn'>().notNull(),
    conditions: text('conditions'),
    determinationDate: date('determination_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_iacuc_reviews_org').on(t.organizationId),
    protocolIdx: index('idx_iacuc_reviews_protocol').on(t.protocolId),
  })
);

export type IacucReview = typeof iacucReviews.$inferSelect;
export type NewIacucReview = typeof iacucReviews.$inferInsert;

// ─── Amendments ──────────────────────────────────────────────────────────────

export const iacucAmendments = pgTable(
  'iacuc_amendments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    protocolId: integer('protocol_id').notNull().references(() => iacucProtocols.id),
    description: text('description').notNull(),
    /** Significant changes require full committee review; minor changes can be DMR/admin. */
    significant: boolean('significant').notNull().default(false),
    status: text('status').$type<AmendmentStatus>().notNull().default('submitted'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_iacuc_amendments_org').on(t.organizationId),
    protocolIdx: index('idx_iacuc_amendments_protocol').on(t.protocolId),
  })
);

export type IacucAmendment = typeof iacucAmendments.$inferSelect;
export type NewIacucAmendment = typeof iacucAmendments.$inferInsert;

// ─── Semi-annual facility inspections (PHS Policy IV.B.1-2) ───────────────────

export const iacucFacilityInspections = pgTable(
  'iacuc_facility_inspections',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    facilityName: text('facility_name').notNull(),
    inspectionDate: date('inspection_date'),
    status: text('status').$type<InspectionStatus>().notNull().default('scheduled'),
    findings: text('findings'),
    deficiencyCount: integer('deficiency_count').notNull().default(0),
    significantDeficiencyCount: integer('significant_deficiency_count').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_iacuc_inspections_org').on(t.organizationId),
  })
);

export type IacucFacilityInspection = typeof iacucFacilityInspections.$inferSelect;
export type NewIacucFacilityInspection = typeof iacucFacilityInspections.$inferInsert;
