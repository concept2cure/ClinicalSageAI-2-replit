/**
 * Reviewer Simulation Runs
 *
 * Persists each red-team simulation against a regulatory program. One row
 * per (program × run); the persona scope, question list, and summary stats
 * are kept as JSON for audit-grade replay.
 *
 * The simulator itself is deterministic over its inputs, so a future
 * "rerun" flow can verify the same inputs produce the same questions
 * (replay determinism, similar in spirit to the defense-packet manifest_hash).
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  json,
  varchar,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { regulatoryPrograms } from './programs';

export const reviewerSimulationRuns = pgTable(
  'reviewer_simulation_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    // Trigger context
    triggeredBy: varchar('triggered_by', { length: 64 }), // user_id or 'system'
    trigger: varchar('trigger', { length: 64 }).notNull().default('manual'),
    // manual | post_packet_render | scheduled | api

    // Persona scope used for this run
    personaScope: json('persona_scope').$type<string[]>().notNull(),

    // Inputs hash — deterministic replay key
    inputsHash: varchar('inputs_hash', { length: 64 }),

    // Questions emitted
    questions: json('questions').$type<unknown[]>().notNull(),
    questionCount: integer('question_count').notNull().default(0),
    criticalCount: integer('critical_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),
    infoCount: integer('info_count').notNull().default(0),

    // Per-persona breakdown
    perPersonaCounts: json('per_persona_counts').$type<Record<string, number>>(),

    // Reference to the defense packet that fed the inputs (optional)
    defensePacketId: uuid('defense_packet_id'),

    // Summary metadata
    summary: json('summary'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('reviewer_sim_program_idx').on(table.programId),
    orgIdx: index('reviewer_sim_org_idx').on(table.organizationId),
    createdIdx: index('reviewer_sim_created_idx').on(table.createdAt),
    triggerIdx: index('reviewer_sim_trigger_idx').on(table.trigger),
  })
);

export const insertReviewerSimulationRunSchema = createInsertSchema(reviewerSimulationRuns).omit({
  id: true,
  createdAt: true,
});

export type ReviewerSimulationRun = InferSelectModel<typeof reviewerSimulationRuns>;
export type InsertReviewerSimulationRun = z.infer<typeof insertReviewerSimulationRunSchema>;

export const reviewerSimulationRunsRelations = relations(reviewerSimulationRuns, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [reviewerSimulationRuns.programId],
    references: [regulatoryPrograms.id],
  }),
}));
