/**
 * Workflow Dead Letter Queue Schema
 * 
 * Persists failed workflow steps for manual intervention or retry.
 * Pillar: Workflow-as-Contract 📜
 * Pillar: Trust Rails 🔐
 */

import { pgTable, uuid, text, timestamp, jsonb, integer, varchar, pgEnum } from 'drizzle-orm/pg-core';

export const dlqStatusEnum = pgEnum('workflow_dlq_status', [
  'PENDING',
  'RETRYING',
  'RESOLVED',
  'SKIPPED',
]);

export const workflowStepDeadLetter = pgTable('workflow_step_dead_letter', {
  id: uuid('id').primaryKey().defaultRandom(),
  tenantId: uuid('tenant_id').notNull(),
  workflowRunId: uuid('workflow_run_id').notNull(),
  workflowStepId: uuid('workflow_step_id').notNull(),
  stepRunId: uuid('step_run_id'),

  action: varchar('action', { length: 50 }),
  errorMessage: text('error_message'),
  errorStack: text('error_stack'),
  payload: jsonb('payload').$type<Record<string, unknown>>(),

  retryCount: integer('retry_count').notNull().default(0),
  maxRetries: integer('max_retries').notNull().default(3),
  status: dlqStatusEnum('status').notNull().default('PENDING'),
  nextRetryAt: timestamp('next_retry_at'),
  resolvedAt: timestamp('resolved_at'),
  resolution: varchar('resolution', { length: 50 }),

  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export type WorkflowDeadLetterStatus = 'PENDING' | 'RETRYING' | 'RESOLVED' | 'SKIPPED';

export interface DeadLetterPayload {
  stepName?: string;
  stepType?: string;
  workflowName?: string;
  completionData?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}
