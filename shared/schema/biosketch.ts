/**
 * NIH Biosketch builder (Capability C2C-24B)
 *
 * The biosketch side of grant proposal development: a section-based NIH biosketch
 * for a senior/key person, composed of the required sections of the NIH biosketch
 * format (A. Personal Statement; B. Positions, Scientific Appointments & Honors;
 * C. Contributions to Science), each tracked for whether it has been addressed +
 * its content so completeness can be scored before the biosketch is finalized.
 * Required for all senior/key personnel; format per the NIH biosketch instructions
 * (FORMS-H). Soft-links to a research_personnel(id) via personnel_id and a
 * grant_proposals(id) via grant_proposal_id (nullable integers, no FK).
 *
 * Conventions match the platform; status/type columns are CHECK-constrained.
 * Mutations are governed + audited under the 'protocol_development' domain.
 *
 * @module shared/schema/biosketch
 */

import { boolean, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

export type BiosketchStatus = 'draft' | 'in_development' | 'in_review' | 'final';
export type BiosketchType = 'nih' | 'nsf' | 'other';

// ─── Biosketches ───────────────────────────────────────────────────────────────

export const biosketches = pgTable(
  'biosketches',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Soft reference to research_personnel(id). */
    personnelId: integer('personnel_id'),
    /** Soft reference to grant_proposals(id). */
    grantProposalId: integer('grant_proposal_id'),
    personName: text('person_name').notNull(),
    biosketchType: text('biosketch_type').$type<BiosketchType>().notNull().default('nih'),
    status: text('status').$type<BiosketchStatus>().notNull().default('draft'),
    finalizedBy: integer('finalized_by').references(() => users.id),
    finalizedAt: timestamp('finalized_at', { withTimezone: true }),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_biosketches_org').on(t.organizationId),
    personnelIdx: index('idx_biosketches_personnel').on(t.personnelId),
    proposalIdx: index('idx_biosketches_proposal').on(t.grantProposalId),
  }),
);

export type Biosketch = typeof biosketches.$inferSelect;
export type NewBiosketch = typeof biosketches.$inferInsert;

// ─── Biosketch sections ──────────────────────────────────────────────────────

export const biosketchSections = pgTable(
  'biosketch_sections',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    biosketchId: integer('biosketch_id').notNull().references(() => biosketches.id),
    /** Stable key (e.g. 'personal_statement', 'positions_honors'). */
    sectionKey: text('section_key').notNull(),
    title: text('title').notNull(),
    content: text('content'),
    addressed: boolean('addressed').notNull().default(false),
    orderIndex: integer('order_index').notNull().default(0),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (t) => ({
    orgIdx: index('idx_biosketch_sections_org').on(t.organizationId),
    bioIdx: index('idx_biosketch_sections_bio').on(t.biosketchId),
  }),
);

export type BiosketchSection = typeof biosketchSections.$inferSelect;
export type NewBiosketchSection = typeof biosketchSections.$inferInsert;
