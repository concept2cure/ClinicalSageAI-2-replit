/**
 * AI/ML Predetermined Change Control Plan (PCCP)
 *
 * Models the FDA 2025 final guidance "Predetermined Change Control Plans for
 * AI-Enabled Device Software Functions". Each plan has three required
 * components per the guidance:
 *
 *   1. Description of Modifications      (what changes are anticipated)
 *   2. Modification Protocol             (how each change is implemented,
 *                                         validated, and deployed)
 *   3. Impact Assessment                 (benefits, risks, mitigations,
 *                                         comparison to current device)
 *
 * A plan is composed of one or more `ai_ml_modifications` rows that hold
 * the per-change boundaries, acceptance thresholds, rollback strategy,
 * cybersecurity impact, and labeling impact.
 *
 * Plans are versioned (immutable per version). Approval requires the
 * existing electronic-signature flow.
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
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { regulatoryPrograms } from './programs';

// ─────────────────────────────────────────────────────────────────────────────
// PCCP Plans
// ─────────────────────────────────────────────────────────────────────────────

export const aiMlPccpPlans = pgTable(
  'ai_ml_pccp_plans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    // Stable code within a program (e.g., "PCCP-001"); reused across versions
    code: varchar('code', { length: 64 }).notNull(),
    version: integer('version').notNull().default(1),
    previousPlanId: uuid('previous_plan_id'),

    // Identity
    title: text('title').notNull(),
    deviceSubjectName: text('device_subject_name'),
    intendedUse: text('intended_use'),

    // Required component 1: Description of Modifications (high-level summary)
    descriptionSummary: text('description_summary'),

    // Required component 2: Modification Protocol — global elements
    // (per-modification details live in ai_ml_modifications)
    dataManagementPractices: text('data_management_practices'),
    retrainingPractices: text('retraining_practices'),
    performanceEvaluationProtocol: text('performance_evaluation_protocol'),
    updateProcedures: text('update_procedures'),
    transparencyCommitments: text('transparency_commitments'),

    // Required component 3: Impact Assessment
    benefitsNarrative: text('benefits_narrative'),
    risksNarrative: text('risks_narrative'),
    mitigationsNarrative: text('mitigations_narrative'),
    comparisonToCurrentDevice: text('comparison_to_current_device'),

    // Cross-cutting
    monitoringPlan: text('monitoring_plan'),
    driftDetectionPlan: text('drift_detection_plan'),
    biasSubgroupAnalysisPlan: text('bias_subgroup_analysis_plan'),
    cybersecurityImpactNarrative: text('cybersecurity_impact_narrative'),
    labelingImpactNarrative: text('labeling_impact_narrative'),
    rollbackStrategyNarrative: text('rollback_strategy_narrative'),

    // Lifecycle
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    // draft | under_review | approved | superseded | withdrawn

    // Approval
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),
    signatureId: uuid('signature_id'), // FK to electronic_signatures, soft (no FK)
    locked: boolean('locked').notNull().default(false),

    // Reference to the FDA guidance edition the plan was authored against
    guidanceVersion: varchar('guidance_version', { length: 32 }).default('FDA-PCCP-2024'),

    metadata: json('metadata'),

    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('pccp_plans_program_idx').on(table.programId),
    orgIdx: index('pccp_plans_org_idx').on(table.organizationId),
    statusIdx: index('pccp_plans_status_idx').on(table.status),
    codeVersionIdx: uniqueIndex('pccp_plans_code_version_idx').on(
      table.organizationId,
      table.code,
      table.version
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Anticipated Modifications
// ─────────────────────────────────────────────────────────────────────────────

export const aiMlModifications = pgTable(
  'ai_ml_modifications',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    planId: uuid('plan_id')
      .notNull()
      .references(() => aiMlPccpPlans.id, { onDelete: 'cascade' }),

    // Identity / ordering
    code: varchar('code', { length: 64 }).notNull(), // e.g. 'MOD-001'
    ordering: integer('ordering').notNull().default(0),
    title: text('title').notNull(),

    // Modification type
    modificationType: varchar('modification_type', { length: 64 }).notNull(),
    // algorithm_update | retraining | input_data_change | output_format_change |
    // performance_threshold_change | ui_change | hardware_dependency | other

    // Required: boundary — what is allowed within this modification
    boundary: text('boundary').notNull(),
    boundaryDeltaLimit: text('boundary_delta_limit'), // e.g. '+/- 5% AUC'

    // Required: rationale for why this is a controlled change
    rationale: text('rationale').notNull(),

    // Retraining-data criteria (only relevant for retraining/algorithm_update)
    retrainingDataCriteria: text('retraining_data_criteria'),

    // Performance acceptance threshold (numeric metric + comparator + value)
    performanceMetric: varchar('performance_metric', { length: 64 }),
    // e.g. 'AUC' | 'sensitivity' | 'specificity' | 'PPV' | 'NPV' | 'F1' | 'MAE'
    performanceComparator: varchar('performance_comparator', { length: 8 }),
    // '>=' | '>' | '<=' | '<' | '=='
    performanceThresholdValue: text('performance_threshold_value'),
    performanceTestSet: text('performance_test_set'),

    // Required: rollback strategy
    rollbackStrategy: text('rollback_strategy').notNull(),

    // Cybersecurity + labeling impact
    cybersecurityImpact: text('cybersecurity_impact'),
    labelingImpact: text('labeling_impact'),

    // Bias / subgroup analysis applicable to this modification
    biasSubgroupAnalysis: text('bias_subgroup_analysis'),

    // Lifecycle
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    // draft | proposed | accepted | rejected | superseded

    metadata: json('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planIdx: index('pccp_modifications_plan_idx').on(table.planId),
    typeIdx: index('pccp_modifications_type_idx').on(table.modificationType),
    codeIdx: uniqueIndex('pccp_modifications_plan_code_idx').on(table.planId, table.code),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Insert schemas + types
// ─────────────────────────────────────────────────────────────────────────────

export const insertAiMlPccpPlanSchema = createInsertSchema(aiMlPccpPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAiMlModificationSchema = createInsertSchema(aiMlModifications).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type AiMlPccpPlan = InferSelectModel<typeof aiMlPccpPlans>;
export type InsertAiMlPccpPlan = z.infer<typeof insertAiMlPccpPlanSchema>;
export type AiMlModification = InferSelectModel<typeof aiMlModifications>;
export type InsertAiMlModification = z.infer<typeof insertAiMlModificationSchema>;

export const aiMlPccpPlansRelations = relations(aiMlPccpPlans, ({ many, one }) => ({
  modifications: many(aiMlModifications),
  program: one(regulatoryPrograms, {
    fields: [aiMlPccpPlans.programId],
    references: [regulatoryPrograms.id],
  }),
}));

export const aiMlModificationsRelations = relations(aiMlModifications, ({ one }) => ({
  plan: one(aiMlPccpPlans, {
    fields: [aiMlModifications.planId],
    references: [aiMlPccpPlans.id],
  }),
}));
