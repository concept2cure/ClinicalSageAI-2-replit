/**
 * IBC / Biosafety (Capability C2C-07)
 *
 * Institutional Biosafety Committee registration of research with recombinant or
 * synthetic nucleic acid molecules, biological agents, and containment — the
 * clearance that gates modality-heavy programs (cell & gene therapy, mRNA, viral
 * vectors). An approved registration threads biosafety clearance forward to the
 * IND-enabling record via provenance_links.
 *
 * Grounded in the NIH Guidelines for Research Involving Recombinant or Synthetic
 * Nucleic Acid Molecules and the CDC/NIH BMBL (biosafety levels BSL-1..4; risk
 * groups RG1..4). Conventions match the platform; status/type columns are
 * CHECK-constrained. Mutations are governed + audited.
 *
 * @module shared/schema/ibc
 */

import { index, integer, pgTable, serial, text, date, boolean, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { submissions } from './submissions';

export type BiosafetyLevel = 'BSL-1' | 'BSL-2' | 'BSL-3' | 'BSL-4';
export type RiskGroup = 'RG1' | 'RG2' | 'RG3' | 'RG4';

/** NIH Guidelines experiment categories (Section III). */
export type NihGuidelinesSection = 'III-A' | 'III-B' | 'III-C' | 'III-D' | 'III-E' | 'III-F' | 'exempt' | 'not_applicable';

export type IbcStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'conditional' | 'disapproved' | 'expired' | 'closed';

export type AgentType = 'virus' | 'bacterium' | 'fungus' | 'toxin' | 'viral_vector' | 'cell_line' | 'recombinant_construct' | 'other';

// ─── Registrations ───────────────────────────────────────────────────────────

export const ibcRegistrations = pgTable(
  'ibc_registrations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    /** Optional IND-enabling submission this clearance supports. */
    submissionId: integer('submission_id').references(() => submissions.id),
    registrationNumber: text('registration_number').notNull(),
    title: text('title').notNull(),
    nihGuidelinesSection: text('nih_guidelines_section').$type<NihGuidelinesSection>().notNull().default('not_applicable'),
    /** Declared containment for the work. */
    biosafetyLevel: text('biosafety_level').$type<BiosafetyLevel>().notNull().default('BSL-1'),
    involvesRecombinantDna: boolean('involves_recombinant_dna').notNull().default(false),
    /** Human gene transfer (CGT) — NIH Guidelines III-C / additional oversight. */
    involvesHumanGeneTransfer: boolean('involves_human_gene_transfer').notNull().default(false),
    status: text('status').$type<IbcStatus>().notNull().default('draft'),
    approvalDate: date('approval_date'),
    expirationDate: date('expiration_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_ibc_registrations_org').on(t.organizationId),
    submissionIdx: index('idx_ibc_registrations_submission').on(t.submissionId),
  })
);

export type IbcRegistration = typeof ibcRegistrations.$inferSelect;
export type NewIbcRegistration = typeof ibcRegistrations.$inferInsert;

// ─── Biological agents ───────────────────────────────────────────────────────

export const ibcBiologicalAgents = pgTable(
  'ibc_biological_agents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    registrationId: integer('registration_id').notNull().references(() => ibcRegistrations.id),
    agentName: text('agent_name').notNull(),
    agentType: text('agent_type').$type<AgentType>().notNull(),
    riskGroup: text('risk_group').$type<RiskGroup>().notNull(),
    /** BSL the agent requires (from the risk-group mapping; may exceed the declared level → finding). */
    requiredBsl: text('required_bsl').$type<BiosafetyLevel>().notNull(),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_ibc_agents_org').on(t.organizationId),
    registrationIdx: index('idx_ibc_agents_registration').on(t.registrationId),
  })
);

export type IbcBiologicalAgent = typeof ibcBiologicalAgents.$inferSelect;
export type NewIbcBiologicalAgent = typeof ibcBiologicalAgents.$inferInsert;

// ─── Determinations ──────────────────────────────────────────────────────────

export const ibcReviews = pgTable(
  'ibc_reviews',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    registrationId: integer('registration_id').notNull().references(() => ibcRegistrations.id),
    outcome: text('outcome').$type<'approved' | 'conditional' | 'disapproved' | 'tabled'>().notNull(),
    /** Whether a quorum of the convened IBC voted (required for III-A/B/C). */
    convenedQuorum: boolean('convened_quorum').notNull().default(false),
    conditions: text('conditions'),
    determinationDate: date('determination_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_ibc_reviews_org').on(t.organizationId),
    registrationIdx: index('idx_ibc_reviews_registration').on(t.registrationId),
  })
);

export type IbcReview = typeof ibcReviews.$inferSelect;
export type NewIbcReview = typeof ibcReviews.$inferInsert;
