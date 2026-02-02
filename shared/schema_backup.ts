/**
 * Shared Database Schema
 *
 * This file defines the database schema for the application,
 * including all tables, relationships, and types.
 *
 * Multi-tenant architecture with two levels:
 * 1. Organizations (top-level tenants)
 * 2. ClientWorkspaces (sub-tenants under an organization)
 */
import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  uuid,
  json,
  unique,
  primaryKey,
  varchar,
  real,
  index,
  uniqueIndex,
  foreignKey,
  decimal,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

/**
 * Organizations (Tenants) Table
 *
 * This is the root table for the multi-tenant system.
 * Each organization represents a separate tenant with isolated data.
 */
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  domain: text('domain'),
  logo: text('logo'),
  settings: json('settings'),
  apiKey: text('api_key').unique(),
  tier: text('tier').default('standard').notNull(), // standard, professional, enterprise
  status: text('status').default('active').notNull(), // active, inactive, suspended
  maxUsers: integer('max_users').default(5),
  maxProjects: integer('max_projects').default(10),
  maxStorage: integer('max_storage').default(5), // in GB
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Organization Insert Schema
export const insertOrganizationSchema = createInsertSchema(organizations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Organization Types
export type Organization = InferSelectModel<typeof organizations>;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

/**
 * ClientWorkspaces Table
 *
 * Represents client workspaces within an organization.
 * For CRO use case: different clients that the CRO works with.
 * For Biotech: could be different divisions or product lines.
 */
export const clientWorkspaces = pgTable(
  'client_workspaces',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    description: text('description'),
    logo: text('logo'),
    status: text('status').default('active').notNull(), // active, inactive, archived
    quotaProjects: integer('quota_projects').default(5), // Project quota for this client
    quotaStorage: integer('quota_storage').default(1), // Storage quota in GB
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    industry: text('industry'),
    settings: json('settings'),
    metadata: json('metadata'),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueOrgSlug: unique('unique_org_slug').on(table.organizationId, table.slug),
    };
  }
);

// Client Workspace Insert Schema
export const insertClientWorkspaceSchema = createInsertSchema(clientWorkspaces).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Workspace Types
export type ClientWorkspace = InferSelectModel<typeof clientWorkspaces>;
export type InsertClientWorkspace = z.infer<typeof insertClientWorkspaceSchema>;

/**
 * Client Access (User-Client Workspace Junction Table)
 *
 * Maps users to client workspaces with role information.
 * Similar to organizationUsers but for the client workspace level.
 */
export const clientAccess = pgTable(
  'client_access',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').default('viewer').notNull(), // admin, member, viewer
    permissions: json('permissions'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueUserClient: unique('unique_user_client').on(table.userId, table.clientWorkspaceId),
    };
  }
);

// Client Access Insert Schema
export const insertClientAccessSchema = createInsertSchema(clientAccess).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Access Types
export type ClientAccess = InferSelectModel<typeof clientAccess>;
export type InsertClientAccess = z.infer<typeof insertClientAccessSchema>;

/**
 * Users Table
 *
 * Represents users in the system.
 * Each user belongs to one or more organizations.
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  passwordHash: text('password_hash').notNull(),
  title: text('title'),
  department: text('department'),
  avatar: text('avatar'),
  bio: text('bio'),
  status: text('status').default('active').notNull(), // active, inactive, suspended
  lastLogin: timestamp('last_login'),
  defaultOrganizationId: integer('default_organization_id').references(() => organizations.id),
  preferences: json('preferences'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// User Insert Schema
export const insertUserSchema = createInsertSchema(users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// User Types
export type User = InferSelectModel<typeof users>;
export type InsertUser = z.infer<typeof insertUserSchema>;

/**
 * Organization Users (Junction Table)
 *
 * Maps users to organizations with role information.
 */
export const organizationUsers = pgTable(
  'organization_users',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').default('member').notNull(), // admin, manager, member, viewer
    permissions: json('permissions'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueUserOrg: unique('unique_user_org').on(table.userId, table.organizationId),
    };
  }
);

// Organization User Insert Schema
export const insertOrganizationUserSchema = createInsertSchema(organizationUsers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Organization User Types
export type OrganizationUser = InferSelectModel<typeof organizationUsers>;
export type InsertOrganizationUser = z.infer<typeof insertOrganizationUserSchema>;

/**
 * CER Projects Table
 *
 * Stores CER (Clinical Evaluation Report) projects.
 * Each project belongs to an organization (tenant).
 */
export const cerProjects = pgTable('cer_projects', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
  name: text('name').notNull(),
  deviceName: text('device_name').notNull(),
  deviceManufacturer: text('device_manufacturer').notNull(),
  deviceType: text('device_type'),
  deviceClass: text('device_class'),
  regulatoryContext: text('regulatory_context'), // MDR, IVDR, FDA, etc.
  description: text('description'),
  status: text('status').default('draft').notNull(), // draft, in-progress, review, approved, published
  version: text('version').default('1.0.0'),
  createdById: integer('created_by_id').references(() => users.id),
  assignedToId: integer('assigned_to_id').references(() => users.id),
  dueDate: timestamp('due_date'),
  startDate: timestamp('start_date'),
  completionDate: timestamp('completion_date'),
  reviewDate: timestamp('review_date'),
  qmpId: integer('qmp_id'), // Reference to Quality Management Plan
  settings: json('settings'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CER Project Insert Schema
export const insertCerProjectSchema = createInsertSchema(cerProjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CER Project Types
export type CerProject = InferSelectModel<typeof cerProjects>;
export type InsertCerProject = z.infer<typeof insertCerProjectSchema>;

/**
 * Project Documents Table
 *
 * Stores document references for CER projects with VAULT integration hooks.
 */
export const projectDocuments = pgTable('project_documents', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => cerProjects.id),
  vaultDocumentId: uuid('vault_document_id'), // Reference to document in VAULT
  name: text('name').notNull(),
  type: text('type').notNull(), // protocol, report, publication, etc.
  category: text('category'), // literature, clinical-investigation, post-market, etc.
  status: text('status').default('draft').notNull(), // draft, in-review, approved, published
  version: text('version').default('1.0.0'),
  filePath: text('file_path'),
  fileSize: integer('file_size'),
  mimeType: text('mime_type'),
  checksum: text('checksum'),
  uploadedById: integer('uploaded_by_id').references(() => users.id),
  metaData: json('meta_data'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Document Insert Schema
export const insertProjectDocumentSchema = createInsertSchema(projectDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Document Types
export type ProjectDocument = InferSelectModel<typeof projectDocuments>;
export type InsertProjectDocument = z.infer<typeof insertProjectDocumentSchema>;

/**
 * Project Activities Table
 *
 * Tracks activities and changes within a CER project for audit trail purposes.
 */
export const projectActivities = pgTable('project_activities', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => cerProjects.id),
  userId: integer('user_id').references(() => users.id),
  activityType: text('activity_type').notNull(), // create, update, delete, review, approve, etc.
  entityType: text('entity_type').notNull(), // project, document, section, etc.
  entityId: text('entity_id').notNull(), // ID of the entity affected
  description: text('description').notNull(),
  details: json('details'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Project Activity Insert Schema
export const insertProjectActivitySchema = createInsertSchema(projectActivities).omit({
  id: true,
  createdAt: true,
});

// Project Activity Types
export type ProjectActivity = InferSelectModel<typeof projectActivities>;
export type InsertProjectActivity = z.infer<typeof insertProjectActivitySchema>;

/**
 * Project Milestones Table
 *
 * Tracks important milestones and deadlines for CER projects.
 */
export const projectMilestones = pgTable('project_milestones', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => cerProjects.id),
  name: text('name').notNull(),
  description: text('description'),
  dueDate: timestamp('due_date').notNull(),
  completedAt: timestamp('completed_at'),
  completedById: integer('completed_by_id').references(() => users.id),
  status: text('status').default('pending').notNull(), // pending, in-progress, completed, missed
  priority: text('priority').default('medium').notNull(), // low, medium, high, critical
  notifyDays: integer('notify_days').default(7), // Days before due date to send notification
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Milestone Insert Schema
export const insertProjectMilestoneSchema = createInsertSchema(projectMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Milestone Types
export type ProjectMilestone = InferSelectModel<typeof projectMilestones>;
export type InsertProjectMilestone = z.infer<typeof insertProjectMilestoneSchema>;

/**
 * Client User Permissions Table
 *
 * Defines fine-grained permissions for users on specific projects.
 */
export const clientUserPermissions = pgTable(
  'client_user_permissions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    projectId: integer('project_id').references(() => cerProjects.id),
    // If projectId is null, permissions apply to all projects in the organization
    permissions: json('permissions').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueUserProject: unique('unique_user_project').on(table.userId, table.projectId),
    };
  }
);

// Client User Permission Insert Schema
export const insertClientUserPermissionSchema = createInsertSchema(clientUserPermissions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client User Permission Types
export type ClientUserPermission = InferSelectModel<typeof clientUserPermissions>;
export type InsertClientUserPermission = z.infer<typeof insertClientUserPermissionSchema>;

// Define table relationships
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(organizationUsers),
  cerProjects: many(cerProjects),
  projects: many(projects),
  clientWorkspaces: many(clientWorkspaces),
  projectTemplates: many(projectTemplates),
}));

export const usersRelations = relations(users, ({ many }) => ({
  organizations: many(organizationUsers),
  permissions: many(clientUserPermissions),
  clientAccess: many(clientAccess),
}));

export const cerProjectsRelations = relations(cerProjects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [cerProjects.organizationId],
    references: [organizations.id],
  }),
  clientWorkspace: one(clientWorkspaces, {
    fields: [cerProjects.clientWorkspaceId],
    references: [clientWorkspaces.id],
  }),
  documents: many(projectDocuments),
  activities: many(projectActivities),
  milestones: many(projectMilestones),
  approvals: many(cerApprovals),
}));

