/**
 * Orchestration Schema — Phase 3 Workflow Infrastructure
 *
 * Implements the 10 Phase 3 enhancement directives:
 *  1. Workflow Run Persistence — every orchestration run is a persisted record
 *  2. Approval Checkpoint Model — configurable gates with step statuses
 *  3. Diff & Review Surface — structured revision summaries
 *  4. Readiness Rules Registry — rules-driven, not just AI-interpreted
 *  5. (Types only — see orchestration-types.ts)
 *  6. Confidence & Evidence Contract — declared evidence sources
 *  7. Resume/Retry Behavior — pause, retry, resume, cancel
 *  8. Project Intelligence Summary — stable continuity object
 *
 * @module shared/schema/orchestration
 */

import { relations, sql } from 'drizzle-orm';
import {
  index,
  integer,
  json,
  pgEnum,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  uniqueIndex,
  varchar,
  decimal,
  uuid,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// ═══════════════════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════════════════

export const workflowRunStatusEnum = pgEnum('workflow_run_status', [
  'pending',
  'running',
  'paused',
  'awaiting_approval',
  'completed',
  'failed',
  'cancelled',
]);

export const workflowStepStatusEnum = pgEnum('workflow_step_status', [
  'proposed',
  'awaiting_review',
  'approved',
  'executed',
  'failed',
  'skipped',
]);

export const approvalGateTypeEnum = pgEnum('approval_gate_type', [
  'manual',          // Human must approve
  'role_based',      // Anyone with the specified role
  'quorum',          // N-of-M approvers
  'auto_on_pass',    // Auto-approve if validation passes
]);

export const triggerSourceEnum = pgEnum('trigger_source', [
  'user_action',
  'schedule',
  'api_call',
  'event_hook',
  'ai_recommendation',
]);

export const actorTypeEnum = pgEnum('actor_type', [
  'user',
  'ai_deterministic',   // Deterministic service (routing, validation, lookup)
  'ai_reasoning',       // LLM reasoning (summarization, recommendation)
  'system',             // System/scheduler
]);

export const evidenceClassEnum = pgEnum('evidence_class', [
  'rules_based',       // Hard rule matched
  'validation_based',  // Validation engine finding
  'ai_inferred',       // LLM interpretation
]);

export const confidenceLevelEnum = pgEnum('confidence_level', [
  'definitive',   // Rule or validation — no ambiguity
  'high',         // Strong evidence, minimal interpretation
  'moderate',     // Multiple signals, some interpretation
  'low',          // Primarily AI-inferred
  'speculative',  // Weak signal, requires human review
]);

export const readinessRuleTypeEnum = pgEnum('readiness_rule_type', [
  'required_item',       // Must be present (e.g., signed protocol)
  'validation_check',    // Must pass validation (e.g., no empty sections)
  'quality_gate',        // Must meet quality threshold
  'cross_reference',     // Must link to another artifact
  'completeness_check',  // Section/field completeness
]);

// ═══════════════════════════════════════════════════════════════════════════════
// 1. WORKFLOW RUN RECORD
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Every orchestration run creates a persisted workflow run record.
 * This is the master audit object for multi-step AI operations.
 */
export const workflowRuns = pgTable(
  'workflow_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),

    // Identity
    workflowType: text('workflow_type').notNull(),       // e.g., 'submission_readiness_review', 'draft_validate_review_route'
    workflowVersion: text('workflow_version').default('1.0'),
    displayName: text('display_name').notNull(),

    // Trigger
    triggerSource: triggerSourceEnum('trigger_source').notNull(),
    triggeredBy: text('triggered_by').notNull(),         // userId or 'system'

    // Scope
    projectId: integer('project_id'),
    programId: uuid('program_id'),
    moduleScope: text('module_scope'),                   // 'cmc', 'cer', 'ectd', etc.

    // Execution state (supports pause/resume/retry — enhancement #7)
    status: workflowRunStatusEnum('status').notNull().default('pending'),
    currentStepIndex: integer('current_step_index').default(0),
    lastSuccessfulStepIndex: integer('last_successful_step_index'),

    // Steps executed (full record — enhancement #1)
    stepsExecuted: json('steps_executed').$type<WorkflowStepRecord[]>().default([]),

    // Objects touched and outputs created
    objectsTouched: json('objects_touched').$type<TouchedObject[]>().default([]),
    outputsCreated: json('outputs_created').$type<CreatedOutput[]>().default([]),

    // Blockers encountered
    blockers: json('blockers').$type<WorkflowBlocker[]>().default([]),

    // Error info (if failed)
    errorMessage: text('error_message'),
    errorStepIndex: integer('error_step_index'),

    // Diff summaries (enhancement #3)
    diffSummaries: json('diff_summaries').$type<DiffSummary[]>().default([]),

    // Recommendations produced (enhancement #6 — confidence contract)
    recommendations: json('recommendations').$type<EvidencedRecommendation[]>().default([]),

    // Timestamps
    startedAt: timestamp('started_at'),
    pausedAt: timestamp('paused_at'),
    resumedAt: timestamp('resumed_at'),
    completedAt: timestamp('completed_at'),
    cancelledAt: timestamp('cancelled_at'),

    // Metadata
    metadata: json('metadata').$type<Record<string, unknown>>().default({}),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgStatusIdx: index('idx_wf_runs_org_status').on(table.organizationId, table.status),
    typeIdx: index('idx_wf_runs_type').on(table.workflowType),
    projectIdx: index('idx_wf_runs_project').on(table.projectId),
    programIdx: index('idx_wf_runs_program').on(table.programId),
    createdIdx: index('idx_wf_runs_created').on(table.createdAt),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 2. APPROVAL CHECKPOINTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Approval gates within workflow runs.
 * No workflow may auto-promote or overwrite governed documents without passing these.
 */
export const approvalCheckpoints = pgTable(
  'approval_checkpoints',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .notNull()
      .references(() => workflowRuns.id, { onDelete: 'cascade' }),

    // Gate definition
    stepIndex: integer('step_index').notNull(),
    stepName: text('step_name').notNull(),
    gateType: approvalGateTypeEnum('gate_type').notNull(),
    isConfigurable: boolean('is_configurable').notNull().default(true),

    // Status (enhancement #2 — step statuses)
    status: workflowStepStatusEnum('status').notNull().default('proposed'),

    // Approver requirements
    requiredApproverRoles: json('required_approver_roles').$type<string[]>().default([]),
    requiredApproverCount: integer('required_approver_count').default(1),

    // Approvals received
    approvals: json('approvals').$type<ApprovalRecord[]>().default([]),

    // Rejection / skip info
    rejectionReason: text('rejection_reason'),
    skipReason: text('skip_reason'),
    skippedBy: text('skipped_by'),

    // What this gate protects
    protectedAction: text('protected_action').notNull(),  // e.g., 'promote_to_review', 'overwrite_section', 'route_to_agency'
    protectedObjectIds: json('protected_object_ids').$type<string[]>().default([]),

    // Timestamps
    proposedAt: timestamp('proposed_at').defaultNow().notNull(),
    reviewStartedAt: timestamp('review_started_at'),
    resolvedAt: timestamp('resolved_at'),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    runIdx: index('idx_approval_ckpts_run').on(table.workflowRunId),
    statusIdx: index('idx_approval_ckpts_status').on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 4. READINESS RULES REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Readiness rules are explicit, rules-driven expected items per project/module type.
 * Distinguishes rules-based missing items from AI-inferred recommendations.
 */
export const readinessRules = pgTable(
  'readiness_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),

    // Scope: what project/module types does this rule apply to?
    programType: text('program_type').notNull(),          // 'CER', '510K', 'IND', 'NDA', etc. or '*' for all
    moduleType: text('module_type'),                       // 'cmc', 'cer', 'ectd', etc. or null for program-level
    documentType: text('document_type'),                   // specific doc type, or null for all

    // Rule definition
    ruleType: readinessRuleTypeEnum('rule_type').notNull(),
    ruleCode: varchar('rule_code', { length: 100 }).notNull(),  // e.g., 'REQ-CER-001'
    name: text('name').notNull(),
    description: text('description'),

    // What must be present / pass
    expectedItem: text('expected_item').notNull(),          // Human-readable: 'Signed clinical evaluation plan'
    validationExpression: text('validation_expression'),     // Machine-evaluable check (optional)

    // Severity if missing
    severity: text('severity').notNull().default('blocker'),  // 'blocker', 'warning', 'advisory'

    // Regulatory reference
    regulatoryReference: text('regulatory_reference'),       // e.g., 'MDR Annex XIV, Part A'
    guidanceReference: text('guidance_reference'),           // e.g., 'MEDDEV 2.7/1 Rev.4, Section 8'

    // Active/versioned
    isActive: boolean('is_active').notNull().default(true),
    version: integer('version').notNull().default(1),

    // Audit
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgTypeIdx: index('idx_readiness_rules_org_type').on(table.organizationId, table.programType),
    codeIdx: uniqueIndex('idx_readiness_rules_code').on(table.organizationId, table.ruleCode),
    activeIdx: index('idx_readiness_rules_active').on(table.isActive),
  })
);

/**
 * Readiness evaluations: per-run evaluation of rules against a project.
 * Links workflow runs to the rules they evaluated.
 */
export const readinessEvaluations = pgTable(
  'readiness_evaluations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workflowRunId: uuid('workflow_run_id')
      .references(() => workflowRuns.id, { onDelete: 'set null' }),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id'),
    programId: uuid('program_id'),

    // Evaluation results
    evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
    evaluatedBy: text('evaluated_by').notNull(),  // userId or 'system'

    // Breakdown by class (enhancement #4 — distinguish source types)
    rulesBasedFindings: json('rules_based_findings').$type<ReadinessFinding[]>().default([]),
    validationFindings: json('validation_findings').$type<ReadinessFinding[]>().default([]),
    aiInferredFindings: json('ai_inferred_findings').$type<ReadinessFinding[]>().default([]),

    // Aggregate scores
    overallScore: decimal('overall_score', { precision: 5, scale: 2 }),
    blockerCount: integer('blocker_count').default(0),
    warningCount: integer('warning_count').default(0),
    advisoryCount: integer('advisory_count').default(0),
    passedCount: integer('passed_count').default(0),

    // Readiness verdict
    isReady: boolean('is_ready').notNull().default(false),
    readinessGate: text('readiness_gate'),  // which gate this evaluation serves

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    runIdx: index('idx_readiness_evals_run').on(table.workflowRunId),
    projectIdx: index('idx_readiness_evals_project').on(table.projectId),
    programIdx: index('idx_readiness_evals_program').on(table.programId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// 8. PROJECT INTELLIGENCE SUMMARY
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * A stable, persisted object that accumulates project intelligence over time.
 * Replaces vague "memory" with a structured continuity record.
 */
export const projectIntelligenceSummaries = pgTable(
  'project_intelligence_summaries',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    projectId: integer('project_id').notNull(),
    programId: uuid('program_id'),

    // Current blockers (updated each workflow run)
    currentBlockers: json('current_blockers').$type<IntelligenceBlocker[]>().default([]),

    // Recent changes (rolling window, last N workflow runs)
    recentChanges: json('recent_changes').$type<IntelligenceChange[]>().default([]),

    // Important decisions (append-only log)
    importantDecisions: json('important_decisions').$type<IntelligenceDecision[]>().default([]),

    // Unresolved risks
    unresolvedRisks: json('unresolved_risks').$type<IntelligenceRisk[]>().default([]),

    // Readiness status snapshot
    readinessStatus: json('readiness_status').$type<ReadinessSnapshot>(),

    // Last workflow outcomes (last 10)
    lastWorkflowOutcomes: json('last_workflow_outcomes').$type<WorkflowOutcome[]>().default([]),

    // Next recommended actions (AI + rules hybrid)
    nextRecommendedActions: json('next_recommended_actions').$type<EvidencedRecommendation[]>().default([]),

    // Version counter (incremented on each update)
    version: integer('version').notNull().default(1),

    // Timestamps
    lastUpdatedBy: text('last_updated_by'),
    lastUpdatedAt: timestamp('last_updated_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    projectIdx: uniqueIndex('idx_proj_intel_project').on(table.organizationId, table.projectId),
    programIdx: index('idx_proj_intel_program').on(table.programId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const workflowRunsRelations = relations(workflowRuns, ({ many }) => ({
  approvalCheckpoints: many(approvalCheckpoints),
  readinessEvaluations: many(readinessEvaluations),
}));

export const approvalCheckpointsRelations = relations(approvalCheckpoints, ({ one }) => ({
  workflowRun: one(workflowRuns, {
    fields: [approvalCheckpoints.workflowRunId],
    references: [workflowRuns.id],
  }),
}));

export const readinessEvaluationsRelations = relations(readinessEvaluations, ({ one }) => ({
  workflowRun: one(workflowRuns, {
    fields: [readinessEvaluations.workflowRunId],
    references: [workflowRuns.id],
  }),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// JSON COLUMN TYPES (referenced by tables above)
// ═══════════════════════════════════════════════════════════════════════════════

/** A single step in a workflow run */
export interface WorkflowStepRecord {
  readonly stepIndex: number;
  readonly stepName: string;
  readonly stepType: 'deterministic' | 'ai_reasoning';  // Enhancement #5
  readonly actorType: 'user' | 'ai_deterministic' | 'ai_reasoning' | 'system';
  readonly actorId: string;
  readonly status: 'proposed' | 'awaiting_review' | 'approved' | 'executed' | 'failed' | 'skipped';
  readonly input: Record<string, unknown>;
  readonly output: Record<string, unknown>;
  readonly startedAt: string;
  readonly completedAt?: string;
  readonly durationMs?: number;
  readonly error?: string;
}

/** An object touched during workflow execution */
export interface TouchedObject {
  readonly objectType: string;   // 'document', 'section', 'evidence', 'milestone'
  readonly objectId: string;
  readonly action: 'read' | 'created' | 'updated' | 'deleted' | 'promoted' | 'routed';
  readonly previousState?: string;
  readonly newState?: string;
}

/** An output created by a workflow run */
export interface CreatedOutput {
  readonly outputType: string;   // 'document_version', 'readiness_report', 'diff_summary', 'recommendation'
  readonly outputId: string;
  readonly title: string;
  readonly createdAt: string;
}

/** A blocker encountered during execution */
export interface WorkflowBlocker {
  readonly blockerType: 'missing_item' | 'validation_failure' | 'approval_pending' | 'permission_denied' | 'external_dependency';
  readonly description: string;
  readonly severity: 'blocker' | 'warning';
  readonly relatedObjectId?: string;
  readonly resolvedAt?: string;
  readonly resolution?: string;
}

/** Enhancement #2 — Approval record within a checkpoint */
export interface ApprovalRecord {
  readonly approverId: string;
  readonly approverName: string;
  readonly approverRole: string;
  readonly decision: 'approved' | 'rejected' | 'escalated' | 'needs_revision';
  readonly comment?: string;
  readonly decidedAt: string;
}

/** Enhancement #3 — Structured diff summary */
export interface DiffSummary {
  readonly documentId: string;
  readonly documentTitle: string;
  readonly fromVersion: number;
  readonly toVersion: number;
  readonly changes: DiffChange[];
  readonly totalAdded: number;
  readonly totalRemoved: number;
  readonly totalModified: number;
  readonly generatedAt: string;
  readonly generatedBy: string;  // userId or 'ai'
}

export interface DiffChange {
  readonly sectionPath: string;
  readonly changeType: 'added' | 'removed' | 'modified';
  readonly description: string;
  readonly reason: string;
  readonly evidenceSources: string[];        // IDs of evidence objects that motivated this change
  readonly validationFindingsAddressed: string[];  // IDs of validation findings this change resolves
}

/** Enhancement #6 — Evidenced recommendation with confidence contract */
export interface EvidencedRecommendation {
  readonly recommendationId: string;
  readonly title: string;
  readonly description: string;
  readonly suggestedAction: string;
  readonly evidenceClass: 'rules_based' | 'validation_based' | 'ai_inferred';
  readonly confidenceLevel: 'definitive' | 'high' | 'moderate' | 'low' | 'speculative';
  readonly evidenceSources: EvidenceSource[];
  readonly requiresHumanReview: boolean;
  readonly priority: 'critical' | 'high' | 'medium' | 'low';
  readonly createdAt: string;
  readonly createdBy: string;
}

export interface EvidenceSource {
  readonly sourceType: 'readiness_rule' | 'validation_result' | 'ai_analysis' | 'regulatory_reference' | 'historical_data';
  readonly sourceId: string;
  readonly sourceTitle: string;
  readonly relevance: number;  // 0-1
}

/** Enhancement #4 — Readiness finding (used in evaluations) */
export interface ReadinessFinding {
  readonly ruleId?: string;          // Links to readiness_rules table if rules-based
  readonly ruleCode?: string;
  readonly findingType: 'passed' | 'missing' | 'incomplete' | 'invalid' | 'warning';
  readonly severity: 'blocker' | 'warning' | 'advisory' | 'info';
  readonly expectedItem: string;
  readonly actualState: string;
  readonly evidenceClass: 'rules_based' | 'validation_based' | 'ai_inferred';
  readonly regulatoryReference?: string;
  readonly recommendation?: string;
}

/** Enhancement #8 — Project intelligence sub-types */
export interface IntelligenceBlocker {
  readonly blockerId: string;
  readonly source: 'readiness_rule' | 'validation' | 'workflow_failure' | 'manual';
  readonly description: string;
  readonly severity: 'critical' | 'high' | 'medium';
  readonly relatedObjectId?: string;
  readonly identifiedAt: string;
  readonly identifiedBy: string;
}

export interface IntelligenceChange {
  readonly changeId: string;
  readonly workflowRunId: string;
  readonly description: string;
  readonly objectsTouched: number;
  readonly timestamp: string;
  readonly actor: string;
}

export interface IntelligenceDecision {
  readonly decisionId: string;
  readonly title: string;
  readonly description: string;
  readonly decidedBy: string;
  readonly decidedAt: string;
  readonly rationale: string;
  readonly relatedWorkflowRunId?: string;
}

export interface IntelligenceRisk {
  readonly riskId: string;
  readonly title: string;
  readonly description: string;
  readonly severity: 'critical' | 'high' | 'medium' | 'low';
  readonly likelihood: 'almost_certain' | 'likely' | 'possible' | 'unlikely' | 'rare';
  readonly mitigation?: string;
  readonly identifiedAt: string;
}

export interface ReadinessSnapshot {
  readonly overallScore: number;
  readonly blockerCount: number;
  readonly warningCount: number;
  readonly isReady: boolean;
  readonly evaluatedAt: string;
  readonly evaluationId: string;
}

export interface WorkflowOutcome {
  readonly workflowRunId: string;
  readonly workflowType: string;
  readonly status: string;
  readonly completedAt: string;
  readonly outputCount: number;
  readonly blockerCount: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS (Zod validation)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertWorkflowRunSchema = createInsertSchema(workflowRuns).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertApprovalCheckpointSchema = createInsertSchema(approvalCheckpoints).omit({
  id: true,
  createdAt: true,
});

export const insertReadinessRuleSchema = createInsertSchema(readinessRules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReadinessEvaluationSchema = createInsertSchema(readinessEvaluations).omit({
  id: true,
  createdAt: true,
});

export const insertProjectIntelligenceSummarySchema = createInsertSchema(projectIntelligenceSummaries).omit({
  id: true,
  createdAt: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type InsertWorkflowRun = z.infer<typeof insertWorkflowRunSchema>;

export type ApprovalCheckpoint = typeof approvalCheckpoints.$inferSelect;
export type InsertApprovalCheckpoint = z.infer<typeof insertApprovalCheckpointSchema>;

export type ReadinessRule = typeof readinessRules.$inferSelect;
export type InsertReadinessRule = z.infer<typeof insertReadinessRuleSchema>;

export type ReadinessEvaluation = typeof readinessEvaluations.$inferSelect;
export type InsertReadinessEvaluation = z.infer<typeof insertReadinessEvaluationSchema>;

export type ProjectIntelligenceSummary = typeof projectIntelligenceSummaries.$inferSelect;
export type InsertProjectIntelligenceSummary = z.infer<typeof insertProjectIntelligenceSummarySchema>;
