/**
 * Workflow Runs Schema
 * 
 * Tracks active workflow executions for specific projects/submissions.
 * Each run is an instance of a workflow definition.
 * 
 * Pillar: Workflow-as-Contract 📜
 * Pillar: Submission-as-Asset 💎
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, varchar, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { workflowDefinitions } from './workflow-definitions';

// Enums
export const workflowRunStatusEnum = pgEnum('workflow_run_status', [
  'PENDING',
  'ACTIVE',
  'PAUSED',
  'COMPLETED',
  'CANCELLED',
  'FAILED',
  'BLOCKED'
]);

export const assetStateEnum = pgEnum('asset_state', [
  'DRAFT',
  'REVIEW',
  'APPROVED',
  'SUBMITTED',
  'DEFICIENCY',
  'RESPONSE_PENDING',
  'ACCEPTED',
  'WITHDRAWN',
  'REJECTED',
  'MARKETED',
  'PHASE_1',
  'PHASE_2',
  'PHASE_3',
  'PHASE_4'
]);

// Workflow Runs Table
export const workflowRuns = pgTable('workflow_runs', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  
  // Links to definition and project
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id),
  projectId: uuid('project_id').notNull(),
  submissionId: uuid('submission_id'),
  
  // Core fields
  name: varchar('name', { length: 255 }).notNull(),
  status: workflowRunStatusEnum('status').notNull().default('PENDING'),
  
  // Asset state (Submission-as-Asset pillar)
  assetState: assetStateEnum('asset_state').notNull().default('DRAFT'),
  previousAssetState: assetStateEnum('previous_asset_state'),
  assetStateChangedAt: timestamp('asset_state_changed_at'),
  
  // Progress tracking
  currentStepId: uuid('current_step_id'),
  completedStepsCount: integer('completed_steps_count').notNull().default(0),
  totalStepsCount: integer('total_steps_count').notNull().default(0),
  progressPercent: integer('progress_percent').notNull().default(0),
  
  // Timing
  startedAt: timestamp('started_at'),
  completedAt: timestamp('completed_at'),
  estimatedCompletionAt: timestamp('estimated_completion_at'),
  dueDate: timestamp('due_date'),
  
  // Ownership
  ownerId: uuid('owner_id').notNull(),
  assignedTeamIds: jsonb('assigned_team_ids').$type<string[]>().default([]),
  
  // Runtime context
  context: jsonb('context').$type<WorkflowContext>().default({}),
  
  // Error tracking
  lastError: text('last_error'),
  errorCount: integer('error_count').notNull().default(0),
  
  // Metrics
  metrics: jsonb('metrics').$type<WorkflowMetrics>(),
  
  // Audit fields (Trust Rails)
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by').notNull(),
  updatedBy: uuid('updated_by'),
  
  // Hash for integrity
  stateHash: varchar('state_hash', { length: 64 }),
});

// Types
export interface WorkflowContext {
  submissionType?: string;
  productName?: string;
  indicationOrUse?: string;
  targetRegion?: string;
  regulatoryPathway?: string;
  variables?: Record<string, unknown>;
  linkedArtifacts?: string[];
  externalReferences?: {
    fdaTrackingNumber?: string;
    sponsorReference?: string;
  };
}

export interface WorkflowMetrics {
  totalDurationHours?: number;
  averageStepDurationHours?: number;
  slaBreaches?: number;
  reworkCount?: number;
  approvalCycles?: number;
  signatureCount?: number;
}

// Relations
export const workflowRunsRelations = relations(workflowRuns, ({ one }) => ({
  workflowDefinition: one(workflowDefinitions, {
    fields: [workflowRuns.workflowDefinitionId],
    references: [workflowDefinitions.id],
  }),
}));

// Export types
export type WorkflowRun = typeof workflowRuns.$inferSelect;
export type NewWorkflowRun = typeof workflowRuns.$inferInsert;