export const projectDocumentsRelations = relations(projectDocuments, ({ one }) => ({
  project: one(cerProjects, {
    fields: [projectDocuments.projectId],
    references: [cerProjects.id],
  }),
  organization: one(organizations, {
    fields: [projectDocuments.organizationId],
    references: [organizations.id],
  }),
}));

export const projectActivitiesRelations = relations(projectActivities, ({ one }) => ({
  project: one(cerProjects, {
    fields: [projectActivities.projectId],
    references: [cerProjects.id],
  }),
  organization: one(organizations, {
    fields: [projectActivities.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [projectActivities.userId],
    references: [users.id],
  }),
}));

/**
 * Regulatory Documents Table
 *
 * Stores regulatory documents created in the Document Editor.
 */
export const regulatoryDocuments = pgTable('regulatory_documents', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  title: text('title').notNull(),
  content: text('content').notNull(),
  documentType: text('document_type').notNull(), // IND, NDA, BLA, eCTD, etc.
  status: text('status').default('draft').notNull(), // draft, in-review, approved, published
  version: text('version').default('1.0.0'),
  createdById: integer('created_by_id').references(() => users.id),
  lastModifiedById: integer('last_modified_by_id').references(() => users.id),
  filePath: text('file_path'),
  metadata: json('metadata'),
  complianceMetrics: json('compliance_metrics'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Regulatory Document Insert Schema
export const insertRegulatoryDocumentSchema = createInsertSchema(regulatoryDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Regulatory Document Types
export type RegulatoryDocument = InferSelectModel<typeof regulatoryDocuments>;
export type InsertRegulatoryDocument = z.infer<typeof insertRegulatoryDocumentSchema>;

/**
 * Document Versions Table
 *
 * Tracks version history for documents.
 */
export const documentVersions = pgTable('document_versions', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => documents.id),
  versionNumber: text('version_number').notNull(),
  content: text('content').notNull(),
  changeDescription: text('change_description'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Document Version Insert Schema
export const insertDocumentVersionSchema = createInsertSchema(documentVersions).omit({
  id: true,
  createdAt: true,
});

// Document Version Types
export type DocumentVersion = InferSelectModel<typeof documentVersions>;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;

/**
 * CER Approvals Table
 *
 * Tracks approval workflow for CER documents and sections.
 */
export const cerApprovals = pgTable('cer_approvals', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => cerProjects.id),
  documentId: integer('document_id').references(() => projectDocuments.id),
  sectionKey: text('section_key'),
  approvalType: text('approval_type').notNull(), // document, section, project
  status: text('status').default('pending').notNull(), // pending, approved, rejected
  requestedById: integer('requested_by_id').references(() => users.id),
  requestedAt: timestamp('requested_at').defaultNow().notNull(),
  approvedById: integer('approved_by_id').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  rejectedById: integer('rejected_by_id').references(() => users.id),
  rejectedAt: timestamp('rejected_at'),
  comments: text('comments'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CER Approval Insert Schema
export const insertCerApprovalSchema = createInsertSchema(cerApprovals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CER Approval Types
export type CerApproval = InferSelectModel<typeof cerApprovals>;
export type InsertCerApproval = z.infer<typeof insertCerApprovalSchema>;

/**
 * CER Documents Table
 *
 * Represents documents associated with CER projects.
 */
export const cerDocuments = pgTable('cer_documents', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  cerProjectId: integer('cer_project_id')
    .notNull()
    .references(() => cerProjects.id),
  documentType: text('document_type').notNull(),
  title: text('title').notNull(),
  version: text('version').notNull(),
  status: text('status').notNull(),
  content: json('content'),
  metadata: json('metadata'),
  createdById: integer('created_by_id').references(() => users.id),
  updatedById: integer('updated_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CER Document Insert Schema
export const insertCerDocumentSchema = createInsertSchema(cerDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CER Document Types
export type CerDocument = InferSelectModel<typeof cerDocuments>;
export type InsertCerDocument = z.infer<typeof insertCerDocumentSchema>;

// CER Approvals Relations
export const cerApprovalsRelations = relations(cerApprovals, ({ one }) => ({
  organization: one(organizations, {
    fields: [cerApprovals.organizationId],
    references: [organizations.id],
  }),
  project: one(cerProjects, {
    fields: [cerApprovals.projectId],
    references: [cerProjects.id],
  }),
  document: one(cerDocuments, {
    fields: [cerApprovals.documentId],
    references: [cerDocuments.id],
  }),
  requestedBy: one(users, {
    fields: [cerApprovals.requestedById],
    references: [users.id],
  }),
  approvedBy: one(users, {
    fields: [cerApprovals.approvedById],
    references: [users.id],
  }),
  rejectedBy: one(users, {
    fields: [cerApprovals.rejectedById],
    references: [users.id],
  }),
}));

/**
 * Quality Management Plans Table
 *
 * Stores quality management plans with tenant context.
 * Each QMP is associated with an organization and optionally a CER project.
 */
export const qualityManagementPlans = pgTable('quality_management_plans', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').default('1.0.0').notNull(),
  status: text('status').default('draft').notNull(), // draft, active, retired
  approvedById: integer('approved_by_id').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  effectiveDate: timestamp('effective_date'),
  expiryDate: timestamp('expiry_date'),
  reviewFrequencyDays: integer('review_frequency_days').default(365),
  lastReviewDate: timestamp('last_review_date'),
  nextReviewDate: timestamp('next_review_date'),
  reviewReminderDays: integer('review_reminder_days').default(30),
  createdById: integer('created_by_id').references(() => users.id),
  settings: json('settings'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// QMP Insert Schema
export const insertQualityManagementPlanSchema = createInsertSchema(qualityManagementPlans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// QMP Types
export type QualityManagementPlan = InferSelectModel<typeof qualityManagementPlans>;
export type InsertQualityManagementPlan = z.infer<typeof insertQualityManagementPlanSchema>;

/**
 * QMP Audit Trail Table
 *
 * Tracks changes to quality management plans for compliance and audit purposes.
 */
export const qmpAuditTrail = pgTable('qmp_audit_trail', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  qmpId: integer('qmp_id')
    .notNull()
    .references(() => qualityManagementPlans.id),
  userId: integer('user_id').references(() => users.id),
  actionType: text('action_type').notNull(), // create, update, approve, review, retire
  entityType: text('entity_type').notNull(), // qmp, ctq_factor, section_gate, etc.
  entityId: text('entity_id').notNull(),
  description: text('description').notNull(),
  previousState: json('previous_state'),
  newState: json('new_state'),
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// QMP Audit Trail Insert Schema
export const insertQmpAuditTrailSchema = createInsertSchema(qmpAuditTrail).omit({
  id: true,
  createdAt: true,
});

// QMP Audit Trail Types
export type QmpAuditTrail = InferSelectModel<typeof qmpAuditTrail>;
export type InsertQmpAuditTrail = z.infer<typeof insertQmpAuditTrailSchema>;

/**
 * CTQ (Critical-to-Quality) Factors Table
 *
 * Stores critical quality factors with risk-based categorization.
 */
export const ctqFactors = pgTable('ctq_factors', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  qmpId: integer('qmp_id')
    .notNull()
    .references(() => qualityManagementPlans.id),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category').notNull(), // safety, efficacy, regulatory, clinical, etc.
  riskLevel: text('risk_level').notNull(), // high, medium, low
  applicableSection: text('applicable_section'), // benefit-risk, safety, equivalence, etc.
  validationCriteria: text('validation_criteria'),
  validationMethod: text('validation_method'),
  status: text('status').default('active').notNull(), // active, inactive
  requiresEvidenceType: text('requires_evidence_type'), // document, data, attestation, etc.
  requirementType: text('requirement_type').default('mandatory').notNull(), // mandatory, recommended, optional
  failureAction: text('failure_action').default('block').notNull(), // block, warning, notify
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CTQ Factor Insert Schema
export const insertCtqFactorSchema = createInsertSchema(ctqFactors).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CTQ Factor Types
export type CtqFactor = InferSelectModel<typeof ctqFactors>;
export type InsertCtqFactor = z.infer<typeof insertCtqFactorSchema>;

/**
 * QMP Section Gating Table
 *
 * Controls which CTQ factors are required for each CER section.
 */
export const qmpSectionGating = pgTable('qmp_section_gating', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  qmpId: integer('qmp_id')
    .notNull()
    .references(() => qualityManagementPlans.id),
  sectionKey: text('section_key').notNull(), // benefit-risk, safety, equivalence, etc.
  sectionName: text('section_name').notNull(),
  requiredCtqFactorIds: json('required_ctq_factor_ids').notNull(), // Array of CTQ factor IDs
  minimumMandatoryCompletion: integer('minimum_mandatory_completion').default(100), // Percentage
  minimumRecommendedCompletion: integer('minimum_recommended_completion').default(80), // Percentage
  allowOverride: boolean('allow_override').default(false),
  overrideRequiresApproval: boolean('override_requires_approval').default(true),
  overrideRequiresReason: boolean('override_requires_reason').default(true),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// QMP Section Gating Insert Schema
export const insertQmpSectionGatingSchema = createInsertSchema(qmpSectionGating).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// QMP Section Gating Types
export type QmpSectionGating = InferSelectModel<typeof qmpSectionGating>;
export type InsertQmpSectionGating = z.infer<typeof insertQmpSectionGatingSchema>;

/**
 * QMP Traceability Matrix Table
 *
 * Maps quality requirements to implementation evidence for traceability.
 */
export const qmpTraceabilityMatrix = pgTable('qmp_traceability_matrix', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  qmpId: integer('qmp_id')
    .notNull()
    .references(() => qualityManagementPlans.id),
  ctqFactorId: integer('ctq_factor_id').references(() => ctqFactors.id),
  requirementId: text('requirement_id').notNull(), // Unique ID for the requirement
  requirementText: text('requirement_text').notNull(),
  requirementSource: text('requirement_source'), // Regulation, standard, guidance, etc.
  verificationMethod: text('verification_method'), // Review, test, inspection, analysis
  implementationEvidence: json('implementation_evidence'), // References to documents, data, etc.
  verificationStatus: text('verification_status').default('pending').notNull(), // pending, verified, failed
  verifiedById: integer('verified_by_id').references(() => users.id),
  verifiedAt: timestamp('verified_at'),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// QMP Traceability Matrix Insert Schema
export const insertQmpTraceabilityMatrixSchema = createInsertSchema(qmpTraceabilityMatrix).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// QMP Traceability Matrix Types
export type QmpTraceabilityMatrix = InferSelectModel<typeof qmpTraceabilityMatrix>;
export type InsertQmpTraceabilityMatrix = z.infer<typeof insertQmpTraceabilityMatrixSchema>;

// Additional relations for QMP tables
export const qualityManagementPlansRelations = relations(
  qualityManagementPlans,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [qualityManagementPlans.organizationId],
      references: [organizations.id],
    }),
    clientWorkspace: one(clientWorkspaces, {
      fields: [qualityManagementPlans.clientWorkspaceId],
      references: [clientWorkspaces.id],
    }),
    ctqFactors: many(ctqFactors),
    sectionGating: many(qmpSectionGating),
    auditTrail: many(qmpAuditTrail),
    traceabilityMatrix: many(qmpTraceabilityMatrix),
  })
);

export const ctqFactorsRelations = relations(ctqFactors, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [ctqFactors.organizationId],
    references: [organizations.id],
  }),
  qmp: one(qualityManagementPlans, {
    fields: [ctqFactors.qmpId],
    references: [qualityManagementPlans.id],
  }),
  traceabilityItems: many(qmpTraceabilityMatrix),
}));

// Update CER Projects relations to include QMP reference
export const cerProjectsQmpRelation = relations(cerProjects, ({ one }) => ({
  qmp: one(qualityManagementPlans, {
    fields: [cerProjects.qmpId],
    references: [qualityManagementPlans.id],
  }),
}));

/**
 * Document Folder Table
 *
 * Represents a folder in the document management system.
 */
export const documentFolders = pgTable('document_folders', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  parentId: integer('parent_id').references(() => documentFolders.id),
  path: text('path'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Document Folder Insert Schema
export const insertDocumentFolderSchema = createInsertSchema(documentFolders).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Document Folder Types
export type DocumentFolder = InferSelectModel<typeof documentFolders>;
export type InsertDocumentFolder = z.infer<typeof insertDocumentFolderSchema>;

/**
 * Documents Table
 *
 * Represents a document in the system.
 */
export const documents = pgTable('documents', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  folderId: integer('folder_id').references(() => documentFolders.id),
  name: text('name').notNull(),
  description: text('description'),
  type: text('type').notNull(), // report, protocol, publication, etc.
  status: text('status').default('draft').notNull(), // draft, review, approved, published
  version: text('version').default('1.0.0'),
  fileName: text('file_name'),
  fileType: text('file_type'),
  fileSize: integer('file_size'),
  filePath: text('file_path'),
  content: json('content'),
  metadata: json('metadata'),
  tags: text('tags').array(),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Document Insert Schema
export const insertDocumentSchema = createInsertSchema(documents).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Document Types
export type Document = InferSelectModel<typeof documents>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

/**
 * Document Audit Log Table
 *
 * Tracks all document changes for compliance and regulatory requirements.
 * Provides complete audit trail for 21 CFR Part 11 compliance.
 */
export const documentAuditLog = pgTable('document_audit_log', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  documentId: integer('document_id')
    .notNull()
    .references(() => documents.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  action: text('action').notNull(), // created, modified, reviewed, approved, rejected, published, archived, restored
  previousVersion: text('previous_version'),
  newVersion: text('new_version').notNull(),
  changes: json('changes'), // Array of change objects: {field, oldValue, newValue, changeType}
  metadata: json('metadata'), // contentLength, wordCount, complianceScore, ipAddress, userAgent, sessionId
  comments: text('comments'),
  reviewDetails: json('review_details'), // reviewerId, reviewerName, reviewType, decision, feedback
  complianceScore: integer('compliance_score'), // 0-100 score
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  sessionId: text('session_id'),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
});

// Document Audit Log Insert Schema
export const insertDocumentAuditLogSchema = createInsertSchema(documentAuditLog).omit({
  id: true,
  timestamp: true,
});

// Document Audit Log Types
export type DocumentAuditLogEntry = InferSelectModel<typeof documentAuditLog>;
export type InsertDocumentAuditLog = z.infer<typeof insertDocumentAuditLogSchema>;

/**
 * Projects Table
 *
 * Core project entity that spans across all modules.
 * This is the central project record that can be linked to module-specific data.
 */
export const projects = pgTable('projects', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id')
    .notNull()
    .references(() => clientWorkspaces.id),
  name: text('name').notNull(),
  code: text('code'), // Project code or identifier
  description: text('description'),
  status: text('status').default('planning').notNull(), // planning, active, on-hold, completed, archived
  priority: text('priority').default('medium').notNull(), // low, medium, high, critical
  type: text('type').notNull(), // research, clinical, regulatory, commercial, etc.
  startDate: timestamp('start_date'),
  targetEndDate: timestamp('target_end_date'),
  actualEndDate: timestamp('actual_end_date'),
  progress: integer('progress').default(0), // 0-100 percentage
  budget: integer('budget'),
  budgetCurrency: text('budget_currency').default('USD'),
  budgetStatus: text('budget_status').default('within-budget'), // within-budget, at-risk, over-budget
  createdById: integer('created_by_id').references(() => users.id),
  ownerId: integer('owner_id').references(() => users.id),
  sponsors: text('sponsors').array(), // List of sponsor IDs or names
  tags: text('tags').array(),
  criticalToQualityFactors: json('critical_to_quality_factors'), // CtQ factors array
  riskLevel: text('risk_level').default('medium'), // low, medium, high
  riskAssessment: json('risk_assessment'),
  qualityTargets: json('quality_targets'),
  moduleReferences: json('module_references'), // References to specific module instances
  settings: json('settings'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Insert Schema
export const insertProjectSchema = createInsertSchema(projects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Types
export type Project = InferSelectModel<typeof projects>;
export type InsertProject = z.infer<typeof insertProjectSchema>;

/**
 * Project Modules Table
 *
 * Associates projects with specific module instances.
 * Maps the central project to module-specific projects (CER, IND, etc.)
 */
export const projectModules = pgTable(
  'project_modules',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    moduleType: text('module_type').notNull(), // cer, ind, cmc, csr, vault, etc.
    moduleInstanceId: integer('module_instance_id').notNull(), // ID in the module's specific table
    status: text('status').default('active').notNull(), // active, inactive, completed
    settings: json('settings'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueProjectModule: unique('unique_project_module').on(
        table.projectId,
        table.moduleType,
        table.moduleInstanceId
      ),
    };
  }
);

// Project Module Insert Schema
export const insertProjectModuleSchema = createInsertSchema(projectModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Module Types
export type ProjectModule = InferSelectModel<typeof projectModules>;
export type InsertProjectModule = z.infer<typeof insertProjectModuleSchema>;

/**
 * Project Workflow Stages Table
 *
 * Defines workflow stages for projects with CtQ integration.
 */
export const projectWorkflowStages = pgTable('project_workflow_stages', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id),
  name: text('name').notNull(),
  description: text('description'),
  order: integer('order').notNull(),
  status: text('status').default('pending').notNull(), // pending, in-progress, completed, blocked
  startDate: timestamp('start_date'),
  endDate: timestamp('end_date'),
  dueDate: timestamp('due_date'),
  criticalToQualityFactors: json('critical_to_quality_factors'), // Stage-specific CtQ factors
  completionCriteria: json('completion_criteria'),
  autoAdvance: boolean('auto_advance').default(false),
  assignees: text('assignees').array(), // User IDs assigned to this stage
  reviewers: text('reviewers').array(), // User IDs who must review/approve
  approvalStatus: text('approval_status').default('not-started'), // not-started, pending, approved, rejected
  settings: json('settings'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Workflow Stage Insert Schema
export const insertProjectWorkflowStageSchema = createInsertSchema(projectWorkflowStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Workflow Stage Types
export type ProjectWorkflowStage = InferSelectModel<typeof projectWorkflowStages>;
export type InsertProjectWorkflowStage = z.infer<typeof insertProjectWorkflowStageSchema>;

/**
 * Project Tasks Table
 *
 * Tasks associated with projects that span across modules.
 */
export const projectTasks = pgTable('project_tasks', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  projectId: integer('project_id')
    .notNull()
    .references(() => projects.id),
  workflowStageId: integer('workflow_stage_id').references(() => projectWorkflowStages.id),
  parentTaskId: integer('parent_task_id').references(() => projectTasks.id),
  name: text('name').notNull(),
  description: text('description'),
  status: text('status').default('todo').notNull(), // todo, in-progress, review, done, blocked
  priority: text('priority').default('medium').notNull(), // low, medium, high, urgent
  moduleType: text('module_type'), // If task is specific to a module
  assigneeId: integer('assignee_id').references(() => users.id),
  reviewerId: integer('reviewer_id').references(() => users.id),
  estimatedHours: integer('estimated_hours'),
  actualHours: integer('actual_hours'),
  startDate: timestamp('start_date'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  completedById: integer('completed_by_id').references(() => users.id),
  blockedReason: text('blocked_reason'),
  criticalToQuality: boolean('critical_to_quality').default(false),
  qualityMetrics: json('quality_metrics'),
  dependsOn: text('depends_on').array(), // IDs of tasks this depends on
  settings: json('settings'),
  metadata: json('metadata'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Task Insert Schema
export const insertProjectTaskSchema = createInsertSchema(projectTasks).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Task Types
export type ProjectTask = InferSelectModel<typeof projectTasks>;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;

/**
 * Project Templates Table
 *
 * Templates for creating standardized projects with predefined workflows.
 */
export const projectTemplates = pgTable('project_templates', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  description: text('description'),
  projectType: text('project_type').notNull(), // research, clinical, regulatory, etc.
  moduleTypes: text('module_types').array(), // List of modules this template is for
  industryFocus: text('industry_focus').array(), // MedDevice, Biotech, Pharma, etc.
  version: text('version').default('1.0.0'),
  status: text('status').default('active').notNull(), // draft, active, archived
  workflowStages: json('workflow_stages'), // Predefined workflow stages
  tasks: json('tasks'), // Predefined task templates
  criticalToQualityFactors: json('critical_to_quality_factors'), // Default CtQ factors
  regulatoryFramework: text('regulatory_framework').array(), // MDR, IVDR, FDA, etc.
  settings: json('settings'),
  metadata: json('metadata'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Template Insert Schema
export const insertProjectTemplateSchema = createInsertSchema(projectTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Template Types
export type ProjectTemplate = InferSelectModel<typeof projectTemplates>;
export type InsertProjectTemplate = z.infer<typeof insertProjectTemplateSchema>;

// Define relationships for the new project tables
export const projectsRelations = relations(projects, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [projects.organizationId],
    references: [organizations.id],
  }),
  clientWorkspace: one(clientWorkspaces, {
    fields: [projects.clientWorkspaceId],
    references: [clientWorkspaces.id],
  }),
  modules: many(projectModules),
  workflowStages: many(projectWorkflowStages),
  tasks: many(projectTasks),
  owner: one(users, {
    fields: [projects.ownerId],
    references: [users.id],
  }),
  creator: one(users, {
    fields: [projects.createdById],
    references: [users.id],
  }),
}));

export const projectModulesRelations = relations(projectModules, ({ one }) => ({
  project: one(projects, {
    fields: [projectModules.projectId],
    references: [projects.id],
  }),
  organization: one(organizations, {
    fields: [projectModules.organizationId],
    references: [organizations.id],
  }),
  clientWorkspace: one(clientWorkspaces, {
    fields: [projectModules.clientWorkspaceId],
    references: [clientWorkspaces.id],
  }),
}));

export const projectWorkflowStagesRelations = relations(projectWorkflowStages, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectWorkflowStages.projectId],
    references: [projects.id],
  }),
  organization: one(organizations, {
    fields: [projectWorkflowStages.organizationId],
    references: [organizations.id],
  }),
  tasks: many(projectTasks, { relationName: 'stageTasks' }),
}));

export const projectTasksRelations = relations(projectTasks, ({ one, many }) => ({
  project: one(projects, {
    fields: [projectTasks.projectId],
    references: [projects.id],
  }),
  organization: one(organizations, {
    fields: [projectTasks.organizationId],
    references: [organizations.id],
  }),
  workflowStage: one(projectWorkflowStages, {
    fields: [projectTasks.workflowStageId],
    references: [projectWorkflowStages.id],
    relationName: 'stageTasks',
  }),
  parentTask: one(projectTasks, {
    fields: [projectTasks.parentTaskId],
    references: [projectTasks.id],
  }),
  subtasks: many(projectTasks, { relationName: 'taskSubtasks' }),
  assignee: one(users, {
    fields: [projectTasks.assigneeId],
    references: [users.id],
  }),
  completer: one(users, {
    fields: [projectTasks.completedById],
    references: [users.id],
  }),
}));

/**
 * ====================================================================================
 * SEMANTIC DATA MODELS & STRUCTURED OBSERVATION TERMS
 * ====================================================================================
 *
 * Advanced semantic modeling for regulatory document intelligence,
 * cross-feature connectivity, and structured observation terminology
 */

// ========================================
// eCTD PYRAMID & DREAM eCTD MACHINE SCHEMA
// ========================================

/**
 * eCTD Modules Table
 *
 * Core eCTD structure (Modules 1-5) following ICH M4 guidelines
 * Hierarchical structure for complete eCTD Pyramid
 */
export const ectdModules = pgTable(
  'ectd_modules',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    projectId: integer('project_id'), // Reference to IND/NDA project
    moduleNumber: text('module_number').notNull(), // e.g., "1", "2", "3.2.P", "3.2.S"
    moduleName: text('module_name').notNull(), // e.g., "Administrative Information", "Quality Overall Summary"
    parentModuleId: integer('parent_module_id').references(() => ectdModules.id),
    level: integer('level').notNull(), // Hierarchy level (1=Module, 2=Section, 3=Subsection)
    isLeaf: boolean('is_leaf').default(false), // True if can contain documents (granules)
    sortOrder: integer('sort_order').notNull(),
    status: text('status').default('active').notNull(), // active, inactive, archived
    ichGuidance: text('ich_guidance'), // ICH M4 guidance text
    isRequired: boolean('is_required').default(false),
    allowCustomGranules: boolean('allow_custom_granules').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    moduleOrgIdx: index('ectd_modules_org_idx').on(table.organizationId),
    moduleProjectIdx: index('ectd_modules_project_idx').on(table.projectId),
    moduleNumberIdx: index('ectd_modules_number_idx').on(table.moduleNumber),
    parentModuleIdx: index('ectd_modules_parent_idx').on(table.parentModuleId),
  })
);

/**
 * eCTD Granules Table
 *
 * Individual documents within modules - the atomic units of eCTD
 * Implements granule-level document management with status tracking
 */
export const ectdGranules = pgTable(
  'ectd_granules',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    moduleId: integer('module_id')
      .references(() => ectdModules.id)
      .notNull(),
    granuleId: text('granule_id').notNull(), // e.g., "1.2", "3.2.P.1", "3.2.S.4.2"
    granuleName: text('granule_name').notNull(), // e.g., "Cover Letter", "Description and Composition"
    fileName: text('file_name'), // Current file name
    fileExtension: text('file_extension'), // .docx, .pdf, etc.
    status: text('status').default('draft').notNull(), // draft, final, uploaded, inactive, locked
    version: text('version').default('1.0').notNull(),
    lastEditedBy: integer('last_edited_by'),
    lastEditedAt: timestamp('last_edited_at'),
    documentPath: text('document_path'), // Path to actual document
    sharepointUrl: text('sharepoint_url'), // SharePoint integration
    sharepointDocId: text('sharepoint_doc_id'),
    isLocked: boolean('is_locked').default(false), // Locked for compilation
    compiledInto: integer('compiled_into'), // Reference to compiled module
    templateId: integer('template_id'), // Reference to template used
    customGranule: boolean('custom_granule').default(false), // User-created custom granule
    ichSection: text('ich_section'), // ICH M4 section reference
    wordCount: integer('word_count').default(0),
    metadata: json('metadata'), // Additional metadata
    tags: text('tags').array(), // User-defined tags
    sortOrder: integer('sort_order').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    granuleOrgIdx: index('ectd_granules_org_idx').on(table.organizationId),
    granuleModuleIdx: index('ectd_granules_module_idx').on(table.moduleId),
    granuleIdIdx: index('ectd_granules_id_idx').on(table.granuleId),
    granuleStatusIdx: index('ectd_granules_status_idx').on(table.status),
    granuleVersionIdx: index('ectd_granules_version_idx').on(table.version),
    granuleEditedIdx: index('ectd_granules_edited_idx').on(table.lastEditedAt),
  })
);

/**
 * eCTD Templates Table
 *
 * Template system for granules with ICH guidance integration
 */
export const ectdTemplates = pgTable(
  'ectd_templates',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    templateName: text('template_name').notNull(),
    granuleId: text('granule_id'), // Associated granule type
    moduleNumber: text('module_number'), // Associated module
    category: text('category').notNull(), // administrative, quality, nonclinical, clinical
    templateType: text('template_type').notNull(), // ich_standard, custom, regulatory
    content: text('content'), // Template content
    placeholders: json('placeholders'), // Dynamic placeholders
    ichGuidance: text('ich_guidance'), // ICH guidance for this template
    wordTemplate: text('word_template'), // Word template file path
    isActive: boolean('is_active').default(true),
    isDefault: boolean('is_default').default(false),
    version: text('version').default('1.0'),
    approvedBy: integer('approved_by'),
    approvedAt: timestamp('approved_at'),
    usageCount: integer('usage_count').default(0),
    tags: text('tags').array(),
    createdBy: integer('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    templateOrgIdx: index('ectd_templates_org_idx').on(table.organizationId),
    templateCategoryIdx: index('ectd_templates_category_idx').on(table.category),
    templateTypeIdx: index('ectd_templates_type_idx').on(table.templateType),
    templateActiveIdx: index('ectd_templates_active_idx').on(table.isActive),
  })
);

/**
 * eCTD Module Compilation Table
 *
 * Track compiled modules with ICH compliance and XML backbone generation
 */
export const ectdCompilations = pgTable(
  'ectd_compilations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    moduleId: integer('module_id')
      .references(() => ectdModules.id)
      .notNull(),
    compilationName: text('compilation_name').notNull(),
    compilationType: text('compilation_type').notNull(), // module, section, custom
    includedGranules: json('included_granules'), // Array of granule IDs
    compiledFilePath: text('compiled_file_path'),
    sharepointUrl: text('sharepoint_url'),
    xmlBackbone: text('xml_backbone'), // eCTD XML structure
    crossReferences: json('cross_references'), // ICH cross-references
    status: text('status').default('pending').notNull(), // pending, compiling, completed, failed
    compiledBy: integer('compiled_by').notNull(),
    compiledAt: timestamp('compiled_at'),
    version: text('version').default('1.0'),
    changeLog: json('change_log'), // Track changes in compilation
    validationResults: json('validation_results'), // ICH validation results
    lockReason: text('lock_reason'), // Reason for locking granules
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    compilationOrgIdx: index('ectd_compilations_org_idx').on(table.organizationId),
    compilationModuleIdx: index('ectd_compilations_module_idx').on(table.moduleId),
    compilationStatusIdx: index('ectd_compilations_status_idx').on(table.status),
    compilationDateIdx: index('ectd_compilations_date_idx').on(table.compiledAt),
  })
);

/**
 * eCTD Change Control Table
 *
 * ICH Change Control Process v1.9 implementation
 */
export const ectdChangeControl = pgTable(
  'ectd_change_control',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    granuleId: integer('granule_id')
      .references(() => ectdGranules.id)
      .notNull(),
    changeType: text('change_type').notNull(), // new, replace, delete, append
    changeReason: text('change_reason').notNull(),
    previousVersion: text('previous_version'),
    newVersion: text('new_version').notNull(),
    changeDescription: text('change_description'),
    sequenceNumber: text('sequence_number'), // ICH sequence number
    xmlOperation: text('xml_operation'), // ICH XML operation
    affectedSections: json('affected_sections'), // Cross-references affected
    reviewRequired: boolean('review_required').default(false),
    reviewedBy: integer('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    approvedBy: integer('approved_by'),
    approvedAt: timestamp('approved_at'),
    status: text('status').default('pending').notNull(), // pending, approved, rejected, implemented
    implementedAt: timestamp('implemented_at'),
    rollbackInfo: json('rollback_info'), // Rollback information
    auditTrail: json('audit_trail'), // Complete audit trail
    createdBy: integer('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    changeOrgIdx: index('ectd_change_org_idx').on(table.organizationId),
    changeGranuleIdx: index('ectd_change_granule_idx').on(table.granuleId),
    changeTypeIdx: index('ectd_change_type_idx').on(table.changeType),
    changeStatusIdx: index('ectd_change_status_idx').on(table.status),
    changeSequenceIdx: index('ectd_change_sequence_idx').on(table.sequenceNumber),
  })
);

/**
 * eCTD Cross References Table
 *
 * ICH M4 cross-referencing system with XML hyperlink generation
 */
export const ectdCrossReferences = pgTable(
  'ectd_cross_references',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    sourceGranuleId: integer('source_granule_id')
      .references(() => ectdGranules.id)
      .notNull(),
    targetGranuleId: integer('target_granule_id')
      .references(() => ectdGranules.id)
      .notNull(),
    referenceType: text('reference_type').notNull(), // citation, cross_ref, hyperlink, table_ref
    sourceLocation: text('source_location'), // Page, section, paragraph reference
    targetLocation: text('target_location'), // Target location
    linkText: text('link_text'), // Display text for link
    autoGenerated: boolean('auto_generated').default(false), // AI-generated reference
    ichCompliant: boolean('ich_compliant').default(true),
    validationStatus: text('validation_status').default('valid'), // valid, broken, outdated
    lastValidated: timestamp('last_validated'),
    xmlHyperlink: text('xml_hyperlink'), // eCTD XML hyperlink format
    contextInfo: json('context_info'), // Additional context
    createdBy: integer('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    crossRefOrgIdx: index('ectd_cross_ref_org_idx').on(table.organizationId),
    crossRefSourceIdx: index('ectd_cross_ref_source_idx').on(table.sourceGranuleId),
    crossRefTargetIdx: index('ectd_cross_ref_target_idx').on(table.targetGranuleId),
    crossRefTypeIdx: index('ectd_cross_ref_type_idx').on(table.referenceType),
    crossRefValidationIdx: index('ectd_cross_ref_validation_idx').on(table.validationStatus),
  })
);

/**
 * SharePoint Integration Table
 *
 * Track SharePoint document synchronization and collaboration
 */
export const sharepointIntegration = pgTable(
  'sharepoint_integration',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    granuleId: integer('granule_id')
      .references(() => ectdGranules.id)
      .notNull(),
    sharepointSiteId: text('sharepoint_site_id').notNull(),
    sharepointDocumentId: text('sharepoint_document_id').notNull(),
    sharepointUrl: text('sharepoint_url').notNull(),
    sharepointPath: text('sharepoint_path'),
    sharepointVersion: text('sharepoint_version'),
    syncStatus: text('sync_status').default('synced').notNull(), // synced, pending, failed, conflict
    lastSyncAt: timestamp('last_sync_at'),
    syncDirection: text('sync_direction'), // upload, download, bidirectional
    lockStatus: text('lock_status'), // unlocked, locked, checked_out
    lockedBy: text('locked_by'), // SharePoint user
    lockedAt: timestamp('locked_at'),
    conflictResolution: json('conflict_resolution'), // Conflict resolution log
    accessPermissions: json('access_permissions'), // SharePoint permissions
    metadata: json('metadata'), // SharePoint metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sharepointOrgIdx: index('sharepoint_org_idx').on(table.organizationId),
    sharepointGranuleIdx: index('sharepoint_granule_idx').on(table.granuleId),
    sharepointSiteIdx: index('sharepoint_site_idx').on(table.sharepointSiteId),
    sharepointStatusIdx: index('sharepoint_status_idx').on(table.syncStatus),
    sharepointSyncIdx: index('sharepoint_sync_idx').on(table.lastSyncAt),
  })
);

// eCTD Relations
export const ectdModulesRelations = relations(ectdModules, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [ectdModules.organizationId],
    references: [organizations.id],
  }),
  parentModule: one(ectdModules, {
    fields: [ectdModules.parentModuleId],
    references: [ectdModules.id],
  }),
  subModules: many(ectdModules),
  granules: many(ectdGranules),
  compilations: many(ectdCompilations),
}));

