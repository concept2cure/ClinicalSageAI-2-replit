/**
 * Evidence Sufficiency Assessment
 *
 * Persisted, deterministic snapshot of "does this program actually have
 * enough evidence to support FDA approval?" for PMA / De Novo / 510(k)
 * programs. The analyzer is a pure function over existing evidence_objects,
 * device_claims (extended evidence_claims), gspr_program_mappings,
 * post_market_documents, and pmaSubmissions; this table just persists the
 * verdict + the per-pillar findings for audit.
 *
 * Why this is not a duplicate of defense_packets:
 *   defense_packets answer "is the substantial-equivalence story strong?" for
 *   510(k) submissions specifically. This table answers "is the underlying
 *   evidence base actually sufficient for the chosen pathway?" across PMA,
 *   De Novo, and 510(k). Different question, different scoring rubric.
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
  boolean,
  index,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { regulatoryPrograms } from './programs';

export type EvidenceSufficiencyVerdict =
  | 'sufficient'
  | 'borderline'
  | 'insufficient';

export type SubmissionPathway = 'PMA' | 'DE_NOVO' | '510K';

export const evidenceSufficiencyAssessments = pgTable(
  'evidence_sufficiency_assessments',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    // Trigger context
    pathway: varchar('pathway', { length: 16 }).notNull(),
    // PMA | DE_NOVO | 510K
    triggeredBy: varchar('triggered_by', { length: 64 }),
    trigger: varchar('trigger', { length: 64 }).notNull().default('manual'),
    // manual | scheduled | post_evidence_change | post_approval_attempt | api

    // Inputs hash for deterministic replay
    inputsHash: varchar('inputs_hash', { length: 64 }),

    // Verdict
    verdict: varchar('verdict', { length: 16 }).notNull(),
    overallScore: integer('overall_score').notNull(), // 0..100

    // Per-pillar breakdown
    pillarScores: json('pillar_scores').$type<Record<string, number>>().notNull(),
    findings: json('findings').$type<unknown[]>().notNull(),
    findingCount: integer('finding_count').notNull().default(0),
    criticalCount: integer('critical_count').notNull().default(0),
    warningCount: integer('warning_count').notNull().default(0),

    // Recommendations
    recommendations: json('recommendations').$type<string[]>(),
    blocksApproval: boolean('blocks_approval').notNull().default(false),

    // Snapshot of inputs for audit replay
    inputsSnapshot: json('inputs_snapshot'),

    summary: json('summary'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('evid_suff_program_idx').on(table.programId),
    orgIdx: index('evid_suff_org_idx').on(table.organizationId),
    pathwayIdx: index('evid_suff_pathway_idx').on(table.pathway),
    verdictIdx: index('evid_suff_verdict_idx').on(table.verdict),
    createdIdx: index('evid_suff_created_idx').on(table.createdAt),
  })
);

export const insertEvidenceSufficiencyAssessmentSchema = createInsertSchema(
  evidenceSufficiencyAssessments
).omit({ id: true, createdAt: true });

export type EvidenceSufficiencyAssessment = InferSelectModel<typeof evidenceSufficiencyAssessments>;
export type InsertEvidenceSufficiencyAssessment = z.infer<
  typeof insertEvidenceSufficiencyAssessmentSchema
>;

export const evidenceSufficiencyAssessmentsRelations = relations(
  evidenceSufficiencyAssessments,
  ({ one }) => ({
    program: one(regulatoryPrograms, {
      fields: [evidenceSufficiencyAssessments.programId],
      references: [regulatoryPrograms.id],
    }),
  })
);
