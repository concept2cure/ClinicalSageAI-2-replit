/**
 * Research Agreements — MTA / DUA / CDA (Capability C2C-27)
 *
 * Material Transfer, Data Use and Confidential Disclosure agreements for moving
 * materials or data into or out of the institution. Tracks the agreement type,
 * direction, parties, the material/data described, and the compliance flags that
 * gate execution — most importantly PHI handling under HIPAA (a Data Use Agreement
 * with a limited data set per 45 CFR 164.514(e), or de-identification per
 * 164.514(b)), human-subjects data, and IP/publication terms.
 *
 * Soft-links to grant_proposals(id) via grant_proposal_id and protocol_documents(id)
 * via protocol_document_id (nullable integers, no FK).
 *
 * Conventions match the platform; status/enum columns are CHECK-constrained.
 * Mutations are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/research-agreements
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type AgreementType = 'mta' | 'dua' | 'cda';
export type AgreementDirection = 'incoming' | 'outgoing';
export type AgreementStatus = 'draft' | 'under_review' | 'negotiation' | 'executed' | 'expired' | 'terminated';

export const researchAgreements = pgTable(
  'research_agreements',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft references. */
    grantProposalId: integer('grant_proposal_id'),
    protocolDocumentId: integer('protocol_document_id'),
    agreementType: text('agreement_type').$type<AgreementType>().notNull().default('mta'),
    direction: text('direction').$type<AgreementDirection>().notNull().default('incoming'),
    title: text('title').notNull(),
    ourParty: text('our_party'),
    otherParty: text('other_party').notNull(),
    materialOrDataDescription: text('material_or_data_description'),
    containsPhi: boolean('contains_phi').notNull().default(false),
    containsHumanData: boolean('contains_human_data').notNull().default(false),
    isDeidentified: boolean('is_deidentified').notNull().default(false),
    limitedDataSet: boolean('limited_data_set').notNull().default(false),
    ipRightsTerms: text('ip_rights_terms'),
    publicationRights: boolean('publication_rights').notNull().default(true),
    status: text('status').$type<AgreementStatus>().notNull().default('draft'),
    effectiveDate: date('effective_date'),
    expirationDate: date('expiration_date'),
    executedBy: integer('executed_by').references(() => users.id),
    executedAt: timestamp('executed_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_research_agreements_org').on(t.organizationId),
    proposalIdx: index('idx_research_agreements_proposal').on(t.grantProposalId),
    statusIdx: index('idx_research_agreements_status').on(t.status),
  }),
);

export type ResearchAgreement = typeof researchAgreements.$inferSelect;
export type NewResearchAgreement = typeof researchAgreements.$inferInsert;