export const ectdGranulesRelations = relations(ectdGranules, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [ectdGranules.organizationId],
    references: [organizations.id],
  }),
  module: one(ectdModules, {
    fields: [ectdGranules.moduleId],
    references: [ectdModules.id],
  }),
  template: one(ectdTemplates, {
    fields: [ectdGranules.templateId],
    references: [ectdTemplates.id],
  }),
  changeControl: many(ectdChangeControl),
  crossReferencesSource: many(ectdCrossReferences, { relationName: 'sourceGranule' }),
  crossReferencesTarget: many(ectdCrossReferences, { relationName: 'targetGranule' }),
  sharepointIntegration: one(sharepointIntegration),
}));

export const ectdTemplatesRelations = relations(ectdTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [ectdTemplates.organizationId],
    references: [organizations.id],
  }),
  granules: many(ectdGranules),
}));

export const ectdCompilationsRelations = relations(ectdCompilations, ({ one }) => ({
  organization: one(organizations, {
    fields: [ectdCompilations.organizationId],
    references: [organizations.id],
  }),
  module: one(ectdModules, {
    fields: [ectdCompilations.moduleId],
    references: [ectdModules.id],
  }),
}));

export const ectdChangeControlRelations = relations(ectdChangeControl, ({ one }) => ({
  organization: one(organizations, {
    fields: [ectdChangeControl.organizationId],
    references: [organizations.id],
  }),
  granule: one(ectdGranules, {
    fields: [ectdChangeControl.granuleId],
    references: [ectdGranules.id],
  }),
}));

