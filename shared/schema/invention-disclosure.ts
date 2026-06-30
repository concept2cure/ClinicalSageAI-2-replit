/**
 * Invention Disclosure / Technology Transfer (Capability C2C-25)
 *
 * The tech-transfer lifecycle: a researcher discloses an invention to the
 * institution's technology-transfer office (TTO), which evaluates it, elects title,
 * pursues patenting, and tracks commercialization. For federally-funded inventions
 * the Bayh-Dole Act (35 U.S.C. §200–212, 37 CFR 401) imposes a reporting timeline —
 * disclosure to the funding agency, election of title, and filing — that the
 * deterministic logic computes and tracks.
 *
 * Soft-links to grant_proposals(id) via grant_proposal_id (nullable integer, no FK —
 * matching the platform's cross-domain soft-ref convention).
 *
 * Conventions match the platform; status columns are CHECK-constrained. Mutations
 * are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/invention-disclosure
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type InventionStatus = 'submitted' | 'under_review' | 'elected' | 'patent_filed' | 'licensed' | 'released' | 'abandoned';

export const inventionDisclosures = pgTable(
  'invention_disclosures',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to grant_proposals(id). */
    grantProposalId: integer('grant_proposal_id'),
    title: text('title').notNull(),
    inventors: text('inventors'),
    fundingSource: text('funding_source'),
    federalFunding: boolean('federal_funding').notNull().default(false),
    federalAward: text('federal_award'),
    /** Date the inventor disclosed to the institution (drives the Bayh-Dole clock). */
    disclosureDate: date('disclosure_date'),
    /** Date the institution elected to retain title (drives the filing clock). */
    electionDate: date('election_date'),
    status: text('status').$type<InventionStatus>().notNull().default('submitted'),
    decisionRationale: text('decision_rationale'),
    reviewedBy: integer('reviewed_by').references(() => users.id),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_invention_disclosures_org').on(t.organizationId),
    proposalIdx: index('idx_invention_disclosures_proposal').on(t.grantProposalId),
    statusIdx: index('idx_invention_disclosures_status').on(t.status),
  }),
);

export type InventionDisclosure = typeof inventionDisclosures.$inferSelect;
export type NewInventionDisclosure = typeof inventionDisclosures.$inferInsert;
