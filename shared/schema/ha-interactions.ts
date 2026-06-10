/**
 * Health-Authority Interaction & Commitment Management (Capability C2C-03)
 *
 * Threads the regulatory relationship onto the provenance spine:
 *   agency meeting (Pre-IND / EOP2 / pre-NDA / Type A-B-C) → questions & outcomes
 *   → commitments (PMR / PMC / REMS / meeting commitments) → fulfillment.
 *
 * Each commitment links back to the interaction that created it and forward to
 * the submission it supports via provenance_links (C2C-02), so "what did we
 * agree to, and did we deliver it" is answerable end to end.
 *
 * Conventions match the platform: organizationId + createdBy + created/updated/
 * deletedAt on every table; indexed FKs and tenant column; status/type columns
 * CHECK-constrained in the SQL migration. Mutations are governed + audited.
 *
 * @module shared/schema/ha-interactions
 */

import { boolean, date, index, integer, pgTable, serial, text, timestamp } from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { submissions } from './submissions';

export type HaInteractionType =
  | 'pre_ind'
  | 'eop1' // End-of-Phase-1
  | 'eop2' // End-of-Phase-2
  | 'pre_nda'
  | 'pre_bla'
  | 'type_a'
  | 'type_b'
  | 'type_c'
  | 'scientific_advice' // EMA
  | 'other';

export type HaAgency = 'fda' | 'ema' | 'pmda' | 'mhra' | 'other';

export type HaInteractionStatus =
  | 'planned'
  | 'requested'
  | 'scheduled'
  | 'held'
  | 'minutes_received'
  | 'closed'
  | 'cancelled';

export type CommitmentType = 'pmr' | 'pmc' | 'rems' | 'meeting_commitment' | 'other';

export type CommitmentStatus =
  | 'open'
  | 'in_progress'
  | 'submitted'
  | 'fulfilled'
  | 'overdue'
  | 'waived'
  | 'released';

export type MilestoneStatus = 'pending' | 'met' | 'missed';

// ─── HA interactions (meetings) ──────────────────────────────────────────────

export const haInteractions = pgTable(
  'ha_interactions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    submissionId: integer('submission_id').references(() => submissions.id),
    interactionType: text('interaction_type').$type<HaInteractionType>().notNull(),
    agency: text('agency').$type<HaAgency>().notNull(),
    title: text('title').notNull(),
    objective: text('objective'),
    status: text('status').$type<HaInteractionStatus>().notNull().default('planned'),
    requestedDate: date('requested_date'),
    scheduledDate: date('scheduled_date'),
    heldDate: date('held_date'),
    minutesReceivedDate: date('minutes_received_date'),
    /** Optional pointer to the briefing-book artifact. */
    briefingBookArtifactId: text('briefing_book_artifact_id'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_ha_interactions_org').on(t.organizationId),
    submissionIdx: index('idx_ha_interactions_submission').on(t.submissionId),
  })
);

export type HaInteraction = typeof haInteractions.$inferSelect;
export type NewHaInteraction = typeof haInteractions.$inferInsert;

// ─── Interaction questions (sponsor question → agency response) ──────────────

export const haInteractionQuestions = pgTable(
  'ha_interaction_questions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    interactionId: integer('interaction_id').notNull().references(() => haInteractions.id),
    questionNumber: integer('question_number').notNull(),
    questionText: text('question_text').notNull(),
    sponsorPosition: text('sponsor_position'),
    agencyResponse: text('agency_response'),
    agreementReached: boolean('agreement_reached').notNull().default(false),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_ha_questions_org').on(t.organizationId),
    interactionIdx: index('idx_ha_questions_interaction').on(t.interactionId),
  })
);

export type HaInteractionQuestion = typeof haInteractionQuestions.$inferSelect;
export type NewHaInteractionQuestion = typeof haInteractionQuestions.$inferInsert;

// ─── Regulatory commitments (PMR / PMC / REMS / meeting) ─────────────────────

export const regulatoryCommitments = pgTable(
  'regulatory_commitments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    submissionId: integer('submission_id').references(() => submissions.id),
    /** The interaction that created this commitment, when applicable. */
    sourceInteractionId: integer('source_interaction_id').references(() => haInteractions.id),
    commitmentType: text('commitment_type').$type<CommitmentType>().notNull(),
    description: text('description').notNull(),
    status: text('status').$type<CommitmentStatus>().notNull().default('open'),
    /** Statute/guidance basis, e.g. FDAAA 505(o)(3) (PMR), 21 CFR 314.81 (PMC). */
    regulatoryBasis: text('regulatory_basis'),
    dueDate: date('due_date'),
    fulfilledDate: date('fulfilled_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_reg_commitments_org').on(t.organizationId),
    submissionIdx: index('idx_reg_commitments_submission').on(t.submissionId),
    sourceIdx: index('idx_reg_commitments_source').on(t.sourceInteractionId),
  })
);

export type RegulatoryCommitment = typeof regulatoryCommitments.$inferSelect;
export type NewRegulatoryCommitment = typeof regulatoryCommitments.$inferInsert;

// ─── Commitment fulfillment milestones ───────────────────────────────────────

export const commitmentMilestones = pgTable(
  'commitment_milestones',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull().references(() => organizations.id),
    commitmentId: integer('commitment_id').notNull().references(() => regulatoryCommitments.id),
    title: text('title').notNull(),
    dueDate: date('due_date'),
    status: text('status').$type<MilestoneStatus>().notNull().default('pending'),
    completedDate: date('completed_date'),
    createdBy: integer('created_by').notNull().references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    orgIdx: index('idx_commitment_milestones_org').on(t.organizationId),
    commitmentIdx: index('idx_commitment_milestones_commitment').on(t.commitmentId),
  })
);

export type CommitmentMilestone = typeof commitmentMilestones.$inferSelect;
export type NewCommitmentMilestone = typeof commitmentMilestones.$inferInsert;