export const ectdCrossReferencesRelations = relations(ectdCrossReferences, ({ one }) => ({
  organization: one(organizations, {
    fields: [ectdCrossReferences.organizationId],
    references: [organizations.id],
  }),
  sourceGranule: one(ectdGranules, {
    fields: [ectdCrossReferences.sourceGranuleId],
    references: [ectdGranules.id],
    relationName: 'sourceGranule',
  }),
  targetGranule: one(ectdGranules, {
    fields: [ectdCrossReferences.targetGranuleId],
    references: [ectdGranules.id],
    relationName: 'targetGranule',
  }),
}));

export const sharepointIntegrationRelations = relations(sharepointIntegration, ({ one }) => ({
  organization: one(organizations, {
    fields: [sharepointIntegration.organizationId],
    references: [organizations.id],
  }),
  granule: one(ectdGranules, {
    fields: [sharepointIntegration.granuleId],
    references: [ectdGranules.id],
  }),
}));

/**
 * Structured Observation Terms Table
 *
 * This table stores structured medical/regulatory observation terms
 * used for AI-powered document analysis and compliance checking.
 * Supports SNOMED, MedDRA, ICD-10, and custom regulatory terminologies.
 */
export const structuredObservationTerms = pgTable(
  'structured_observation_terms',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    termCode: text('term_code').notNull(), // SNOMED, MedDRA, ICD-10 code
    termName: text('term_name').notNull(),
    termType: text('term_type').notNull(), // medical, regulatory, clinical, adverse_event, indication
    category: text('category').notNull(), // pharmacology, toxicology, efficacy, safety, chemistry
    subcategory: text('subcategory'),
    definition: text('definition'),
    synonyms: text('synonyms').array(),
    hierarchy: json('hierarchy'), // Parent-child relationships
    regulatoryContext: json('regulatory_context'), // FDA, EMA, ICH guidelines
    complianceRelevance: text('compliance_relevance').array(), // Which regulations this applies to
    frequency: integer('frequency').default(0), // Usage frequency for prioritization
    confidenceScore: real('confidence_score').default(1.0), // AI confidence in term accuracy
    vectorEmbedding: text('vector_embedding'), // Embedding for semantic search
    crossReferences: json('cross_references'), // References to other terminology systems
    contextualUsage: json('contextual_usage'), // How term is used in different contexts
    validationStatus: text('validation_status').default('pending').notNull(), // pending, validated, deprecated
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    observationTermsOrgIdx: index('observation_terms_org_idx').on(table.organizationId),
    observationTermsCodeIdx: index('observation_terms_code_idx').on(table.termCode),
    observationTermsTypeIdx: index('observation_terms_type_idx').on(table.termType),
    observationTermsCategoryIdx: index('observation_terms_category_idx').on(table.category),
    observationTermsActiveIdx: index('observation_terms_active_idx').on(table.isActive),
    observationTermsValidationIdx: index('observation_terms_validation_idx').on(
      table.validationStatus
    ),
  })
);

