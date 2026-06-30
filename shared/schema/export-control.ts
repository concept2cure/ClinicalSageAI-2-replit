/**
 * Export Control review (ITAR / EAR / OFAC) (Capability C2C-26)
 *
 * Export-control screening for research: classify a project/technology under ITAR
 * (22 CFR 120–130, USML), the EAR (15 CFR 730–774, CCL / EAR99) or OFAC sanctions,
 * decide whether the Fundamental Research Exclusion applies (15 CFR 734.8 / NSDD-189),
 * and determine whether an export (including a deemed export to a foreign national)
 * requires a license. The legal determination is computed deterministically by the
 * pure logic; narrative rationale is advisory.
 *
 * Soft-links to grant_proposals(id) via grant_proposal_id (nullable integer, no FK).
 *
 * Conventions match the platform; status/enum columns are CHECK-constrained.
 * Mutations are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/export-control
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type ExportJurisdiction = 'itar' | 'ear' | 'ofac' | 'not_subject' | 'pending';
export type ExportLicenseRequired = 'yes' | 'no' | 'unknown';
export type ExportReviewStatus = 'draft' | 'under_review' | 'determined' | 'expired';

export const exportControlReviews = pgTable(
  'export_control_reviews',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to grant_proposals(id). */
    grantProposalId: integer('grant_proposal_id'),
    projectTitle: text('project_title').notNull(),
    description: text('description'),
    jurisdiction: text('jurisdiction').$type<ExportJurisdiction>().notNull().default('pending'),
    /** USML category (ITAR) or ECCN / EAR99 (EAR) — free text. */
    classification: text('classification'),
    involvesForeignNationals: boolean('involves_foreign_nationals').notNull().default(false),
    foreignCountries: text('foreign_countries'),
    fundamentalResearchExclusion: boolean('fundamental_research_exclusion').notNull().default(false),
    hasPublicationRestrictions: boolean('has_publication_restrictions').notNull().default(false),
    hasProprietaryRestrictions: boolean('has_proprietary_restrictions').notNull().default(false),
    involvesPhysicalExport: boolean('involves_physical_export').notNull().default(false),
    licenseRequired: text('license_required').$type<ExportLicenseRequired>().notNull().default('unknown'),
    determinationRationale: text('determination_rationale'),
    status: text('status').$type<ExportReviewStatus>().notNull().default('draft'),
    determinedBy: integer('determined_by').references(() => users.id),
    determinedAt: timestamp('determined_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_export_control_reviews_org').on(t.organizationId),
    proposalIdx: index('idx_export_control_reviews_proposal').on(t.grantProposalId),
    statusIdx: index('idx_export_control_reviews_status').on(t.status),
  }),
);

export type ExportControlReview = typeof exportControlReviews.$inferSelect;
export type NewExportControlReview = typeof exportControlReviews.$inferInsert;
