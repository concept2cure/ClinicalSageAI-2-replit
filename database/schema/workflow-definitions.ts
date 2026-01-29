/**
 * Workflow Definitions Schema
 * 
 * Defines workflow templates for regulatory submissions.
 * Each workflow contains steps with preconditions, effects, and SLAs.
 * 
 * Pillar: Workflow-as-Contract 📜
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, boolean, varchar, pgEnum } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Enums
export const submissionTypeEnum = pgEnum('submission_type', [
  '510K',
  'IND',
  'NDA',
  'BLA',
  'PMA',
  'MAA',
  'DE_NOVO'
]);

export const stepTypeEnum = pgEnum('step_type', [
  'TASK',
  'APPROVAL',
  'SIGNATURE',
  'EXPORT',
  'MILESTONE',
  'REVIEW',
  'NOTIFICATION'
]);

export const preconditionTypeEnum = pgEnum('precondition_type', [
  'DATA_PRESENT',
  'APPROVAL_RECEIVED',
  'SIGNATURE_OBTAINED',
  'ARTIFACT_COMPLETE',
  'STEP_COMPLETE',
  'ROLE_ASSIGNED',
  'DEADLINE_NOT_PASSED'
]);

export const effectTypeEnum = pgEnum('effect_type', [
  'CREATE_TASK',
  'TRIGGER_WORKER',
  'SEND_NOTIFICATION',
  'LOCK_VERSION',
  'UPDATE_STATE',
  'CREATE_ARTIFACT',
  'ASSIGN_ROLE',
  'SCHEDULE_REMINDER'
]);

// Workflow Definitions Table
export const workflowDefinitions = pgTable('workflow_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  
  // Core fields
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  submissionType: submissionTypeEnum('submission_type').notNull(),
  version: varchar('version', { length: 50 }).notNull().default('1.0.0'),
  
  // Configuration
  isActive: boolean('is_active').notNull().default(true),
  isDefault: boolean('is_default').notNull().default(false),
  
  // Metadata stored as JSON for flexibility
  metadata: jsonb('metadata').$type<{
    author?: string;
    tags?: string[];
    regulatoryBasis?: string;
    estimatedDuration?: number; // days
    complexity?: 'LOW' | 'MEDIUM' | 'HIGH';
  }>(),
  
  // Global SLA defaults
  defaultSlaHours: integer('default_sla_hours').default(72),
  escalationEmail: varchar('escalation_email', { length: 255 }),
  
  // Audit fields
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
  createdBy: uuid('created_by'),
  updatedBy: uuid('updated_by'),
  
  // Hash for integrity verification (Trust Rails)
  contentHash: varchar('content_hash', { length: 64 }),
});

// Workflow Step Definitions Table
export const workflowStepDefinitions = pgTable('workflow_step_definitions', {
  id: uuid('id').primaryKey().defaultRandom(),
  workflowDefinitionId: uuid('workflow_definition_id').notNull().references(() => workflowDefinitions.id, { onDelete: 'cascade' }),
  
  // Core fields
  name: varchar('name', { length: 255 }).notNull(),
  description: text('description'),
  stepType: stepTypeEnum('step_type').notNull(),
  order: integer('order').notNull(),
  
  // Grouping
  phaseId: varchar('phase_id', { length: 100 }),
  phaseName: varchar('phase_name', { length: 255 }),
  
  // Assignment
  assigneeRole: varchar('assignee_role', { length: 100 }),
  assigneeUserId: uuid('assignee_user_id'),
  
  // Preconditions (Workflow-as-Contract)
  preconditions: jsonb('preconditions').$type<Precondition[]>().default([]),
  
  // Effects (Workflow-as-Contract)
  effects: jsonb('effects').$type<Effect[]>().default([]),
  
  // SLA Configuration
  slaHours: integer('sla_hours'),
  escalationRules: jsonb('escalation_rules').$type<EscalationRule[]>().default([]),
  
  // UI Configuration
  isRequired: boolean('is_required').notNull().default(true),
  isAutoAdvance: boolean('is_auto_advance').notNull().default(false),
  uiConfig: jsonb('ui_config').$type<{
    icon?: string;
    color?: string;
    helpText?: string;
    formSchema?: object;
  }>(),
  
  // Linked artifacts
  artifactTemplateIds: jsonb('artifact_template_ids').$type<string[]>().default([]),
  
  // Audit
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

// Types for JSON fields
export interface Precondition {
  id: string;
  type: 'DATA_PRESENT' | 'APPROVAL_RECEIVED' | 'SIGNATURE_OBTAINED' | 'ARTIFACT_COMPLETE' | 'STEP_COMPLETE' | 'ROLE_ASSIGNED' | 'DEADLINE_NOT_PASSED';
  target: string;
  operator: 'EXISTS' | 'EQUALS' | 'CONTAINS' | 'GREATER_THAN' | 'LESS_THAN' | 'NOT_EMPTY';
  value?: string | number | boolean;
  errorMessage?: string;
}

export interface Effect {
  id: string;
  type: 'CREATE_TASK' | 'TRIGGER_WORKER' | 'SEND_NOTIFICATION' | 'LOCK_VERSION' | 'UPDATE_STATE' | 'CREATE_ARTIFACT' | 'ASSIGN_ROLE' | 'SCHEDULE_REMINDER';
  target: string;
  payload?: Record<string, unknown>;
  delay?: number; // milliseconds
  condition?: string; // optional condition expression
}

export interface EscalationRule {
  id: string;
  triggerAfterHours: number;
  action: 'NOTIFY' | 'REASSIGN' | 'ESCALATE_MANAGER' | 'AUTO_COMPLETE' | 'BLOCK';
  recipients?: string[];
  message?: string;
}

// Relations
export const workflowDefinitionsRelations = relations(workflowDefinitions, ({ many }) => ({
  steps: many(workflowStepDefinitions),
}));

export const workflowStepDefinitionsRelations = relations(workflowStepDefinitions, ({ one }) => ({
  workflowDefinition: one(workflowDefinitions, {
    fields: [workflowStepDefinitions.workflowDefinitionId],
    references: [workflowDefinitions.id],
  }),
}));

// Export types
export type WorkflowDefinition = typeof workflowDefinitions.$inferSelect;
export type NewWorkflowDefinition = typeof workflowDefinitions.$inferInsert;
export type WorkflowStepDefinition = typeof workflowStepDefinitions.$inferSelect;
export type NewWorkflowStepDefinition = typeof workflowStepDefinitions.$inferInsert;