// Structured Observation Terms Insert Schema
export const insertStructuredObservationTermsSchema = createInsertSchema(
  structuredObservationTerms
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Structured Observation Terms Types
export type StructuredObservationTerm = InferSelectModel<typeof structuredObservationTerms>;
export type InsertStructuredObservationTerm = z.infer<
  typeof insertStructuredObservationTermsSchema
>;

/**
 * Semantic Entities Table
 *
 * Stores identified regulatory entities and concepts extracted from documents
 * for cross-document intelligence and automated compliance analysis.
 */
export const semanticEntities = pgTable(
  'semantic_entities',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    entityType: text('entity_type').notNull(), // drug, indication, endpoint, methodology, regulation
    entityName: text('entity_name').notNull(),
    ontologyId: text('ontology_id'), // External ontology reference
    confidence: real('confidence').default(0.0).notNull(), // AI confidence in entity extraction
    sourceDocuments: json('source_documents'), // Documents where entity was found
    attributes: json('attributes'), // Entity-specific attributes
    relationships: json('relationships'), // Relationships to other entities
    regulatorySignificance: text('regulatory_significance'), // High, medium, low
    complianceImpact: json('compliance_impact'), // Impact on regulatory compliance
    vectorEmbedding: text('vector_embedding'), // Semantic embedding
    extractionMethod: text('extraction_method').notNull(), // manual, ai_nlp, pattern_matching
    validationStatus: text('validation_status').default('pending').notNull(),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    semanticEntitiesOrgIdx: index('semantic_entities_org_idx').on(table.organizationId),
    semanticEntitiesTypeIdx: index('semantic_entities_type_idx').on(table.entityType),
    semanticEntitiesConfidenceIdx: index('semantic_entities_confidence_idx').on(table.confidence),
    semanticEntitiesSignificanceIdx: index('semantic_entities_significance_idx').on(
      table.regulatorySignificance
    ),
  })
);

