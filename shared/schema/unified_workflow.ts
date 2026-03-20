/**
 * Unified Workflow Schema
 *
 * This file defines the database schema for the unified document workflow system.
 * It includes tables for documents, versions, workflows, approvals, and more.
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
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Enums
export const documentStatusEnum = pgEnum('document_status', [
  'draft',
  'in_review',
  'approved',
  'published',
  'archived',
  'rejected',
]);

export const workflowStatusEnum = pgEnum('workflow_status', [
  'active',
  'completed',
  'rejected',
  'cancelled',
]);

export const approvalStatusEnum = pgEnum('approval_status', ['pending', 'approved', 'rejected']);

export const approvalTypeEnum = pgEnum('approval_type', ['user', 'role', 'group']);

export const moduleTypeEnum = pgEnum('module_type', [
  'cmc', // Chemistry, Manufacturing and Controls
  'cer', // Clinical Evaluation Reports
  'study', // Clinical Study Modules
  'ectd', // Electronic Common Technical Document
  '510k', // Medical Device Submissions
  'vault', // Document Vault (cross-module)
]);

// Tables
export const unifiedDocuments = pgTable('unified_documents', {
  id: serial('id').primaryKey(),
  title: text('title').notNull(),
  documentType: text('document_type').notNull(),
  status: documentStatusEnum('status').notNull().default('draft'),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
  organizationId: integer('organization_id').notNull(),
  latestVersion: integer('latest_version').notNull().default(1),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
}, table => ({
  orgStatusIdx: index('idx_unified_docs_org_status').on(table.organizationId, table.status),
}));

export const workflowDocumentVersions = pgTable(
  'workflow_document_versions',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => unifiedDocuments.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    content: json('content').$type<Record<string, any>>(),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    comments: text('comments'),
  },
  table => {
    return {
      wfDocVersionIdx: uniqueIndex('wf_doc_version_idx').on(table.documentId, table.version),
    };
  }
);

export const moduleDocuments = pgTable(
  'module_documents',
  {
    id: serial('id').primaryKey(),
    unifiedDocumentId: integer('unified_document_id')
      .notNull()
      .references(() => unifiedDocuments.id, { onDelete: 'cascade' }),
    moduleType: moduleTypeEnum('module_type').notNull(),
    originalId: text('original_id').notNull(),
    organizationId: integer('organization_id').notNull(),
    metadata: json('metadata').$type<Record<string, any>>().default({}),
  },
  table => {
    return {
      moduleDocIdx: uniqueIndex('module_doc_idx').on(
        table.moduleType,
        table.originalId,
        table.organizationId
      ),
    };
  }
);

export const documentAuditLogs = pgTable('document_audit_logs', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => unifiedDocuments.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  performedBy: text('performed_by').notNull(),
  performedAt: timestamp('performed_at').defaultNow().notNull(),
  details: json('details').$type<Record<string, any>>().default({}),
}, table => ({
  docTimeIdx: index('idx_audit_logs_doc_time').on(table.documentId, table.performedAt),
}));

export const workflowTemplates = pgTable('workflow_templates', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  moduleType: moduleTypeEnum('module_type').notNull(),
  organizationId: integer('organization_id').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedBy: text('updated_by'),
  updatedAt: timestamp('updated_at').defaultNow(),
  isActive: boolean('is_active').notNull().default(true),
  documentTypes: text('document_types').array().notNull().default([]),
  defaultForTypes: text('default_for_types').array().notNull().default([]),
});

export const workflowSteps = pgTable('workflow_steps', {
  id: serial('id').primaryKey(),
  templateId: integer('template_id')
    .notNull()
    .references(() => workflowTemplates.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  order: integer('order').notNull(),
  approverType: approvalTypeEnum('approver_type').notNull(),
  approverIds: text('approver_ids').array().notNull(),
  requiredActions: text('required_actions').array().notNull().default(['review', 'comment']),
});

export const documentWorkflows = pgTable('document_workflows', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => unifiedDocuments.id, { onDelete: 'cascade' }),
  templateId: integer('template_id')
    .notNull()
    .references(() => workflowTemplates.id),
  status: workflowStatusEnum('status').notNull().default('active'),
  currentStep: integer('current_step').notNull().default(1),
  startedBy: text('started_by').notNull(),
  startedAt: timestamp('started_at').defaultNow().notNull(),
  completedBy: text('completed_by'),
  completedAt: timestamp('completed_at'),
  rejectedBy: text('rejected_by'),
  rejectedAt: timestamp('rejected_at'),
  organizationId: integer('organization_id').notNull(),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
}, table => ({
  orgStatusIdx: index('idx_doc_workflows_org_status').on(table.organizationId, table.status),
  documentIdx: index('idx_doc_workflows_document_id').on(table.documentId),
}));

export const workflowApprovals = pgTable('workflow_approvals', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id')
    .notNull()
    .references(() => documentWorkflows.id, { onDelete: 'cascade' }),
  stepId: integer('step_id')
    .notNull()
    .references(() => workflowSteps.id),
  stepOrder: integer('step_order').notNull(),
  status: approvalStatusEnum('status').notNull().default('pending'),
  assignedTo: text('assigned_to').array().notNull(),
  assignmentType: approvalTypeEnum('assignment_type').notNull(),
  requiredActions: text('required_actions').array().notNull().default(['review']),
  completedBy: text('completed_by'),
  completedAt: timestamp('completed_at'),
  comments: text('comments'),
}, table => ({
  workflowStatusIdx: index('idx_wf_approvals_workflow_status').on(table.workflowId, table.status),
}));

export const workflowHistory = pgTable('workflow_history', {
  id: serial('id').primaryKey(),
  workflowId: integer('workflow_id')
    .notNull()
    .references(() => documentWorkflows.id, { onDelete: 'cascade' }),
  action: text('action').notNull(),
  performedBy: text('performed_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  details: json('details').$type<Record<string, any>>().default({}),
});

export const documentAttachments = pgTable('document_attachments', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => unifiedDocuments.id, { onDelete: 'cascade' }),
  fileName: text('file_name').notNull(),
  fileType: text('file_type').notNull(),
  fileSize: integer('file_size').notNull(),
  filePath: text('file_path').notNull(),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedAt: timestamp('uploaded_at').defaultNow().notNull(),
  description: text('description'),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
});

export const documentComments = pgTable('document_comments', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => unifiedDocuments.id, { onDelete: 'cascade' }),
  versionId: integer('version_id').references(() => workflowDocumentVersions.id),
  content: text('content').notNull(),
  createdBy: text('created_by').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at'),
  isResolved: boolean('is_resolved').notNull().default(false),
  resolvedBy: text('resolved_by'),
  resolvedAt: timestamp('resolved_at'),
  parentId: integer('parent_id').references((): AnyPgColumn => documentComments.id),
  metadata: json('metadata').$type<Record<string, any>>().default({}),
});

// Relations
export const unifiedDocumentsRelations = relations(unifiedDocuments, ({ many }) => ({
  versions: many(workflowDocumentVersions),
  moduleDocuments: many(moduleDocuments),
  workflows: many(documentWorkflows),
  auditLogs: many(documentAuditLogs),
  attachments: many(documentAttachments),
  comments: many(documentComments),
}));

export const workflowDocumentVersionsRelations = relations(workflowDocumentVersions, ({ one }) => ({
  document: one(unifiedDocuments, {
    fields: [workflowDocumentVersions.documentId],
    references: [unifiedDocuments.id],
  }),
}));

export const moduleDocumentsRelations = relations(moduleDocuments, ({ one }) => ({
  unifiedDocument: one(unifiedDocuments, {
    fields: [moduleDocuments.unifiedDocumentId],
    references: [unifiedDocuments.id],
  }),
}));

export const workflowTemplatesRelations = relations(workflowTemplates, ({ many }) => ({
  steps: many(workflowSteps),
  workflows: many(documentWorkflows),
}));

export const workflowStepsRelations = relations(workflowSteps, ({ one }) => ({
  template: one(workflowTemplates, {
    fields: [workflowSteps.templateId],
    references: [workflowTemplates.id],
  }),
}));

export const documentWorkflowsRelations = relations(documentWorkflows, ({ one, many }) => ({
  document: one(unifiedDocuments, {
    fields: [documentWorkflows.documentId],
    references: [unifiedDocuments.id],
  }),
  template: one(workflowTemplates, {
    fields: [documentWorkflows.templateId],
    references: [workflowTemplates.id],
  }),
  approvals: many(workflowApprovals),
  history: many(workflowHistory),
}));

export const workflowApprovalsRelations = relations(workflowApprovals, ({ one }) => ({
  workflow: one(documentWorkflows, {
    fields: [workflowApprovals.workflowId],
    references: [documentWorkflows.id],
  }),
  step: one(workflowSteps, {
    fields: [workflowApprovals.stepId],
    references: [workflowSteps.id],
  }),
}));

export const workflowHistoryRelations = relations(workflowHistory, ({ one }) => ({
  workflow: one(documentWorkflows, {
    fields: [workflowHistory.workflowId],
    references: [documentWorkflows.id],
  }),
}));

export const documentAttachmentsRelations = relations(documentAttachments, ({ one }) => ({
  document: one(unifiedDocuments, {
    fields: [documentAttachments.documentId],
    references: [unifiedDocuments.id],
  }),
}));

export const documentCommentsRelations = relations(documentComments, ({ one, many }) => ({
  document: one(unifiedDocuments, {
    fields: [documentComments.documentId],
    references: [unifiedDocuments.id],
  }),
  version: one(workflowDocumentVersions, {
    fields: [documentComments.versionId],
    references: [workflowDocumentVersions.id],
  }),
  parent: one(documentComments, {
    fields: [documentComments.parentId],
    references: [documentComments.id],
  }),
  replies: many(documentComments, { relationName: 'comment_replies' }),
}));

// Insert schemas
export const insertUnifiedDocumentSchema = createInsertSchema(unifiedDocuments, {
  metadata: z.record(z.any()).optional(),
});

export const insertDocumentVersionSchema = createInsertSchema(workflowDocumentVersions, {
  content: z.record(z.any()).optional(),
});

export const insertModuleDocumentSchema = createInsertSchema(moduleDocuments, {
  metadata: z.record(z.any()).optional(),
});

export const insertWorkflowTemplateSchema = createInsertSchema(workflowTemplates, {
  documentTypes: z.array(z.string()).optional(),
  defaultForTypes: z.array(z.string()).optional(),
});

export const insertWorkflowStepSchema = createInsertSchema(workflowSteps, {
  approverIds: z.array(z.string()),
  requiredActions: z.array(z.string()).optional(),
});

export const insertDocumentWorkflowSchema = createInsertSchema(documentWorkflows, {
  metadata: z.record(z.any()).optional(),
});

export const insertWorkflowApprovalSchema = createInsertSchema(workflowApprovals, {
  assignedTo: z.array(z.string()),
  requiredActions: z.array(z.string()).optional(),
});

// Types
export type UnifiedDocument = typeof unifiedDocuments.$inferSelect;
export type InsertUnifiedDocument = z.infer<typeof insertUnifiedDocumentSchema>;

export type DocumentVersion = typeof workflowDocumentVersions.$inferSelect;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;

export type ModuleDocument = typeof moduleDocuments.$inferSelect;
export type InsertModuleDocument = z.infer<typeof insertModuleDocumentSchema>;

export type WorkflowTemplate = typeof workflowTemplates.$inferSelect;
export type InsertWorkflowTemplate = z.infer<typeof insertWorkflowTemplateSchema>;

export type WorkflowStep = typeof workflowSteps.$inferSelect;
export type InsertWorkflowStep = z.infer<typeof insertWorkflowStepSchema>;

export type DocumentWorkflow = typeof documentWorkflows.$inferSelect;
export type InsertDocumentWorkflow = z.infer<typeof insertDocumentWorkflowSchema>;

export type WorkflowApproval = typeof workflowApprovals.$inferSelect;
export type InsertWorkflowApproval = z.infer<typeof insertWorkflowApprovalSchema>;
