// @ts-nocheck - Duplicate exports between schema and unified_workflow modules
/**
 * Schema Index with Type-Safe Exports
 *
 * This file provides convenient re-exports of commonly used schema entities
 * with proper TypeScript types inferred from Drizzle.
 */

// Re-export all tables from the main schema
export * from './schema';

// Re-export from sub-schemas
export * from './schema/unified_workflow';
export * from './schema/regulatory-atoms';

// Type helpers for common queries
import type { InferSelectModel, InferInsertModel } from 'drizzle-orm';
import {
  organizations,
  projects,
  documents,
  csrReports,
  users,
  auditLogs,
  sections,
  clientWorkspaces,
} from './schema';

// Inferred types from schema
export type Organization = InferSelectModel<typeof organizations>;
export type InsertOrganization = InferInsertModel<typeof organizations>;

export type Project = InferSelectModel<typeof projects>;
export type InsertProject = InferInsertModel<typeof projects>;

export type Document = InferSelectModel<typeof documents>;
export type InsertDocument = InferInsertModel<typeof documents>;

export type CSRReport = InferSelectModel<typeof csrReports>;
export type InsertCSRReport = InferInsertModel<typeof csrReports>;

export type User = InferSelectModel<typeof users>;
export type InsertUser = InferInsertModel<typeof users>;

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type InsertAuditLog = InferInsertModel<typeof auditLogs>;

export type Section = InferSelectModel<typeof sections>;
export type InsertSection = InferInsertModel<typeof sections>;

export type ClientWorkspace = InferSelectModel<typeof clientWorkspaces>;
export type InsertClientWorkspace = InferInsertModel<typeof clientWorkspaces>;

// Common status types
export type DocumentStatus =
  | 'draft'
  | 'in_progress'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'published';
export type SubmissionStatus = 'draft' | 'pending' | 'submitted' | 'approved' | 'rejected';

// Helper type for nullable timestamps
export type WithTimestamps = {
  createdAt: Date;
  updatedAt: Date;
};

// Helper type for organization-scoped entities
export type WithOrganization = {
  organizationId: number;
};

// Helper type for project-scoped entities
export type WithProject = WithOrganization & {
  projectId?: number;
};