// Semantic Entities Insert Schema
export const insertSemanticEntitiesSchema = createInsertSchema(semanticEntities).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Semantic Entities Types
export type SemanticEntity = InferSelectModel<typeof semanticEntities>;
export type InsertSemanticEntity = z.infer<typeof insertSemanticEntitiesSchema>;

/**
 * Knowledge Graph Nodes Table
 *
 * Represents nodes in the regulatory knowledge graph for
 * intelligent document cross-referencing and compliance analysis.
 */
export const knowledgeGraphNodes = pgTable(
  'knowledge_graph_nodes',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    nodeType: text('node_type').notNull(), // concept, document, regulation, guideline, entity
    nodeLabel: text('node_label').notNull(),
    properties: json('properties'), // Node-specific properties
    vectorEmbedding: text('vector_embedding'), // Semantic embedding for similarity
    confidence: real('confidence').default(1.0).notNull(),
    importance: real('importance').default(0.5).notNull(), // Node importance score
    sourceType: text('source_type'), // document, manual, ai_extracted, regulatory_database
    sourceId: text('source_id'), // Reference to source
    metadata: json('metadata'),
    isActive: boolean('is_active').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    knowledgeGraphOrgIdx: index('knowledge_graph_org_idx').on(table.organizationId),
    knowledgeGraphTypeIdx: index('knowledge_graph_type_idx').on(table.nodeType),
    knowledgeGraphImportanceIdx: index('knowledge_graph_importance_idx').on(table.importance),
  })
);

