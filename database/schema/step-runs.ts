/**
 * Step Runs Schema
 * 
 * Audit log for each step execution attempt.
 * Provides detailed history for compliance and debugging.
 * 
 * Pillar: Trust Rails 🔐
 * Pillar: Workflow-as-Contract 📜
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, varchar, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workflowSteps, stepStatusEnum } from './workflow-steps';

// Step Run Action Enum
export const stepRunActionEnum = pgEnum('step_run_action', [
  'STARTED',
  'PRECONDITION_CHECK',
  'ASSIGNED',
  'REASSIGNED',
  'SUBMITTED',
  'APPROVED',
  'REJECTED',
  'SIGNED',
  'EXPORTED',
  'COMPLETED',
  'FAILED',
  'RETRIED',
  'SKIPPED',
  'BLOCKED',
  'ESCALATED',
  'SLA_BREACHED',
  'EFFECT_EXECUTED',
  'COMMENT_ADDED',
  'ATTACHMENT_ADDED'
]);

// Step Runs Table (Audit Log)
export const stepRuns = pgTable('step_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowStepId: uuid('workflow_step_id').notNull().references(() => workflowSteps.id, { onDelete: 'cascade' }),
  workflowRunId: uuid('workflow_run_id').notNull(),
  tenantId: uuid('tenant_id').notNull(),
  
  // Action details
  action: stepRunActionEnum('action').notNull(),
  previousStatus: stepStatusEnum('previous_status'),
  newStatus: stepStatusEnum('new_status'),
  
  // Actor
  performedBy: uuid('performed_by').notNull(),
  performedByName: varchar('performed_by_name', { length: 255 }),
  performedByRole: varchar('performed_by_role', { length: 100 }),
  
  // Timing
  performedAt: timestamp('performed_at').notNull().defaultNow(),
  durationMs: integer('duration_ms'),
  
  // Context
  details: jsonb('details').$type<StepRunDetails>(),
  
  // For precondition checks
  preconditionsSnapshot: jsonb('preconditions_snapshot').$type<PreconditionCheckResult[]>(),
  
  // For effect execution
  effectsSnapshot: jsonb('effects_snapshot').$type<EffectExecutionResult[]>(),
  
  // Error info
  errorCode: varchar('error_code', { length: 100 }),
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
  
  // Trust Rails - Hash chaining for immutability
  prevHash: varchar('prev_hash', { length: 64 }),
  entryHash: varchar('entry_hash', { length: 64 }).notNull(),
  
  // IP and client info for compliance
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  sessionId: varchar('session_id', { length: 100 }),
});

// Types
export interface StepRunDetails {
  // For assignments
  assignedTo?: string;
  assignedFrom?: string;
  assignmentReason?: string;
  
  // For approvals
  approvalDecision?: 'APPROVED' | 'REJECTED';
  approvalComments?: string;
  
  // For signatures
  signatureId?: string;
  signatureIntent?: string;
  signatureHash?: string;
  documentVersion?: string;
  
  // For exports
  exportJobId?: string;
  exportFormat?: string;
  releaseHash?: string;
  filesExported?: number;
  
  // For escalations
  escalationLevel?: number;
  escalationRecipients?: string[];
  escalationMessage?: string;
  
  // For SLA breaches
  slaHours?: number;
  actualHours?: number;
  
  // For comments
  comment?: string;
  
  // For attachments
  attachmentId?: string;
  attachmentName?: string;
  attachmentType?: string;
  
  // Generic metadata
  metadata?: Record<string, unknown>;
}

export interface PreconditionCheckResult {
  preconditionId: string;
  type: string;
  target: string;
  passed: boolean;
  actualValue?: unknown;
  expectedValue?: unknown;
  errorMessage?: string;
}

export interface EffectExecutionResult {
  effectId: string;
  type: string;
  target: string;
  success: boolean;
  result?: unknown;
  errorMessage?: string;
  executedAt: string;
}

// Relations
export const stepRunsRelations = relations(stepRuns, ({ one }) => ({
  workflowStep: one(workflowSteps, {
    fields: [stepRuns.workflowStepId],
    references: [workflowSteps.id],
  }),
}));

// Export types
export type StepRun = typeof stepRuns.$inferSelect;
export type NewStepRun = typeof stepRuns.$inferInsert;

// Index suggestions for performance
// CREATE INDEX idx_step_runs_workflow_step ON step_runs(workflow_step_id);
// CREATE INDEX idx_step_runs_workflow_run ON step_runs(workflow_run_id);
// CREATE INDEX idx_step_runs_tenant ON step_runs(tenant_id);
// CREATE INDEX idx_step_runs_performed_at ON step_runs(performed_at DESC);
// CREATE INDEX idx_step_runs_action ON step_runs(action);
