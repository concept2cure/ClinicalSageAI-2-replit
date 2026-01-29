/**
 * Workflow Steps Schema (Runtime)
 * 
 * Instantiated steps for a workflow run, copied from definitions.
 * Allows runtime modifications without affecting the template.
 * 
 * Pillar: Workflow-as-Contract 📜
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, varchar, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workflowRuns } from './workflow-runs';
import { Precondition, Effect, EscalationRule, stepTypeEnum } from './workflow-definitions';

// Step Status Enum
export const stepStatusEnum = pgEnum('step_status', [
  'PENDING',
  'READY',
  'IN_PROGRESS',
  'AWAITING_APPROVAL',
  'AWAITING_SIGNATURE',
  'COMPLETED',
  'SKIPPED',
  'BLOCKED',
  'FAILED'
]);

// Workflow Steps Table (Runtime instances)
export const workflowSteps = pgTable('workflow_steps', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowRunId: uuid('workflow_run_id').notNull().references(() => workflowRuns.id, { onDelete: 'cascade' }),
  stepDefinitionId: uuid('step_definition_id').notNull(),
  
  // Core fields (copied from definition, can be modified at runtime)
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  stepType: stepTypeEnum('step_type').notNull(),
  order: integer('order').notNull(),
  
  // Status
  status: stepStatusEnum('status').notNull().default('PENDING'),
  
  // Grouping
  phaseId: varchar('phase_id', { length: 100 }),
  phaseName: varchar('phase_name', { length: 255 }),
  
  // Assignment (can be reassigned at runtime)
  assigneeRole: varchar('assignee_role', { length: 100 }),
  assigneeUserId: uuid('assignee_user_id'),
  assignedAt: timestamp('assigned_at'),
  
  // Preconditions status
  preconditions: jsonb('preconditions').$type<Precondition[]>().default([]),
  preconditionsMet: boolean('preconditions_met').notNull().default(false),
  preconditionsEvaluatedAt: timestamp('preconditions_evaluated_at'),
  failedPreconditions: jsonb('failed_preconditions').$type<string[]>().default([]),
  
  // Effects to execute on completion
  effects: jsonb('effects').$type<Effect[]>().default([]),
  effectsExecuted: boolean('effects_executed').notNull().default(false),
  effectsExecutedAt: timestamp('effects_executed_at'),
  
  // SLA tracking
  slaHours: integer('sla_hours'),
  slaDueAt: timestamp('sla_due_at'),
  slaBreached: boolean('sla_breached').notNull().default(false),
  slaBreachedAt: timestamp('sla_breached_at'),
  escalationRules: jsonb('escalation_rules').$type<EscalationRule[]>().default([]),
  escalationLevel: integer('escalation_level').notNull().default(0),
  
  // Timing
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  actualDurationMinutes: integer('actual_duration_minutes'),
  
  // Linked artifacts
  linkedArtifactIds: jsonb('linked_artifact_ids').$type<string[]>().default([]),
  
  // Completion data
  completionData: jsonb('completion_data').$type<StepCompletionData>(),
  completedBy: uuid('completed_by'),
  
  // UI state
  isRequired: boolean('is_required').notNull().default(true),
  isAutoAdvance: boolean('is_auto_advance').notNull().default(false),
  isExpanded: boolean('is_expanded').notNull().default(false),
  uiConfig: jsonb('ui_config').$type<{
    icon?: string;
    color?: string;
    helpText?: string;
    formSchema?: object;
  }>(),
  
  // Error tracking
  lastError: text('last_error'),
  retryCount: integer('retry_count').notNull().default(0),
  
  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Types
export interface StepCompletionData {
  // For TASK type
  formData?: Record<string, unknown>;
  notes?: string;
  
  // For APPROVAL type
  approved?: boolean;
  approvalComments?: string;
  approvedBy?: string;
  approvedAt?: string;
  
  // For SIGNATURE type
  signatureId?: string;
  signatureHash?: string;
  signedAt?: string;
  signedBy?: string;
  signingIntent?: string;
  
  // For EXPORT type
  exportJobId?: string;
  releaseHash?: string;
  exportedAt?: string;
  exportFormat?: string;
  
  // For REVIEW type
  reviewerComments?: string;
  reviewOutcome?: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  reviewedAt?: string;
  
  // Generic
  attachments?: string[];
  references?: string[];
}

// Relations
export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  workflowRun: one(workflowRuns, {
    fields: [workflowSteps.workflowRunId],
    references: [workflowRuns.id],
  }),
}));

// Export types
export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type NewWorkflowStep = typeof workflowSteps.$inferInsert;