// Knowledge Graph Nodes Insert Schema
export const insertKnowledgeGraphNodesSchema = createInsertSchema(knowledgeGraphNodes).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Knowledge Graph Nodes Types
export type KnowledgeGraphNode = InferSelectModel<typeof knowledgeGraphNodes>;
export type InsertKnowledgeGraphNode = z.infer<typeof insertKnowledgeGraphNodesSchema>;

// eCTD Insert Schemas
export const insertEctdModuleSchema = createInsertSchema(ectdModules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEctdGranuleSchema = createInsertSchema(ectdGranules).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEctdTemplateSchema = createInsertSchema(ectdTemplates).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEctdCompilationSchema = createInsertSchema(ectdCompilations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEctdChangeControlSchema = createInsertSchema(ectdChangeControl).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEctdCrossReferenceSchema = createInsertSchema(ectdCrossReferences).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSharepointIntegrationSchema = createInsertSchema(sharepointIntegration).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// eCTD Types
export type EctdModule = InferSelectModel<typeof ectdModules>;
export type InsertEctdModule = z.infer<typeof insertEctdModuleSchema>;

export type EctdGranule = InferSelectModel<typeof ectdGranules>;
export type InsertEctdGranule = z.infer<typeof insertEctdGranuleSchema>;

export type EctdTemplate = InferSelectModel<typeof ectdTemplates>;
export type InsertEctdTemplate = z.infer<typeof insertEctdTemplateSchema>;

export type EctdCompilation = InferSelectModel<typeof ectdCompilations>;
export type InsertEctdCompilation = z.infer<typeof insertEctdCompilationSchema>;

export type EctdChangeControl = InferSelectModel<typeof ectdChangeControl>;
export type InsertEctdChangeControl = z.infer<typeof insertEctdChangeControlSchema>;

export type EctdCrossReference = InferSelectModel<typeof ectdCrossReferences>;
export type InsertEctdCrossReference = z.infer<typeof insertEctdCrossReferenceSchema>;

export type SharepointIntegration = InferSelectModel<typeof sharepointIntegration>;
export type InsertSharepointIntegration = z.infer<typeof insertSharepointIntegrationSchema>;

/**
 * Semantic Entities Table
 *
 * Central semantic entity registry for all domain-specific concepts
 * across regulatory, clinical, and document management domains
 */

/**
 * Semantic Relationships Table
 *
 * Models complex relationships between semantic entities
 * enabling intelligent document cross-referencing and knowledge discovery
 */
export const semanticRelationships = pgTable(
  'semantic_relationships',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),

    // Relationship Definition
    sourceEntityId: integer('source_entity_id')
      .references(() => semanticEntities.id)
      .notNull(),
    targetEntityId: integer('target_entity_id')
      .references(() => semanticEntities.id)
      .notNull(),
    relationshipType: text('relationship_type').notNull(), // is_a, part_of, requires, contradicts, supports, references, etc.
    relationshipStrength: real('relationship_strength').default(1.0), // 0.0 to 1.0
    bidirectional: boolean('bidirectional').default(false),

    // Semantic Context
    context: json('context'), // contextual information about the relationship
    evidence: json('evidence'), // supporting evidence for the relationship
    confidence: real('confidence').default(1.0),

    // Regulatory Significance
    regulatoryRelevance: text('regulatory_relevance'), // critical, important, informational
    complianceImpact: text('compliance_impact'), // affects_approval, guidance_only, informational

    // Usage Tracking
    usageCount: integer('usage_count').default(0),
    lastUsed: timestamp('last_used'),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdById: integer('created_by_id').references(() => users.id),
    validatedById: integer('validated_by_id').references(() => users.id),
  },
  table => ({
    sourceTargetIdx: uniqueIndex('semantic_rel_source_target_idx').on(
      table.sourceEntityId,
      table.targetEntityId,
      table.relationshipType
    ),
    relationshipTypeIdx: index('semantic_rel_type_idx').on(table.relationshipType),
    strengthIdx: index('semantic_rel_strength_idx').on(table.relationshipStrength),
    organizationIdx: index('semantic_rel_org_idx').on(table.organizationId),
  })
);

/**
 * Knowledge Graph Table
 *
 * Knowledge graph nodes for semantic intelligence
 */
export const knowledgeGraph = pgTable(
  'knowledge_graph',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    nodeType: text('node_type').notNull(),
    nodeId: text('node_id').notNull(),
    embeddingVector: real('embedding_vector').array(),
    embeddingModel: text('embedding_model'),
    embeddingVersion: text('embedding_version'),
    centrality: real('centrality'),
    connectivity: integer('connectivity'),
    clusterMembership: text('cluster_membership').array(),
    temporalValidity: json('temporal_validity'), // when this knowledge is valid
    lastValidated: timestamp('last_validated'),

    // Confidence and Quality
    confidence: real('confidence').default(1.0),
    quality: real('quality').default(1.0),
    sourceReliability: real('source_reliability').default(1.0),

    // Usage Analytics
    accessCount: integer('access_count').default(0),
    lastAccessed: timestamp('last_accessed'),

    // Metadata
    attributes: json('attributes'), // flexible attribute storage
    tags: text('tags').array(),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdById: integer('created_by_id').references(() => users.id),
  },
  table => ({
    nodeIdIdx: uniqueIndex('knowledge_graph_node_id_idx').on(table.nodeId, table.organizationId),
    nodeTypeIdx: index('knowledge_graph_node_type_idx').on(table.nodeType),
    centralityIdx: index('knowledge_graph_centrality_idx').on(table.centrality),
    organizationIdx: index('knowledge_graph_org_idx').on(table.organizationId),
  })
);

/**
 * Knowledge Graph Edges Table
 *
 * Relationships/connections in the knowledge graph
 */
export const knowledgeGraphEdges = pgTable(
  'knowledge_graph_edges',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),

    // Edge Definition
    sourceNodeId: text('source_node_id').notNull(),
    targetNodeId: text('target_node_id').notNull(),
    edgeType: text('edge_type').notNull(), // semantic_similarity, regulatory_reference, clinical_correlation, etc.

    // Edge Properties
    weight: real('weight').default(1.0), // strength of the relationship
    direction: text('direction').default('undirected'), // directed, undirected, bidirectional

    // Semantic Properties
    semanticDistance: real('semantic_distance'), // semantic distance between nodes
    similarity: real('similarity'), // similarity score

    // Contextual Information
    context: json('context'), // context in which this relationship exists
    evidence: json('evidence'), // evidence supporting this relationship

    // Quality Metrics
    confidence: real('confidence').default(1.0),
    reliability: real('reliability').default(1.0),

    // Usage Analytics
    traversalCount: integer('traversal_count').default(0),
    lastTraversed: timestamp('last_traversed'),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdById: integer('created_by_id').references(() => users.id),
  },
  table => ({
    sourceTargetIdx: index('knowledge_edges_source_target_idx').on(
      table.sourceNodeId,
      table.targetNodeId
    ),
    edgeTypeIdx: index('knowledge_edges_type_idx').on(table.edgeType),
    weightIdx: index('knowledge_edges_weight_idx').on(table.weight),
    organizationIdx: index('knowledge_edges_org_idx').on(table.organizationId),
  })
);

/**
 * Document Semantic Analysis Table
 *
 * Detailed semantic analysis results for all documents in the system
 * enabling intelligent search, cross-referencing, and compliance checking
 */
