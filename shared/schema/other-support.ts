/**
 * NIH Other Support document builder (Capability C2C-24A)
 *
 * The disclosure side of grant proposal development: an NIH "Other Support"
 * document for a PD/PI or senior/key person listing all resources (financial and
 * in-kind, foreign and domestic) available in support of their research, with
 * committed person-months, active/pending status, major goals and an overlap
 * statement per project. Required at Just-in-Time / RPPR and digitally certified
 * via SciENcv since FORMS-H (eff. 2023-01-25). Grounded in NIH GPS 2.5.1 and the
 * research-security disclosure notices (NOT-OD-19-114, NOT-OD-21-073).
 *
 * Soft-links to a research_personnel(id) record via personnel_id and to a
 * grant_proposals(id) record via grant_proposal_id (nullable integers, no FK —
 * matching the platform's cross-domain soft-ref convention). Person identity is
 * also captured as free text so a roster row is optional.
 *
 * Conventions match the platform; status/type columns are CHECK-constrained.
 * Mutations are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/other-support
 */

import { boolean, index, integer, numeric, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type OtherSupportStatus = 'draft' | 'in_progress' | 'certified' | 'superseded';
export type OtherSupportType = 'grant' | 'contract' | 'in_kind' | 'other';
export type OtherSupportEntryStatus = 'active' | 'pending';

// ─── Other Support documents ───────────────────────────────────────────────────

export const otherSupportDocuments = pgTable(
  'other_support_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to research_personnel(id). */
    personnelId: integer('personnel_id'),
    /** Soft reference to grant_proposals(id). */
    grantProposalId: integer('grant_proposal_id'),
    personName: text('person_name').notNull(),
    eraCommonsId: text('era_commons_id'),
    role: text('role'),
    status: text('status').$type<OtherSupportStatus>().notNull().default('draft'),
    certifiedBy: integer('certified_by').references(() => users.id),
    certifiedAt: timestamp('certified_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_other_support_docs_org').on(t.organizationId),
    personnelIdx: index('idx_other_support_docs_personnel').on(t.personnelId),
    proposalIdx: index('idx_other_support_docs_proposal').on(t.grantProposalId),
  }),
);

export type OtherSupportDocument = typeof otherSupportDocuments.$inferSelect;
export type NewOtherSupportDocument = typeof otherSupportDocuments.$inferInsert;

// ─── Other Support entries (one row per funding source / resource) ─────────────

export const otherSupportEntries = pgTable(
  'other_support_entries',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    documentId: integer('document_id').notNull().references(() => otherSupportDocuments.id),
    supportType: text('support_type').$type<OtherSupportType>().notNull().default('grant'),
    projectTitle: text('project_title').notNull(),
    fundingSource: text('funding_source').notNull(),
    status: text('status').$type<OtherSupportEntryStatus>().notNull().default('active'),
    isForeign: boolean('is_foreign').notNull().default(false),
    foreignCountry: text('foreign_country'),
    personMonthsCalendar: numeric('person_months_calendar', { precision: 6, scale: 2 }).notNull().default('0'),
    personMonthsAcademic: numeric('person_months_academic', { precision: 6, scale: 2 }).notNull().default('0'),
    personMonthsSummer: numeric('person_months_summer', { precision: 6, scale: 2 }).notNull().default('0'),
    majorGoals: text('major_goals'),
    overlapStatement: text('overlap_statement'),
    awardIdentifier: text('award_identifier'),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_other_support_entries_org').on(t.organizationId),
    docIdx: index('idx_other_support_entries_doc').on(t.documentId),
  }),
);

export type OtherSupportEntry = typeof otherSupportEntries.$inferSelect;
export type NewOtherSupportEntry = typeof otherSupportEntries.$inferInsert;