export const documentSemanticAnalysis = pgTable(
  'document_semantic_analysis',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),

    // Document Reference
    documentId: integer('document_id'), // flexible reference to any document table
    documentType: text('document_type').notNull(), // regulatory_document, cer_document, project_document, etc.
    documentTable: text('document_table').notNull(), // source table name

    // Semantic Analysis Results
    extractedEntities: json('extracted_entities'), // entities found in the document
    semanticConcepts: json('semantic_concepts'), // high-level concepts identified
    regulatoryReferences: json('regulatory_references'), // regulatory references found
    complianceGaps: json('compliance_gaps'), // identified compliance issues

    // Text Analytics
    sentimentAnalysis: json('sentiment_analysis'), // document sentiment analysis
    readabilityMetrics: json('readability_metrics'), // readability scores and metrics
    linguisticFeatures: json('linguistic_features'), // linguistic analysis results

    // Semantic Embeddings
    documentEmbedding: real('document_embedding').array(), // full document embedding
    sectionEmbeddings: json('section_embeddings'), // embeddings for each section
    embeddingModel: text('embedding_model'), // model used for embeddings

    // Regulatory Analysis
    regulatoryClassification: text('regulatory_classification'), // classification result
    complianceScore: real('compliance_score'), // overall compliance score
    criticalIssues: json('critical_issues'), // critical compliance issues
    recommendations: json('recommendations'), // AI-generated recommendations

    // Quality Metrics
    analysisConfidence: real('analysis_confidence').default(1.0),
    processingTime: integer('processing_time'), // milliseconds to process

    // Version Tracking
    analysisVersion: text('analysis_version'), // version of analysis algorithm
    lastReanalyzed: timestamp('last_reanalyzed'),

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    analyzedById: integer('analyzed_by_id').references(() => users.id),
  },
  table => ({
    documentRefIdx: index('doc_semantic_doc_ref_idx').on(table.documentTable, table.documentId),
    documentTypeIdx: index('doc_semantic_doc_type_idx').on(table.documentType),
    complianceScoreIdx: index('doc_semantic_compliance_idx').on(table.complianceScore),
    regulatoryClassIdx: index('doc_semantic_regulatory_idx').on(table.regulatoryClassification),
    organizationIdx: index('doc_semantic_org_idx').on(table.organizationId),
  })
);

/**
 * Cross-Feature Connectivity Table
 *
 * Tracks relationships and dependencies between different features and modules
 * enabling intelligent workflow automation and impact analysis
 */
export const crossFeatureConnectivity = pgTable(
  'cross_feature_connectivity',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),

    // Feature Connection Definition
    sourceFeature: text('source_feature').notNull(), // ectd_coauthor, vault_dms, ind_wizard, etc.
    targetFeature: text('target_feature').notNull(),
    connectionType: text('connection_type').notNull(), // data_dependency, workflow_trigger, cross_reference, etc.

    // Connection Details
    sourceObjectType: text('source_object_type'), // document, project, task, etc.
    sourceObjectId: integer('source_object_id'),
    targetObjectType: text('target_object_type'),
    targetObjectId: integer('target_object_id'),

    // Relationship Properties
    relationshipStrength: real('relationship_strength').default(1.0),
    automationLevel: text('automation_level'), // manual, semi_automated, fully_automated
    bidirectional: boolean('bidirectional').default(false),

    // Workflow Information
    triggerConditions: json('trigger_conditions'), // conditions that activate this connection
    actions: json('actions'), // actions to perform when triggered
    workflowState: json('workflow_state'), // current state of workflow processes

    // Impact Analysis
    impactLevel: text('impact_level'), // low, medium, high, critical
    propagationRules: json('propagation_rules'), // how changes propagate through connections

    // Performance Metrics
    executionCount: integer('execution_count').default(0),
    lastExecution: timestamp('last_execution'),
    averageExecutionTime: integer('average_execution_time'), // milliseconds
    successRate: real('success_rate').default(1.0),

    // Metadata
    metadata: json('metadata'), // additional connection metadata
    status: text('status').default('active'), // active, inactive, error

    // Audit
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdById: integer('created_by_id').references(() => users.id),
  },
  table => ({
    sourceTargetIdx: index('cross_feature_source_target_idx').on(
      table.sourceFeature,
      table.targetFeature
    ),
    connectionTypeIdx: index('cross_feature_type_idx').on(table.connectionType),
    sourceObjectIdx: index('cross_feature_source_obj_idx').on(
      table.sourceObjectType,
      table.sourceObjectId
    ),
    targetObjectIdx: index('cross_feature_target_obj_idx').on(
      table.targetObjectType,
      table.targetObjectId
    ),
    organizationIdx: index('cross_feature_org_idx').on(table.organizationId),
  })
);

export const insertSemanticRelationshipSchema = createInsertSchema(semanticRelationships).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKnowledgeGraphSchema = createInsertSchema(knowledgeGraph).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertKnowledgeGraphEdgeSchema = createInsertSchema(knowledgeGraphEdges).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentSemanticAnalysisSchema = createInsertSchema(
  documentSemanticAnalysis
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrossFeatureConnectivitySchema = createInsertSchema(
  crossFeatureConnectivity
).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type SemanticRelationship = InferSelectModel<typeof semanticRelationships>;
export type InsertSemanticRelationship = z.infer<typeof insertSemanticRelationshipSchema>;

export type KnowledgeGraphEdge = InferSelectModel<typeof knowledgeGraphEdges>;
export type InsertKnowledgeGraphEdge = z.infer<typeof insertKnowledgeGraphEdgeSchema>;

export type DocumentSemanticAnalysis = InferSelectModel<typeof documentSemanticAnalysis>;
export type InsertDocumentSemanticAnalysis = z.infer<typeof insertDocumentSemanticAnalysisSchema>;

export type CrossFeatureConnectivity = InferSelectModel<typeof crossFeatureConnectivity>;
export type InsertCrossFeatureConnectivity = z.infer<typeof insertCrossFeatureConnectivitySchema>;

/**
 * Semantic Relations - connecting all semantic models together
 */
export const semanticEntitiesRelations = relations(semanticEntities, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [semanticEntities.organizationId],
    references: [organizations.id],
  }),
  parentEntity: one(semanticEntities, {
    fields: [semanticEntities.parentEntityId],
    references: [semanticEntities.id],
  }),
  childEntities: many(semanticEntities, { relationName: 'entityHierarchy' }),
  sourceRelationships: many(semanticRelationships, { relationName: 'sourceEntity' }),
  targetRelationships: many(semanticRelationships, { relationName: 'targetEntity' }),
  creator: one(users, {
    fields: [semanticEntities.createdById],
    references: [users.id],
  }),
  updater: one(users, {
    fields: [semanticEntities.updatedById],
    references: [users.id],
  }),
}));

export const semanticRelationshipsRelations = relations(semanticRelationships, ({ one }) => ({
  organization: one(organizations, {
    fields: [semanticRelationships.organizationId],
    references: [organizations.id],
  }),
  sourceEntity: one(semanticEntities, {
    fields: [semanticRelationships.sourceEntityId],
    references: [semanticEntities.id],
    relationName: 'sourceEntity',
  }),
  targetEntity: one(semanticEntities, {
    fields: [semanticRelationships.targetEntityId],
    references: [semanticEntities.id],
    relationName: 'targetEntity',
  }),
  creator: one(users, {
    fields: [semanticRelationships.createdById],
    references: [users.id],
  }),
  validator: one(users, {
    fields: [semanticRelationships.validatedById],
    references: [users.id],
  }),
}));

export const structuredObservationTermsRelations = relations(
  structuredObservationTerms,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [structuredObservationTerms.organizationId],
      references: [organizations.id],
    }),
    parentTerm: one(structuredObservationTerms, {
      fields: [structuredObservationTerms.parentTermId],
      references: [structuredObservationTerms.id],
    }),
    childTerms: many(structuredObservationTerms, { relationName: 'termHierarchy' }),
    creator: one(users, {
      fields: [structuredObservationTerms.createdById],
      references: [users.id],
    }),
    reviewer: one(users, {
      fields: [structuredObservationTerms.reviewedById],
      references: [users.id],
    }),
  })
);

export const knowledgeGraphRelations = relations(knowledgeGraph, ({ one }) => ({
  organization: one(organizations, {
    fields: [knowledgeGraph.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [knowledgeGraph.createdById],
    references: [users.id],
  }),
}));

export const knowledgeGraphEdgesRelations = relations(knowledgeGraphEdges, ({ one }) => ({
  organization: one(organizations, {
    fields: [knowledgeGraphEdges.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [knowledgeGraphEdges.createdById],
    references: [users.id],
  }),
}));

export const documentSemanticAnalysisRelations = relations(documentSemanticAnalysis, ({ one }) => ({
  organization: one(organizations, {
    fields: [documentSemanticAnalysis.organizationId],
    references: [organizations.id],
  }),
  analyzer: one(users, {
    fields: [documentSemanticAnalysis.analyzedById],
    references: [users.id],
  }),
}));

export const crossFeatureConnectivityRelations = relations(crossFeatureConnectivity, ({ one }) => ({
  organization: one(organizations, {
    fields: [crossFeatureConnectivity.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [crossFeatureConnectivity.createdById],
    references: [users.id],
  }),
}));
