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
  date,
  customType,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';
import { sql } from 'drizzle-orm';
export * from './schema/vault';

// Type-safe helper for omitting fields from insert schemas
// This resolves TypeScript compatibility issues with drizzle-zod omit()
type OmitConfig<T extends Record<string, unknown>> = {
  [K in keyof T]?: true;
};

function createInsertSchemaOmit<
  TTable extends Parameters<typeof createInsertSchema>[0],
  TOmit extends OmitConfig<z.infer<ReturnType<typeof createInsertSchema<TTable>>>>,
>(table: TTable, omitFields: TOmit) {
  const schema = createInsertSchema(table);
  return schema.omit(omitFields as any);
}

// Custom pgvector type definition
const vector = (name: string, config: { dimensions: number }) =>
  customType<{ data: number[]; driverData: string }>({
    dataType() {
      return `vector(${config.dimensions})`;
    },
    toDriver(value: number[]): string {
      return JSON.stringify(value);
    },
    fromDriver(value: string): number[] {
      if (typeof value === 'string') {
        return JSON.parse(value);
      }
      return value as any;
    },
  })(name);

/**
 * Organizations (Tenants) Table
 *
 * This is the root table for the multi-tenant system.
 * Each organization represents a separate tenant with isolated data.
 */
export const organizations = pgTable('organizations', {
  id: serial('id').primaryKey(),
  uuid: uuid('uuid')
    .default(sql`gen_random_uuid()`)
    .notNull(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  domain: text('domain'),
  logo: text('logo'),
  industryMode: text('industry_mode'),
  stripeCustomerId: text('stripe_customer_id'),
  settings: json('settings'),
  apiKey: text('api_key').unique(),
  tier: text('tier').default('standard').notNull(), // free, standard, professional, enterprise
  status: text('status').default('active').notNull(), // active, inactive, suspended
  maxUsers: integer('max_users').default(5),
  maxProjects: integer('max_projects').default(10),
  maxStorage: integer('max_storage').default(5), // in GB
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Organization Insert Schema
export const insertOrganizationSchema = createInsertSchemaOmit(organizations, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Organization Types
export type Organization = InferSelectModel<typeof organizations>;
export type InsertOrganization = z.infer<typeof insertOrganizationSchema>;

/**
 * Audit Logs
 * GxP-compliant immutable audit trail of CRUD activity.
 */
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    tenantId: integer('tenant_id').notNull(),
    userId: integer('user_id'),
    action: text('action').notNull(),
    tableName: text('table_name').notNull(),
    recordId: text('record_id').notNull(),
    oldValues: json('old_values'),
    newValues: json('new_values'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => {
    return {
      idxAuditTenant: index('idx_audit_tenant').on(table.tenantId),
      idxAuditCreated: index('idx_audit_created').on(table.createdAt),
      idxAuditTableRecord: index('idx_audit_table_record').on(table.tableName, table.recordId),
    };
  }
);

export const insertAuditLogSchema = createInsertSchemaOmit(auditLogs, {
  id: true,
  createdAt: true,
});

export type AuditLog = InferSelectModel<typeof auditLogs>;
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;

/**
 * ======================================================================================
 * SHAREPOINT FILE MANAGEMENT SYSTEM
 * ======================================================================================
 *
 * Enterprise-grade file management with SharePoint/OneDrive functionality
 * Supports multi-tenant isolation, version control, audit trails, and 21 CFR Part 11 compliance
 */

// SharePoint Files table - stores file metadata and hierarchy
export const sharepoint_files = pgTable(
  'sharepoint_files',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    parentId: integer('parent_id'),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'file' or 'folder'
    mimeType: text('mime_type'),
    size: integer('size'),
    path: text('path').notNull(), // Full path for breadcrumb navigation
    storageUrl: text('storage_url'), // URL or path to actual file storage
    checksum: text('checksum'), // For integrity verification
    status: text('status').default('active').notNull(), // active, archived, deleted
    lockedBy: integer('locked_by'),
    lockedAt: timestamp('locked_at'),
    tags: text('tags').array(),
    metadata: json('metadata'),
    permissions: json('permissions'), // Access control list
    createdBy: text('created_by').notNull(),
    modifiedBy: text('modified_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    modifiedAt: timestamp('modified_at').defaultNow().notNull(),
  },
  table => ({
    orgPathIdx: index('sharepoint_files_org_path_idx').on(table.organizationId, table.path),
    parentIdx: index('sharepoint_files_parent_idx').on(table.parentId),
    statusIdx: index('sharepoint_files_status_idx').on(table.status),
  })
);

// SharePoint File Versions table - tracks all file versions
export const sharepoint_file_versions = pgTable(
  'sharepoint_file_versions',
  {
    id: serial('id').primaryKey(),
    fileId: integer('file_id')
      .notNull()
      .references(() => sharepoint_files.id),
    versionNumber: text('version_number').notNull(), // e.g., "1.0", "1.1", "2.0"
    size: integer('size'),
    storageUrl: text('storage_url').notNull(),
    checksum: text('checksum').notNull(),
    changeComment: text('change_comment'),
    isMajorVersion: boolean('is_major_version').default(false),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    fileVersionIdx: uniqueIndex('file_version_idx').on(table.fileId, table.versionNumber),
  })
);

// SharePoint Audit Log table - 21 CFR Part 11 compliance
export const sharepoint_audit_log = pgTable(
  'sharepoint_audit_log',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    fileId: integer('file_id').references(() => sharepoint_files.id),
    action: text('action').notNull(), // create, read, update, delete, share, lock, unlock, version, restore
    details: json('details'),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    signature: text('signature'), // Digital signature for Part 11 compliance
  },
  table => ({
    orgTimestampIdx: index('sharepoint_audit_org_timestamp_idx').on(
      table.organizationId,
      table.timestamp
    ),
    fileIdx: index('sharepoint_audit_file_idx').on(table.fileId),
  })
);

// SharePoint Shares table - tracks file/folder sharing
export const sharepoint_shares = pgTable(
  'sharepoint_shares',
  {
    id: serial('id').primaryKey(),
    fileId: integer('file_id')
      .notNull()
      .references(() => sharepoint_files.id),
    sharedWith: text('shared_with').notNull(), // email or group
    permission: text('permission').notNull(), // view, edit, admin
    shareType: text('share_type').notNull(), // user, group, link
    expiresAt: timestamp('expires_at'),
    shareLink: text('share_link').unique(),
    password: text('password'), // For password-protected links
    accessCount: integer('access_count').default(0),
    createdBy: text('created_by').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    fileShareIdx: index('sharepoint_shares_file_idx').on(table.fileId),
    sharedWithIdx: index('sharepoint_shares_with_idx').on(table.sharedWith),
  })
);

// SharePoint File Comments table - for collaboration
export const sharepoint_comments = pgTable(
  'sharepoint_comments',
  {
    id: serial('id').primaryKey(),
    fileId: integer('file_id')
      .notNull()
      .references(() => sharepoint_files.id),
    parentCommentId: integer('parent_comment_id'),
    content: text('content').notNull(),
    userId: text('user_id').notNull(),
    userName: text('user_name').notNull(),
    isResolved: boolean('is_resolved').default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    fileCommentIdx: index('sharepoint_comments_file_idx').on(table.fileId),
  })
);

// SharePoint File Locks table - for check-in/check-out
export const sharepoint_locks = pgTable('sharepoint_locks', {
  id: serial('id').primaryKey(),
  fileId: integer('file_id')
    .notNull()
    .references(() => sharepoint_files.id)
    .unique(),
  userId: text('user_id').notNull(),
  userName: text('user_name').notNull(),
  lockType: text('lock_type').notNull(), // exclusive, shared
  lockReason: text('lock_reason'),
  lockedAt: timestamp('locked_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at'),
});

/**
 * ======================================================================================
 * DOCUMENT LEAVES & EVIDENCE GRAPH SYSTEM
 * ======================================================================================
 *
 * Tables for the Enhanced Document Editor integration with IND Wizard
 * Supports Facts hydration, tracked changes, and regulatory validation
 */

// Leaves table - stores document leaf content and metadata
export const leaves = pgTable('leaves', {
  id: serial('id').primaryKey(),
  leafId: text('leaf_id').notNull().unique(),
  organizationId: integer('organization_id').references(() => organizations.id),
  ctdPath: text('ctd_path').notNull(),
  templateId: integer('template_id'),
  content: text('content'),
  status: text('status').default('draft').notNull(), // draft, review, approved, published
  version: integer('version').default(1).notNull(),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by'),
  lastModifiedBy: text('last_modified_by'),
});

// Facts table - evidence graph facts
export const facts = pgTable('facts', {
  id: serial('id').primaryKey(),
  factId: text('fact_id').notNull().unique(),
  type: text('type').notNull(), // drug_substance, clinical, administrative, etc.
  key: text('key').notNull(),
  value: text('value').notNull(),
  source: text('source'),
  confidence: real('confidence').default(1.0),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Leaf citations table - maps facts to leaf blocks
export const leafCitations = pgTable('leaf_citations', {
  id: serial('id').primaryKey(),
  leafId: text('leaf_id')
    .notNull()
    .references(() => leaves.leafId),
  factId: text('fact_id')
    .notNull()
    .references(() => facts.factId),
  blockId: text('block_id'),
  citationType: text('citation_type'), // direct, indirect, reference
  confidence: real('confidence'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Leaf patches table - proposed changes with tracked diffs
export const leafPatches = pgTable('leaf_patches', {
  id: serial('id').primaryKey(),
  patchId: text('patch_id').notNull().unique(),
  leafId: text('leaf_id')
    .notNull()
    .references(() => leaves.leafId),
  blocks: json('blocks'), // Array of block changes
  citations: json('citations'), // Array of citation changes
  status: text('status').default('pending').notNull(), // pending, applied, rejected
  author: text('author'),
  description: text('description'),
  appliedAt: timestamp('applied_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Validation findings table - validation results
export const validationFindings = pgTable('validation_findings', {
  id: serial('id').primaryKey(),
  findingId: text('finding_id').notNull().unique(),
  leafId: text('leaf_id').references(() => leaves.leafId),
  documentId: text('document_id'),
  category: text('category').notNull(), // structure, content, formatting, compliance
  severity: text('severity').notNull(), // error, warning, info
  check: text('check').notNull(),
  message: text('message').notNull(),
  resolved: boolean('resolved').default(false),
  resolvedAt: timestamp('resolved_at'),
  resolvedBy: text('resolved_by'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Audit trail table - e-signatures and approvals
export const auditTrail = pgTable(
  'audit_trail',
  {
    id: serial('id').primaryKey(),
    trailId: text('trail_id').notNull().unique(),
    entityType: varchar('entity_type', { length: 50 }).notNull(), // Added for Section Graph
    // section, document, leaf, project, module, task, etc.
    entityId: integer('entity_id').notNull(), // Added for Section Graph
    leafId: text('leaf_id').references(() => leaves.leafId),
    action: text('action').notNull(), // created, modified, approved, rejected, signed
    userId: text('user_id').notNull(),
    userName: text('user_name'),
    signature: text('signature'), // Electronic signature hash
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    reason: text('reason'),
    metadata: json('metadata'),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  table => ({
    entityIdx: index('audit_trail_entity_idx').on(table.entityType, table.entityId),
    actionIdx: index('audit_trail_action_idx').on(table.action),
    userIdx: index('audit_trail_user_idx').on(table.userId),
    timestampIdx: index('audit_trail_timestamp_idx').on(table.timestamp),
  })
);

// Insert schemas for leaves system
export const insertLeafSchema = createInsertSchemaOmit(leaves, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFactSchema = createInsertSchemaOmit(facts, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertLeafCitationSchema = createInsertSchemaOmit(leafCitations, {
  id: true,
  createdAt: true,
});

export const insertLeafPatchSchema = createInsertSchemaOmit(leafPatches, {
  id: true,
  createdAt: true,
});

export const insertValidationFindingSchema = createInsertSchemaOmit(validationFindings, {
  id: true,
  createdAt: true,
});

export const insertAuditTrailSchema = createInsertSchemaOmit(auditTrail, {
  id: true,
  timestamp: true,
});

// Types for leaves system
export type Leaf = InferSelectModel<typeof leaves>;
export type InsertLeaf = z.infer<typeof insertLeafSchema>;
export type Fact = InferSelectModel<typeof facts>;
export type InsertFact = z.infer<typeof insertFactSchema>;
export type LeafCitation = InferSelectModel<typeof leafCitations>;
export type InsertLeafCitation = z.infer<typeof insertLeafCitationSchema>;
export type LeafPatch = InferSelectModel<typeof leafPatches>;
export type InsertLeafPatch = z.infer<typeof insertLeafPatchSchema>;
export type ValidationFinding = InferSelectModel<typeof validationFindings>;
export type InsertValidationFinding = z.infer<typeof insertValidationFindingSchema>;
export type AuditTrailEntry = InferSelectModel<typeof auditTrail>;
export type InsertAuditTrailEntry = z.infer<typeof insertAuditTrailSchema>;

/**
 * ======================================================================================
 * MODULE SUBSCRIPTION SYSTEM
 * ======================================================================================
 *
 * Tables for managing module subscriptions for organizations
 * Supports toggling modules on/off per organization for SaaS licensing
 */

// Available modules table - defines all available modules in the system
export const availableModules = pgTable('available_modules', {
  id: serial('id').primaryKey(),
  moduleId: text('module_id').notNull().unique(),
  name: text('name').notNull(),
  description: text('description'),
  category: text('category'), // submissions, authoring, intelligence, analytics
  path: text('path'), // route path in the application
  icon: text('icon'), // icon identifier
  isNew: boolean('is_new').default(false),
  isHighlight: boolean('is_highlight').default(false),
  sortOrder: integer('sort_order').default(0),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Module subscriptions table - links organizations to enabled modules
export const moduleSubscriptions = pgTable(
  'module_subscriptions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    moduleId: text('module_id')
      .notNull()
      .references(() => availableModules.moduleId, { onDelete: 'cascade' }),
    enabled: boolean('enabled').default(true).notNull(),
    enabledAt: timestamp('enabled_at'),
    disabledAt: timestamp('disabled_at'),
    enabledBy: text('enabled_by'),
    disabledBy: text('disabled_by'),
    metadata: json('metadata'), // can store tier info, custom pricing, limits etc
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    // Ensure each organization can only have one subscription per module
    uniqueOrgModule: unique().on(table.organizationId, table.moduleId),
    orgIdx: index('module_subscriptions_org_idx').on(table.organizationId),
    moduleIdx: index('module_subscriptions_module_idx').on(table.moduleId),
    enabledIdx: index('module_subscriptions_enabled_idx').on(table.enabled),
  })
);

// Insert schemas for module subscription system
export const insertAvailableModuleSchema = createInsertSchemaOmit(availableModules, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertModuleSubscriptionSchema = createInsertSchemaOmit(moduleSubscriptions, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for module subscription system
export type AvailableModule = InferSelectModel<typeof availableModules>;
export type InsertAvailableModule = z.infer<typeof insertAvailableModuleSchema>;
export type ModuleSubscription = InferSelectModel<typeof moduleSubscriptions>;
export type InsertModuleSubscription = z.infer<typeof insertModuleSubscriptionSchema>;

/**
 * ======================================================================================
 * SECTION GRAPH & REAL-TIME SYNCHRONIZATION SYSTEM
 * ======================================================================================
 *
 * Tables for cross-document section synchronization and real-time propagation
 * Supports canonical sections, linking, patching, and conflict resolution
 */

// Sections table - canonical sections that can be linked across documents
export const sections = pgTable('sections', {
  id: serial('id').primaryKey(),
  sectionId: text('section_id').notNull().unique(),
  organizationId: integer('organization_id').references(() => organizations.id),
  projectId: integer('project_id'),
  title: text('title'),
  content: text('content'),
  contentHash: text('content_hash'),
  version: integer('version').default(1).notNull(),
  status: text('status').default('active').notNull(), // active, archived, deleted
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdBy: text('created_by'),
  lastModifiedBy: text('last_modified_by'),
});

// Section links table - links documents to canonical sections
export const sectionLinks = pgTable(
  'section_links',
  {
    id: serial('id').primaryKey(),
    leafId: text('leaf_id')
      .notNull()
      .references(() => leaves.leafId),
    sectionId: text('section_id')
      .notNull()
      .references(() => sections.sectionId),
    organizationId: integer('organization_id').references(() => organizations.id),
    projectId: integer('project_id'),
    blockRange: json('block_range'), // {start: blockId, end: blockId}
    linkType: text('link_type').default('reference'), // reference, canonical, override
    isActive: boolean('is_active').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    leafSectionIdx: index('leaf_section_idx').on(table.leafId, table.sectionId),
    sectionLinksIdx: index('section_links_idx').on(table.sectionId),
  })
);

// Section patches table - changes to canonical sections
export const sectionPatches = pgTable(
  'section_patches',
  {
    id: serial('id').primaryKey(),
    sectionId: text('section_id')
      .notNull()
      .references(() => sections.sectionId),
    leafId: text('leaf_id'), // source leaf that triggered the patch
    patch: json('patch').notNull(), // {type, content, blocks, citations, metadata}
    author: json('author'), // {id, name, email}
    version: integer('version').notNull(),
    conflictsWith: integer('conflicts_with'), // references another patch id if conflict
    status: text('status').default('pending').notNull(), // pending, applied, rejected, conflict
    appliedAt: timestamp('applied_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    sectionPatchesIdx: index('section_patches_idx').on(table.sectionId, table.status),
    versionIdx: index('section_version_idx').on(table.sectionId, table.version),
  })
);

// Section propagations table - tracks propagation of changes to documents
export const sectionPropagations = pgTable(
  'section_propagations',
  {
    id: serial('id').primaryKey(),
    sectionId: text('section_id').notNull(),
    patchId: integer('patch_id').references(() => sectionPatches.id),
    targetLeafId: text('target_leaf_id').notNull(),
    status: text('status').default('pending').notNull(), // pending, in_progress, completed, failed
    priority: text('priority').default('normal'), // low, normal, high, critical
    retryCount: integer('retry_count').default(0),
    lastError: text('last_error'),
    scheduledAt: timestamp('scheduled_at').defaultNow().notNull(),
    executedAt: timestamp('executed_at'),
    metadata: json('metadata'),
  },
  table => ({
    propagationStatusIdx: index('propagation_status_idx').on(table.status, table.priority),
    targetLeafIdx: index('target_leaf_idx').on(table.targetLeafId),
  })
);

// Insert schemas for section system
export const insertSectionSchema = createInsertSchemaOmit(sections, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSectionLinkSchema = createInsertSchemaOmit(sectionLinks, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSectionPatchSchema = createInsertSchemaOmit(sectionPatches, {
  id: true,
  createdAt: true,
});

export const insertSectionPropagationSchema = createInsertSchemaOmit(sectionPropagations, {
  id: true,
  scheduledAt: true,
});

// Types for section system
export type Section = InferSelectModel<typeof sections>;
export type InsertSection = z.infer<typeof insertSectionSchema>;
export type SectionLink = InferSelectModel<typeof sectionLinks>;
export type InsertSectionLink = z.infer<typeof insertSectionLinkSchema>;
export type SectionPatch = InferSelectModel<typeof sectionPatches>;
export type InsertSectionPatch = z.infer<typeof insertSectionPatchSchema>;
export type SectionPropagation = InferSelectModel<typeof sectionPropagations>;
export type InsertSectionPropagation = z.infer<typeof insertSectionPropagationSchema>;

/**
 * ======================================================================================
 * PHARMACEUTICAL SUPPLY CHAIN MANAGEMENT SYSTEM - GxP COMPLIANT DATA MODELS
 * ======================================================================================
 *
 * Comprehensive pharmaceutical supply chain entities for enterprise deployment
 * Includes GxP compliance, 21 CFR Part 11, ICH guidelines, and regulatory requirements
 */

// ============================================================================
// SUPPLIERS & VENDOR MANAGEMENT
// ============================================================================

export const supplyChainSuppliers = pgTable(
  'supply_chain_suppliers',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    supplierCode: varchar('supplier_code', { length: 50 }).notNull(),
    name: text('name').notNull(),
    legalName: text('legal_name'),
    supplierType: varchar('supplier_type', { length: 50 }).notNull(), // API, Excipient, Packaging, Testing, Contract
    qualificationStatus: varchar('qualification_status', { length: 50 })
      .default('pending')
      .notNull(), // pending, qualified, disqualified, suspended
    riskLevel: varchar('risk_level', { length: 20 }).default('medium').notNull(), // low, medium, high, critical
    qualificationDate: date('qualification_date'),
    nextAuditDate: date('next_audit_date'),
    lastAuditDate: date('last_audit_date'),
    auditScore: decimal('audit_score', { precision: 5, scale: 2 }),
    // Contact Information
    primaryContact: text('primary_contact'),
    contactEmail: text('contact_email'),
    contactPhone: text('contact_phone'),
    // Address Information
    address: text('address'),
    city: text('city'),
    state: text('state'),
    postalCode: text('postal_code'),
    country: text('country'),
    // Regulatory & Compliance
    regulatoryLicenses: json('regulatory_licenses'), // FDA registration, EMA authorization, etc.
    certifications: json('certifications'), // ISO 9001, ICH Q7, GDP, etc.
    inspectionHistory: json('inspection_history'),
    deviationHistory: json('deviation_history'),
    // Business Information
    contractStatus: varchar('contract_status', { length: 50 }).default('active'),
    contractExpiry: date('contract_expiry'),
    paymentTerms: text('payment_terms'),
    deliveryTerms: text('delivery_terms'),
    // Performance Metrics
    qualityScore: decimal('quality_score', { precision: 5, scale: 2 }),
    deliveryPerformance: decimal('delivery_performance', { precision: 5, scale: 2 }),
    // Metadata
    notes: text('notes'),
    metadata: json('metadata'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    supplierCodeOrg: uniqueIndex('supplier_code_org_idx').on(
      table.supplierCode,
      table.organizationId
    ),
    qualificationStatusIdx: index('supplier_qualification_status_idx').on(
      table.qualificationStatus
    ),
    riskLevelIdx: index('supplier_risk_level_idx').on(table.riskLevel),
  })
);

// ============================================================================
// MATERIALS & SPECIFICATIONS MANAGEMENT
// ============================================================================

export const supplyChainMaterials = pgTable(
  'supply_chain_materials',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    materialCode: varchar('material_code', { length: 100 }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    materialType: varchar('material_type', { length: 50 }).notNull(), // API, Excipient, PackagingMaterial, FinishedProduct
    materialCategory: varchar('material_category', { length: 50 }), // DrugSubstance, DrugProduct, PrimaryPackaging, etc.
    // Chemical & Regulatory Information
    casNumber: varchar('cas_number', { length: 50 }),
    molecularFormula: text('molecular_formula'),
    molecularWeight: decimal('molecular_weight', { precision: 10, scale: 4 }),
    // Regulatory Status
    regulatoryStatus: varchar('regulatory_status', { length: 50 }).default('approved'), // approved, pending, restricted, banned
    dmeFileNumber: text('dme_file_number'),
    cepNumber: text('cep_number'),
    // Storage & Handling
    storageConditions: text('storage_conditions'), // 2-8°C, -20°C, Room Temperature
    handlingInstructions: text('handling_instructions'),
    shelfLife: integer('shelf_life'), // months
    reorderPoint: decimal('reorder_point', { precision: 10, scale: 3 }),
    // Supplier Information
    primarySupplierId: integer('primary_supplier_id'),
    approvedSuppliers: json('approved_suppliers'), // array of supplier IDs
    // Quality Specifications
    qualityGrade: varchar('quality_grade', { length: 50 }), // USP, Ph.Eur, JP, In-house
    specificationVersion: varchar('specification_version', { length: 20 }).default('1.0'),
    specifications: json('specifications'), // detailed specs with parameters and limits
    // Batch Information
    batchSize: decimal('batch_size', { precision: 12, scale: 3 }),
    batchSizeUnit: varchar('batch_size_unit', { length: 20 }).default('kg'),
    // Traceability
    isControlled: boolean('is_controlled').default(false), // controlled substance
    isHazardous: boolean('is_hazardous').default(false),
    // Metadata
    notes: text('notes'),
    metadata: json('metadata'),
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    materialCodeOrg: uniqueIndex('material_code_org_idx').on(
      table.materialCode,
      table.organizationId
    ),
    materialTypeIdx: index('material_type_idx').on(table.materialType),
    casNumberIdx: index('cas_number_idx').on(table.casNumber),
    storageConditionsIdx: index('storage_conditions_idx').on(table.storageConditions),
  })
);

// ============================================================================
// BATCH & LOT MANAGEMENT
// ============================================================================

export const supplyChainBatches = pgTable(
  'supply_chain_batches',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    batchNumber: varchar('batch_number', { length: 100 }).notNull(),
    lotNumber: varchar('lot_number', { length: 100 }), // same as batch for API, different for DP
    materialId: integer('material_id')
      .notNull()
      .references(() => materials.id),
    // Batch Status & Lifecycle
    batchStatus: varchar('batch_status', { length: 50 }).default('in_process').notNull(),
    // in_process, testing, quarantine, approved, rejected, released, recalled
    manufacturingStatus: varchar('manufacturing_status', { length: 50 }).default('planned'),
    // planned, in_progress, completed, failed
    // Manufacturing Information
    manufacturingDate: date('manufacturing_date'),
    expiryDate: date('expiry_date'),
    retest_date: date('retest_date'),
    manufacturingSiteId: integer('manufacturing_site_id'),
    batchSize: decimal('batch_size', { precision: 12, scale: 3 }),
    batchSizeUnit: varchar('batch_size_unit', { length: 20 }).default('kg'),
    yield: decimal('yield', { precision: 5, scale: 2 }), // percentage
    // Quality Information
    qcStatus: varchar('qc_status', { length: 50 }).default('pending'), // pending, in_progress, passed, failed
    qcTestingDate: date('qc_testing_date'),
    qcApprovalDate: date('qc_approval_date'),
    qcApprovedBy: text('qc_approved_by'),
    coaNumber: varchar('coa_number', { length: 100 }),
    testResults: json('test_results'), // detailed analytical results
    // Release Information
    releaseStatus: varchar('release_status', { length: 50 }).default('not_released'),
    // not_released, pending_release, released, recalled
    qpReleaseDate: date('qp_release_date'),
    qpReleasedBy: text('qp_released_by'),
    releaseNotes: text('release_notes'),
    // Genealogy & Traceability
    parentBatchIds: json('parent_batch_ids'), // for traceability
    bomVersion: varchar('bom_version', { length: 20 }), // Bill of Materials version
    processVersion: varchar('process_version', { length: 20 }),
    // Storage & Distribution
    currentLocation: text('current_location'),
    storageConditions: text('storage_conditions'),
    distributionStatus: varchar('distribution_status', { length: 50 }).default('in_stock'),
    // in_stock, shipped, delivered, consumed
    // Compliance & Documentation
    batchRecord: text('batch_record'), // link to batch manufacturing record
    deviations: json('deviations'), // any manufacturing deviations
    investigations: json('investigations'),
    // Metadata
    notes: text('notes'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    batchNumberOrg: uniqueIndex('batch_number_org_idx').on(table.batchNumber, table.organizationId),
    lotNumberOrg: index('lot_number_org_idx').on(table.lotNumber, table.organizationId),
    batchStatusIdx: index('batch_status_idx').on(table.batchStatus),
    qcStatusIdx: index('qc_status_idx').on(table.qcStatus),
    releaseStatusIdx: index('release_status_idx').on(table.releaseStatus),
    materialBatchIdx: index('material_batch_idx').on(table.materialId, table.batchNumber),
  })
);

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
export const insertClientWorkspaceSchema = createInsertSchemaOmit(clientWorkspaces, {
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
export const insertClientAccessSchema = createInsertSchemaOmit(clientAccess, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Access Types
export type ClientAccess = InferSelectModel<typeof clientAccess>;
export type InsertClientAccess = z.infer<typeof insertClientAccessSchema>;

/**
 * Client Workspace Settings Table
 *
 * Stores comprehensive settings for each client workspace including
 * general, quotas, modules, integration, appearance, and notifications.
 */
export const clientWorkspaceSettings = pgTable(
  'client_workspace_settings',
  {
    id: serial('id').primaryKey(),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    // General settings
    generalSettings: json('general_settings'),
    // Quota settings
    quotaSettings: json('quota_settings'),
    // Module settings
    moduleSettings: json('module_settings'),
    // Integration settings
    integrationSettings: json('integration_settings'),
    // Appearance settings
    appearanceSettings: json('appearance_settings'),
    // Notification settings
    notificationSettings: json('notification_settings'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueClientSettings: unique('unique_client_settings').on(table.clientWorkspaceId),
    };
  }
);

// Client Workspace Settings Insert Schema
export const insertClientWorkspaceSettingsSchema = createInsertSchemaOmit(clientWorkspaceSettings, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Workspace Settings Types
export type ClientWorkspaceSettings = InferSelectModel<typeof clientWorkspaceSettings>;
export type InsertClientWorkspaceSettings = z.infer<typeof insertClientWorkspaceSettingsSchema>;

/**
 * Client Security Settings Table
 *
 * Stores comprehensive security settings for each client workspace including
 * password policy, session settings, data protection, audit settings, and FDA compliance.
 */
export const clientSecuritySettings = pgTable(
  'client_security_settings',
  {
    id: serial('id').primaryKey(),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    // Password policy settings
    passwordPolicySettings: json('password_policy_settings'),
    // Session settings
    sessionSettings: json('session_settings'),
    // Data protection settings
    dataProtectionSettings: json('data_protection_settings'),
    // Audit settings
    auditSettings: json('audit_settings'),
    // FDA compliance settings
    fdaComplianceSettings: json('fda_compliance_settings'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      uniqueClientSecurity: unique('unique_client_security').on(table.clientWorkspaceId),
    };
  }
);

// Client Security Settings Insert Schema
export const insertClientSecuritySettingsSchema = createInsertSchemaOmit(clientSecuritySettings, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Client Security Settings Types
export type ClientSecuritySettings = InferSelectModel<typeof clientSecuritySettings>;
export type InsertClientSecuritySettings = z.infer<typeof insertClientSecuritySettingsSchema>;

/**
 * PM Settings Table
 *
 * Stores organization-specific project management AI settings, workflows,
 * notifications, compliance, and therapeutic area defaults.
 */
export const pmSettings = pgTable(
  'pm_settings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    aiSettings: json('ai_settings'),
    workflowSettings: json('workflow_settings'),
    notificationSettings: json('notification_settings'),
    complianceSettings: json('compliance_settings'),
    therapeuticAreaSettings: json('therapeutic_area_settings'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedBy: integer('updated_by'),
  },
  table => {
    return {
      uniqueOrgSettings: unique('unique_pm_settings_org').on(table.organizationId),
    };
  }
);

// PM Settings Insert Schema
export const insertPmSettingsSchema = createInsertSchemaOmit(pmSettings, {
  id: true,
  updatedAt: true,
});

// PM Settings Types
export type PmSettings = InferSelectModel<typeof pmSettings>;
export type InsertPmSettings = z.infer<typeof insertPmSettingsSchema>;

/**
 * Risk Factors Table
 *
 * Catalog of standardized risk factors referenced by detections and predictions.
 */
export const riskFactors = pgTable(
  'risk_factors',
  {
    id: serial('id').primaryKey(),
    code: text('code').notNull(),
    name: text('name').notNull(),
    category: text('category'),
    description: text('description'),
    defaultSeverity: decimal('default_severity', { precision: 3, scale: 2 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    codeIdx: uniqueIndex('risk_factor_code_idx').on(table.code),
    categoryIdx: index('risk_factor_category_idx').on(table.category),
  })
);

// Risk Factors Insert Schema
export const insertRiskFactorSchema = createInsertSchemaOmit(riskFactors, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Risk Factors Types
export type RiskFactor = InferSelectModel<typeof riskFactors>;
export type InsertRiskFactor = z.infer<typeof insertRiskFactorSchema>;

/**
 * Risk Detections Table
 *
 * Stores detected risks for projects, linked to standardized risk factors.
 */
export const riskDetections = pgTable(
  'risk_detections',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id),
    riskFactorId: integer('risk_factor_id').references(() => riskFactors.id),
    severity: decimal('severity', { precision: 3, scale: 2 }),
    detectedAt: timestamp('detected_at').defaultNow().notNull(),
    status: text('status').default('OPEN').notNull(),
    mitigationApplied: text('mitigation_applied'),
    resolvedAt: timestamp('resolved_at'),
    details: json('details'),
  },
  table => ({
    projectIdx: index('risk_detections_project_idx').on(table.projectId),
    statusIdx: index('risk_detections_status_idx').on(table.status),
    factorIdx: index('risk_detections_factor_idx').on(table.riskFactorId),
  })
);

// Risk Detections Insert Schema
export const insertRiskDetectionSchema = createInsertSchemaOmit(riskDetections, {
  id: true,
  detectedAt: true,
});

// Risk Detections Types
export type RiskDetection = InferSelectModel<typeof riskDetections>;
export type InsertRiskDetection = z.infer<typeof insertRiskDetectionSchema>;

/**
 * Project Predictions Table
 *
 * Stores generated project risk predictions and recommendations.
 */
export const projectPredictions = pgTable(
  'project_predictions',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id').references(() => projects.id),
    successProbability: decimal('success_probability', { precision: 3, scale: 2 }),
    confidenceLevel: decimal('confidence_level', { precision: 3, scale: 2 }),
    riskLevel: text('risk_level'),
    detectedRisks: json('detected_risks'),
    recommendations: json('recommendations'),
    generatedAt: timestamp('generated_at').defaultNow().notNull(),
  },
  table => ({
    projectIdx: index('project_predictions_project_idx').on(table.projectId),
    generatedIdx: index('project_predictions_generated_idx').on(table.generatedAt),
  })
);

// Project Predictions Insert Schema
export const insertProjectPredictionSchema = createInsertSchemaOmit(projectPredictions, {
  id: true,
  generatedAt: true,
});

// Project Predictions Types
export type ProjectPrediction = InferSelectModel<typeof projectPredictions>;
export type InsertProjectPrediction = z.infer<typeof insertProjectPredictionSchema>;

/**
 * Communication Channels Table
 *
 * Project-linked channels for threaded communications.
 */
export const communicationChannels = pgTable(
  'communication_channels',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id').references(() => projects.id),
    name: text('name').notNull(),
    channelType: text('channel_type').default('internal').notNull(), // internal, fda, partner
    description: text('description'),
    status: text('status').default('active').notNull(), // active, archived
    metadata: json('metadata'),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('communication_channels_org_idx').on(table.organizationId),
    projectIdx: index('communication_channels_project_idx').on(table.projectId),
    statusIdx: index('communication_channels_status_idx').on(table.status),
  })
);

// Communication Channels Insert Schema
export const insertCommunicationChannelSchema = createInsertSchemaOmit(communicationChannels, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Communication Channels Types
export type CommunicationChannel = InferSelectModel<typeof communicationChannels>;
export type InsertCommunicationChannel = z.infer<typeof insertCommunicationChannelSchema>;

/**
 * Communication Messages Table
 *
 * Messages posted to communication channels.
 */
export const communicationMessages = pgTable(
  'communication_messages',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    channelId: integer('channel_id')
      .notNull()
      .references(() => communicationChannels.id),
    projectId: integer('project_id').references(() => projects.id),
    senderId: integer('sender_id').references(() => users.id),
    senderType: text('sender_type').default('internal').notNull(), // internal, agency, partner
    subject: text('subject'),
    body: text('body').notNull(),
    attachments: json('attachments'),
    metadata: json('metadata'),
    sentAt: timestamp('sent_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    channelIdx: index('communication_messages_channel_idx').on(table.channelId),
    projectIdx: index('communication_messages_project_idx').on(table.projectId),
    senderIdx: index('communication_messages_sender_idx').on(table.senderId),
  })
);

// Communication Messages Insert Schema
export const insertCommunicationMessageSchema = createInsertSchemaOmit(communicationMessages, {
  id: true,
  sentAt: true,
  createdAt: true,
  updatedAt: true,
});

// Communication Messages Types
export type CommunicationMessage = InferSelectModel<typeof communicationMessages>;
export type InsertCommunicationMessage = z.infer<typeof insertCommunicationMessageSchema>;

/**
 * FDA Communications Table
 *
 * Tracks FDA-facing communications tied to projects and channels.
 */
export const fdaCommunications = pgTable(
  'fda_communications',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id').references(() => projects.id),
    channelId: integer('channel_id').references(() => communicationChannels.id),
    direction: text('direction').default('outbound').notNull(), // inbound, outbound
    communicationType: text('communication_type').default('email').notNull(), // meeting, email, letter, phone
    subject: text('subject').notNull(),
    summary: text('summary'),
    sentAt: timestamp('sent_at'),
    receivedAt: timestamp('received_at'),
    status: text('status').default('open').notNull(), // open, responded, closed
    attachments: json('attachments'),
    metadata: json('metadata'),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('fda_communications_org_idx').on(table.organizationId),
    projectIdx: index('fda_communications_project_idx').on(table.projectId),
    channelIdx: index('fda_communications_channel_idx').on(table.channelId),
    statusIdx: index('fda_communications_status_idx').on(table.status),
  })
);

// FDA Communications Insert Schema
export const insertFdaCommunicationSchema = createInsertSchemaOmit(fdaCommunications, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// FDA Communications Types
export type FdaCommunication = InferSelectModel<typeof fdaCommunications>;
export type InsertFdaCommunication = z.infer<typeof insertFdaCommunicationSchema>;

/**
 * Knowledge Base Entries Table
 *
 * Stores reference content for Lumen Cortex semantic retrieval.
 */
export const knowledgeEntries = pgTable(
  'knowledge_entries',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(() => organizations.id),
    entryType: text('entry_type').notNull(), // GUIDELINE, CSR, STUDY, REGULATION, FAQ, TEMPLATE
    source: text('source'),
    title: text('title').notNull(),
    content: text('content'),
    embedding: vector('embedding', { dimensions: 1536 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    entryTypeIdx: index('knowledge_entries_type_idx').on(table.entryType),
    sourceIdx: index('knowledge_entries_source_idx').on(table.source),
  })
);

// Knowledge Entries Insert Schema
export const insertKnowledgeEntrySchema = createInsertSchemaOmit(knowledgeEntries, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Knowledge Entries Types
export type KnowledgeEntry = InferSelectModel<typeof knowledgeEntries>;
export type InsertKnowledgeEntry = z.infer<typeof insertKnowledgeEntrySchema>;

/**
 * Response Cache Table
 *
 * Caches generated responses for reuse and analytics.
 */
export const responseCache = pgTable(
  'response_cache',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(() => organizations.id),
    queryHash: varchar('query_hash', { length: 64 }).notNull(),
    queryText: text('query_text').notNull(),
    responseText: text('response_text').notNull(),
    confidence: decimal('confidence', { precision: 3, scale: 2 }),
    metadata: json('metadata'),
    hitCount: integer('hit_count').default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastAccessed: timestamp('last_accessed').defaultNow().notNull(),
  },
  table => ({
    queryHashIdx: uniqueIndex('response_cache_query_hash_idx').on(table.queryHash),
    lastAccessedIdx: index('response_cache_last_accessed_idx').on(table.lastAccessed),
  })
);

// Response Cache Insert Schema
export const insertResponseCacheSchema = createInsertSchemaOmit(responseCache, {
  id: true,
  createdAt: true,
  lastAccessed: true,
});

// Response Cache Types
export type ResponseCacheEntry = InferSelectModel<typeof responseCache>;
export type InsertResponseCacheEntry = z.infer<typeof insertResponseCacheSchema>;

/**
 * Lumen Cortex - SEC Filing Harvesting & Signal Extraction
 */
export const lumenFilingDocuments = pgTable(
  'lumen_filing_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(() => organizations.id),
    source: text('source').notNull(),
    cik: text('cik'),
    accessionNo: text('accession_no').notNull(),
    filingDate: text('filing_date'),
    reportYear: integer('report_year'),
    companyName: text('company_name'),
    formType: text('form_type'),
    primaryDocument: text('primary_document'),
    filingUrl: text('filing_url'),
    content: text('content'),
    extractedSignals: json('extracted_signals'),
    rejectionSignals: json('rejection_signals'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    lumenFilingOrgIdx: index('lumen_filing_org_idx').on(table.organizationId),
    lumenFilingAccessionIdx: index('lumen_filing_accession_idx').on(table.accessionNo),
  })
);

export const lumenDataAtoms = pgTable(
  'lumen_data_atoms',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(() => organizations.id),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    atomType: text('atom_type').notNull(),
    title: text('title').notNull(),
    content: text('content').notNull(),
    structuredData: json('structured_data'),
    tags: text('tags').array(),
    confidence: real('confidence').default(0.5),
    status: text('status').default('active'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    lumenAtomOrgIdx: index('lumen_atom_org_idx').on(table.organizationId),
    lumenAtomSourceIdx: index('lumen_atom_source_idx').on(table.sourceType, table.sourceId),
  })
);

export const lumenObservationTerms = pgTable(
  'lumen_observation_terms',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').references(() => organizations.id),
    term: text('term').notNull(),
    termType: text('term_type').notNull(),
    category: text('category').notNull(),
    sourceType: text('source_type').notNull(),
    sourceId: text('source_id').notNull(),
    weight: real('weight').default(1.0),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    lumenTermsOrgIdx: index('lumen_terms_org_idx').on(table.organizationId),
    lumenTermsTermIdx: index('lumen_terms_term_idx').on(table.term),
  })
);

/**
 * ======================================================================================
 * DOCUMENT AUTHORING WITH 21 CFR PART 11 COMPLIANCE
 * ======================================================================================
 *
 * Complete document management system with electronic signatures, audit trails,
 * version control, and FDA 21 CFR Part 11 compliance requirements.
 */

// ============================================================================
// DOCUMENT MANAGEMENT
// ============================================================================

export const documents = pgTable(
  'documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    projectId: integer('project_id').references(() => projects.id), // Added for Section Graph
    module: varchar('module', { length: 50 }), // Added for Section Graph (e.g., "M1", "M2", "M3")
    version: varchar('version', { length: 20 }).default('1.0'), // Added for Section Graph
    regionScope: text('region_scope'), // Added for Section Graph (e.g., "FDA", "EMA", "ALL")
    documentCode: varchar('document_code', { length: 100 }).notNull(),
    title: text('title').notNull(),
    documentType: varchar('document_type', { length: 50 }).notNull(), // SOP, Protocol, Report, etc.
    category: varchar('category', { length: 50 }), // Quality, Clinical, Regulatory, etc.
    status: varchar('status', { length: 50 }).default('draft').notNull(),
    // draft, in_review, pending_approval, approved, effective, obsolete
    currentVersionId: integer('current_version_id'),
    effectiveDate: date('effective_date'),
    expiryDate: date('expiry_date'),
    ownerId: integer('owner_id')
      .notNull()
      .references(() => users.id),
    departmentId: integer('department_id'),
    // Regulatory Compliance
    complianceLevel: varchar('compliance_level', { length: 50 }).default('standard'),
    // standard, gxp, cfr_part_11
    regulatoryReferences: json('regulatory_references'), // ICH, FDA, EMA guidelines
    validationStatus: varchar('validation_status', { length: 50 }),
    // Security & Access
    accessLevel: varchar('access_level', { length: 50 }).default('restricted'),
    // public, internal, restricted, confidential
    accessControlList: json('access_control_list'), // user/role permissions
    encryptionStatus: boolean('encryption_status').default(false),
    // Metadata
    keywords: text('keywords'),
    description: text('description'),
    metadata: json('metadata'),
    isActive: boolean('is_active').default(true),
    isLocked: boolean('is_locked').default(false),
    lockedById: integer('locked_by_id').references(() => users.id),
    lockedAt: timestamp('locked_at'),
    createdById: integer('created_by_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    documentCodeOrg: uniqueIndex('document_code_org_idx').on(
      table.documentCode,
      table.organizationId
    ),
    documentStatusIdx: index('document_status_idx').on(table.status),
    documentTypeIdx: index('document_type_idx').on(table.documentType),
    ownerIdx: index('document_owner_idx').on(table.ownerId),
    effectiveDateIdx: index('document_effective_date_idx').on(table.effectiveDate),
  })
);

// ============================================================================
// DOCUMENT VERSIONS
// ============================================================================

export const documentVersions = pgTable(
  'document_versions',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id),
    versionNumber: varchar('version_number', { length: 20 }).notNull(), // 1.0, 1.1, 2.0, etc.
    versionLabel: varchar('version_label', { length: 50 }), // Draft A, Final, Approved
    content: text('content').notNull(), // Document content (JSON/HTML/Markdown)
    changeDescription: text('change_description'),
    changeType: varchar('change_type', { length: 50 }), // minor, major, editorial
    // Version Status
    status: varchar('status', { length: 50 }).default('draft').notNull(),
    // draft, in_review, approved, superseded
    isPublished: boolean('is_published').default(false),
    publishedAt: timestamp('published_at'),
    // Review & Approval
    reviewedById: integer('reviewed_by_id').references(() => users.id),
    reviewedAt: timestamp('reviewed_at'),
    approvedById: integer('approved_by_id').references(() => users.id),
    approvedAt: timestamp('approved_at'),
    // File Information
    filePath: text('file_path'),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    checksum: varchar('checksum', { length: 64 }), // SHA-256 hash for integrity
    // Metadata
    metadata: json('metadata'),
    createdById: integer('created_by_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    documentVersionIdx: uniqueIndex('document_version_idx').on(
      table.documentId,
      table.versionNumber
    ),
    versionStatusIdx: index('version_status_idx').on(table.status),
    versionCreatedIdx: index('version_created_idx').on(table.createdAt),
  })
);

// ============================================================================
// AUDIT TRAIL (21 CFR PART 11 COMPLIANT - IMMUTABLE)
// ============================================================================

export const documentAuditTrail = pgTable(
  'document_audit_trail',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    documentId: integer('document_id').references(() => documents.id),
    versionId: integer('version_id').references(() => documentVersions.id),
    // Action Information
    actionType: varchar('action_type', { length: 50 }).notNull(),
    // create, read, update, delete, approve, reject, sign, lock, unlock, export
    actionCategory: varchar('action_category', { length: 50 }).notNull(),
    // document, version, signature, permission, export
    actionDescription: text('action_description').notNull(),
    actionResult: varchar('action_result', { length: 20 }).notNull(), // success, failure
    // User Information (denormalized for compliance)
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    userName: text('user_name').notNull(), // Stored for compliance even if user deleted
    userEmail: text('user_email').notNull(),
    userRole: text('user_role'),
    // System Information
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    sessionId: varchar('session_id', { length: 100 }),
    // Before/After State
    previousValue: json('previous_value'),
    newValue: json('new_value'),
    // Compliance Fields
    reasonForChange: text('reason_for_change'),
    justification: text('justification'),
    // Integrity
    dataIntegrityCheck: varchar('data_integrity_check', { length: 64 }), // Hash of record
    // Timestamp - IMMUTABLE
    timestamp: timestamp('timestamp').defaultNow().notNull(),
  },
  table => ({
    docAuditDocumentIdx: index('doc_audit_document_idx').on(table.documentId),
    docAuditUserIdx: index('doc_audit_user_idx').on(table.userId),
    docAuditTimestampIdx: index('doc_audit_timestamp_idx').on(table.timestamp),
    docAuditActionIdx: index('doc_audit_action_idx').on(table.actionType),
  })
);

// ============================================================================
// ELECTRONIC SIGNATURES (21 CFR PART 11)
// ============================================================================

export const electronicSignatures = pgTable(
  'electronic_signatures',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id),
    versionId: integer('version_id')
      .notNull()
      .references(() => documentVersions.id),
    // Signature Details
    signatureType: varchar('signature_type', { length: 50 }).notNull(),
    // approval, review, witness, acknowledgment
    signaturePurpose: text('signature_purpose').notNull(),
    signatureLevel: integer('signature_level').default(1), // 1=first, 2=second signature
    // Signer Information (denormalized for compliance)
    signerId: integer('signer_id')
      .notNull()
      .references(() => users.id),
    signerName: text('signer_name').notNull(),
    signerTitle: text('signer_title'),
    signerEmail: text('signer_email').notNull(),
    // Authentication
    authenticationMethod: varchar('authentication_method', { length: 50 }).notNull(),
    // password, biometric, two_factor, smart_card
    authenticationTimestamp: timestamp('authentication_timestamp').notNull(),
    secondFactorVerified: boolean('second_factor_verified').default(false),
    // Signature Data
    signatureHash: varchar('signature_hash', { length: 256 }).notNull(), // Cryptographic signature
    signatureMeaning: text('signature_meaning'), // FDA requirement
    signatureManifest: json('signature_manifest'), // Full signature details
    // Verification
    isValid: boolean('is_valid').default(true),
    verificationStatus: varchar('verification_status', { length: 50 }),
    verificationDate: timestamp('verification_date'),
    // Compliance
    complianceStatement: text('compliance_statement'),
    legalDisclaimer: text('legal_disclaimer'),
    // Metadata
    ipAddress: varchar('ip_address', { length: 45 }),
    deviceInfo: json('device_info'),
    signedAt: timestamp('signed_at').defaultNow().notNull(),
  },
  table => ({
    signatureDocumentIdx: index('signature_document_idx').on(table.documentId, table.versionId),
    signatureSignerIdx: index('signature_signer_idx').on(table.signerId),
    signatureTypeIdx: index('signature_type_idx').on(table.signatureType),
    signedAtIdx: index('signed_at_idx').on(table.signedAt),
  })
);

// ============================================================================
// DOCUMENT LOCKS (COLLABORATION)
// ============================================================================

export const documentLocks = pgTable(
  'document_locks',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id),
    sectionId: varchar('section_id', { length: 100 }), // Optional section-level locking
    lockType: varchar('lock_type', { length: 50 }).notNull(), // exclusive, shared, section
    // Lock Owner
    lockedById: integer('locked_by_id')
      .notNull()
      .references(() => users.id),
    lockedByName: text('locked_by_name').notNull(),
    // Lock Details
    lockReason: text('lock_reason'),
    lockToken: varchar('lock_token', { length: 100 }).notNull(), // Unique token for lock
    // Timing
    lockedAt: timestamp('locked_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    releasedAt: timestamp('released_at'),
    // Auto-release
    autoRelease: boolean('auto_release').default(true),
    // Metadata
    metadata: json('metadata'),
  },
  table => ({
    lockDocumentIdx: index('lock_document_idx').on(table.documentId),
    lockSectionIdx: index('lock_section_idx').on(table.sectionId),
    lockUserIdx: index('lock_user_idx').on(table.lockedById),
    lockTokenIdx: uniqueIndex('lock_token_idx').on(table.lockToken),
  })
);

// ============================================================================
// DOCUMENT COMMENTS
// ============================================================================

export const documentComments = pgTable(
  'document_comments',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id),
    versionId: integer('version_id').references(() => documentVersions.id),
    parentCommentId: integer('parent_comment_id'),
    // Comment Details
    commentType: varchar('comment_type', { length: 50 }).default('general'),
    // general, review, approval, question, suggestion
    sectionReference: varchar('section_reference', { length: 200 }), // Section/paragraph reference
    content: text('content').notNull(),
    // Status
    status: varchar('status', { length: 50 }).default('open'),
    // open, resolved, rejected, incorporated
    priority: varchar('priority', { length: 20 }).default('normal'),
    // low, normal, high, critical
    // Resolution
    resolvedById: integer('resolved_by_id').references(() => users.id),
    resolvedAt: timestamp('resolved_at'),
    resolutionNote: text('resolution_note'),
    // Author
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id),
    authorName: text('author_name').notNull(),
    // Metadata
    attachments: json('attachments'),
    mentions: json('mentions'), // Tagged users
    isEdited: boolean('is_edited').default(false),
    editedAt: timestamp('edited_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    commentDocumentIdx: index('comment_document_idx').on(table.documentId),
    commentAuthorIdx: index('comment_author_idx').on(table.authorId),
    commentStatusIdx: index('comment_status_idx').on(table.status),
    commentCreatedIdx: index('comment_created_idx').on(table.createdAt),
  })
);

// ============================================================================
// DOCUMENT ACCESS SESSIONS
// ============================================================================

export const documentSessions = pgTable(
  'document_sessions',
  {
    id: serial('id').primaryKey(),
    sessionToken: varchar('session_token', { length: 256 }).notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    // Session Details
    documentId: integer('document_id').references(() => documents.id),
    sessionType: varchar('session_type', { length: 50 }).default('read'),
    // read, write, review, approve
    // Security
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    deviceId: varchar('device_id', { length: 100 }),
    // Timing
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at').notNull(),
    endedAt: timestamp('ended_at'),
    // Status
    isActive: boolean('is_active').default(true),
    endReason: varchar('end_reason', { length: 50 }), // timeout, logout, forced, expired
    // Metadata
    metadata: json('metadata'),
  },
  table => ({
    sessionTokenIdx: uniqueIndex('session_token_idx').on(table.sessionToken),
    sessionUserIdx: index('session_user_idx').on(table.userId),
    sessionDocumentIdx: index('session_document_idx').on(table.documentId),
    sessionActiveIdx: index('session_active_idx').on(table.isActive),
  })
);

// Export Insert Schemas
export const insertDocumentSchema = createInsertSchemaOmit(documents, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentVersionSchema = createInsertSchemaOmit(documentVersions, {
  id: true,
  createdAt: true,
});

export const insertDocumentAuditTrailSchema = createInsertSchemaOmit(documentAuditTrail, {
  id: true,
  timestamp: true,
});

export const insertElectronicSignatureSchema = createInsertSchemaOmit(electronicSignatures, {
  id: true,
  signedAt: true,
});

export const insertDocumentLockSchema = createInsertSchemaOmit(documentLocks, {
  id: true,
  lockedAt: true,
});

export const insertDocumentCommentSchema = createInsertSchemaOmit(documentComments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentSessionSchema = createInsertSchemaOmit(documentSessions, {
  id: true,
  startedAt: true,
  lastActivityAt: true,
});

// Export Types
export type Document = InferSelectModel<typeof documents>;
export type InsertDocument = z.infer<typeof insertDocumentSchema>;

export type DocumentVersion = InferSelectModel<typeof documentVersions>;
export type InsertDocumentVersion = z.infer<typeof insertDocumentVersionSchema>;

export type DocumentAuditTrail = InferSelectModel<typeof documentAuditTrail>;
export type InsertDocumentAuditTrail = z.infer<typeof insertDocumentAuditTrailSchema>;

export type ElectronicSignature = InferSelectModel<typeof electronicSignatures>;
export type InsertElectronicSignature = z.infer<typeof insertElectronicSignatureSchema>;

export type DocumentLock = InferSelectModel<typeof documentLocks>;
export type InsertDocumentLock = z.infer<typeof insertDocumentLockSchema>;

export type DocumentComment = InferSelectModel<typeof documentComments>;
export type InsertDocumentComment = z.infer<typeof insertDocumentCommentSchema>;

export type DocumentSession = InferSelectModel<typeof documentSessions>;
export type InsertDocumentSession = z.infer<typeof insertDocumentSessionSchema>;

/**
 * ============================================================================
 * ACTIVITY FEED & NOTIFICATIONS SYSTEM
 * ============================================================================
 * SharePoint-style activity tracking and notification management
 */

// Activity Feed Table - tracks all user activities across the system
export const activityFeed = pgTable(
  'activity_feed',
  {
    id: serial('id').primaryKey(),
    activityId: text('activity_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Actor information
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    userName: text('user_name').notNull(),
    userAvatar: text('user_avatar'),

    // Activity details
    activityType: text('activity_type').notNull(), // document_modified, component_updated, comment_added, etc.
    action: text('action').notNull(), // created, modified, deleted, shared, commented, approved, etc.
    entityType: text('entity_type').notNull(), // document, component, comment, project, etc.
    entityId: text('entity_id').notNull(),
    entityName: text('entity_name'),
    entityIcon: text('entity_icon'),

    // Additional context
    description: text('description'), // Human-readable description
    previewSnippet: text('preview_snippet'), // Preview of the content
    changes: json('changes'), // Detailed change information
    metadata: json('metadata'), // Additional activity metadata

    // Interaction tracking
    likes: integer('likes').default(0),
    reactions: json('reactions'), // { emoji: count, ... }

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // For temporary activities
  },
  table => ({
    activityOrgIdx: index('activity_org_idx').on(table.organizationId),
    activityUserIdx: index('activity_user_idx').on(table.userId),
    activityTypeIdx: index('activity_type_idx').on(table.activityType),
    activityEntityIdx: index('activity_entity_idx').on(table.entityType, table.entityId),
    activityCreatedIdx: index('activity_created_idx').on(table.createdAt),
  })
);

// Notifications Table - user-specific notifications
export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    notificationId: text('notification_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // Recipient information
    recipientId: integer('recipient_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Notification details
    type: text('type').notNull(), // mention, share, approval_request, compliance_alert, system_alert
    category: text('category').notNull(), // collaboration, compliance, system, workflow
    priority: text('priority').default('normal'), // low, normal, high, critical

    // Content
    title: text('title').notNull(),
    message: text('message').notNull(),
    icon: text('icon'),
    actionUrl: text('action_url'), // Where to navigate when clicked

    // Related activity (optional)
    activityId: text('activity_id').references(() => activityFeed.activityId),

    // Status tracking
    isRead: boolean('is_read').default(false),
    readAt: timestamp('read_at'),
    isDismissed: boolean('is_dismissed').default(false),
    dismissedAt: timestamp('dismissed_at'),

    // Email notification tracking
    emailSent: boolean('email_sent').default(false),
    emailSentAt: timestamp('email_sent_at'),

    // Metadata
    metadata: json('metadata'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // For temporary notifications
  },
  table => ({
    notificationRecipientIdx: index('notification_recipient_idx').on(table.recipientId),
    notificationTypeIdx: index('notification_type_idx').on(table.type),
    notificationReadIdx: index('notification_read_idx').on(table.isRead),
    notificationCreatedIdx: index('notification_created_idx').on(table.createdAt),
  })
);

// User Following Table - tracks what users are following
export const userFollowing = pgTable(
  'user_following',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // What is being followed
    entityType: text('entity_type').notNull(), // document, component, user, project, folder
    entityId: text('entity_id').notNull(),
    entityName: text('entity_name'),

    // Following settings
    autoFollowed: boolean('auto_followed').default(false), // Automatically followed due to interaction
    notifyOnActivity: boolean('notify_on_activity').default(true),

    // Timestamps
    followedAt: timestamp('followed_at').defaultNow().notNull(),
    metadata: json('metadata'),
  },
  table => ({
    followingUserIdx: index('following_user_idx').on(table.userId),
    followingEntityIdx: index('following_entity_idx').on(table.entityType, table.entityId),
    uniqueFollowing: unique().on(table.userId, table.entityType, table.entityId),
  })
);

// Notification Preferences Table - user notification settings
export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),

    // Email preferences
    emailMentions: boolean('email_mentions').default(true),
    emailShares: boolean('email_shares').default(true),
    emailApprovals: boolean('email_approvals').default(true),
    emailCompliance: boolean('email_compliance').default(true),
    emailSystem: boolean('email_system').default(true),
    emailDigest: text('email_digest').default('daily'), // none, daily, weekly

    // In-app preferences
    inAppMentions: boolean('in_app_mentions').default(true),
    inAppShares: boolean('in_app_shares').default(true),
    inAppApprovals: boolean('in_app_approvals').default(true),
    inAppCompliance: boolean('in_app_compliance').default(true),
    inAppSystem: boolean('in_app_system').default(true),

    // Toast preferences
    toastEnabled: boolean('toast_enabled').default(true),
    toastDuration: integer('toast_duration').default(5000), // milliseconds
    toastPosition: text('toast_position').default('top-right'),

    // Quiet hours
    quietHoursEnabled: boolean('quiet_hours_enabled').default(false),
    quietHoursStart: text('quiet_hours_start'), // HH:MM format
    quietHoursEnd: text('quiet_hours_end'), // HH:MM format
    timezone: text('timezone').default('UTC'),

    // Other preferences
    autoFollowOnInteraction: boolean('auto_follow_on_interaction').default(true),
    soundEnabled: boolean('sound_enabled').default(false),

    // Metadata
    metadata: json('metadata'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    preferencesUserIdx: index('preferences_user_idx').on(table.userId),
  })
);

// User Presence Table - tracks user online status
export const userPresence = pgTable(
  'user_presence',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' })
      .unique(),

    // Status
    status: text('status').default('offline'), // online, away, offline
    statusMessage: text('status_message'),

    // Activity tracking
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at').defaultNow().notNull(),

    // Current context
    currentDocumentId: text('current_document_id'),
    currentComponentId: text('current_component_id'),
    currentPageUrl: text('current_page_url'),

    // Connection info
    socketId: text('socket_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),

    // Metadata
    metadata: json('metadata'),
  },
  table => ({
    presenceUserIdx: index('presence_user_idx').on(table.userId),
    presenceStatusIdx: index('presence_status_idx').on(table.status),
    presenceActivityIdx: index('presence_activity_idx').on(table.lastActivityAt),
  })
);

// Activity Reactions Table - tracks likes and reactions on activities
export const activityReactions = pgTable(
  'activity_reactions',
  {
    id: serial('id').primaryKey(),
    activityId: text('activity_id')
      .notNull()
      .references(() => activityFeed.activityId, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),

    // Reaction details
    reactionType: text('reaction_type').notNull(), // like, love, celebrate, insightful, curious

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    reactionActivityIdx: index('reaction_activity_idx').on(table.activityId),
    reactionUserIdx: index('reaction_user_idx').on(table.userId),
    uniqueReaction: unique().on(table.activityId, table.userId, table.reactionType),
  })
);

// Insert Schemas for Activity & Notification System
export const insertActivityFeedSchema = createInsertSchemaOmit(activityFeed, {
  id: true,
  createdAt: true,
});

export const insertNotificationSchema = createInsertSchemaOmit(notifications, {
  id: true,
  createdAt: true,
});

export const insertUserFollowingSchema = createInsertSchemaOmit(userFollowing, {
  id: true,
  followedAt: true,
});

export const insertNotificationPreferencesSchema = createInsertSchemaOmit(notificationPreferences, {
  id: true,
  updatedAt: true,
});

export const insertUserPresenceSchema = createInsertSchemaOmit(userPresence, {
  id: true,
  lastActivityAt: true,
  lastHeartbeatAt: true,
});

export const insertActivityReactionSchema = createInsertSchemaOmit(activityReactions, {
  id: true,
  createdAt: true,
});

// Export Types for Activity & Notification System
export type ActivityFeed = InferSelectModel<typeof activityFeed>;
export type InsertActivityFeed = z.infer<typeof insertActivityFeedSchema>;

export type Notification = InferSelectModel<typeof notifications>;
export type InsertNotification = z.infer<typeof insertNotificationSchema>;

export type UserFollowing = InferSelectModel<typeof userFollowing>;
export type InsertUserFollowing = z.infer<typeof insertUserFollowingSchema>;

export type NotificationPreferences = InferSelectModel<typeof notificationPreferences>;
export type InsertNotificationPreferences = z.infer<typeof insertNotificationPreferencesSchema>;

export type UserPresence = InferSelectModel<typeof userPresence>;
export type InsertUserPresence = z.infer<typeof insertUserPresenceSchema>;

export type ActivityReaction = InferSelectModel<typeof activityReactions>;
export type InsertActivityReaction = z.infer<typeof insertActivityReactionSchema>;

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
export const insertUserSchema = createInsertSchemaOmit(users, {
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
export const insertOrganizationUserSchema = createInsertSchemaOmit(organizationUsers, {
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
/**
 * ======================================================================================
 * MEDICAL DEVICE & DIAGNOSTICS MODULE
 * ======================================================================================
 *
 * Production-ready tables for FDA medical device submissions:
 * - 510(k) Premarket Notifications
 * - PMA (Premarket Approval) Applications
 * - CER (Clinical Evaluation Reports)
 *
 * Features:
 * - Full 21 CFR Part 11 compliance with audit trails
 * - Tenant-scoped data isolation
 * - Workflow orchestration and status tracking
 * - FDA integration readiness
 * - Electronic signatures and approvals
 */

// Medical Device Master Table - Core device information
export const medicalDevices = pgTable(
  'medical_devices',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Device Identification
    deviceName: text('device_name').notNull(),
    deviceModel: text('device_model'),
    manufacturer: text('manufacturer').notNull(),
    establishmentRegistrationNumber: text('establishment_registration_number'),

    // Device Classification
    deviceClass: text('device_class').notNull(), // Class I, II, III
    deviceType: text('device_type'), // diagnostic, therapeutic, monitoring
    productCode: text('product_code'), // FDA product code
    regulationNumber: text('regulation_number'), // 21 CFR reference

    // UDI Information
    udiDeviceIdentifier: text('udi_device_identifier'),
    udiProductionIdentifier: text('udi_production_identifier'),
    gudidSubmissionStatus: text('gudid_submission_status'), // pending, submitted, approved

    // Device Details
    intendedUse: text('intended_use'),
    indicationsForUse: text('indications_for_use'),
    technologyType: text('technology_type'),
    isImplantable: boolean('is_implantable').default(false),
    isSterile: boolean('is_sterile').default(false),
    containsSoftware: boolean('contains_software').default(false),

    // Regulatory Status
    regulatoryStatus: text('regulatory_status').default('development'), // development, under_review, cleared, approved
    fdaClearanceNumber: text('fda_clearance_number'),
    ceMarkStatus: text('ce_mark_status'),

    // Metadata
    createdBy: integer('created_by').notNull(),
    updatedBy: integer('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgDeviceIdx: index('medical_devices_org_idx').on(table.organizationId),
    udiIdx: index('medical_devices_udi_idx').on(table.udiDeviceIdentifier),
    statusIdx: index('medical_devices_status_idx').on(table.regulatoryStatus),
  })
);

// 510(k) Submissions Table
export const fda510kSubmissions = pgTable(
  'fda_510k_submissions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    deviceId: integer('device_id')
      .notNull()
      .references(() => medicalDevices.id),

    // Submission Information
    submissionNumber: text('submission_number').unique(), // K-number when assigned
    submissionType: text('submission_type').notNull(), // traditional, special, abbreviated
    submissionStatus: text('submission_status').default('draft'), // draft, in_review, submitted, cleared, rejected

    // Predicate Device Information
    predicateDeviceName: text('predicate_device_name'),
    predicateDeviceNumber: text('predicate_device_number'),
    predicateManufacturer: text('predicate_manufacturer'),
    substantialEquivalenceRationale: text('substantial_equivalence_rationale'),

    // Testing & Validation
    performanceTestingSummary: text('performance_testing_summary'),
    biocompatibilityTesting: json('biocompatibility_testing'),
    sterilizationValidation: json('sterilization_validation'),
    softwareValidation: json('software_validation'),
    clinicalDataSummary: text('clinical_data_summary'),

    // Compliance Information
    consensusStandardsUsed: text('consensus_standards_used').array(),
    guidanceDocumentsReferenced: text('guidance_documents_referenced').array(),

    // Submission Tracking
    targetSubmissionDate: date('target_submission_date'),
    actualSubmissionDate: date('actual_submission_date'),
    fdaAcknowledgmentDate: date('fda_acknowledgment_date'),
    additionalInfoRequestDate: date('additional_info_request_date'),
    clearanceDate: date('clearance_date'),

    // Electronic Signatures
    preparedBy: integer('prepared_by'),
    preparedDate: timestamp('prepared_date'),
    reviewedBy: integer('reviewed_by'),
    reviewedDate: timestamp('reviewed_date'),
    approvedBy: integer('approved_by'),
    approvedDate: timestamp('approved_date'),
    electronicSignatures: json('electronic_signatures'), // Array of signature records

    // Audit Trail
    auditTrail: json('audit_trail'), // Comprehensive change history
    validationStatus: text('validation_status').default('pending'), // pending, passed, failed
    validationErrors: json('validation_errors'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    org510kIdx: index('fda_510k_org_idx').on(table.organizationId),
    device510kIdx: index('fda_510k_device_idx').on(table.deviceId),
    status510kIdx: index('fda_510k_status_idx').on(table.submissionStatus),
    submission510kIdx: uniqueIndex('fda_510k_submission_idx').on(table.submissionNumber),
  })
);

// CERV2 510(k) Sections Table - FDA eSTAR Document Structure
export const cerv2510kSections = pgTable(
  'cerv2_510k_sections',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    documentId: integer('document_id'), // Optional - can be template or document-specific

    // Section Identification
    sectionNumber: text('section_number').notNull(), // e.g., "1.0", "2.0", "17.0"
    sectionTitle: text('section_title').notNull(), // e.g., "Medical Device User Fee Cover Sheet"
    sectionKey: text('section_key').notNull(), // e.g., "user-fee-cover", "software"
    category: text('category').notNull(), // Administrative, Device, Testing, Software, Clinical, Additional

    // Hierarchical Structure
    parentSectionId: integer('parent_section_id'), // For subsections
    level: integer('level').default(1), // Section depth level
    displayOrder: integer('display_order').notNull(), // Sort order

    // Section Configuration
    isRequired: boolean('is_required').default(false),
    icon: text('icon'), // Lucide icon name
    fields: json('fields'), // Array of field definitions

    // Section Content & Status
    content: text('content'), // Rich text content
    status: text('status').default('todo'), // todo, drafting, validated
    completionPercentage: integer('completion_percentage').default(0),

    // Compliance & Sources
    complianceNotes: text('compliance_notes'),
    regulatoryReferences: text('regulatory_references').array(), // e.g., ["21 CFR 807.87", "FDA Guidance 2023"]
    sources: json('sources'), // Evidence/citation tracking

    // Collaboration
    assignedTo: integer('assigned_to'),
    reviewer: integer('reviewer'),
    dueDate: date('due_date'),
    lastEditedBy: integer('last_edited_by'),

    // Validation
    validationErrors: json('validation_errors'),
    validationStatus: text('validation_status').default('pending'),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgSectionIdx: index('cerv2_sections_org_idx').on(table.organizationId),
    docSectionIdx: index('cerv2_sections_doc_idx').on(table.documentId),
    orderIdx: index('cerv2_sections_order_idx').on(table.displayOrder),
    statusIdx: index('cerv2_sections_status_idx').on(table.status),
  })
);

// CERV2 Section Versions Table - Version History & Change Tracking
export const cerv2SectionVersions = pgTable(
  'cerv2_section_versions',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => cerv2510kSections.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Version Information
    versionNumber: integer('version_number').notNull(), // 1, 2, 3, etc.
    versionLabel: text('version_label'), // Optional: "Initial Draft", "Final Review", etc.
    changeType: text('change_type').notNull(), // created, edited, reviewed, approved
    changeSummary: text('change_summary'), // Brief description of changes

    // Snapshot of Section Data at this Version
    content: text('content'), // Section content at this version
    fieldData: json('field_data'), // All field values at this version
    status: text('status'), // Section status at this version
    completionPercentage: integer('completion_percentage'),

    // Change Details
    fieldsChanged: text('fields_changed').array(), // List of field IDs that changed
    previousValues: json('previous_values'), // Previous field values for diff
    newValues: json('new_values'), // New field values for diff

    // User & Timestamp
    changedBy: integer('changed_by'), // User ID who made the change
    changedByName: text('changed_by_name'), // User name for display
    changedByEmail: text('changed_by_email'), // User email
    changedAt: timestamp('changed_at').defaultNow().notNull(),

    // Metadata
    ipAddress: text('ip_address'), // For audit trail
    userAgent: text('user_agent'), // Browser/device info
    comment: text('comment'), // Optional comment from user

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    sectionVersionIdx: index('cerv2_version_section_idx').on(table.sectionId),
    orgVersionIdx: index('cerv2_version_org_idx').on(table.organizationId),
    timestampIdx: index('cerv2_version_timestamp_idx').on(table.changedAt),
    userIdx: index('cerv2_version_user_idx').on(table.changedBy),
  })
);

// CERV2 Document Sessions Table - Tracks open editing sessions
export const cerv2DocumentSessions = pgTable(
  'cerv2_document_sessions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    documentId: integer('document_id').notNull(), // Reference to document
    userId: integer('user_id').notNull(), // User with active session

    // Session Data
    openSections: text('open_sections').array(), // List of section IDs currently open in tabs
    activeSectionId: text('active_section_id'), // Currently focused section
    sectionOrder: text('section_order').array(), // Order of tabs

    // Session State
    isDirty: boolean('is_dirty').default(false),
    unsavedData: json('unsaved_data'), // Temporary unsaved changes

    // Timestamps
    lastActivity: timestamp('last_activity').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'), // Auto-cleanup old sessions
  },
  table => ({
    userSessionIdx: uniqueIndex('cerv2_session_user_doc_idx').on(table.userId, table.documentId),
    activityIdx: index('cerv2_session_activity_idx').on(table.lastActivity),
  })
);

// PMA Submissions Table
export const pmaSubmissions = pgTable(
  'pma_submissions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    deviceId: integer('device_id')
      .notNull()
      .references(() => medicalDevices.id),

    // PMA Identification
    pmaNumber: text('pma_number').unique(), // P-number when assigned
    supplementNumber: text('supplement_number'),
    submissionType: text('submission_type').notNull(), // original, panel_track_supplement, 180_day_supplement

    // Clinical Trial Information
    clinicalTrialIds: text('clinical_trial_ids').array(),
    pivotalStudySummary: text('pivotal_study_summary'),
    clinicalDataOverview: json('clinical_data_overview'),
    adverseEventsAnalysis: json('adverse_events_analysis'),

    // Manufacturing Information
    manufacturingSiteAddresses: json('manufacturing_site_addresses'),
    qualitySystemRegulation: json('quality_system_regulation'),
    deviceMasterRecord: text('device_master_record'),

    // Risk Analysis
    riskAnalysisMethod: text('risk_analysis_method'), // FMEA, FTA, HAZOP
    riskMitigationMeasures: json('risk_mitigation_measures'),
    residualRiskAssessment: json('residual_risk_assessment'),

    // Advisory Committee
    advisoryCommitteeRequired: boolean('advisory_committee_required').default(false),
    advisoryCommitteeMeeting: date('advisory_committee_meeting'),
    advisoryCommitteeRecommendation: text('advisory_committee_recommendation'),

    // Submission Status
    submissionStatus: text('submission_status').default('draft'),
    fdaFilingDate: date('fda_filing_date'),
    fdaApprovalDate: date('fda_approval_date'),
    conditionsOfApproval: json('conditions_of_approval'),

    // Post-Approval Requirements
    postApprovalStudies: json('post_approval_studies'),
    annualReportsDue: json('annual_reports_due'),

    // Compliance & Signatures
    electronicSignatures: json('electronic_signatures'),
    auditTrail: json('audit_trail'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgPmaIdx: index('pma_org_idx').on(table.organizationId),
    devicePmaIdx: index('pma_device_idx').on(table.deviceId),
    statusPmaIdx: index('pma_status_idx').on(table.submissionStatus),
    pmaNumbderIdx: uniqueIndex('pma_number_idx').on(table.pmaNumber),
  })
);

// Medical Device Submission Documents
export const deviceSubmissionDocuments = pgTable(
  'device_submission_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    submissionType: text('submission_type').notNull(), // 510k, pma, cer
    submissionId: integer('submission_id').notNull(), // References the specific submission

    // Document Information
    documentType: text('document_type').notNull(), // cover_letter, substantial_equivalence, clinical_data, etc.
    documentTitle: text('document_title').notNull(),
    documentVersion: text('document_version').default('1.0'),
    filePath: text('file_path'),
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),

    // Document Status
    status: text('status').default('draft'), // draft, under_review, approved, rejected
    reviewComments: json('review_comments'),

    // Compliance & Validation
    isRequired: boolean('is_required').default(false),
    isSubmitted: boolean('is_submitted').default(false),
    validationStatus: text('validation_status'),
    validationErrors: json('validation_errors'),

    // Electronic Signatures
    uploadedBy: integer('uploaded_by'),
    uploadedAt: timestamp('uploaded_at'),
    approvedBy: integer('approved_by'),
    approvedAt: timestamp('approved_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgDocIdx: index('device_docs_org_idx').on(table.organizationId),
    submissionDocIdx: index('device_docs_submission_idx').on(
      table.submissionType,
      table.submissionId
    ),
    statusDocIdx: index('device_docs_status_idx').on(table.status),
  })
);

// Medical Device Workflow Tracking
export const deviceSubmissionWorkflows = pgTable(
  'device_submission_workflows',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Workflow Identification
    workflowType: text('workflow_type').notNull(), // 510k_submission, pma_submission, cer_generation
    submissionType: text('submission_type').notNull(),
    submissionId: integer('submission_id').notNull(),

    // Workflow Steps
    currentStep: text('current_step').notNull(),
    completedSteps: json('completed_steps').default([]),
    pendingSteps: json('pending_steps').default([]),
    totalSteps: integer('total_steps'),

    // Progress Tracking
    progressPercentage: integer('progress_percentage').default(0),
    estimatedCompletionDate: date('estimated_completion_date'),

    // Status & Validation
    workflowStatus: text('workflow_status').default('active'), // active, paused, completed, cancelled
    validationCheckpoints: json('validation_checkpoints'),
    blockingIssues: json('blocking_issues'),

    // Assignments
    assignedTo: integer('assigned_to'),
    reviewers: integer('reviewers').array(),

    // Timestamps
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    lastActivityAt: timestamp('last_activity_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgWorkflowIdx: index('device_workflow_org_idx').on(table.organizationId),
    workflowStatusIdx: index('device_workflow_status_idx').on(table.workflowStatus),
    submissionWorkflowIdx: index('device_workflow_submission_idx').on(
      table.submissionType,
      table.submissionId
    ),
  })
);

// 21 CFR Part 11 Audit Trail for Medical Devices
export const deviceAuditTrail = pgTable(
  'device_audit_trail',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Audit Information
    entityType: text('entity_type').notNull(), // device, 510k, pma, cer, document
    entityId: integer('entity_id').notNull(),
    action: text('action').notNull(), // created, updated, deleted, submitted, approved, rejected

    // Change Details
    previousValues: json('previous_values'),
    newValues: json('new_values'),
    changedFields: text('changed_fields').array(),
    changeReason: text('change_reason'),

    // User & System Information
    userId: integer('user_id').notNull(),
    userName: text('user_name').notNull(),
    userRole: text('user_role'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),

    // Electronic Signature
    electronicSignature: text('electronic_signature'),
    signatureTimestamp: timestamp('signature_timestamp'),
    signatureMeaning: text('signature_meaning'), // approval, review, authorship

    // Compliance
    complianceStandard: text('compliance_standard').default('21 CFR Part 11'),
    dataIntegrityCheck: text('data_integrity_check'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    orgAuditIdx: index('device_audit_org_idx').on(table.organizationId),
    entityAuditIdx: index('device_audit_entity_idx').on(table.entityType, table.entityId),
    userAuditIdx: index('device_audit_user_idx').on(table.userId),
    timestampAuditIdx: index('device_audit_timestamp_idx').on(table.createdAt),
  })
);

// Data Lineage Tracking for 510(k) Compliance
export const dataLineageTracking = pgTable(
  'data_lineage_tracking',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Project and Workflow
    projectId: text('project_id').notNull(),
    workflowId: text('workflow_id'),

    // Source Information
    sourceField: text('source_field').notNull(), // e.g., "strategy.device_intake.deviceName"
    sourceValue: json('source_value'),
    sourceStage: text('source_stage'),
    sourceSection: text('source_section'),

    // Target Information
    targetSection: text('target_section').notNull(), // e.g., "FDA_3881"
    targetField: text('target_field').notNull(), // e.g., "device_name"

    // Mapping Rules
    mappingRule: text('mapping_rule').notNull(), // e.g., "DIRECT_COPY", "TRANSFORM"
    transformations: text('transformations').array(), // e.g., ["TRIM", "UPPERCASE_FIRST"]

    // Tracking
    userId: integer('user_id').notNull(),
    sessionId: text('session_id'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    projectLineageIdx: index('lineage_project_idx').on(table.projectId, table.organizationId),
    sourceFieldIdx: index('lineage_source_idx').on(table.sourceField),
    targetFieldIdx: index('lineage_target_idx').on(table.targetSection, table.targetField),
  })
);

// FDA Integration Logs
export const fdaIntegrationLogs = pgTable(
  'fda_integration_logs',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Integration Details
    integrationType: text('integration_type').notNull(), // openFDA, GUDID, CDRH_Portal, eSubmitter
    apiEndpoint: text('api_endpoint'),
    httpMethod: text('http_method'),

    // Request/Response
    requestPayload: json('request_payload'),
    responsePayload: json('response_payload'),
    httpStatusCode: integer('http_status_code'),

    // Related Entity
    relatedEntityType: text('related_entity_type'),
    relatedEntityId: integer('related_entity_id'),

    // Status & Error Handling
    status: text('status').notNull(), // success, failure, timeout, rate_limited
    errorMessage: text('error_message'),
    errorCode: text('error_code'),
    retryCount: integer('retry_count').default(0),

    // Performance Metrics
    requestDuration: integer('request_duration'), // in milliseconds

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    orgIntegrationIdx: index('fda_integration_org_idx').on(table.organizationId),
    statusIntegrationIdx: index('fda_integration_status_idx').on(table.status),
    typeIntegrationIdx: index('fda_integration_type_idx').on(table.integrationType),
  })
);

// Enhanced CER Projects Table with Medical Device Integration
export const cerProjects = pgTable('cer_projects', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),

  // Link to Medical Device
  deviceId: integer('device_id').references(() => medicalDevices.id),

  // Project Information
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
export const insertCerProjectSchema = createInsertSchemaOmit(cerProjects, {
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
export const insertProjectDocumentSchema = createInsertSchemaOmit(projectDocuments, {
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
export const insertProjectActivitySchema = createInsertSchemaOmit(projectActivities, {
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
export const insertProjectMilestoneSchema = createInsertSchemaOmit(projectMilestones, {
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
export const insertClientUserPermissionSchema = createInsertSchemaOmit(clientUserPermissions, {
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
 * CMC Database Schema - Real Pharmaceutical CMC Workflows
 */

// Analytical Methods Table - Core CMC functionality
export const analyticalMethods = pgTable('analytical_methods', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  methodCode: text('method_code').notNull(),
  title: text('title').notNull(),
  purpose: text('purpose').notNull(),
  analyte: text('analyte').notNull(),
  matrix: text('matrix').notNull(),
  technique: text('technique').notNull(), // HPLC, GC, UV-VIS, etc.
  status: text('status').default('development').notNull(), // development, validation, validated, retired
  ichQ2Parameters: json('ich_q2_parameters'), // Validation parameters
  systemSuitability: json('system_suitability'),
  acceptance_criteria: json('acceptance_criteria'),
  robustness_data: json('robustness_data'),
  validationDate: timestamp('validation_date'),
  developedBy: integer('developed_by').references(() => users.id),
  validatedBy: integer('validated_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Process Validation Table - 3 Stage Lifecycle
export const processValidation = pgTable('process_validation', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  processName: text('process_name').notNull(),
  stage: text('stage').notNull(), // design, qualification, verification
  batchNumbers: text('batch_numbers').array(),
  criticalProcessParameters: json('critical_process_parameters'),
  criticalQualityAttributes: json('critical_quality_attributes'),
  controlStrategy: json('control_strategy'),
  validationProtocol: text('validation_protocol'),
  validationReport: text('validation_report'),
  status: text('status').default('planning').notNull(),
  leadValidator: integer('lead_validator').references(() => users.id),
  approvedBy: integer('approved_by').references(() => users.id),
  approvalDate: timestamp('approval_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Stability Studies Table - ICH Q1 Compliance with Complete Lifecycle Support
export const stabilityStudies = pgTable('stability_studies', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  studyTitle: text('study_title'),
  productName: text('product_name').notNull(),
  batchNumber: text('batch_number').notNull(),
  dosageForm: text('dosage_form').notNull().default('Tablet'),
  strength: text('strength'),
  scope: text('scope').notNull().default('DP'), // DP = Drug Product, DS = Drug Substance
  climaticZone: text('climatic_zone').notNull().default('II'),
  studyType: text('study_type').notNull().default('long-term'), // long-term, accelerated, intermediate, stress
  storageConditions: text('storage_conditions').array().notNull(), // ['LT', 'ACC', 'INT', 'REF']
  duration: integer('duration').notNull().default(24), // months
  testParameters: text('test_parameters').array().notNull(), // ['Assay', 'Related Substances', etc.]
  testingSchedule: json('testing_schedule'),
  timePoints: text('time_points').array(),
  stabilityData: json('stability_data'),
  notes: text('notes'),
  shelfLife: text('shelf_life'),
  status: text('status').default('DRAFT').notNull(), // DRAFT, ACTIVE, PAUSED, COMPLETED
  startDate: timestamp('start_date').notNull(),
  plannedEndDate: timestamp('planned_end_date'),
  studyDirector: integer('study_director').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Quality Control Testing Table
export const qcTesting = pgTable('qc_testing', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  sampleId: text('sample_id').notNull(),
  sampleType: text('sample_type').notNull(), // raw-material, in-process, finished-product
  testMethod: text('test_method').notNull(),
  testResults: json('test_results'),
  specifications: json('specifications'),
  passFailStatus: text('pass_fail_status'), // pass, fail, pending
  certificateOfAnalysis: text('certificate_of_analysis'),
  analyst: integer('analyst').references(() => users.id),
  reviewedBy: integer('reviewed_by').references(() => users.id),
  testDate: timestamp('test_date').notNull(),
  releaseDate: timestamp('release_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CMC Change Control Table
export const cmcChangeControl = pgTable('cmc_change_control', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  changeNumber: text('change_number').notNull(),
  changeType: text('change_type').notNull(), // process, analytical, specification, etc.
  description: text('description').notNull(),
  justification: text('justification').notNull(),
  impactAssessment: json('impact_assessment'),
  riskAssessment: json('risk_assessment'),
  regulatoryFiling: text('regulatory_filing'), // Prior approval, CBE-30, Annual Report
  status: text('status').default('draft').notNull(),
  initiator: integer('initiator').references(() => users.id),
  approvers: integer('approvers').array(),
  implementationDate: timestamp('implementation_date'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drug Substances Table - Enhanced CMC
export const drugSubstances = pgTable('drug_substances', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  substanceName: text('substance_name').notNull(),
  structuralFormula: text('structural_formula'),
  molecularFormula: text('molecular_formula'),
  molecularWeight: decimal('molecular_weight'),
  casNumber: text('cas_number'),
  inn: text('inn'), // International Nonproprietary Name
  manufacturingProcess: json('manufacturing_process'),
  specifications: json('specifications'),
  impuritiesProfile: json('impurities_profile'),
  stability: json('stability'),
  controlOfMaterials: json('control_of_materials'),
  status: text('status').default('development').notNull(),
  developmentPhase: text('development_phase'), // preclinical, phase1, phase2, phase3, commercial
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Drug Products Table - Enhanced CMC
export const drugProducts = pgTable('drug_products', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  productName: text('product_name').notNull(),
  dosageForm: text('dosage_form').notNull(),
  strength: text('strength').notNull(),
  routeOfAdministration: text('route_of_administration'),
  composition: json('composition'),
  manufacturingProcess: json('manufacturing_process'),
  batchFormula: json('batch_formula'),
  processControls: json('process_controls'),
  specifications: json('specifications'),
  packagingMaterials: json('packaging_materials'),
  stability: json('stability'),
  status: text('status').default('development').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Regulatory Documents Table
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

// CMC Schema Types and Insert Schemas
export const insertAnalyticalMethodSchema = createInsertSchemaOmit(analyticalMethods, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProcessValidationSchema = createInsertSchemaOmit(processValidation, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStabilityStudySchema = createInsertSchemaOmit(stabilityStudies, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertQcTestingSchema = createInsertSchemaOmit(qcTesting, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCmcChangeControlSchema = createInsertSchemaOmit(cmcChangeControl, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDrugSubstanceSchema = createInsertSchemaOmit(drugSubstances, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDrugProductSchema = createInsertSchemaOmit(drugProducts, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CMC Types
export type AnalyticalMethod = InferSelectModel<typeof analyticalMethods>;
export type InsertAnalyticalMethod = z.infer<typeof insertAnalyticalMethodSchema>;
export type ProcessValidation = InferSelectModel<typeof processValidation>;
export type InsertProcessValidation = z.infer<typeof insertProcessValidationSchema>;
export type StabilityStudy = InferSelectModel<typeof stabilityStudies>;
export type InsertStabilityStudy = z.infer<typeof insertStabilityStudySchema>;
export type QcTesting = InferSelectModel<typeof qcTesting>;
export type InsertQcTesting = z.infer<typeof insertQcTestingSchema>;
export type CmcChangeControl = InferSelectModel<typeof cmcChangeControl>;
export type InsertCmcChangeControl = z.infer<typeof insertCmcChangeControlSchema>;
export type DrugSubstance = InferSelectModel<typeof drugSubstances>;
export type InsertDrugSubstance = z.infer<typeof insertDrugSubstanceSchema>;
export type DrugProduct = InferSelectModel<typeof drugProducts>;
export type InsertDrugProduct = z.infer<typeof insertDrugProductSchema>;

// Regulatory Document Insert Schema
export const insertRegulatoryDocumentSchema = createInsertSchemaOmit(regulatoryDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Regulatory Document Types
export type RegulatoryDocument = InferSelectModel<typeof regulatoryDocuments>;
export type InsertRegulatoryDocument = z.infer<typeof insertRegulatoryDocumentSchema>;

/**
 * Simple Document Versions Table (renamed to avoid conflict)
 *
 * Tracks simple version history for non-compliant documents.
 * For 21 CFR Part 11 compliant version tracking, use the 'documentVersions' table defined earlier.
 */
export const simpleDocumentVersions = pgTable('simple_document_versions', {
  id: serial('id').primaryKey(),
  documentId: integer('document_id')
    .notNull()
    .references(() => simpleDocuments.id),
  versionNumber: text('version_number').notNull(),
  content: text('content').notNull(),
  changeDescription: text('change_description'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Simple Document Version Insert Schema
export const insertSimpleDocumentVersionSchema = createInsertSchemaOmit(simpleDocumentVersions, {
  id: true,
  createdAt: true,
});

// Simple Document Version Types
export type SimpleDocumentVersion = InferSelectModel<typeof simpleDocumentVersions>;
export type InsertSimpleDocumentVersion = z.infer<typeof insertSimpleDocumentVersionSchema>;

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
export const insertCerApprovalSchema = createInsertSchemaOmit(cerApprovals, {
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
export const insertCerDocumentSchema = createInsertSchemaOmit(cerDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CER Document Types
export type CerDocument = InferSelectModel<typeof cerDocuments>;
export type InsertCerDocument = z.infer<typeof insertCerDocumentSchema>;

/**
 * CER Reports Table
 *
 * Main reports for Clinical Evaluation Reports (CER)
 */
export const cerReports = pgTable('cer_reports', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  cerProjectId: integer('cer_project_id').references(() => cerProjects.id),
  reportId: text('report_id').notNull().unique(),
  deviceId: integer('device_id'),
  deviceName: text('device_name').notNull(),
  deviceManufacturer: text('device_manufacturer'),
  deviceType: text('device_type'),
  deviceClass: text('device_class'),
  cerNumber: text('cer_number'),
  cerVersion: text('cer_version'),
  cerStatus: text('cer_status'),
  regulatoryFramework: text('regulatory_framework'),
  notifiedBodyId: text('notified_body_id'),
  executiveSummary: json('executive_summary'),
  deviceDescription: json('device_description'),
  essentialRequirements: json('essential_requirements'),
  clinicalBackground: json('clinical_background'),
  clinicalEvidence: json('clinical_evidence'),
  literatureReview: json('literature_review'),
  riskBenefitAnalysis: json('risk_benefit_analysis'),
  conclusions: json('conclusions'),
  templateId: text('template_id'),
  templateVersion: text('template_version'),
  templateChecksum: text('template_checksum'),
  status: text('status').default('draft').notNull(),
  version: text('version').default('1.0.0'),
  content: json('content'),
  metadata: json('metadata'),
  changeLog: json('change_log'),
  createdBy: integer('created_by'),
  updatedBy: integer('updated_by'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerReportSchema = createInsertSchemaOmit(cerReports, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerReport = InferSelectModel<typeof cerReports>;
export type InsertCerReport = z.infer<typeof insertCerReportSchema>;
export type NewCerReport = z.infer<typeof insertCerReportSchema>;

// CER Templates
export const cerTemplates = pgTable('cer_templates', {
  id: serial('id').primaryKey(),
  templateId: text('template_id').notNull().unique(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  version: text('version').default('1.0.0'),
  content: json('content'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerTemplateSchema = createInsertSchemaOmit(cerTemplates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerTemplate = InferSelectModel<typeof cerTemplates>;
export type InsertCerTemplate = z.infer<typeof insertCerTemplateSchema>;

// CER Clinical Evidence
export const cerClinicalEvidence = pgTable('cer_clinical_evidence', {
  id: serial('id').primaryKey(),
  cerReportId: integer('cer_report_id')
    .notNull()
    .references(() => cerReports.id),
  evidenceType: text('evidence_type'),
  title: text('title'),
  authors: text('authors'),
  year: integer('year'),
  patients: integer('patients'),
  findings: text('findings'),
  relevance: real('relevance'),
  quality: real('quality'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerClinicalEvidenceSchema = createInsertSchemaOmit(cerClinicalEvidence, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerClinicalEvidence = InferSelectModel<typeof cerClinicalEvidence>;
export type NewCerClinicalEvidence = z.infer<typeof insertCerClinicalEvidenceSchema>;

// CER Essential Requirements
export const cerEssentialRequirements = pgTable('cer_essential_requirements', {
  id: serial('id').primaryKey(),
  cerReportId: integer('cer_report_id')
    .notNull()
    .references(() => cerReports.id),
  requirement: text('requirement'),
  evidence: text('evidence'),
  status: text('status'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CER Version History
export const cerVersionHistory = pgTable('cer_version_history', {
  id: serial('id').primaryKey(),
  cerReportId: integer('cer_report_id')
    .notNull()
    .references(() => cerReports.id),
  version: text('version').notNull(),
  changeLog: json('change_log'),
  createdBy: integer('created_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Device Profiles
export const deviceProfiles = pgTable('device_profiles', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name'),
  deviceName: text('device_name'),
  classification: text('classification'),
  manufacturer: text('manufacturer'),
  deviceType: text('device_type'),
  productCode: text('product_code'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Device Submissions
export const deviceSubmissions = pgTable('device_submissions', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  deviceId: integer('device_id').references(() => deviceProfiles.id),
  submissionType: text('submission_type'),
  status: text('status'),
  submittedAt: timestamp('submitted_at'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * CER Sections Table
 *
 * Individual sections within a CER report
 */
export const cerSections = pgTable('cer_sections', {
  id: serial('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => cerReports.reportId),
  sectionId: text('section_id').notNull(),
  title: text('title').notNull(),
  order: integer('order').notNull(),
  content: json('content'),
  status: text('status').default('draft'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerSectionSchema = createInsertSchemaOmit(cerSections, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerSection = InferSelectModel<typeof cerSections>;
export type InsertCerSection = z.infer<typeof insertCerSectionSchema>;

/**
 * CER FAERS Data Table
 *
 * FDA Adverse Event Reporting System data for CER reports
 */
export const cerFaersData = pgTable('cer_faers_data', {
  id: serial('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => cerReports.reportId),
  faersId: text('faers_id').notNull(),
  eventDate: timestamp('event_date'),
  eventType: text('event_type'),
  severity: text('severity'),
  deviceInfo: json('device_info'),
  patientInfo: json('patient_info'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerFaersDataSchema = createInsertSchemaOmit(cerFaersData, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerFaersData = InferSelectModel<typeof cerFaersData>;
export type InsertCerFaersData = z.infer<typeof insertCerFaersDataSchema>;

/**
 * CER Literature Table
 *
 * Literature references and analysis for CER reports
 */
export const cerLiterature = pgTable('cer_literature', {
  id: serial('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => cerReports.reportId),
  literatureId: text('literature_id').notNull(),
  title: text('title').notNull(),
  authors: json('authors'),
  publicationDate: timestamp('publication_date'),
  journal: text('journal'),
  doi: text('doi'),
  pmid: text('pmid'),
  relevanceScore: real('relevance_score'),
  included: boolean('included').default(false),
  summary: text('summary'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerLiteratureSchema = createInsertSchemaOmit(cerLiterature, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerLiterature = InferSelectModel<typeof cerLiterature>;
export type InsertCerLiterature = z.infer<typeof insertCerLiteratureSchema>;

/**
 * CER Compliance Checks Table
 *
 * Compliance verification for CER reports
 */
export const cerComplianceChecks = pgTable('cer_compliance_checks', {
  id: serial('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => cerReports.reportId),
  checkId: text('check_id').notNull(),
  checkType: text('check_type').notNull(),
  requirement: text('requirement'),
  status: text('status').default('pending'),
  result: json('result'),
  notes: text('notes'),
  checkedById: integer('checked_by_id').references(() => users.id),
  checkedAt: timestamp('checked_at'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerComplianceCheckSchema = createInsertSchemaOmit(cerComplianceChecks, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerComplianceCheck = InferSelectModel<typeof cerComplianceChecks>;
export type InsertCerComplianceCheck = z.infer<typeof insertCerComplianceCheckSchema>;

/**
 * CER Workflows Table
 *
 * Workflow management for CER reports
 */
export const cerWorkflows = pgTable('cer_workflows', {
  id: serial('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => cerReports.reportId),
  workflowId: text('workflow_id').notNull(),
  stage: text('stage').notNull(),
  status: text('status').default('pending'),
  assignedToId: integer('assigned_to_id').references(() => users.id),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerWorkflowSchema = createInsertSchemaOmit(cerWorkflows, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerWorkflow = InferSelectModel<typeof cerWorkflows>;
export type InsertCerWorkflow = z.infer<typeof insertCerWorkflowSchema>;

/**
 * CER Exports Table
 *
 * Export history for CER reports
 */
export const cerExports = pgTable('cer_exports', {
  id: serial('id').primaryKey(),
  reportId: text('report_id')
    .notNull()
    .references(() => cerReports.reportId),
  exportId: text('export_id').notNull(),
  format: text('format').notNull(),
  fileName: text('file_name'),
  filePath: text('file_path'),
  exportedById: integer('exported_by_id').references(() => users.id),
  exportedAt: timestamp('exported_at').defaultNow(),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const insertCerExportSchema = createInsertSchemaOmit(cerExports, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CerExport = InferSelectModel<typeof cerExports>;
export type InsertCerExport = z.infer<typeof insertCerExportSchema>;

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
export const insertQualityManagementPlanSchema = createInsertSchemaOmit(qualityManagementPlans, {
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
export const insertQmpAuditTrailSchema = createInsertSchemaOmit(qmpAuditTrail, {
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
export const insertCtqFactorSchema = createInsertSchemaOmit(ctqFactors, {
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
export const insertQmpSectionGatingSchema = createInsertSchemaOmit(qmpSectionGating, {
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
export const insertQmpTraceabilityMatrixSchema = createInsertSchemaOmit(qmpTraceabilityMatrix, {
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
 * CRO (Contract Research Organization) Tables
 *
 * These tables support CRO-specific functionality including
 * client management, study oversight, and regulatory coordination
 */

/**
 * CRO Clients Table
 *
 * Represents pharmaceutical/biotech clients that the CRO works with
 */
export const croClients = pgTable('cro_clients', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  name: text('name').notNull(),
  companyType: text('company_type').notNull(), // biotech, pharma, medical_device, diagnostic
  industrySegment: text('industry_segment'), // oncology, cardiology, neurology, etc.
  headquarters: text('headquarters'),
  website: text('website'),
  primaryContact: text('primary_contact'),
  contactEmail: text('contact_email'),
  contactPhone: text('contact_phone'),
  regulatoryContact: text('regulatory_contact'),
  regulatoryEmail: text('regulatory_email'),
  contractStartDate: timestamp('contract_start_date'),
  contractEndDate: timestamp('contract_end_date'),
  contractValue: decimal('contract_value'),
  contractStatus: text('contract_status').default('active').notNull(), // active, expired, terminated, pending
  preferredRegions: json('preferred_regions'), // Array of regulatory regions
  complianceRequirements: json('compliance_requirements'), // Specific compliance needs
  riskLevel: text('risk_level').default('medium').notNull(), // low, medium, high, critical
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRO Clients Insert Schema
export const insertCroClientSchema = createInsertSchemaOmit(croClients, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CRO Clients Types
export type CroClient = InferSelectModel<typeof croClients>;
export type InsertCroClient = z.infer<typeof insertCroClientSchema>;

/**
 * CRO Studies Table
 *
 * Represents clinical studies managed by the CRO
 */
export const croStudies = pgTable('cro_studies', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientId: integer('client_id')
    .notNull()
    .references(() => croClients.id),
  studyNumber: text('study_number').notNull(),
  studyTitle: text('study_title').notNull(),
  studyType: text('study_type').notNull(), // phase_1, phase_2, phase_3, phase_4, observational, device_study
  therapeuticArea: text('therapeutic_area').notNull(),
  indication: text('indication').notNull(),
  compound: text('compound'),
  deviceName: text('device_name'),
  studyPhase: text('study_phase'),
  studyDesign: text('study_design'), // randomized, open_label, double_blind, etc.
  primaryEndpoint: text('primary_endpoint'),
  secondaryEndpoints: json('secondary_endpoints'), // Array of secondary endpoints
  targetEnrollment: integer('target_enrollment'),
  currentEnrollment: integer('current_enrollment').default(0),
  studyStatus: text('study_status').default('planning').notNull(), // planning, startup, recruiting, active, completed, terminated
  regulatoryStatus: text('regulatory_status').default('pre_ind').notNull(), // pre_ind, ind_submitted, ind_approved, etc.
  firstPatientIn: timestamp('first_patient_in'),
  lastPatientOut: timestamp('last_patient_out'),
  studyCompletionDate: timestamp('study_completion_date'),
  regulatoryRegions: json('regulatory_regions'), // Array of regulatory regions
  investigationalProduct: json('investigational_product'), // Product details
  studyBudget: decimal('study_budget'),
  csoAssignments: json('cso_assignments'), // Clinical Study Operations assignments
  timeline: json('timeline'), // Study milestones and timelines
  riskAssessment: json('risk_assessment'), // Risk factors and mitigation
  complianceStatus: text('compliance_status').default('compliant').notNull(), // compliant, minor_deviation, major_deviation, critical
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRO Studies Insert Schema
export const insertCroStudySchema = createInsertSchemaOmit(croStudies, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CRO Studies Types
export type CroStudy = InferSelectModel<typeof croStudies>;
export type InsertCroStudy = z.infer<typeof insertCroStudySchema>;

/**
 * CRO Regulatory Submissions Table
 *
 * Tracks regulatory submissions managed by the CRO
 */
export const croRegulatorySubmissions = pgTable('cro_regulatory_submissions', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientId: integer('client_id')
    .notNull()
    .references(() => croClients.id),
  studyId: integer('study_id').references(() => croStudies.id),
  submissionType: text('submission_type').notNull(), // ind, nda, bla, ide, 510k, pma, ce_mark
  submissionNumber: text('submission_number'),
  regulatoryRegion: text('regulatory_region').notNull(), // fda, ema, pmda, health_canada, etc.
  submissionStatus: text('submission_status').default('draft').notNull(), // draft, submitted, under_review, approved, rejected
  submissionDate: timestamp('submission_date'),
  expectedApprovalDate: timestamp('expected_approval_date'),
  actualApprovalDate: timestamp('actual_approval_date'),
  submissionPackage: json('submission_package'), // Details of submission contents
  regulatoryStrategy: text('regulatory_strategy'),
  meetingHistory: json('meeting_history'), // FDA meetings, EMA meetings, etc.
  queries: json('queries'), // Regulatory queries and responses
  amendments: json('amendments'), // Submission amendments
  milestones: json('milestones'), // Submission milestones
  budget: decimal('budget'),
  assignedRegulator: text('assigned_regulator'),
  consultants: json('consultants'), // External regulatory consultants
  complianceScore: integer('compliance_score'), // 0-100 compliance score
  riskLevel: text('risk_level').default('medium').notNull(),
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRO Regulatory Submissions Insert Schema
export const insertCroRegulatorySubmissionSchema = createInsertSchemaOmit(
  croRegulatorySubmissions,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

// CRO Regulatory Submissions Types
export type CroRegulatorySubmission = InferSelectModel<typeof croRegulatorySubmissions>;
export type InsertCroRegulatorySubmission = z.infer<typeof insertCroRegulatorySubmissionSchema>;

/**
 * CRO Team Assignments Table
 *
 * Tracks team member assignments to CRO projects
 */
export const croTeamAssignments = pgTable('cro_team_assignments', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  clientId: integer('client_id').references(() => croClients.id),
  studyId: integer('study_id').references(() => croStudies.id),
  submissionId: integer('submission_id').references(() => croRegulatorySubmissions.id),
  role: text('role').notNull(), // project_manager, clinical_monitor, regulatory_affairs, biostatistician, etc.
  responsibility: text('responsibility'),
  assignmentType: text('assignment_type').default('primary').notNull(), // primary, secondary, consultant, backup
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  utilizationPercentage: integer('utilization_percentage').default(100), // Percentage of time allocated
  billableRate: decimal('billable_rate'),
  status: text('status').default('active').notNull(), // active, inactive, completed
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRO Team Assignments Insert Schema
export const insertCroTeamAssignmentSchema = createInsertSchemaOmit(croTeamAssignments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CRO Team Assignments Types
export type CroTeamAssignment = InferSelectModel<typeof croTeamAssignments>;
export type InsertCroTeamAssignment = z.infer<typeof insertCroTeamAssignmentSchema>;

/**
 * CRO Milestones Table
 *
 * Tracks project milestones and deliverables
 */
export const croMilestones = pgTable('cro_milestones', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientId: integer('client_id')
    .notNull()
    .references(() => croClients.id),
  studyId: integer('study_id').references(() => croStudies.id),
  submissionId: integer('submission_id').references(() => croRegulatorySubmissions.id),
  title: text('title').notNull(),
  description: text('description'),
  category: text('category').notNull(), // regulatory, clinical, operational, financial
  priority: text('priority').default('medium').notNull(), // low, medium, high, critical
  status: text('status').default('planned').notNull(), // planned, in_progress, completed, delayed, cancelled
  plannedStartDate: timestamp('planned_start_date'),
  actualStartDate: timestamp('actual_start_date'),
  plannedEndDate: timestamp('planned_end_date'),
  actualEndDate: timestamp('actual_end_date'),
  dependencies: json('dependencies'), // Array of dependent milestone IDs
  deliverables: json('deliverables'), // Expected deliverables
  resources: json('resources'), // Required resources
  budget: decimal('budget'),
  actualCost: decimal('actual_cost'),
  assignedTo: integer('assigned_to').references(() => users.id),
  completionPercentage: integer('completion_percentage').default(0),
  qualityChecks: json('quality_checks'), // Quality control measures
  riskFactors: json('risk_factors'), // Associated risks
  notes: text('notes'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CRO Milestones Insert Schema
export const insertCroMilestoneSchema = createInsertSchemaOmit(croMilestones, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// CRO Milestones Types
export type CroMilestone = InferSelectModel<typeof croMilestones>;
export type InsertCroMilestone = z.infer<typeof insertCroMilestoneSchema>;

/**
 * CRO Relations
 */
export const croClientsRelations = relations(croClients, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [croClients.organizationId],
    references: [organizations.id],
  }),
  studies: many(croStudies),
  submissions: many(croRegulatorySubmissions),
  teamAssignments: many(croTeamAssignments),
  milestones: many(croMilestones),
}));

export const croStudiesRelations = relations(croStudies, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [croStudies.organizationId],
    references: [organizations.id],
  }),
  client: one(croClients, {
    fields: [croStudies.clientId],
    references: [croClients.id],
  }),
  submissions: many(croRegulatorySubmissions),
  teamAssignments: many(croTeamAssignments),
  milestones: many(croMilestones),
}));

export const croRegulatorySubmissionsRelations = relations(
  croRegulatorySubmissions,
  ({ one, many }) => ({
    organization: one(organizations, {
      fields: [croRegulatorySubmissions.organizationId],
      references: [organizations.id],
    }),
    client: one(croClients, {
      fields: [croRegulatorySubmissions.clientId],
      references: [croClients.id],
    }),
    study: one(croStudies, {
      fields: [croRegulatorySubmissions.studyId],
      references: [croStudies.id],
    }),
    teamAssignments: many(croTeamAssignments),
    milestones: many(croMilestones),
  })
);

export const croTeamAssignmentsRelations = relations(croTeamAssignments, ({ one }) => ({
  organization: one(organizations, {
    fields: [croTeamAssignments.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [croTeamAssignments.userId],
    references: [users.id],
  }),
  client: one(croClients, {
    fields: [croTeamAssignments.clientId],
    references: [croClients.id],
  }),
  study: one(croStudies, {
    fields: [croTeamAssignments.studyId],
    references: [croStudies.id],
  }),
  submission: one(croRegulatorySubmissions, {
    fields: [croTeamAssignments.submissionId],
    references: [croRegulatorySubmissions.id],
  }),
}));

export const croMilestonesRelations = relations(croMilestones, ({ one }) => ({
  organization: one(organizations, {
    fields: [croMilestones.organizationId],
    references: [organizations.id],
  }),
  client: one(croClients, {
    fields: [croMilestones.clientId],
    references: [croClients.id],
  }),
  study: one(croStudies, {
    fields: [croMilestones.studyId],
    references: [croStudies.id],
  }),
  submission: one(croRegulatorySubmissions, {
    fields: [croMilestones.submissionId],
    references: [croRegulatorySubmissions.id],
  }),
  assignedTo: one(users, {
    fields: [croMilestones.assignedTo],
    references: [users.id],
  }),
}));

/**
 * Document Folder Table
 *
 * Represents a folder in the document management system.
 */
export const documentFolders: any = pgTable('document_folders', {
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
export const insertDocumentFolderSchema = createInsertSchemaOmit(documentFolders, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Document Folder Types
export type DocumentFolder = InferSelectModel<typeof documentFolders>;
export type InsertDocumentFolder = z.infer<typeof insertDocumentFolderSchema>;

/**
 * Simple Documents Table (renamed to avoid conflict)
 *
 * Represents a simple document in the system for non-compliance use cases.
 * For 21 CFR Part 11 compliant documents, use the 'documents' table defined earlier.
 */
export const simpleDocuments = pgTable('simple_documents', {
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

// Simple Document Insert Schema
export const insertSimpleDocumentSchema = createInsertSchemaOmit(simpleDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Simple Document Types
export type SimpleDocument = InferSelectModel<typeof simpleDocuments>;
export type InsertSimpleDocument = z.infer<typeof insertSimpleDocumentSchema>;

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
export const insertDocumentAuditLogSchema = createInsertSchemaOmit(documentAuditLog, {
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
export const insertProjectSchema = createInsertSchemaOmit(projects, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Types
export type Project = InferSelectModel<typeof projects>;
export type InsertProject = z.infer<typeof insertProjectSchema>;

// ============================================================================
// CONCEPT2CURE AI ASSISTANT - CONVERSATIONS & ARTIFACTS
// FDA 21 CFR Part 11 Compliant Chat System
// ============================================================================

/**
 * Concept2Cure Conversations Table
 *
 * Stores AI assistant conversations for regulatory document generation.
 * Supports conversation forking/branching for exploring alternatives.
 */
export const concept2cureConversations = pgTable(
  'concept2cure_conversations',
  {
    id: serial('id').primaryKey(),
    conversationId: text('conversation_id').notNull().unique(), // External ID (conv_xxx)
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    title: text('title').notNull(),
    summary: text('summary'), // AI-generated summary
    parentConversationId: integer('parent_conversation_id'), // For forked conversations
    forkMessageIndex: integer('fork_message_index'), // Index where fork occurred
    threadId: text('thread_id'), // OpenAI thread ID if using assistants API
    messageCount: integer('message_count').default(0),
    status: text('status').default('active').notNull(), // active, archived
    createdById: integer('created_by_id').references(() => users.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    projectIdx: index('c2c_conv_project_idx').on(table.projectId),
    orgIdx: index('c2c_conv_org_idx').on(table.organizationId),
    conversationIdIdx: index('c2c_conv_id_idx').on(table.conversationId),
  })
);

/**
 * Concept2Cure Messages Table
 *
 * Individual messages within conversations.
 * Immutable for 21 CFR Part 11 compliance - edits create new versions.
 */
export const concept2cureMessages = pgTable(
  'concept2cure_messages',
  {
    id: serial('id').primaryKey(),
    messageId: text('message_id').notNull().unique(), // External ID (msg_xxx)
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => concept2cureConversations.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    role: text('role').notNull(), // user, assistant, system
    content: text('content').notNull(),
    contentHash: text('content_hash'), // SHA-256 for integrity verification
    attachments: json('attachments'), // Array of {id, name, type, size}
    artifactId: text('artifact_id'), // Reference to generated artifact
    citations: json('citations'), // Array of document citations
    tokenCount: integer('token_count'), // For usage tracking
    modelUsed: text('model_used'), // claude-3, gpt-4, etc.
    latencyMs: integer('latency_ms'), // Response time
    edited: boolean('edited').default(false),
    editedAt: timestamp('edited_at'),
    originalContent: text('original_content'), // For edit tracking
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    conversationIdx: index('c2c_msg_conv_idx').on(table.conversationId),
    messageIdIdx: index('c2c_msg_id_idx').on(table.messageId),
    roleIdx: index('c2c_msg_role_idx').on(table.role),
  })
);

/**
 * Concept2Cure Artifacts Table
 *
 * Generated documents and interactive components.
 * Version-controlled for regulatory compliance.
 */
export const concept2cureArtifacts = pgTable(
  'concept2cure_artifacts',
  {
    id: serial('id').primaryKey(),
    artifactId: text('artifact_id').notNull().unique(), // External ID (artifact_xxx)
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id, { onDelete: 'cascade' }),
    conversationId: integer('conversation_id').references(() => concept2cureConversations.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    type: text('type').notNull(), // markdown, code, table, chart, form
    category: text('category').notNull(), // document, interactive, visualization
    title: text('title').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash'), // SHA-256 for integrity
    version: integer('version').default(1).notNull(),
    ctdSection: text('ctd_section'), // eCTD section reference
    templateId: text('template_id'), // Reference to source template
    status: text('status').default('draft').notNull(), // draft, review, approved, locked
    lockedAt: timestamp('locked_at'), // When content was locked for submission
    lockedById: integer('locked_by_id').references(() => users.id),
    createdById: integer('created_by_id').references(() => users.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    projectIdx: index('c2c_artifact_project_idx').on(table.projectId),
    artifactIdIdx: index('c2c_artifact_id_idx').on(table.artifactId),
    typeIdx: index('c2c_artifact_type_idx').on(table.type),
    statusIdx: index('c2c_artifact_status_idx').on(table.status),
  })
);

/**
 * Concept2Cure Artifact Versions Table
 *
 * Complete version history for regulatory audit trail.
 * Immutable - versions are never modified or deleted.
 */
export const concept2cureArtifactVersions = pgTable(
  'concept2cure_artifact_versions',
  {
    id: serial('id').primaryKey(),
    artifactId: integer('artifact_id')
      .notNull()
      .references(() => concept2cureArtifacts.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    version: integer('version').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash').notNull(), // SHA-256
    changeDescription: text('change_description'), // What changed
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    artifactVersionIdx: index('c2c_artifact_ver_idx').on(table.artifactId, table.version),
    uniqueVersion: unique('c2c_artifact_unique_version').on(table.artifactId, table.version),
  })
);

/**
 * Concept2Cure Signatures Table
 *
 * Electronic signatures for artifacts (21 CFR Part 11).
 * Append-only and immutable by policy.
 */
export const concept2cureSignatures = pgTable(
  'concept2cure_signatures',
  {
    id: serial('id').primaryKey(),
    signatureId: text('signature_id').notNull().unique(),
    artifactId: integer('artifact_id')
      .notNull()
      .references(() => concept2cureArtifacts.id, { onDelete: 'cascade' }),
    artifactVersionId: integer('artifact_version_id')
      .notNull()
      .references(() => concept2cureArtifactVersions.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    signatureType: text('signature_type').notNull(),
    signaturePurpose: text('signature_purpose').notNull(),
    signatureMeaning: text('signature_meaning'),
    signerId: integer('signer_id')
      .notNull()
      .references(() => users.id),
    signerName: text('signer_name').notNull(),
    signerEmail: text('signer_email').notNull(),
    signerRole: text('signer_role'),
    authenticationMethod: text('authentication_method').notNull(),
    authenticationTimestamp: timestamp('authentication_timestamp').notNull(),
    secondFactorVerified: boolean('second_factor_verified').default(false),
    signatureHash: varchar('signature_hash', { length: 256 }).notNull(),
    signatureManifest: json('signature_manifest'),
    ipAddress: varchar('ip_address', { length: 45 }),
    deviceInfo: json('device_info'),
    status: text('status').default('active').notNull(),
    signedAt: timestamp('signed_at').defaultNow().notNull(),
  },
  table => ({
    signatureIdIdx: index('c2c_sig_id_idx').on(table.signatureId),
    artifactIdx: index('c2c_sig_artifact_idx').on(table.artifactId),
    artifactVersionIdx: index('c2c_sig_artifact_version_idx').on(table.artifactVersionId),
    orgIdx: index('c2c_sig_org_idx').on(table.organizationId),
    signerIdx: index('c2c_sig_signer_idx').on(table.signerId),
    signedAtIdx: index('c2c_sig_signed_at_idx').on(table.signedAt),
  })
);

// Insert Schemas
export const insertConcept2cureConversationSchema = createInsertSchemaOmit(
  concept2cureConversations,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

export const insertConcept2cureMessageSchema = createInsertSchemaOmit(concept2cureMessages, {
  id: true,
  createdAt: true,
});

export const insertConcept2cureArtifactSchema = createInsertSchemaOmit(concept2cureArtifacts, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertConcept2cureArtifactVersionSchema = createInsertSchemaOmit(
  concept2cureArtifactVersions,
  {
    id: true,
    createdAt: true,
  }
);

export const insertConcept2cureSignatureSchema = createInsertSchemaOmit(concept2cureSignatures, {
  id: true,
  signedAt: true,
});

// Types
export type Concept2cureConversation = InferSelectModel<typeof concept2cureConversations>;
export type InsertConcept2cureConversation = z.infer<typeof insertConcept2cureConversationSchema>;

export type Concept2cureMessage = InferSelectModel<typeof concept2cureMessages>;
export type InsertConcept2cureMessage = z.infer<typeof insertConcept2cureMessageSchema>;

export type Concept2cureArtifact = InferSelectModel<typeof concept2cureArtifacts>;
export type InsertConcept2cureArtifact = z.infer<typeof insertConcept2cureArtifactSchema>;

export type Concept2cureArtifactVersion = InferSelectModel<typeof concept2cureArtifactVersions>;
export type InsertConcept2cureArtifactVersion = z.infer<
  typeof insertConcept2cureArtifactVersionSchema
>;

export type Concept2cureSignature = InferSelectModel<typeof concept2cureSignatures>;
export type InsertConcept2cureSignature = z.infer<typeof insertConcept2cureSignatureSchema>;

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
export const insertProjectModuleSchema = createInsertSchemaOmit(projectModules, {
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
export const insertProjectWorkflowStageSchema = createInsertSchemaOmit(projectWorkflowStages, {
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
export const projectTasks: any = pgTable('project_tasks', {
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
  moduleType: text('module_type'), // CMC, IND, Medical Device, eCTD, Vault, Protocol Design
  moduleIcon: text('module_icon'), // Icon identifier for the module
  moduleColor: text('module_color'), // Color for module visualization
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
  linkedTasks: json('linked_tasks'), // Cross-module task linkages
  settings: json('settings'),
  metadata: json('metadata'),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Project Task Insert Schema
export const insertProjectTaskSchema = createInsertSchemaOmit(projectTasks, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Project Task Types
export type ProjectTask = InferSelectModel<typeof projectTasks>;
export type InsertProjectTask = z.infer<typeof insertProjectTaskSchema>;

/**
 * Unified Tasks Table
 *
 * Central table for managing tasks across ALL modules in the ecosystem.
 * This table acts as the single source of truth for task management,
 * connecting Protocol Design, CMC, Medical Device, IND Wizard, eCTD Co-Author, and Vault.
 */
export const unifiedTasks = pgTable(
  'unified_tasks',
  {
    id: serial('id').primaryKey(),
    taskId: text('task_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    projectId: integer('project_id').references(() => projects.id),

    // Module Information
    moduleType: text('module_type').notNull(), // CMC, IND, MedicalDevice, eCTD, Vault, ProtocolDesign
    moduleIcon: text('module_icon'), // lucide-react icon name
    moduleColor: text('module_color'), // Hex color for module visualization
    sourceEntityId: text('source_entity_id'), // ID from the source module
    sourceEntityType: text('source_entity_type'), // Type of entity in source module

    // Task Details
    title: text('title').notNull(),
    description: text('description'),
    category: text('category'), // document-prep, review, approval, analysis, compliance, etc.
    taskType: text('task_type'), // milestone, deliverable, review, approval, action

    // Assignment & Ownership
    assigneeId: integer('assignee_id').references(() => users.id),
    assigneeName: text('assignee_name'),
    assignedBy: integer('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at'),
    teamId: integer('team_id'),

    // Status & Progress
    status: text('status').default('pending').notNull(), // pending, in-progress, review, completed, blocked, cancelled
    priority: text('priority').default('medium').notNull(), // low, medium, high, critical
    progress: integer('progress').default(0), // 0-100
    completionPercentage: integer('completion_percentage').default(0),

    // Dates & Deadlines
    startDate: timestamp('start_date'),
    dueDate: timestamp('due_date'),
    completedAt: timestamp('completed_at'),
    estimatedHours: real('estimated_hours'),
    actualHours: real('actual_hours'),

    // Cross-Module Linkages
    linkedTasks: json('linked_tasks'), // Array of linked task IDs across modules
    dependencies: json('dependencies'), // Task dependencies with type and status
    blockedBy: text('blocked_by').array(), // Task IDs blocking this task
    blocks: text('blocks').array(), // Task IDs this task blocks

    // Enhanced Task Management Fields
    moduleSource: text('module_source'), // Specific source module that created the task
    moduleData: json('module_data'), // Module-specific data and context
    crossModuleLinks: json('cross_module_links'), // Links to tasks in other modules
    automationRules: json('automation_rules'), // Rules for automatic task generation
    escalationPath: json('escalation_path'), // Escalation chain for overdue tasks

    // Approval Workflow
    approvalRequired: boolean('approval_required').default(false),
    approvers: json('approvers'), // List of required approvers
    approvalStatus: text('approval_status'), // pending, partial, approved, rejected
    approvalHistory: json('approval_history'),

    // Impact & Risk
    impactScore: real('impact_score'), // 0-10 score for submission impact
    riskLevel: text('risk_level'), // low, medium, high
    criticalPath: boolean('critical_path').default(false),
    regulatoryImpact: boolean('regulatory_impact').default(false),

    // Notifications & Automation
    notificationSettings: json('notification_settings'),
    automationEnabled: boolean('automation_enabled').default(true),
    aiSuggestions: json('ai_suggestions'),

    // Metadata
    tags: text('tags').array(),
    attachments: json('attachments'),
    comments: json('comments'),
    metadata: json('metadata'),

    // Audit
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    taskIdIdx: index('unified_task_id_idx').on(table.taskId),
    moduleIdx: index('unified_module_idx').on(table.moduleType),
    statusIdx: index('unified_status_idx').on(table.status),
    assigneeIdx: index('unified_assignee_idx').on(table.assigneeId),
    dueDateIdx: index('unified_due_date_idx').on(table.dueDate),
    priorityIdx: index('unified_priority_idx').on(table.priority),
    projectIdx: index('unified_project_idx').on(table.projectId),
  })
);

// Unified Task Insert Schema
export const insertUnifiedTaskSchema = createInsertSchemaOmit(unifiedTasks, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Unified Task Types
export type UnifiedTask = InferSelectModel<typeof unifiedTasks>;
export type InsertUnifiedTask = z.infer<typeof insertUnifiedTaskSchema>;

/**
 * Cross-Module Task Links Table
 *
 * Tracks relationships and dependencies between tasks across different modules.
 */
export const crossModuleTaskLinks = pgTable(
  'cross_module_task_links',
  {
    id: serial('id').primaryKey(),
    linkId: text('link_id').notNull().unique(),

    // Source Task
    sourceTaskId: text('source_task_id')
      .notNull()
      .references(() => unifiedTasks.taskId),
    sourceModule: text('source_module').notNull(),

    // Target Task
    targetTaskId: text('target_task_id')
      .notNull()
      .references(() => unifiedTasks.taskId),
    targetModule: text('target_module').notNull(),

    // Link Details
    linkType: text('link_type').notNull(), // dependency, reference, parent-child, related
    dependencyType: text('dependency_type'), // finish-to-start, start-to-start, etc.
    isBlocking: boolean('is_blocking').default(false),

    // Status
    status: text('status').default('active').notNull(), // active, satisfied, broken

    // Impact Analysis
    impactDescription: text('impact_description'),
    riskLevel: text('risk_level'), // low, medium, high

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    sourceIdx: index('link_source_idx').on(table.sourceTaskId),
    targetIdx: index('link_target_idx').on(table.targetTaskId),
    linkTypeIdx: index('link_type_idx').on(table.linkType),
  })
);

// Cross-Module Task Link Insert Schema
export const insertCrossModuleTaskLinkSchema = createInsertSchemaOmit(crossModuleTaskLinks, {
  id: true,
  createdAt: true,
});

// Cross-Module Task Link Types
export type CrossModuleTaskLink = InferSelectModel<typeof crossModuleTaskLinks>;
export type InsertCrossModuleTaskLink = z.infer<typeof insertCrossModuleTaskLinkSchema>;

/**
 * Task Templates Table
 *
 * Stores reusable task templates for different regulatory submission types and milestones.
 */
export const taskTemplates = pgTable(
  'task_templates',
  {
    id: serial('id').primaryKey(),
    templateId: text('template_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Template Details
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // NDA, ANDA, BLA, IND, milestone, regulatory, etc.
    submissionType: text('submission_type'), // Specific submission type this applies to
    milestone: text('milestone'), // Pre-IND, Phase 1, Phase 2, etc.

    // Template Configuration
    isActive: boolean('is_active').default(true),
    isDefault: boolean('is_default').default(false), // Default template for this category
    version: integer('version').default(1),

    // Task Structure
    tasks: json('tasks').notNull(), // Array of task definitions
    dependencies: json('dependencies'), // Task dependency structure
    milestones: json('milestones'), // Milestone definitions

    // Timing Configuration
    defaultDuration: integer('default_duration'), // Total duration in days
    criticalPath: json('critical_path'), // Pre-calculated critical path

    // Intelligence Features
    bestPractices: text('best_practices'),
    regulatoryRequirements: json('regulatory_requirements'),
    riskFactors: json('risk_factors'),

    // Usage Statistics
    usageCount: integer('usage_count').default(0),
    lastUsedAt: timestamp('last_used_at'),
    averageCompletionTime: real('avg_completion_time'), // In days
    successRate: real('success_rate'), // Percentage

    // Metadata
    tags: text('tags').array(),
    metadata: json('metadata'),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    templateIdIdx: uniqueIndex('template_id_idx').on(table.templateId),
    categoryIdx: index('template_category_idx').on(table.category),
    submissionTypeIdx: index('template_submission_type_idx').on(table.submissionType),
    orgIdx: index('template_org_idx').on(table.organizationId),
  })
);

// Task Template Insert Schema
export const insertTaskTemplateSchema = createInsertSchemaOmit(taskTemplates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Task Template Types
export type TaskTemplate = InferSelectModel<typeof taskTemplates>;
export type InsertTaskTemplate = z.infer<typeof insertTaskTemplateSchema>;

/**
 * Task Automation Rules Table
 *
 * Defines rules for automatic task generation based on events and conditions.
 */
export const taskAutomation = pgTable(
  'task_automation',
  {
    id: serial('id').primaryKey(),
    automationId: text('automation_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Rule Definition
    name: text('name').notNull(),
    description: text('description'),
    ruleType: text('rule_type').notNull(), // event-based, schedule-based, condition-based
    isActive: boolean('is_active').default(true),
    priority: integer('priority').default(50), // 0-100, higher executes first

    // Trigger Configuration
    triggerModule: text('trigger_module'), // Module that triggers this rule
    triggerEvent: text('trigger_event').notNull(), // Event that triggers the rule
    triggerConditions: json('trigger_conditions'), // Additional conditions to check

    // Action Configuration
    actionType: text('action_type').notNull(), // create-task, update-task, notify, escalate
    taskTemplate: json('task_template'), // Template for task creation
    taskDefaults: json('task_defaults'), // Default values for created tasks

    // Advanced Configuration
    delayMinutes: integer('delay_minutes'), // Delay before action execution
    recurringSchedule: json('recurring_schedule'), // For recurring tasks
    maxExecutions: integer('max_executions'), // Maximum times this rule can execute

    // Intelligence Features
    workloadBalancing: boolean('workload_balancing').default(true),
    smartAssignment: json('smart_assignment'), // Rules for intelligent assignment
    riskAssessment: json('risk_assessment'), // Auto risk scoring rules

    // Execution History
    lastExecutedAt: timestamp('last_executed_at'),
    executionCount: integer('execution_count').default(0),
    successCount: integer('success_count').default(0),
    failureCount: integer('failure_count').default(0),

    // Metadata
    tags: text('tags').array(),
    metadata: json('metadata'),
    createdById: integer('created_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    automationIdIdx: uniqueIndex('automation_id_idx').on(table.automationId),
    ruleTypeIdx: index('automation_rule_type_idx').on(table.ruleType),
    triggerModuleIdx: index('automation_trigger_module_idx').on(table.triggerModule),
    triggerEventIdx: index('automation_trigger_event_idx').on(table.triggerEvent),
    orgIdx: index('automation_org_idx').on(table.organizationId),
  })
);

// Task Automation Insert Schema
export const insertTaskAutomationSchema = createInsertSchemaOmit(taskAutomation, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Task Automation Types
export type TaskAutomation = InferSelectModel<typeof taskAutomation>;
export type InsertTaskAutomation = z.infer<typeof insertTaskAutomationSchema>;

/**
 * Task Dependencies Table
 *
 * Manages complex task relationships and dependencies across the system.
 */
export const taskDependencies = pgTable(
  'task_dependencies',
  {
    id: serial('id').primaryKey(),
    dependencyId: text('dependency_id').notNull().unique(),

    // Task References
    predecessorTaskId: text('predecessor_task_id')
      .notNull()
      .references(() => unifiedTasks.taskId),
    successorTaskId: text('successor_task_id')
      .notNull()
      .references(() => unifiedTasks.taskId),

    // Dependency Configuration
    dependencyType: text('dependency_type').notNull(),
    // finish-to-start, start-to-start, finish-to-finish, start-to-finish
    lagTime: integer('lag_time').default(0), // Lag in hours (can be negative)

    // Dependency Status
    status: text('status').default('active').notNull(), // active, satisfied, violated, bypassed
    isCritical: boolean('is_critical').default(false), // Part of critical path
    isBlocking: boolean('is_blocking').default(true), // Blocks successor if not satisfied

    // Impact Analysis
    impactScore: real('impact_score'), // 0-10 impact on timeline
    riskLevel: text('risk_level'), // low, medium, high
    cascadeEffect: json('cascade_effect'), // Downstream impact analysis

    // Validation
    validationRules: json('validation_rules'), // Custom validation rules
    violationReason: text('violation_reason'), // Reason if violated
    bypassReason: text('bypass_reason'), // Reason if bypassed
    bypassedBy: integer('bypassed_by').references(() => users.id),
    bypassedAt: timestamp('bypassed_at'),

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    dependencyIdIdx: uniqueIndex('dependency_id_idx').on(table.dependencyId),
    predecessorIdx: index('dependency_predecessor_idx').on(table.predecessorTaskId),
    successorIdx: index('dependency_successor_idx').on(table.successorTaskId),
    statusIdx: index('dependency_status_idx').on(table.status),
    criticalIdx: index('dependency_critical_idx').on(table.isCritical),
  })
);

// Task Dependencies Insert Schema
export const insertTaskDependencySchema = createInsertSchemaOmit(taskDependencies, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Task Dependencies Types
export type TaskDependency = InferSelectModel<typeof taskDependencies>;
export type InsertTaskDependency = z.infer<typeof insertTaskDependencySchema>;

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
export const insertProjectTemplateSchema = createInsertSchemaOmit(projectTemplates, {
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
 * DOCUMENT TEMPLATES SYSTEM
 * ====================================================================================
 *
 * Database schema for regulatory document templates library
 */

/**
 * Document Templates Table
 *
 * Stores regulatory document templates for eCTD submissions
 */
export const documentTemplates = pgTable(
  'document_templates',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    category: text('category').notNull(), // clinical, nonclinical, quality, administrative
    module: text('module'), // eCTD module reference (e.g., "Module 2.5")
    region: text('region'), // FDA, EMA, PMDA, Health_Canada, TGA
    type: text('type').notNull(), // protocol, report, summary, cover-letter, etc.
    description: text('description'),
    version: text('version').default('1.0.0'),
    content: json('content'), // Template content structure
    placeholders: json('placeholders'), // Template placeholder fields
    tags: text('tags').array(), // Searchable tags
    status: text('status').default('active').notNull(), // active, inactive, archived
    isPublic: boolean('is_public').default(true), // Public templates vs organization-specific
    downloadCount: integer('download_count').default(0),
    ratingAverage: decimal('rating_average', { precision: 3, scale: 2 }).default('0'),
    ratingCount: integer('rating_count').default(0),
    fileUrl: text('file_url'), // Link to actual template file
    fileSize: integer('file_size'), // File size in bytes
    fileType: text('file_type'), // docx, pdf, txt, etc.
    createdById: integer('created_by_id').references(() => users.id),
    lastUsedAt: timestamp('last_used_at'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    categoryIdx: index('document_templates_category_idx').on(table.category),
    moduleIdx: index('document_templates_module_idx').on(table.module),
    regionIdx: index('document_templates_region_idx').on(table.region),
    statusIdx: index('document_templates_status_idx').on(table.status),
    orgIdx: index('document_templates_org_idx').on(table.organizationId),
  })
);

/**
 * Template Usage Tracking Table
 *
 * Tracks when templates are used to create documents
 */
export const templateUsage = pgTable(
  'template_usage',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    templateId: integer('template_id')
      .notNull()
      .references(() => documentTemplates.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    projectId: integer('project_id').references(() => projects.id),
    documentTitle: text('document_title'),
    usageType: text('usage_type').notNull(), // create_new, download, preview
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    templateIdx: index('template_usage_template_idx').on(table.templateId),
    userIdx: index('template_usage_user_idx').on(table.userId),
    dateIdx: index('template_usage_date_idx').on(table.createdAt),
  })
);

/**
 * Recent Documents Table
 *
 * Tracks recently accessed/created documents from templates
 */
export const recentDocuments = pgTable(
  'recent_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    templateId: integer('template_id').references(() => documentTemplates.id),
    title: text('title').notNull(),
    status: text('status').default('draft').notNull(), // draft, in_review, final, submitted
    fileUrl: text('file_url'),
    lastEditedAt: timestamp('last_edited_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    userIdx: index('recent_documents_user_idx').on(table.userId),
    dateIdx: index('recent_documents_date_idx').on(table.lastEditedAt),
  })
);

// Document Templates Insert Schema
export const insertDocumentTemplateSchema = createInsertSchemaOmit(documentTemplates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Template Usage Insert Schema
export const insertTemplateUsageSchema = createInsertSchemaOmit(templateUsage, {
  id: true,
  createdAt: true,
});

// Recent Documents Insert Schema
export const insertRecentDocumentSchema = createInsertSchemaOmit(recentDocuments, {
  id: true,
  createdAt: true,
});

// Document Templates Types
export type DocumentTemplate = InferSelectModel<typeof documentTemplates>;
export type InsertDocumentTemplate = z.infer<typeof insertDocumentTemplateSchema>;

export type TemplateUsage = InferSelectModel<typeof templateUsage>;
export type InsertTemplateUsage = z.infer<typeof insertTemplateUsageSchema>;

export type RecentDocument = InferSelectModel<typeof recentDocuments>;
export type InsertRecentDocument = z.infer<typeof insertRecentDocumentSchema>;

// Document Templates Relations
export const documentTemplatesRelations = relations(documentTemplates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [documentTemplates.organizationId],
    references: [organizations.id],
  }),
  creator: one(users, {
    fields: [documentTemplates.createdById],
    references: [users.id],
  }),
  usage: many(templateUsage),
}));

export const templateUsageRelations = relations(templateUsage, ({ one }) => ({
  organization: one(organizations, {
    fields: [templateUsage.organizationId],
    references: [organizations.id],
  }),
  template: one(documentTemplates, {
    fields: [templateUsage.templateId],
    references: [documentTemplates.id],
  }),
  user: one(users, {
    fields: [templateUsage.userId],
    references: [users.id],
  }),
  project: one(projects, {
    fields: [templateUsage.projectId],
    references: [projects.id],
  }),
}));

export const recentDocumentsRelations = relations(recentDocuments, ({ one }) => ({
  organization: one(organizations, {
    fields: [recentDocuments.organizationId],
    references: [organizations.id],
  }),
  user: one(users, {
    fields: [recentDocuments.userId],
    references: [users.id],
  }),
  template: one(documentTemplates, {
    fields: [recentDocuments.templateId],
    references: [documentTemplates.id],
  }),
}));

/**
 * ====================================================================================
 * MULTI-AGENCY VALIDATION SYSTEM
 * ====================================================================================
 *
 * Database schema for the multi-agency validation system supporting
 * FDA, EMA, PMDA, Health Canada, and TGA regulatory compliance
 */

/**
 * Multi-Agency Validation Sessions Table
 *
 * Tracks validation sessions across multiple regulatory agencies
 */
export const multiAgencyValidationSessions = pgTable(
  'multi_agency_validation_sessions',
  {
    sessionId: uuid('session_id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    documentId: text('document_id').notNull(),
    documentVersionId: text('document_version_id'),
    userId: text('user_id').notNull(),
    tenantId: text('tenant_id').notNull(),
    agencies: text('agencies').array(), // ['FDA', 'EMA', 'PMDA']
    content: text('content'), // Document content
    status: text('status').default('pending').notNull(), // pending, processing, completed, failed
    validationStartedAt: timestamp('validation_started_at').defaultNow().notNull(),
    validationCompletedAt: timestamp('validation_completed_at'),
    totalIssuesFound: integer('total_issues_found').default(0),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sessionOrgIdx: index('validation_sessions_org_idx').on(table.organizationId),
    sessionTenantIdx: index('validation_sessions_tenant_idx').on(table.tenantId),
    sessionDocIdx: index('validation_sessions_doc_idx').on(table.documentId),
    sessionStatusIdx: index('validation_sessions_status_idx').on(table.status),
  })
);

/**
 * Agency Validation Results Table
 *
 * Stores validation results for each agency in a session
 */
export const agencyValidationResults = pgTable(
  'agency_validation_results',
  {
    id: serial('id').primaryKey(),
    sessionId: uuid('session_id')
      .references(() => multiAgencyValidationSessions.sessionId)
      .notNull(),
    agency: text('agency').notNull(), // FDA, EMA, PMDA, Health_Canada, TGA
    complianceScore: decimal('compliance_score', { precision: 5, scale: 2 }),
    issuesFound: integer('issues_found').default(0),
    processingTimeSeconds: integer('processing_time_seconds'),
    validationDetails: json('validation_details'),
    recommendations: json('recommendations'),
    status: text('status').default('pending').notNull(), // pending, completed, failed
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    resultSessionIdx: index('agency_results_session_idx').on(table.sessionId),
    resultAgencyIdx: index('agency_results_agency_idx').on(table.agency),
    resultStatusIdx: index('agency_results_status_idx').on(table.status),
  })
);

/**
 * Validation Issues Table
 *
 * Stores individual validation issues found during multi-agency validation
 */
export const validationIssues = pgTable(
  'validation_issues',
  {
    issueId: uuid('issue_id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => multiAgencyValidationSessions.sessionId)
      .notNull(),
    agency: text('agency').notNull(),
    issueType: text('issue_type').notNull(), // terminology, formatting, content, compliance
    severity: text('severity').notNull(), // critical, major, minor
    description: text('description').notNull(),
    location: text('location'), // Section/page reference
    conflictingRequirements: json('conflicting_requirements'),
    suggestedFix: text('suggested_fix'),
    status: text('status').default('open').notNull(), // open, in_progress, resolved, dismissed
    assignedTo: text('assigned_to'),
    resolvedAt: timestamp('resolved_at'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    issueSessionIdx: index('validation_issues_session_idx').on(table.sessionId),
    issueAgencyIdx: index('validation_issues_agency_idx').on(table.agency),
    issueSeverityIdx: index('validation_issues_severity_idx').on(table.severity),
    issueStatusIdx: index('validation_issues_status_idx').on(table.status),
  })
);

/**
 * Validation Harmonization Opportunities Table
 *
 * Tracks opportunities for harmonizing requirements across agencies
 */
export const validationHarmonizationOpportunities = pgTable(
  'validation_harmonization_opportunities',
  {
    opportunityId: uuid('opportunity_id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .references(() => multiAgencyValidationSessions.sessionId)
      .notNull(),
    agencies: text('agencies').array(), // Agencies that could be harmonized
    requirementType: text('requirement_type').notNull(),
    harmonizationPotential: text('harmonization_potential').notNull(), // high, medium, low
    description: text('description').notNull(),
    suggestedApproach: text('suggested_approach'),
    potentialImpact: text('potential_impact'),
    status: text('status').default('identified').notNull(), // identified, under_review, implemented, dismissed
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    harmSessionIdx: index('harmonization_session_idx').on(table.sessionId),
    harmPotentialIdx: index('harmonization_potential_idx').on(table.harmonizationPotential),
    harmStatusIdx: index('harmonization_status_idx').on(table.status),
  })
);

// Insert schemas for multi-agency validation tables
export const insertMultiAgencyValidationSessionSchema = createInsertSchemaOmit(
  multiAgencyValidationSessions,
  {
    sessionId: true,
    createdAt: true,
    updatedAt: true,
  }
);

export const insertAgencyValidationResultSchema = createInsertSchemaOmit(agencyValidationResults, {
  id: true,
  createdAt: true,
});

export const insertValidationIssueSchema = createInsertSchemaOmit(validationIssues, {
  issueId: true,
  createdAt: true,
});

export const insertValidationHarmonizationOpportunitySchema = createInsertSchemaOmit(
  validationHarmonizationOpportunities,
  {
    opportunityId: true,
    createdAt: true,
  }
);

// Types for multi-agency validation
export type MultiAgencyValidationSession = InferSelectModel<typeof multiAgencyValidationSessions>;
export type InsertMultiAgencyValidationSession = z.infer<
  typeof insertMultiAgencyValidationSessionSchema
>;

export type AgencyValidationResult = InferSelectModel<typeof agencyValidationResults>;
export type InsertAgencyValidationResult = z.infer<typeof insertAgencyValidationResultSchema>;

export type ValidationIssue = InferSelectModel<typeof validationIssues>;
export type InsertValidationIssue = z.infer<typeof insertValidationIssueSchema>;

export type ValidationHarmonizationOpportunity = InferSelectModel<
  typeof validationHarmonizationOpportunities
>;
export type InsertValidationHarmonizationOpportunity = z.infer<
  typeof insertValidationHarmonizationOpportunitySchema
>;

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
export const ectdModules: any = pgTable(
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
 * IND Applications Table
 *
 * Stores IND application data and metadata
 */
export const indApplications = pgTable(
  'ind_applications',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    applicationNumber: text('application_number').unique(),
    sponsorName: text('sponsor_name'),
    drugName: text('drug_name'),
    drugEstablishedName: text('drug_established_name'),
    drugCode: text('drug_code'),
    indication: text('indication'),
    phase: text('phase'), // Phase 1, Phase 2, Phase 3, etc.
    submissionType: text('submission_type'), // initial, amendment, etc.
    submissionDate: date('submission_date'),
    status: text('status').default('draft'), // draft, submitted, approved, rejected
    preIndData: json('pre_ind_data'), // Pre-IND meeting data
    nonclinicalData: json('nonclinical_data'), // Nonclinical study data
    cmcData: json('cmc_data'), // Chemistry, Manufacturing, Controls data
    clinicalProtocolData: json('clinical_protocol_data'), // Clinical protocol data
    investigatorBrochureData: json('investigator_brochure_data'),
    metadata: json('metadata'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    indOrgIdx: index('ind_applications_org_idx').on(table.organizationId),
    indStatusIdx: index('ind_applications_status_idx').on(table.status),
    indPhaseIdx: index('ind_applications_phase_idx').on(table.phase),
  })
);

/**
 * IND Documents Table
 *
 * Stores generated documents from templates for IND applications
 */
export const indDocuments = pgTable(
  'ind_documents',
  {
    id: serial('id').primaryKey(),
    indApplicationId: integer('ind_application_id')
      .references(() => indApplications.id)
      .notNull(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    templateId: integer('template_id').references(() => ectdTemplates.id),
    title: text('title').notNull(),
    content: text('content'),
    documentType: text('document_type'), // form, protocol, report, etc.
    moduleNumber: text('module_number'), // CTD module reference
    version: text('version').default('1.0'),
    status: text('status').default('draft'), // draft, review, approved, finalized
    filePath: text('file_path'), // Path to generated file
    sharepointUrl: text('sharepoint_url'),
    aiGenerated: boolean('ai_generated').default(false),
    aiModel: text('ai_model'), // OpenAI model used
    aiTokensUsed: integer('ai_tokens_used'),
    generationTime: integer('generation_time'), // ms
    approvedBy: integer('approved_by'),
    approvedAt: timestamp('approved_at'),
    metadata: json('metadata'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    indDocOrgIdx: index('ind_documents_org_idx').on(table.organizationId),
    indDocApplicationIdx: index('ind_documents_application_idx').on(table.indApplicationId),
    indDocStatusIdx: index('ind_documents_status_idx').on(table.status),
    indDocModuleIdx: index('ind_documents_module_idx').on(table.moduleNumber),
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

/**
 * Integration Tokens Table
 *
 * Store OAuth tokens for external integrations (Google, Microsoft, etc.)
 */
export const integrationTokens = pgTable(
  'integration_tokens',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .references(() => organizations.id)
      .notNull(),
    userId: integer('user_id')
      .references(() => users.id)
      .notNull(),
    provider: text('provider').notNull(), // google, microsoft, sharepoint, etc.
    accessToken: text('access_token').notNull(),
    refreshToken: text('refresh_token'),
    expiresAt: timestamp('expires_at').notNull(),
    scope: text('scope'), // OAuth scopes
    metadata: json('metadata'), // Additional provider-specific metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    intTokensOrgIdx: index('integration_tokens_org_idx').on(table.organizationId),
    intTokensUserIdx: index('integration_tokens_user_idx').on(table.userId),
    intTokensProviderIdx: index('integration_tokens_provider_idx').on(table.provider),
    intTokensUniqueIdx: uniqueIndex('integration_tokens_unique').on(
      table.organizationId,
      table.userId,
      table.provider
    ),
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
export const structuredObservationTerms = pgTable('structured_observation_terms', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .references(() => organizations.id)
    .notNull(),
  termCode: text('term_code').notNull(),
  name: text('name').notNull(),
  definition: text('definition'),
  category: text('category'),
  subcategory: text('subcategory'),
  terminology: text('terminology'),
  status: text('status').default('active'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Structured Observation Terms Insert Schema
export const insertStructuredObservationTermSchema = createInsertSchemaOmit(
  structuredObservationTerms,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

// Structured Observation Terms Types
export type StructuredObservationTerm = InferSelectModel<typeof structuredObservationTerms>;
export type InsertStructuredObservationTerm = z.infer<typeof insertStructuredObservationTermSchema>;

/**
 * OBLIGATIONS & COMMITMENTS LEDGER
 * ====================================================================================
 *
 * Comprehensive agency commitment management system for tracking regulatory
 * obligations, commitments, and compliance requirements across multiple agencies
 */

/**
 * Regulatory Obligations Table
 *
 * Tracks regulatory obligations and commitments made to agencies
 */
export const regulatoryObligations = pgTable(
  'regulatory_obligations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    submissionId: text('submission_id'), // Associated submission
    obligationType: text('obligation_type').notNull(), // commitment, condition, requirement, post_market
    category: text('category').notNull(), // safety, efficacy, quality, manufacturing, labeling
    title: text('title').notNull(),
    description: text('description').notNull(),
    agency: text('agency').notNull(), // FDA, EMA, PMDA, HC, TGA, etc.
    agencyDivision: text('agency_division'), // CDER, CBER, etc.
    regulatoryPathway: text('regulatory_pathway'), // NDA, ANDA, BLA, 510k, etc.
    dueDate: timestamp('due_date'),
    priority: text('priority').default('medium').notNull(), // critical, high, medium, low
    status: text('status').default('open').notNull(), // open, in_progress, completed, overdue, cancelled
    assignedTo: integer('assigned_to').references(() => users.id),
    sourceDocument: text('source_document'), // Letter, meeting minutes, etc.
    sourceReference: text('source_reference'), // Document reference number
    legalBasis: text('legal_basis'), // CFR reference, guidance, etc.
    consequenceOfNonCompliance: text('consequence_of_non_compliance'),
    complianceEvidence: json('compliance_evidence'), // Supporting evidence
    agencyCorrespondence: json('agency_correspondence'), // Communication history
    milestones: json('milestones'), // Progress milestones
    dependencies: json('dependencies'), // Dependencies on other obligations
    riskAssessment: json('risk_assessment'), // Risk analysis
    businessImpact: text('business_impact'), // high, medium, low
    estimatedCost: decimal('estimated_cost'),
    actualCost: decimal('actual_cost'),
    completionDate: timestamp('completion_date'),
    verificationMethod: text('verification_method'),
    verificationEvidence: text('verification_evidence'),
    reviewCycle: text('review_cycle'), // quarterly, annually, as_needed
    nextReviewDate: timestamp('next_review_date'),
    tags: json('tags'), // Searchable tags
    attachments: json('attachments'), // File attachments
    notes: text('notes'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      orgWorkspaceIdx: index('reg_obligations_org_workspace_idx').on(
        table.organizationId,
        table.clientWorkspaceId
      ),
      statusIdx: index('reg_obligations_status_idx').on(table.status),
      dueDateIdx: index('reg_obligations_due_date_idx').on(table.dueDate),
      agencyIdx: index('reg_obligations_agency_idx').on(table.agency),
      priorityIdx: index('reg_obligations_priority_idx').on(table.priority),
    };
  }
);

/**
 * Commitment Updates & Progress Tracking
 */
export const obligationUpdates = pgTable('obligation_updates', {
  id: serial('id').primaryKey(),
  obligationId: integer('obligation_id')
    .notNull()
    .references(() => regulatoryObligations.id),
  updateType: text('update_type').notNull(), // status_change, progress, correspondence, milestone
  previousStatus: text('previous_status'),
  newStatus: text('new_status'),
  progressPercentage: integer('progress_percentage').default(0),
  description: text('description').notNull(),
  impactAssessment: text('impact_assessment'),
  attachments: json('attachments'),
  agencyResponse: text('agency_response'),
  nextAction: text('next_action'),
  actionDueDate: timestamp('action_due_date'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Agency Communication Log
 */
export const agencyCommunications = pgTable('agency_communications', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  obligationId: integer('obligation_id').references(() => regulatoryObligations.id),
  submissionId: text('submission_id'),
  communicationType: text('communication_type').notNull(), // meeting, email, letter, phone, information_request
  direction: text('direction').notNull(), // inbound, outbound
  agency: text('agency').notNull(),
  agencyContact: text('agency_contact'),
  subject: text('subject').notNull(),
  summary: text('summary').notNull(),
  keyDecisions: json('key_decisions'),
  actionItems: json('action_items'),
  followUpRequired: boolean('follow_up_required').default(false),
  followUpDate: timestamp('follow_up_date'),
  attachments: json('attachments'),
  relatedObligations: integer('related_obligations').array(),
  urgency: text('urgency').default('normal').notNull(), // critical, high, normal, low
  confidentialityLevel: text('confidentiality_level').default('internal').notNull(),
  meetingParticipants: json('meeting_participants'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * Compliance Calendar & Deadlines
 */
export const complianceCalendar = pgTable('compliance_calendar', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  obligationId: integer('obligation_id').references(() => regulatoryObligations.id),
  eventType: text('event_type').notNull(), // deadline, review, meeting, submission
  title: text('title').notNull(),
  description: text('description'),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  allDay: boolean('all_day').default(false),
  location: text('location'),
  participants: json('participants'),
  agency: text('agency'),
  priority: text('priority').default('medium').notNull(),
  status: text('status').default('scheduled').notNull(), // scheduled, completed, cancelled, rescheduled
  reminderSettings: json('reminder_settings'),
  recurrenceRule: text('recurrence_rule'), // RFC 5545 RRULE
  timezone: text('timezone').default('UTC'),
  createdBy: integer('created_by')
    .notNull()
    .references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Obligation Insert Schemas
export const insertRegulatoryObligationSchema = createInsertSchemaOmit(regulatoryObligations, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertObligationUpdateSchema = createInsertSchemaOmit(obligationUpdates, {
  id: true,
  createdAt: true,
});

export const insertAgencyCommunicationSchema = createInsertSchemaOmit(agencyCommunications, {
  id: true,
  createdAt: true,
});

export const insertComplianceCalendarSchema = createInsertSchemaOmit(complianceCalendar, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * REGULATORY STEP 7: Obligations & Commitments Ledger (Per Specification)
 * ====================================================================================
 */

// Core obligation record (per specification) - matches existing UUID patterns exactly
export const regObligations = pgTable(
  'reg_obligations',
  {
    oblId: uuid('obl_id').primaryKey().defaultRandom(),
    subId: uuid('sub_id').notNull(), // references reg_submissions(sub_id)
    productId: text('product_id').notNull(),
    region: text('region'), // 'FDA','EMA','PMDA', ...
    title: text('title').notNull(),
    source: text('source').notNull().default('AGENCY'), // 'AGENCY','APPROVAL','IR','INTERNAL'
    severity: text('severity').notNull().default('MAJOR'), // 'CRITICAL','MAJOR','MINOR'
    status: text('status').notNull().default('OPEN'), // 'OPEN','IN_PROGRESS','COMPLETED','DEFERRED','CANCELLED'
    dueDate: timestamp('due_date'),
    recurrence: json('recurrence').notNull().default('{}'), // {freq:'YEARLY'|'QUARTERLY'|'MONTHLY', interval:1, until?:'YYYY-MM-DD'}
    ownerUserId: uuid('owner_user_id'),
    priority: text('priority').notNull().default('High'),
    evidence: json('evidence').notNull().default('[]'), // linked artifacts at creation
    links: json('links').notNull().default('[]'), // [{entity:'SECTION|LEAF|SPEC|CPP|STUDY', id:'...', code?:'3.2.P.8'}]
    note: text('note'),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    closedAt: timestamp('closed_at'),
  },
  table => ({
    subDueIdx: index('idx_reg_obl_sub_due').on(table.subId, table.dueDate),
    statusIdx: index('idx_reg_obl_status').on(table.status),
  })
);

// Event log (audit)
export const regObligationEvents = pgTable('reg_obligation_events', {
  evtId: uuid('evt_id').primaryKey().defaultRandom(),
  oblId: uuid('obl_id')
    .notNull()
    .references(() => regObligations.oblId, { onDelete: 'cascade' }),
  event: text('event').notNull(), // 'CREATED','AI_EXTRACT','ASSIGNED','SNOOZED','COMPLETED'
  byUser: text('by_user'),
  payloadJson: json('payload_json').notNull().default('{}'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Optional templates (seed obligations by region/product type)
export const regObligationTemplates = pgTable('reg_obligation_templates', {
  tplId: uuid('tpl_id').primaryKey().defaultRandom(),
  region: text('region'),
  title: text('title').notNull(),
  defaultSeverity: text('default_severity').notNull().default('MAJOR'),
  defaultRecurrence: json('default_recurrence').notNull().default('{}'), // e.g., {"freq":"YEARLY","interval":1}
  defaultLinks: json('default_links').notNull().default('[]'),
});

// Insert Schemas for new tables
export const insertRegObligationSchema = createInsertSchemaOmit(regObligations, {
  oblId: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegObligationEventSchema = createInsertSchemaOmit(regObligationEvents, {
  evtId: true,
  createdAt: true,
});

export const insertRegObligationTemplateSchema = createInsertSchemaOmit(regObligationTemplates, {
  tplId: true,
});

// Types for new tables
export type RegObligation = InferSelectModel<typeof regObligations>;
export type InsertRegObligation = z.infer<typeof insertRegObligationSchema>;

export type RegObligationEvent = InferSelectModel<typeof regObligationEvents>;
export type InsertRegObligationEvent = z.infer<typeof insertRegObligationEventSchema>;

export type RegObligationTemplate = InferSelectModel<typeof regObligationTemplates>;
export type InsertRegObligationTemplate = z.infer<typeof insertRegObligationTemplateSchema>;

// Legacy obligation types (keep for compatibility)
export type RegulatoryObligation = InferSelectModel<typeof regulatoryObligations>;
export type InsertRegulatoryObligation = z.infer<typeof insertRegulatoryObligationSchema>;

export type ObligationUpdate = InferSelectModel<typeof obligationUpdates>;
export type InsertObligationUpdate = z.infer<typeof insertObligationUpdateSchema>;

export type AgencyCommunication = InferSelectModel<typeof agencyCommunications>;
export type InsertAgencyCommunication = z.infer<typeof insertAgencyCommunicationSchema>;

export type ComplianceCalendar = InferSelectModel<typeof complianceCalendar>;
export type InsertComplianceCalendar = z.infer<typeof insertComplianceCalendarSchema>;

/**
 * Design of Experiments (DOE) Tables
 *
 * Support for statistical design of experiments functionality
 */

// DOE Studies Table
export const doeStudies = pgTable('doe_studies', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  processId: varchar('process_id').notNull(),
  name: text('name').notNull(),
  description: text('description'),
  designType: text('design_type').notNull(), // factorial, fractional_factorial, response_surface, etc.
  status: text('status').default('planning').notNull(), // planning, active, completed, cancelled
  objectives: json('objectives'), // Array of objectives
  constraints: json('constraints'), // Array of constraints
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DOE Factors Table
export const doeFactors = pgTable('doe_factors', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studyId: varchar('study_id')
    .notNull()
    .references(() => doeStudies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').default('continuous').notNull(), // continuous, discrete, categorical
  unit: text('unit'),
  lowLevel: text('low_level'), // String to handle both numeric and categorical
  highLevel: text('high_level'),
  centerPoint: text('center_point'),
  levels: json('levels'), // For categorical factors
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DOE Responses Table
export const doeResponses = pgTable('doe_responses', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studyId: varchar('study_id')
    .notNull()
    .references(() => doeStudies.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description'),
  unit: text('unit'),
  target: decimal('target', { precision: 15, scale: 6 }),
  targetType: text('target_type').default('maximize'), // minimize, maximize, target
  lowerLimit: decimal('lower_limit', { precision: 15, scale: 6 }),
  upperLimit: decimal('upper_limit', { precision: 15, scale: 6 }),
  importance: integer('importance').default(1), // 1-5 scale
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DOE Experiments (Runs) Table
export const doeExperiments = pgTable('doe_experiments', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studyId: varchar('study_id')
    .notNull()
    .references(() => doeStudies.id, { onDelete: 'cascade' }),
  runOrder: integer('run_order').notNull(),
  standardOrder: integer('standard_order'),
  blockNumber: integer('block_number').default(1),
  factorSettings: json('factor_settings').notNull(), // {factorId: value}
  responseValues: json('response_values'), // {responseId: value}
  status: text('status').default('planned').notNull(), // planned, running, completed, failed
  notes: text('notes'),
  conductedBy: text('conducted_by'),
  conductedAt: timestamp('conducted_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DOE Analysis Results Table
export const doeAnalysisResults = pgTable('doe_analysis_results', {
  id: varchar('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  studyId: varchar('study_id')
    .notNull()
    .references(() => doeStudies.id, { onDelete: 'cascade' }),
  responseId: varchar('response_id')
    .notNull()
    .references(() => doeResponses.id, { onDelete: 'cascade' }),
  analysisType: text('analysis_type').notNull(), // anova, regression, optimization
  model: json('model'), // Model coefficients and statistics
  statistics: json('statistics'), // R-squared, p-values, etc.
  predictions: json('predictions'), // Predicted values
  residuals: json('residuals'), // Residual analysis
  optimizationResults: json('optimization_results'), // Optimal settings
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// DOE Insert Schemas
export const insertDoeStudySchema = createInsertSchemaOmit(doeStudies, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDoeFactorSchema = createInsertSchemaOmit(doeFactors, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDoeResponseSchema = createInsertSchemaOmit(doeResponses, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDoeExperimentSchema = createInsertSchemaOmit(doeExperiments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDoeAnalysisResultSchema = createInsertSchemaOmit(doeAnalysisResults, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// DOE Types
export type DoeStudy = InferSelectModel<typeof doeStudies>;
export type InsertDoeStudy = z.infer<typeof insertDoeStudySchema>;

export type DoeFactor = InferSelectModel<typeof doeFactors>;
export type InsertDoeFactor = z.infer<typeof insertDoeFactorSchema>;

export type DoeResponse = InferSelectModel<typeof doeResponses>;
export type InsertDoeResponse = z.infer<typeof insertDoeResponseSchema>;

export type DoeExperiment = InferSelectModel<typeof doeExperiments>;
export type InsertDoeExperiment = z.infer<typeof insertDoeExperimentSchema>;

export type DoeAnalysisResult = InferSelectModel<typeof doeAnalysisResults>;
export type InsertDoeAnalysisResult = z.infer<typeof insertDoeAnalysisResultSchema>;

/**
 * =============================================================================
 * GxP PHARMACEUTICAL SUPPLY CHAIN MANAGEMENT SCHEMA
 * =============================================================================
 *
 * Enterprise-grade data models for pharmaceutical supply chain management
 * following regulatory requirements (21 CFR Part 11, ICH Q7-Q10, EU GDP)
 */

/**
 * Supply Chain Organizations Table
 *
 * Represents different types of organizations in the pharmaceutical supply chain
 * (manufacturing sites, suppliers, distributors, testing labs, etc.)
 */
export const supplyChainOrganizations = pgTable(
  'supply_chain_organizations',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    organizationType: text('organization_type').notNull(), // manufacturer, supplier, distributor, testing_lab, warehouse
    regulatoryClass: text('regulatory_class').notNull(), // gmp, gdp, gcp, glp, iso
    duns: text('duns'), // D-U-N-S Number
    registrationNumber: text('registration_number'), // FDA registration, EMA number, etc.
    address: json('address').notNull(), // Full address object
    contactInfo: json('contact_info').notNull(),
    qualificationStatus: text('qualification_status').default('pending').notNull(), // pending, qualified, disqualified, suspended
    qualificationDate: timestamp('qualification_date'),
    qualifiedBy: integer('qualified_by').references(() => users.id),
    auditDate: timestamp('audit_date'),
    auditScore: integer('audit_score'), // 0-100 audit score
    certifications: text('certifications').array(), // ['ISO9001', 'ISO13485', 'GMP_EU', 'FDA_510K']
    capabilities: text('capabilities').array(), // ['drug_substance', 'drug_product', 'packaging', 'testing']
    riskLevel: text('risk_level').default('medium').notNull(), // low, medium, high, critical
    status: text('status').default('active').notNull(), // active, inactive, suspended, terminated
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      tenantOrgIdx: index('supply_chain_orgs_tenant_idx').on(table.tenantId),
      typeIdx: index('supply_chain_orgs_type_idx').on(table.organizationType),
      statusIdx: index('supply_chain_orgs_status_idx').on(table.status),
      dunsUnique: uniqueIndex('supply_chain_orgs_duns_unique').on(table.duns),
    };
  }
);

// Supply Chain Organization Insert Schema
export const insertSupplyChainOrganizationSchema = createInsertSchemaOmit(
  supplyChainOrganizations,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

// Supply Chain Organization Types
export type SupplyChainOrganization = InferSelectModel<typeof supplyChainOrganizations>;
export type InsertSupplyChainOrganization = z.infer<typeof insertSupplyChainOrganizationSchema>;

/**
 * Materials Master Table
 *
 * Central registry for all materials used in pharmaceutical manufacturing
 * (drug substances, drug products, excipients, components, raw materials)
 */
export const materials = pgTable(
  'materials',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    materialCode: text('material_code').notNull(), // Internal material code
    materialName: text('material_name').notNull(),
    materialType: text('material_type').notNull(), // drug_substance, drug_product, excipient, component, raw_material, packaging
    manufacturerSku: text('manufacturer_sku'), // Manufacturer's SKU/Part Number
    casNumber: text('cas_number'), // CAS Registry Number
    einecs: text('einecs'), // European Inventory number
    molecularFormula: text('molecular_formula'),
    molecularWeight: decimal('molecular_weight', { precision: 10, scale: 4 }),
    physicalForm: text('physical_form'), // solid, liquid, gas, powder, granules
    storageConditions: text('storage_conditions').array(), // ['room_temp', 'refrigerated', 'frozen', 'light_protected']
    hazardClassification: text('hazard_classification').array(), // ['explosive', 'flammable', 'toxic', 'corrosive']
    shelfLifeMonths: integer('shelf_life_months'),
    reorderLevel: integer('reorder_level'),
    reorderQuantity: integer('reorder_quantity'),
    unitOfMeasure: text('unit_of_measure').notNull(), // kg, L, pieces, vials
    costPerUnit: decimal('cost_per_unit', { precision: 12, scale: 4 }),
    currency: text('currency').default('USD'),
    regulatoryStatus: text('regulatory_status').default('approved').notNull(), // approved, pending, rejected, withdrawn
    controlledSubstance: boolean('controlled_substance').default(false),
    scheduleClass: text('schedule_class'), // DEA schedule classification
    supplierOrgId: integer('supplier_org_id').references(() => supplyChainOrganizations.id),
    qualityGrade: text('quality_grade'), // pharma, reagent, technical, analytical
    specifications: json('specifications'), // Detailed quality specifications
    safetyDataSheet: json('safety_data_sheet'), // SDS information
    certificates: text('certificates').array(), // ['coa', 'halal', 'kosher', 'organic']
    customsCode: text('customs_code'), // HS/HTS code
    countryOfOrigin: text('country_of_origin'),
    status: text('status').default('active').notNull(), // active, inactive, discontinued, obsolete
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      tenantIdx: index('materials_tenant_idx').on(table.tenantId),
      codeUnique: uniqueIndex('materials_code_unique').on(table.tenantId, table.materialCode),
      typeIdx: index('materials_type_idx').on(table.materialType),
      supplierIdx: index('materials_supplier_idx').on(table.supplierOrgId),
      statusIdx: index('materials_status_idx').on(table.status),
      casIdx: index('materials_cas_idx').on(table.casNumber),
    };
  }
);

// Material Insert Schema
export const insertMaterialSchema = createInsertSchemaOmit(materials, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Material Types
export type Material = InferSelectModel<typeof materials>;
export type InsertMaterial = z.infer<typeof insertMaterialSchema>;

/**
 * Batches/Lots Table
 *
 * Represents manufacturing batches/lots with complete traceability
 * and genealogy tracking for pharmaceutical manufacturing
 */
export const batches = pgTable(
  'batches',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    batchNumber: text('batch_number').notNull(),
    materialId: integer('material_id')
      .notNull()
      .references(() => materials.id),
    manufacturingOrgId: integer('manufacturing_org_id')
      .notNull()
      .references(() => supplyChainOrganizations.id),
    batchSize: decimal('batch_size', { precision: 15, scale: 6 }).notNull(),
    batchSizeUnit: text('batch_size_unit').notNull(), // kg, L, pieces
    manufacturedDate: date('manufactured_date').notNull(),
    expiryDate: date('expiry_date').notNull(),
    retestDate: date('retest_date'),
    quarantineUntil: date('quarantine_until'),
    batchStatus: text('batch_status').default('quarantine').notNull(),
    // quarantine, qc_testing, released, rejected, recalled, expired, destroyed
    releaseDate: date('release_date'),
    releasedBy: integer('released_by').references(() => users.id),
    rejectionReason: text('rejection_reason'),
    recallDate: date('recall_date'),
    recallReason: text('recall_reason'),
    destructionDate: date('destruction_date'),
    potency: decimal('potency', { precision: 8, scale: 4 }), // % of label claim
    yield: decimal('yield', { precision: 8, scale: 4 }), // Manufacturing yield %
    processParameters: json('process_parameters'), // Temperature, pressure, time, etc.
    environmentalConditions: json('environmental_conditions'), // Temp, humidity during mfg
    equipmentUsed: text('equipment_used').array(), // Equipment IDs/names
    personnelInvolved: text('personnel_involved').array(), // Personnel IDs
    qualityRemarks: text('quality_remarks'),
    storageLocation: text('storage_location'),
    currentQuantity: decimal('current_quantity', { precision: 15, scale: 6 }),
    originalQuantity: decimal('original_quantity', { precision: 15, scale: 6 }),
    reservedQuantity: decimal('reserved_quantity', { precision: 15, scale: 6 }).default('0'),
    parentBatches: text('parent_batches').array(), // Parent batch genealogy
    childBatches: text('child_batches').array(), // Child batch genealogy
    costPerUnit: decimal('cost_per_unit', { precision: 12, scale: 4 }),
    totalCost: decimal('total_cost', { precision: 15, scale: 4 }),
    barcode: text('barcode'),
    qrCode: text('qr_code'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      tenantIdx: index('batches_tenant_idx').on(table.tenantId),
      batchNumberUnique: uniqueIndex('batches_number_unique').on(table.tenantId, table.batchNumber),
      materialIdx: index('batches_material_idx').on(table.materialId),
      statusIdx: index('batches_status_idx').on(table.batchStatus),
      mfgOrgIdx: index('batches_mfg_org_idx').on(table.manufacturingOrgId),
      mfgDateIdx: index('batches_mfg_date_idx').on(table.manufacturedDate),
      expiryIdx: index('batches_expiry_idx').on(table.expiryDate),
      barcodeIdx: index('batches_barcode_idx').on(table.barcode),
    };
  }
);

// Batch Insert Schema
export const insertBatchSchema = createInsertSchemaOmit(batches, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Batch Types
export type Batch = InferSelectModel<typeof batches>;
export type InsertBatch = z.infer<typeof insertBatchSchema>;

/**
 * Batch Genealogy Table
 *
 * Tracks the parent-child relationships between batches for complete traceability
 * (e.g., API batch -> Blend batch -> Final Product batch)
 */
export const batchGenealogy = pgTable(
  'batch_genealogy',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    childBatchId: integer('child_batch_id')
      .notNull()
      .references(() => batches.id),
    parentBatchId: integer('parent_batch_id')
      .notNull()
      .references(() => batches.id),
    quantityUsed: decimal('quantity_used', { precision: 15, scale: 6 }).notNull(),
    quantityUnit: text('quantity_unit').notNull(),
    usageDate: date('usage_date').notNull(),
    processStep: text('process_step'), // blending, coating, encapsulation, etc.
    operatorId: integer('operator_id').references(() => users.id),
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => {
    return {
      tenantIdx: index('batch_genealogy_tenant_idx').on(table.tenantId),
      childIdx: index('batch_genealogy_child_idx').on(table.childBatchId),
      parentIdx: index('batch_genealogy_parent_idx').on(table.parentBatchId),
      uniqueRelation: uniqueIndex('batch_genealogy_unique').on(
        table.childBatchId,
        table.parentBatchId
      ),
    };
  }
);

// Batch Genealogy Insert Schema
export const insertBatchGenealogySchema = createInsertSchemaOmit(batchGenealogy, {
  id: true,
  createdAt: true,
});

// Batch Genealogy Types
export type BatchGenealogy = InferSelectModel<typeof batchGenealogy>;
export type InsertBatchGenealogy = z.infer<typeof insertBatchGenealogySchema>;

// ============================================================================
// SHIPMENTS & COLD CHAIN MONITORING
// ============================================================================

export const supplyChainShipments = pgTable(
  'supply_chain_shipments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    shipmentNumber: varchar('shipment_number', { length: 100 }).notNull(),
    // Shipment Details
    shipmentType: varchar('shipment_type', { length: 50 }).notNull(), // inbound, outbound, transfer
    shipmentStatus: varchar('shipment_status', { length: 50 }).default('planned').notNull(),
    // planned, picked, packed, shipped, in_transit, delivered, received
    // Origin & Destination
    originSupplierId: integer('origin_supplier_id').references(() => supplyChainSuppliers.id),
    destinationSupplierId: integer('destination_supplier_id').references(
      () => supplyChainSuppliers.id
    ),
    originAddress: text('origin_address'),
    destinationAddress: text('destination_address'),
    // Logistics Information
    carrierId: integer('carrier_id').references(() => supplyChainSuppliers.id),
    trackingNumber: varchar('tracking_number', { length: 100 }),
    carrierService: text('carrier_service'), // Express, Standard, Overnight
    transportMode: varchar('transport_mode', { length: 50 }), // Road, Air, Sea, Rail
    // Timing
    plannedShipDate: timestamp('planned_ship_date'),
    actualShipDate: timestamp('actual_ship_date'),
    plannedDeliveryDate: timestamp('planned_delivery_date'),
    actualDeliveryDate: timestamp('actual_delivery_date'),
    // Cold Chain Requirements
    temperatureMin: decimal('temperature_min', { precision: 5, scale: 2 }), // °C
    temperatureMax: decimal('temperature_max', { precision: 5, scale: 2 }), // °C
    humidityMin: decimal('humidity_min', { precision: 5, scale: 2 }), // %RH
    humidityMax: decimal('humidity_max', { precision: 5, scale: 2 }), // %RH
    // Cold Chain Monitoring
    temperatureMonitoringDevice: text('temperature_monitoring_device'),
    deviceCalibrationDate: date('device_calibration_date'),
    temperatureExcursions: json('temperature_excursions'),
    coldChainIntact: boolean('cold_chain_intact').default(true),
    // GDP (Good Distribution Practice) Compliance
    gdpCompliance: boolean('gdp_compliance').default(true),
    qualifiedPerson: text('qualified_person'), // QP responsible
    // Documentation
    packingList: json('packing_list'), // batch numbers and quantities
    shippingDocuments: json('shipping_documents'),
    customsClearance: json('customs_clearance'),
    // Metadata
    notes: text('notes'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    shipmentNumberOrg: uniqueIndex('shipment_number_org_idx').on(
      table.shipmentNumber,
      table.organizationId
    ),
    statusIdx: index('shipment_status_idx').on(table.shipmentStatus),
    trackingIdx: index('tracking_number_idx').on(table.trackingNumber),
    coldChainIdx: index('cold_chain_intact_idx').on(table.coldChainIntact),
  })
);

export const supplyChainTemperatureReadings = pgTable(
  'supply_chain_temperature_readings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    shipmentId: integer('shipment_id')
      .notNull()
      .references(() => supplyChainShipments.id),
    deviceId: text('device_id').notNull(),
    readingTime: timestamp('reading_time').notNull(),
    temperature: decimal('temperature', { precision: 5, scale: 2 }).notNull(), // °C
    humidity: decimal('humidity', { precision: 5, scale: 2 }), // %RH
    location: text('location'), // GPS coordinates or location name
    batteryLevel: integer('battery_level'), // percentage
    // Data Quality
    dataQuality: varchar('data_quality', { length: 20 }).default('good'), // good, questionable, bad
    calibrationStatus: varchar('calibration_status', { length: 20 }).default('valid'),
    // Excursion Detection
    isExcursion: boolean('is_excursion').default(false),
    excursionType: varchar('excursion_type', { length: 20 }), // high, low, duration
    // Metadata
    rawData: json('raw_data'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    shipmentTimeIdx: index('temp_reading_shipment_time_idx').on(
      table.shipmentId,
      table.readingTime
    ),
    deviceTimeIdx: index('temp_reading_device_time_idx').on(table.deviceId, table.readingTime),
    excursionIdx: index('temp_reading_excursion_idx').on(table.isExcursion),
  })
);

// ============================================================================
// CERTIFICATES OF ANALYSIS (COAs)
// ============================================================================

export const supplyChainCOAs = pgTable(
  'supply_chain_coas',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    coaNumber: varchar('coa_number', { length: 100 }).notNull(),
    batchId: integer('batch_id')
      .notNull()
      .references(() => supplyChainBatches.id),
    materialId: integer('material_id')
      .notNull()
      .references(() => supplyChainMaterials.id),
    // COA Information
    coaVersion: varchar('coa_version', { length: 20 }).default('1.0'),
    coaStatus: varchar('coa_status', { length: 50 }).default('draft').notNull(),
    // draft, under_review, approved, superseded
    issuedDate: date('issued_date'),
    effectiveDate: date('effective_date'),
    expiryDate: date('expiry_date'),
    // Testing Information
    testingLaboratory: text('testing_laboratory'),
    testingStartDate: date('testing_start_date'),
    testingEndDate: date('testing_end_date'),
    analystName: text('analyst_name'),
    // Specifications & Results
    specificationVersion: varchar('specification_version', { length: 20 }),
    testResults: json('test_results'), // array of test parameters with results and specs
    overallResult: varchar('overall_result', { length: 20 }).default('pending'), // pass, fail, pending
    outOfSpecifications: json('out_of_specifications'), // OOS results requiring investigation
    // Approval Workflow
    reviewedBy: text('reviewed_by'),
    reviewedDate: date('reviewed_date'),
    approvedBy: text('approved_by'), // Quality Person
    approvedDate: date('approved_date'),
    // Digital Signature & 21 CFR Part 11
    digitalSignature: text('digital_signature'),
    signatureTimestamp: timestamp('signature_timestamp'),
    auditTrail: json('audit_trail'),
    // Metadata
    notes: text('notes'),
    attachments: json('attachments'), // chromatograms, spectra, etc.
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    coaNumberOrg: uniqueIndex('coa_number_org_idx').on(table.coaNumber, table.organizationId),
    batchCoaIdx: index('coa_batch_idx').on(table.batchId),
    statusIdx: index('coa_status_idx').on(table.coaStatus),
    resultIdx: index('coa_result_idx').on(table.overallResult),
  })
);

// ============================================================================
// DEVIATIONS & CAPAs (Corrective and Preventive Actions)
// ============================================================================

export const deviations = pgTable(
  'deviations',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    deviationNumber: varchar('deviation_number', { length: 100 }).notNull(),
    // Classification
    deviationType: varchar('deviation_type', { length: 50 }).notNull(),
    // manufacturing, quality, supply_chain, cold_chain, documentation
    severity: varchar('severity', { length: 20 }).notNull(), // critical, major, minor
    impact: varchar('impact', { length: 50 }), // product_quality, safety, compliance, delivery
    // Related Entities
    batchId: integer('batch_id').references(() => batches.id),
    materialId: integer('material_id').references(() => materials.id),
    shipmentId: integer('shipment_id'),
    supplierId: integer('supplier_id'),
    // Deviation Details
    title: text('title').notNull(),
    description: text('description').notNull(),
    discoveryDate: timestamp('discovery_date').notNull(),
    discoveredBy: text('discovered_by').notNull(),
    location: text('location'),
    // Investigation
    investigationRequired: boolean('investigation_required').default(true),
    investigationStatus: varchar('investigation_status', { length: 50 }).default('not_started'),
    // not_started, in_progress, completed, closed
    rootCause: text('root_cause'),
    immediateAction: text('immediate_action'),
    // CAPA (Corrective and Preventive Action)
    correctiveActions: json('corrective_actions'),
    preventiveActions: json('preventive_actions'),
    capaRequired: boolean('capa_required').default(false),
    // Status & Workflow
    status: varchar('status', { length: 50 }).default('open').notNull(),
    // open, under_investigation, capa_pending, resolved, closed
    priority: varchar('priority', { length: 20 }).default('medium'), // high, medium, low
    assignedTo: text('assigned_to'),
    dueDate: date('due_date'),
    closedDate: date('closed_date'),
    closedBy: text('closed_by'),
    // Regulatory Impact
    regulatoryReportingRequired: boolean('regulatory_reporting_required').default(false),
    regulatoryNotificationDate: date('regulatory_notification_date'),
    // Quality Impact
    qualityImpactAssessment: text('quality_impact_assessment'),
    batchDisposition: varchar('batch_disposition', { length: 50 }), // accept, reject, rework, retest
    // Metadata
    attachments: json('attachments'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    deviationNumberOrg: uniqueIndex('deviation_number_org_idx').on(
      table.deviationNumber,
      table.organizationId
    ),
    statusIdx: index('deviation_status_idx').on(table.status),
    severityIdx: index('deviation_severity_idx').on(table.severity),
    assignedIdx: index('deviation_assigned_idx').on(table.assignedTo),
    batchDeviationIdx: index('deviation_batch_idx').on(table.batchId),
  })
);

// ============================================================================
// AUDIT TRAIL & 21 CFR PART 11 COMPLIANCE
// ============================================================================

export const auditEvents = pgTable(
  'audit_events',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    // Event Information
    eventType: varchar('event_type', { length: 100 }).notNull(),
    // create, update, delete, approve, release, sign, etc.
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    // batch, material, supplier, coa, deviation, etc.
    entityId: integer('entity_id').notNull(),
    // User & Session
    userId: integer('user_id').references(() => users.id),
    userName: text('user_name').notNull(),
    userRole: text('user_role'),
    sessionId: text('session_id'),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    // Timing (21 CFR Part 11 requirement)
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    timestampUtc: timestamp('timestamp_utc').defaultNow().notNull(),
    // Change Information
    oldValues: json('old_values'), // before state
    newValues: json('new_values'), // after state
    changedFields: json('changed_fields'), // array of field names
    // Reason & Comments (21 CFR Part 11 requirement)
    reason: text('reason'), // why was this change made
    comments: text('comments'),
    // Digital Signature (if applicable)
    requiresSignature: boolean('requires_signature').default(false),
    signatureStatus: varchar('signature_status', { length: 50 }), // pending, signed, rejected
    signedBy: text('signed_by'),
    signedDate: timestamp('signed_date'),
    signatureMeaning: text('signature_meaning'), // "Approved by", "Reviewed by", etc.
    // System Information
    applicationVersion: text('application_version'),
    systemVersion: text('system_version'),
    // Compliance
    regulatorySignificant: boolean('regulatory_significant').default(false),
    gxpRelevant: boolean('gxp_relevant').default(false),
    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    entityEventIdx: index('audit_entity_event_idx').on(
      table.entityType,
      table.entityId,
      table.eventType
    ),
    auditEventTimestampIdx: index('audit_event_timestamp_idx').on(table.timestamp),
    userEventIdx: index('audit_user_event_idx').on(table.userId, table.eventType),
    regulatoryIdx: index('audit_regulatory_idx').on(table.regulatorySignificant),
    gxpIdx: index('audit_gxp_idx').on(table.gxpRelevant),
  })
);

// ============================================================================
// REGULATORY MANAGEMENT - COMPREHENSIVE MULTI-AGENCY COMPLIANCE
// ============================================================================

// Regulatory Agencies Master
export const regulatoryAgencies = pgTable(
  'regulatory_agencies',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    agencyCode: varchar('agency_code', { length: 10 }).notNull(), // FDA, EMA, PMDA, HC, WHO, TGA
    agencyName: text('agency_name').notNull(),
    region: varchar('region', { length: 50 }).notNull(),
    country: varchar('country', { length: 100 }),
    contactInfo: json('contact_info'),
    requirements: json('requirements'), // region-specific requirements
    isActive: boolean('is_active').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    agencyCodeOrg: uniqueIndex('agency_code_org_idx').on(table.agencyCode, table.organizationId),
  })
);

// Multi-Agency Compliance Tracking
export const complianceTracking = pgTable(
  'compliance_tracking',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    productId: varchar('product_id', { length: 100 }).notNull(),
    agencyId: integer('agency_id')
      .notNull()
      .references(() => regulatoryAgencies.id),
    complianceStatus: varchar('compliance_status', { length: 50 }).default('pending'),
    // pending, compliant, non_compliant, in_review, under_assessment
    complianceScore: decimal('compliance_score', { precision: 5, scale: 2 }),
    lastAssessmentDate: date('last_assessment_date'),
    nextAssessmentDate: date('next_assessment_date'),
    requirements: json('requirements'), // specific requirements for this product/agency
    findings: json('findings'), // compliance findings and gaps
    remediationActions: json('remediation_actions'),
    riskLevel: varchar('risk_level', { length: 20 }).default('medium'),
    assignedTo: text('assigned_to'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    productAgencyIdx: uniqueIndex('product_agency_idx').on(table.productId, table.agencyId),
    complianceStatusIdx: index('compliance_status_idx').on(table.complianceStatus),
  })
);

// Regulatory Submissions - Moved to line 6311 for enhanced version with intelligent task management
// This table has been replaced with a more comprehensive version below

// Agency Correspondence Management
export const agencyCorrespondence = pgTable(
  'agency_correspondence',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    submissionId: integer('submission_id').references(() => regulatorySubmissions.id),
    correspondenceNumber: varchar('correspondence_number', { length: 100 }).notNull(),
    correspondenceType: varchar('correspondence_type', { length: 50 }).notNull(),
    // IR, RTF, CRL, approval_letter, meeting_minutes, guidance_request
    direction: varchar('direction', { length: 20 }).notNull(), // inbound, outbound
    agencyId: integer('agency_id')
      .notNull()
      .references(() => regulatoryAgencies.id),
    subject: text('subject').notNull(),
    content: text('content'),
    receivedDate: date('received_date'),
    responseDeadline: date('response_deadline'),
    responseDate: date('response_date'),
    status: varchar('status', { length: 50 }).default('pending'),
    // pending, in_progress, responded, overdue, closed
    priority: varchar('priority', { length: 20 }).default('medium'),
    assignedTo: text('assigned_to'),
    documents: json('documents'),
    versionHistory: json('version_history'),
    threadId: varchar('thread_id', { length: 100 }),
    parentCorrespondenceId: integer('parent_correspondence_id'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    correspondenceNumberOrg: uniqueIndex('correspondence_number_org_idx').on(
      table.correspondenceNumber,
      table.organizationId
    ),
    statusIdx: index('correspondence_status_idx').on(table.status),
    deadlineIdx: index('correspondence_deadline_idx').on(table.responseDeadline),
    threadIdx: index('correspondence_thread_idx').on(table.threadId),
  })
);

// Regulatory Intelligence & Updates
export const regulatoryIntelligence = pgTable(
  'regulatory_intelligence',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    intelId: varchar('intel_id', { length: 100 }).notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    content: text('content'),
    type: varchar('type', { length: 50 }).notNull(),
    // guidance, regulation, alert, news, policy_change, deadline_reminder
    agencyId: integer('agency_id').references(() => regulatoryAgencies.id),
    effectiveDate: date('effective_date'),
    publishedDate: date('published_date'),
    source: text('source'),
    url: text('url'),
    impactLevel: varchar('impact_level', { length: 20 }).default('medium'),
    // low, medium, high, critical
    applicableProducts: json('applicable_products'),
    impactAssessment: text('impact_assessment'),
    actionRequired: boolean('action_required').default(false),
    actionItems: json('action_items'),
    status: varchar('status', { length: 50 }).default('active'),
    // active, archived, superseded
    tags: json('tags'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    intelIdOrg: uniqueIndex('intel_id_org_idx').on(table.intelId, table.organizationId),
    typeIdx: index('intel_type_idx').on(table.type),
    impactLevelIdx: index('intel_impact_level_idx').on(table.impactLevel),
    effectiveDateIdx: index('intel_effective_date_idx').on(table.effectiveDate),
  })
);

// Change Control Management
export const regulatoryChangeControl = pgTable(
  'regulatory_change_control',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    changeControlNumber: varchar('change_control_number', { length: 100 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    changeType: varchar('change_type', { length: 50 }).notNull(),
    // major, minor, administrative, manufacturing, analytical, labeling
    affectedProducts: json('affected_products'),
    affectedAgencies: json('affected_agencies'),
    riskCategory: varchar('risk_category', { length: 20 }).default('medium'),
    // low, medium, high, critical
    regulatoryImpact: text('regulatory_impact'),
    notificationRequired: boolean('notification_required').default(false),
    submissionType: varchar('submission_type', { length: 50 }),
    // CBE, PAS, supplement, annual_report
    impactAssessment: text('impact_assessment'),
    implementation: json('implementation'), // plan and timeline
    agencyNotifications: json('agency_notifications'),
    status: varchar('status', { length: 50 }).default('draft'),
    // draft, under_review, approved, implemented, closed, rejected
    initiatedBy: text('initiated_by'),
    approvedBy: text('approved_by'),
    implementationDate: date('implementation_date'),
    dueDate: date('due_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    changeControlNumberOrg: uniqueIndex('change_control_number_org_idx').on(
      table.changeControlNumber,
      table.organizationId
    ),
    statusIdx: index('change_control_status_idx').on(table.status),
    riskCategoryIdx: index('change_control_risk_idx').on(table.riskCategory),
  })
);

// Post-Approval Commitments Tracking
export const postApprovalCommitments = pgTable(
  'post_approval_commitments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    submissionId: integer('submission_id').references(() => regulatorySubmissions.id),
    commitmentNumber: varchar('commitment_number', { length: 100 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    type: varchar('type', { length: 50 }).notNull(),
    // clinical_study, manufacturing_change, labeling_update, safety_study, quality_study
    agencyId: integer('agency_id')
      .notNull()
      .references(() => regulatoryAgencies.id),
    status: varchar('status', { length: 50 }).default('pending'),
    // pending, in_progress, completed, submitted, approved, overdue, cancelled
    priority: varchar('priority', { length: 20 }).default('medium'),
    dueDate: date('due_date'),
    reminderDate: date('reminder_date'),
    submissionDate: date('submission_date'),
    approvalDate: date('approval_date'),
    assignedTo: text('assigned_to'),
    progressReport: text('progress_report'),
    deliverables: json('deliverables'),
    milestones: json('milestones'),
    escalationRules: json('escalation_rules'),
    notificationSettings: json('notification_settings'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    commitmentNumberOrg: uniqueIndex('commitment_number_org_idx').on(
      table.commitmentNumber,
      table.organizationId
    ),
    statusIdx: index('commitment_status_idx').on(table.status),
    dueDateIdx: index('commitment_due_date_idx').on(table.dueDate),
    assignedIdx: index('commitment_assigned_idx').on(table.assignedTo),
  })
);

// Regulatory Calendar Events
export const regulatoryCalendar = pgTable(
  'regulatory_calendar',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    eventType: varchar('event_type', { length: 50 }).notNull(),
    // deadline, meeting, submission, milestone, reminder, commitment_due
    eventDate: timestamp('event_date').notNull(),
    endDate: timestamp('end_date'),
    allDay: boolean('all_day').default(false),
    agencyId: integer('agency_id').references(() => regulatoryAgencies.id),
    submissionId: integer('submission_id').references(() => regulatorySubmissions.id),
    commitmentId: integer('commitment_id').references(() => postApprovalCommitments.id),
    priority: varchar('priority', { length: 20 }).default('medium'),
    status: varchar('status', { length: 50 }).default('scheduled'),
    // scheduled, completed, cancelled, rescheduled
    location: text('location'),
    attendees: json('attendees'),
    reminders: json('reminders'),
    recurrence: json('recurrence'), // recurring event settings
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    eventIdOrg: uniqueIndex('event_id_org_idx').on(table.eventId, table.organizationId),
    eventDateIdx: index('calendar_event_date_idx').on(table.eventDate),
    eventTypeIdx: index('calendar_event_type_idx').on(table.eventType),
    statusIdx: index('calendar_status_idx').on(table.status),
  })
);

// ============================================================================
// REGULATORY CORRESPONDENCE MANAGEMENT
// ============================================================================

// Regulatory Attachments - Uploaded correspondence documents
export const regAttachments = pgTable(
  'reg_attachments',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    correspondenceId: integer('correspondence_id').references(() => agencyCorrespondence.id),
    fileName: text('file_name').notNull(),
    fileType: varchar('file_type', { length: 50 }), // PDF, DOCX, etc.
    fileSize: integer('file_size'), // in bytes
    filePath: text('file_path'),
    uploadedBy: text('uploaded_by'),
    extractedText: text('extracted_text'), // Full text extracted from document
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    correspondenceAttachmentIdx: index('reg_attachment_correspondence_idx').on(
      table.correspondenceId
    ),
    orgAttachmentIdx: index('reg_attachment_org_idx').on(table.organizationId),
  })
);

// Regulatory Questions - Extracted questions from correspondence
export const regQuestions = pgTable(
  'reg_questions',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    correspondenceId: integer('correspondence_id').references(() => agencyCorrespondence.id),
    attachmentId: integer('attachment_id').references(() => regAttachments.id),
    questionText: text('question_text').notNull(),
    sectionReference: text('section_reference'), // Section of submission being questioned
    priority: varchar('priority', { length: 20 }).default('medium'), // low, medium, high, critical
    severity: varchar('severity', { length: 20 }).default('MAJOR'), // MAJOR, MINOR
    status: varchar('status', { length: 50 }).default('pending'), // pending, in_progress, responded, closed
    region: text('region'), // FDA, EMA, etc.
    dueDate: date('due_date'),
    assignedTo: text('assigned_to'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    correspondenceQuestionIdx: index('reg_question_correspondence_idx').on(table.correspondenceId),
    statusQuestionIdx: index('reg_question_status_idx').on(table.status),
    priorityQuestionIdx: index('reg_question_priority_idx').on(table.priority),
    dueDateQuestionIdx: index('reg_question_due_date_idx').on(table.dueDate),
  })
);

// Regulatory Responses - Drafted responses to questions
export const regResponses = pgTable(
  'reg_responses',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    questionId: integer('question_id')
      .notNull()
      .references(() => regQuestions.id),
    responseText: text('response_text').notNull(),
    evidenceUsed: json('evidence_used'), // Array of evidence references
    version: integer('version').default(1),
    status: varchar('status', { length: 50 }).default('draft'), // draft, review, approved, submitted
    draftedBy: text('drafted_by'),
    reviewedBy: text('reviewed_by'),
    approvedBy: text('approved_by'),
    submittedAt: timestamp('submitted_at'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    questionResponseIdx: index('reg_response_question_idx').on(table.questionId),
    statusResponseIdx: index('reg_response_status_idx').on(table.status),
    versionResponseIdx: index('reg_response_version_idx').on(table.questionId, table.version),
  })
);

// Regulatory Messages - Correspondence thread messages
export const regMessages = pgTable(
  'reg_messages',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    correspondenceId: integer('correspondence_id').references(() => agencyCorrespondence.id),
    questionId: integer('question_id').references(() => regQuestions.id),
    messageType: varchar('message_type', { length: 50 }).notNull(), // question, response, clarification, note
    messageText: text('message_text').notNull(),
    sender: text('sender'), // User or Agency
    senderType: varchar('sender_type', { length: 20 }).default('internal'), // internal, agency
    attachments: json('attachments'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    correspondenceMessageIdx: index('reg_message_correspondence_idx').on(table.correspondenceId),
    questionMessageIdx: index('reg_message_question_idx').on(table.questionId),
    typeMessageIdx: index('reg_message_type_idx').on(table.messageType),
  })
);

// Insert Schemas
export const insertRegAttachmentSchema = createInsertSchemaOmit(regAttachments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegQuestionSchema = createInsertSchemaOmit(regQuestions, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegResponseSchema = createInsertSchemaOmit(regResponses, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegMessageSchema = createInsertSchemaOmit(regMessages, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type RegAttachment = InferSelectModel<typeof regAttachments>;
export type InsertRegAttachment = z.infer<typeof insertRegAttachmentSchema>;

export type RegQuestion = InferSelectModel<typeof regQuestions>;
export type InsertRegQuestion = z.infer<typeof insertRegQuestionSchema>;

export type RegResponse = InferSelectModel<typeof regResponses>;
export type InsertRegResponse = z.infer<typeof insertRegResponseSchema>;

export type RegMessage = InferSelectModel<typeof regMessages>;
export type InsertRegMessage = z.infer<typeof insertRegMessageSchema>;

// ============================================================================
// IND PACKAGE PLANNING & REGIONAL SCOPING
// ============================================================================

// IND Package Plans - Main table for package planning configurations
export const indPackagePlans = pgTable(
  'ind_package_plans',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id')
      .notNull()
      .references(() => clientWorkspaces.id),
    planId: varchar('plan_id', { length: 100 }).notNull(),
    name: text('name').notNull(),
    description: text('description'),
    drugName: text('drug_name'),
    indication: text('indication'),
    phase: varchar('phase', { length: 20 }).default('Phase I'), // Phase I, II, III, etc.
    sponsor: text('sponsor'),
    planType: varchar('plan_type', { length: 50 }).default('multi_regional'), // single_region, multi_regional
    status: varchar('status', { length: 50 }).default('draft'), // draft, active, completed, archived

    // Selected regions (stored as JSON array for quick access)
    selectedRegions: json('selected_regions'), // ["US", "EU", "UK", "Canada", "Japan", "Australia"]

    // Selected modalities (stored as JSON array for quick access)
    selectedModalities: json('selected_modalities'), // ["Small Molecule", "Biologics", etc.]

    // Package configuration
    packageConfig: json('package_config'), // Complete package configuration

    // Compliance and readiness scores
    overallComplianceScore: decimal('overall_compliance_score', { precision: 5, scale: 2 }),
    cmcReadinessScore: decimal('cmc_readiness_score', { precision: 5, scale: 2 }),

    // Timeline estimates
    estimatedTimelineDays: integer('estimated_timeline_days'),
    targetSubmissionDate: date('target_submission_date'),

    // Integration data
    cmcProjectId: text('cmc_project_id'), // Link to CMC wizard data
    lastSyncedAt: timestamp('last_synced_at'),

    // Metadata
    metadata: json('metadata'),
    isActive: boolean('is_active').default(true),
    createdById: integer('created_by_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planIdOrg: uniqueIndex('ind_plan_id_org_idx').on(table.planId, table.organizationId),
    statusIdx: index('ind_plan_status_idx').on(table.status),
    phaseIdx: index('ind_plan_phase_idx').on(table.phase),
  })
);

// IND Package Plan Regions - Detailed regional configurations
export const indPackagePlanRegions = pgTable(
  'ind_package_plan_regions',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => indPackagePlans.id),
    regionCode: varchar('region_code', { length: 10 }).notNull(), // US, EU, UK, CA, JP, AU
    regionName: text('region_name').notNull(), // United States, European Union, etc.

    // Regional specific requirements
    agencyName: text('agency_name'), // FDA, EMA, MHRA, etc.
    submissionType: varchar('submission_type', { length: 50 }), // IND, CTA, CTN, etc.
    regulatoryPathway: text('regulatory_pathway'), // Traditional, Fast Track, etc.

    // Timeline estimates for this region
    estimatedDays: integer('estimated_days'),
    criticalPath: boolean('critical_path').default(false),

    // Requirements and templates
    requiredDocuments: json('required_documents'), // List of required documents
    recommendedTemplates: json('recommended_templates'), // Template recommendations
    specificRequirements: json('specific_requirements'), // Region-specific requirements

    // Compliance status
    complianceStatus: varchar('compliance_status', { length: 50 }).default('not_assessed'),
    // not_assessed, compliant, non_compliant, partially_compliant
    complianceScore: decimal('compliance_score', { precision: 5, scale: 2 }),

    // Priority and status
    priority: varchar('priority', { length: 20 }).default('medium'), // high, medium, low
    status: varchar('status', { length: 50 }).default('planned'), // planned, in_progress, completed

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planRegionIdx: uniqueIndex('plan_region_idx').on(table.planId, table.regionCode),
    statusIdx: index('region_status_idx').on(table.status),
    priorityIdx: index('region_priority_idx').on(table.priority),
  })
);

// IND Package Plan Modalities - Detailed modality configurations
export const indPackagePlanModalities = pgTable(
  'ind_package_plan_modalities',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => indPackagePlans.id),
    modalityCode: varchar('modality_code', { length: 20 }).notNull(), // SM, BIO, GT, CT, OLIGO, RADIO
    modalityName: text('modality_name').notNull(), // Small Molecule, Biologics, etc.

    // Modality-specific requirements
    specialRequirements: json('special_requirements'), // Modality-specific requirements
    recommendedTemplates: json('recommended_templates'), // Template recommendations
    additionalStudies: json('additional_studies'), // Required additional studies

    // CMC considerations for this modality
    cmcComplexity: varchar('cmc_complexity', { length: 20 }).default('standard'), // simple, standard, complex
    manufacturingRequirements: json('manufacturing_requirements'),
    analyticalRequirements: json('analytical_requirements'),

    // Timeline impact
    timelineImpactDays: integer('timeline_impact_days').default(0),
    complexityMultiplier: decimal('complexity_multiplier', { precision: 3, scale: 2 }).default(
      '1.0'
    ),

    // Priority and status
    priority: varchar('priority', { length: 20 }).default('medium'),
    status: varchar('status', { length: 50 }).default('configured'),

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planModalityIdx: uniqueIndex('plan_modality_idx').on(table.planId, table.modalityCode),
    statusIdx: index('modality_status_idx').on(table.status),
    complexityIdx: index('modality_complexity_idx').on(table.cmcComplexity),
  })
);

// IND Package Plan Requirements - Cross-region/modality requirements matrix
export const indPackagePlanRequirements = pgTable(
  'ind_package_plan_requirements',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => indPackagePlans.id),
    regionCode: varchar('region_code', { length: 10 }).notNull(),
    modalityCode: varchar('modality_code', { length: 20 }),

    // Requirement details
    requirementType: varchar('requirement_type', { length: 50 }).notNull(),
    // document, study, analysis, consultation, meeting
    requirementTitle: text('requirement_title').notNull(),
    description: text('description'),
    isMandatory: boolean('is_mandatory').default(true),

    // Status and compliance
    status: varchar('status', { length: 50 }).default('pending'),
    // pending, in_progress, completed, not_applicable, waived
    complianceLevel: varchar('compliance_level', { length: 50 }), // full, partial, non_compliant

    // Timeline and dependencies
    estimatedEffort: integer('estimated_effort'), // in person-days
    estimatedDuration: integer('estimated_duration'), // in calendar days
    dependencies: json('dependencies'), // List of dependent requirements

    // Documentation and templates
    templateRecommendations: json('template_recommendations'),
    referenceGuidelines: json('reference_guidelines'),

    // Assignment and tracking
    assignedTo: text('assigned_to'),
    dueDate: date('due_date'),
    completionDate: date('completion_date'),

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planRequirementIdx: index('plan_requirement_idx').on(table.planId, table.requirementType),
    statusIdx: index('requirement_status_idx').on(table.status),
    dueDateIdx: index('requirement_due_date_idx').on(table.dueDate),
  })
);

// IND Package Plan Timelines - Detailed timeline estimates and tracking
export const indPackagePlanTimelines = pgTable(
  'ind_package_plan_timelines',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => indPackagePlans.id),
    regionCode: varchar('region_code', { length: 10 }),
    modalityCode: varchar('modality_code', { length: 20 }),

    // Timeline details
    phaseType: varchar('phase_type', { length: 50 }).notNull(),
    // planning, preparation, documentation, review, submission, approval
    phaseName: text('phase_name').notNull(),
    description: text('description'),

    // Time estimates
    estimatedDays: integer('estimated_days').notNull(),
    bufferDays: integer('buffer_days').default(0),
    totalDays: integer('total_days').notNull(),

    // Monte Carlo simulation results
    optimisticDays: integer('optimistic_days'), // P10
    expectedDays: integer('expected_days'), // P50
    pessimisticDays: integer('pessimistic_days'), // P90

    // Sequencing and dependencies
    sequenceOrder: integer('sequence_order'),
    isParallel: boolean('is_parallel').default(false),
    dependsOnPhases: json('depends_on_phases'), // List of phase IDs

    // Risk and uncertainty
    riskLevel: varchar('risk_level', { length: 20 }).default('medium'), // low, medium, high
    uncertaintyFactor: decimal('uncertainty_factor', { precision: 3, scale: 2 }).default('1.2'),

    // Progress tracking
    status: varchar('status', { length: 50 }).default('planned'),
    // planned, in_progress, completed, delayed, blocked
    actualStartDate: date('actual_start_date'),
    actualEndDate: date('actual_end_date'),
    actualDays: integer('actual_days'),

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planTimelineIdx: index('plan_timeline_idx').on(table.planId, table.sequenceOrder),
    statusIdx: index('timeline_status_idx').on(table.status),
    phaseTypeIdx: index('timeline_phase_type_idx').on(table.phaseType),
  })
);

// IND Package Plan Documents - Document checklist and tracking
export const indPackagePlanDocuments = pgTable(
  'ind_package_plan_documents',
  {
    id: serial('id').primaryKey(),
    planId: integer('plan_id')
      .notNull()
      .references(() => indPackagePlans.id),
    regionCode: varchar('region_code', { length: 10 }).notNull(),
    modalityCode: varchar('modality_code', { length: 20 }),

    // Document details
    documentType: varchar('document_type', { length: 50 }).notNull(),
    // protocol, ib, cmc, nonclinical, clinical, regulatory_forms, administrative
    documentTitle: text('document_title').notNull(),
    description: text('description'),
    section: varchar('section', { length: 50 }), // IND section (e.g., "2.3", "5.1")

    // Requirements and compliance
    isMandatory: boolean('is_mandatory').default(true),
    isRegionSpecific: boolean('is_region_specific').default(false),
    isModalitySpecific: boolean('is_modality_specific').default(false),

    // Template and guidance
    recommendedTemplate: text('recommended_template'),
    templateId: text('template_id'),
    guidanceReferences: json('guidance_references'),

    // Status and tracking
    status: varchar('status', { length: 50 }).default('not_started'),
    // not_started, in_progress, draft_complete, review, approved, final
    completionPercentage: integer('completion_percentage').default(0),

    // Assignment and timeline
    assignedTo: text('assigned_to'),
    estimatedEffort: integer('estimated_effort'), // in person-hours
    targetDate: date('target_date'),
    completionDate: date('completion_date'),

    // Version and approval tracking
    currentVersion: varchar('current_version', { length: 20 }).default('1.0'),
    lastReviewDate: date('last_review_date'),
    reviewedBy: text('reviewed_by'),
    approvedBy: text('approved_by'),
    approvalDate: date('approval_date'),

    // Links to actual documents
    documentId: integer('document_id').references(() => documents.id),
    filePath: text('file_path'),
    fileSize: integer('file_size'),

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    planDocumentIdx: index('plan_document_idx').on(table.planId, table.documentType),
    indStatusIdx: index('ind_document_status_idx').on(table.status),
    indTargetDateIdx: index('ind_document_target_date_idx').on(table.targetDate),
    regionModalityIdx: index('document_region_modality_idx').on(
      table.regionCode,
      table.modalityCode
    ),
  })
);

// Insert Schemas for Package Planning
export const insertIndPackagePlanSchema = createInsertSchemaOmit(indPackagePlans, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndPackagePlanRegionSchema = createInsertSchemaOmit(indPackagePlanRegions, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndPackagePlanModalitySchema = createInsertSchemaOmit(indPackagePlanModalities, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndPackagePlanRequirementSchema = createInsertSchemaOmit(
  indPackagePlanRequirements,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

export const insertIndPackagePlanTimelineSchema = createInsertSchemaOmit(indPackagePlanTimelines, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndPackagePlanDocumentSchema = createInsertSchemaOmit(indPackagePlanDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types for Package Planning
export type IndPackagePlan = typeof indPackagePlans.$inferSelect;
export type InsertIndPackagePlan = z.infer<typeof insertIndPackagePlanSchema>;

export type IndPackagePlanRegion = typeof indPackagePlanRegions.$inferSelect;
export type InsertIndPackagePlanRegion = z.infer<typeof insertIndPackagePlanRegionSchema>;

export type IndPackagePlanModality = typeof indPackagePlanModalities.$inferSelect;
export type InsertIndPackagePlanModality = z.infer<typeof insertIndPackagePlanModalitySchema>;

export type IndPackagePlanRequirement = typeof indPackagePlanRequirements.$inferSelect;
export type InsertIndPackagePlanRequirement = z.infer<typeof insertIndPackagePlanRequirementSchema>;

export type IndPackagePlanTimeline = typeof indPackagePlanTimelines.$inferSelect;
export type InsertIndPackagePlanTimeline = z.infer<typeof insertIndPackagePlanTimelineSchema>;

export type IndPackagePlanDocument = typeof indPackagePlanDocuments.$inferSelect;
export type InsertIndPackagePlanDocument = z.infer<typeof insertIndPackagePlanDocumentSchema>;

// ============================================================================
// SCHEMA RELATIONSHIPS
// ============================================================================

// Supply Chain Supplier Relationships
export const supplyChainSupplierRelations = relations(supplyChainSuppliers, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [supplyChainSuppliers.organizationId],
    references: [organizations.id],
  }),
  clientWorkspace: one(clientWorkspaces, {
    fields: [supplyChainSuppliers.clientWorkspaceId],
    references: [clientWorkspaces.id],
  }),
  materials: many(supplyChainMaterials),
  batches: many(supplyChainBatches),
  shipments: many(supplyChainShipments),
}));

// Supply Chain Material Relationships
export const supplyChainMaterialRelations = relations(supplyChainMaterials, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [supplyChainMaterials.organizationId],
    references: [organizations.id],
  }),
  clientWorkspace: one(clientWorkspaces, {
    fields: [supplyChainMaterials.clientWorkspaceId],
    references: [clientWorkspaces.id],
  }),
  primarySupplier: one(supplyChainSuppliers, {
    fields: [supplyChainMaterials.primarySupplierId],
    references: [supplyChainSuppliers.id],
  }),
  batches: many(supplyChainBatches),
  coas: many(supplyChainCOAs),
}));

// Supply Chain Batch Relationships
export const supplyChainBatchRelations = relations(supplyChainBatches, ({ many, one }) => ({
  organization: one(organizations, {
    fields: [supplyChainBatches.organizationId],
    references: [organizations.id],
  }),
  clientWorkspace: one(clientWorkspaces, {
    fields: [supplyChainBatches.clientWorkspaceId],
    references: [clientWorkspaces.id],
  }),
  material: one(supplyChainMaterials, {
    fields: [supplyChainBatches.materialId],
    references: [supplyChainMaterials.id],
  }),
  manufacturingSite: one(supplyChainSuppliers, {
    fields: [supplyChainBatches.manufacturingSiteId],
    references: [supplyChainSuppliers.id],
  }),
  coas: many(supplyChainCOAs),
}));

/**
 * ======================================================================================
 * SECTION GRAPH DATABASE SCHEMA
 * ======================================================================================
 *
 * Tables for cross-document synchronization and section management
 * Enables tracking of document sections, versioning, and change propagation
 */

// ============================================================================
// CORE SECTION GRAPH TABLES
// ============================================================================

// Renamed to avoid conflict with existing sections table
export const sectionGraphNodes = pgTable(
  'section_graph_nodes',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    canonical: boolean('canonical').default(false).notNull(),
    ichReference: text('ich_reference'), // Reference to ICH guidelines
    regionScope: text('region_scope'), // e.g., "FDA", "EMA", "ALL"
    description: text('description'),
    sectionType: varchar('section_type', { length: 50 }), // e.g., "module", "chapter", "appendix"
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    slugIdx: uniqueIndex('section_graph_slug_idx').on(table.slug),
    canonicalIdx: index('section_graph_canonical_idx').on(table.canonical),
    regionScopeIdx: index('section_graph_region_scope_idx').on(table.regionScope),
    orgIdx: index('section_graph_org_idx').on(table.organizationId),
  })
);

// Document Sections table - Link documents to sections
export const documentSections = pgTable(
  'document_sections',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => documents.id),
    sectionId: integer('section_id')
      .notNull()
      .references(() => sectionGraphNodes.id),
    position: integer('position').notNull().default(0), // Order within document
    leafId: integer('leaf_id').references(() => sectionLeaves.id),
    override: boolean('override').default(false).notNull(), // Override canonical content
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    isActive: boolean('is_active').default(true).notNull(),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    documentSectionIdx: uniqueIndex('document_section_idx').on(table.documentId, table.sectionId),
    positionIdx: index('document_section_position_idx').on(table.documentId, table.position),
    sectionIdx: index('document_section_section_idx').on(table.sectionId),
    leafIdx: index('document_section_leaf_idx').on(table.leafId),
  })
);

// Section Leaves table - Store versioned content (renamed to avoid conflict with existing leaves table)
export const sectionLeaves = pgTable(
  'section_leaves',
  {
    id: serial('id').primaryKey(),
    latestPatchId: integer('latest_patch_id'), // References the most recent patch
    valueHtml: text('value_html'), // HTML content
    valueText: text('value_text'), // Plain text content
    structuredJson: json('structured_json'), // Structured data representation
    checksum: text('checksum'), // Content integrity check
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    status: varchar('status', { length: 50 }).default('draft').notNull(),
    // draft, review, approved, published
    createdBy: integer('created_by').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    statusIdx: index('section_leaves_status_idx').on(table.status),
    checksumIdx: index('section_leaves_checksum_idx').on(table.checksum),
    orgIdx: index('section_leaves_org_idx').on(table.organizationId),
  })
);

// Patches table - Track all changes
export const patches = pgTable(
  'patches',
  {
    id: serial('id').primaryKey(),
    leafId: integer('leaf_id')
      .notNull()
      .references(() => sectionLeaves.id),
    version: integer('version').notNull().default(1),
    authorId: integer('author_id')
      .notNull()
      .references(() => users.id),
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    diffOps: json('diff_ops'), // JSON array of diff operations
    snapshot: text('snapshot'), // Full content snapshot at this version
    reason: text('reason'), // Change reason/comment
    changeType: varchar('change_type', { length: 50 }), // edit, review, approval, revert
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    leafVersionIdx: uniqueIndex('patch_leaf_version_idx').on(table.leafId, table.version),
    leafIdx: index('patch_leaf_idx').on(table.leafId),
    authorIdx: index('patch_author_idx').on(table.authorId),
    patchTimestampIdx: index('patch_timestamp_idx').on(table.timestamp),
    changeTypeIdx: index('patch_change_type_idx').on(table.changeType),
  })
);

// Link Edges table - Define section relationships
export const linkEdges = pgTable(
  'link_edges',
  {
    id: serial('id').primaryKey(),
    sourceSectionId: integer('source_section_id')
      .notNull()
      .references(() => sections.id),
    targetSectionId: integer('target_section_id')
      .notNull()
      .references(() => sections.id),
    linkType: varchar('link_type', { length: 50 }).notNull(),
    // depends_on, duplicates, derived_from, references, supersedes
    strength: real('strength').default(1.0), // Link strength/weight
    bidirectional: boolean('bidirectional').default(false),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sourceTargetIdx: uniqueIndex('link_edge_source_target_idx').on(
      table.sourceSectionId,
      table.targetSectionId,
      table.linkType
    ),
    sourceIdx: index('link_edge_source_idx').on(table.sourceSectionId),
    targetIdx: index('link_edge_target_idx').on(table.targetSectionId),
    linkTypeIdx: index('link_edge_type_idx').on(table.linkType),
  })
);

// Sync Status table - Track synchronization state
export const syncStatus = pgTable(
  'sync_status',
  {
    id: serial('id').primaryKey(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    // section, document, leaf, patch
    entityId: integer('entity_id').notNull(),
    status: varchar('status', { length: 50 }).notNull(),
    // pending, syncing, synced, failed, conflict
    lastError: text('last_error'),
    lastPropagationTimestamp: timestamp('last_propagation_timestamp'),
    syncDirection: varchar('sync_direction', { length: 20 }),
    // upstream, downstream, bidirectional
    retryCount: integer('retry_count').default(0),
    nextRetryAt: timestamp('next_retry_at'),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    syncEntityIdx: uniqueIndex('sync_status_entity_idx').on(table.entityType, table.entityId),
    syncStatusIdx: index('sync_status_status_idx').on(table.status),
    nextRetryIdx: index('sync_status_next_retry_idx').on(table.nextRetryAt),
    syncOrgIdx: index('sync_status_org_idx').on(table.organizationId),
  })
);

// ============================================================================
// INTEGRATION TABLES
// ============================================================================

// Staff Assignments table - Track who owns what
export const staffAssignments = pgTable(
  'staff_assignments',
  {
    id: serial('id').primaryKey(),
    entityType: varchar('entity_type', { length: 50 }).notNull(),
    // section, document, project, module, task
    entityId: integer('entity_id').notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    role: varchar('role', { length: 50 }).notNull(),
    // owner, editor, reviewer, approver, viewer
    permissions: json('permissions'), // Detailed permission settings
    assignedAt: timestamp('assigned_at').defaultNow().notNull(),
    assignedBy: integer('assigned_by').references(() => users.id),
    validFrom: timestamp('valid_from').defaultNow().notNull(),
    validUntil: timestamp('valid_until'),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
    isActive: boolean('is_active').default(true).notNull(),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    staffEntityUserIdx: uniqueIndex('staff_assignment_entity_user_idx').on(
      table.entityType,
      table.entityId,
      table.userId,
      table.role
    ),
    staffEntityIdx: index('staff_assignment_entity_idx').on(table.entityType, table.entityId),
    staffUserIdx: index('staff_assignment_user_idx').on(table.userId),
    staffRoleIdx: index('staff_assignment_role_idx').on(table.role),
    staffActiveIdx: index('staff_assignment_active_idx').on(table.isActive),
  })
);

// ============================================================================
// INSERT SCHEMAS FOR SECTION GRAPH
// ============================================================================

export const insertSectionGraphNodeSchema = createInsertSchemaOmit(sectionGraphNodes, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDocumentSectionSchema = createInsertSchemaOmit(documentSections, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSectionLeafSchema = createInsertSchemaOmit(sectionLeaves, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPatchSchema = createInsertSchemaOmit(patches, {
  id: true,
  createdAt: true,
});

export const insertLinkEdgeSchema = createInsertSchemaOmit(linkEdges, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSyncStatusSchema = createInsertSchemaOmit(syncStatus, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStaffAssignmentSchema = createInsertSchemaOmit(staffAssignments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ============================================================================
// TYPES FOR SECTION GRAPH
// ============================================================================

export type SectionGraphNode = InferSelectModel<typeof sectionGraphNodes>;
export type InsertSectionGraphNode = z.infer<typeof insertSectionGraphNodeSchema>;

export type DocumentSection = InferSelectModel<typeof documentSections>;
export type InsertDocumentSection = z.infer<typeof insertDocumentSectionSchema>;

export type SectionLeaf = InferSelectModel<typeof sectionLeaves>;
export type InsertSectionLeaf = z.infer<typeof insertSectionLeafSchema>;

export type Patch = InferSelectModel<typeof patches>;
export type InsertPatch = z.infer<typeof insertPatchSchema>;

export type LinkEdge = InferSelectModel<typeof linkEdges>;
export type InsertLinkEdge = z.infer<typeof insertLinkEdgeSchema>;

export type SyncStatus = InferSelectModel<typeof syncStatus>;
export type InsertSyncStatus = z.infer<typeof insertSyncStatusSchema>;

export type StaffAssignment = InferSelectModel<typeof staffAssignments>;
export type InsertStaffAssignment = z.infer<typeof insertStaffAssignmentSchema>;

/**
 * ======================================================================================
 * IND WIZARD, TEMPLATES & WORKFLOW MANAGEMENT SYSTEM
 * ======================================================================================
 *
 * Complete system for IND wizard projects, eCTD templates, and workflow progress
 * with real database persistence for production use.
 */

/**
 * IND Projects Table
 *
 * Stores IND wizard projects with all metadata and progress tracking.
 */
export const indProjects = pgTable(
  'ind_projects',
  {
    id: serial('id').primaryKey(),
    projectId: text('project_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),

    // Project Information
    name: text('name').notNull(),
    drugName: text('drug_name').notNull(),
    indication: text('indication').notNull(),
    sponsor: text('sponsor').notNull(),
    phase: text('phase').notNull(), // Phase I, Phase II, Phase III, etc.
    targetSubmissionDate: timestamp('target_submission_date'),

    // Status and Progress
    status: text('status').default('draft').notNull(), // draft, in-progress, submitted, approved, rejected
    stage: text('stage').default('preparation').notNull(), // preparation, review, submission, complete
    progress: integer('progress').default(0).notNull(), // 0-100
    currentStep: integer('current_step').default(1).notNull(),

    // Project Data
    projectData: json('project_data').notNull(), // Full project metadata
    stepData: json('step_data').notNull(), // Data for each wizard step
    sections: json('sections').notNull(), // Section completion status

    // CMC and CSR Integration
    cmcData: json('cmc_data'),
    csrData: json('csr_data'),
    analyticsData: json('analytics_data'),

    // Compliance and AI
    complianceScore: integer('compliance_score').default(0),
    aiCapabilities: json('ai_capabilities'),
    deficiencies: json('deficiencies'),

    // User and Timestamps
    ownerId: integer('owner_id').references(() => users.id),
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    submittedAt: timestamp('submitted_at'),
    approvedAt: timestamp('approved_at'),
  },
  table => ({
    projectIdIdx: index('ind_project_id_idx').on(table.projectId),
    orgIdx: index('ind_org_idx').on(table.organizationId),
    statusIdx: index('ind_status_idx').on(table.status),
  })
);

/**
 * IND Templates Table
 *
 * Stores IND/eCTD document templates specifically for IND wizard and CoAuthor modules.
 */
export const indTemplates = pgTable(
  'ind_templates',
  {
    id: serial('id').primaryKey(),
    templateId: text('template_id').notNull().unique(),
    organizationId: integer('organization_id').references(() => organizations.id),

    // Template Information
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // ectd, ind, clinical, regulatory, etc.
    type: text('type').notNull(), // FDA, EMA, PMDA, generic, etc.
    region: text('region'), // US, EU, JP, etc.

    // Template Content
    content: text('content'), // Template content/structure
    sections: json('sections'), // Section definitions
    blocks: json('blocks'), // Content blocks/atoms
    metadata: json('metadata'), // Additional template metadata

    // Configuration
    validationRules: json('validation_rules'), // ICH-compliant validation rules
    requiredFields: json('required_fields'),
    defaultValues: json('default_values'),

    // Status and Version
    status: text('status').default('active').notNull(), // draft, active, deprecated
    version: text('version').default('1.0.0').notNull(),
    isPublic: boolean('is_public').default(false).notNull(),

    // Usage Tracking
    usageCount: integer('usage_count').default(0),
    lastUsedAt: timestamp('last_used_at'),

    // User and Timestamps
    createdById: integer('created_by_id').references(() => users.id),
    updatedById: integer('updated_by_id').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    templateIdIdx: index('ind_template_id_idx').on(table.templateId),
    categoryIdx: index('ind_template_category_idx').on(table.category),
    typeIdx: index('ind_template_type_idx').on(table.type),
    statusIdx: index('ind_template_status_idx').on(table.status),
  })
);

/**
 * Workflow Progress Table
 *
 * Tracks workflow progress and state for various modules.
 */
export const workflowProgress = pgTable(
  'workflow_progress',
  {
    id: serial('id').primaryKey(),
    workflowId: text('workflow_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),

    // Workflow Information
    module: text('module').notNull(), // ind-wizard, coauthor, cmc, etc.
    entityType: text('entity_type').notNull(), // project, document, report, etc.
    entityId: text('entity_id').notNull(), // ID of the entity

    // Progress State
    currentState: json('current_state').notNull(), // Complete workflow state
    completedSteps: json('completed_steps'), // Array of completed step IDs
    pendingSteps: json('pending_steps'), // Array of pending step IDs
    progressPercentage: integer('progress_percentage').default(0),

    // Session Management
    sessionId: text('session_id'),
    lastActivityAt: timestamp('last_activity_at').defaultNow().notNull(),
    resumeData: json('resume_data'), // Data to resume workflow

    // Status
    status: text('status').default('active').notNull(), // active, paused, completed, abandoned
    completedAt: timestamp('completed_at'),

    // User and Timestamps
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    workflowIdIdx: index('workflow_id_idx').on(table.workflowId),
    entityIdx: index('workflow_entity_idx').on(table.entityType, table.entityId),
    userIdx: index('workflow_user_idx').on(table.userId),
    statusIdx: index('workflow_status_idx').on(table.status),
  })
);

/**
 * Template Usage Log Table
 *
 * Tracks template usage for analytics and optimization.
 */
export const indTemplateUsageLogs = pgTable('ind_template_usage_logs', {
  id: serial('id').primaryKey(),
  templateId: text('template_id')
    .notNull()
    .references(() => indTemplates.templateId),
  organizationId: integer('organization_id').references(() => organizations.id),

  // Usage Information
  usedBy: integer('used_by').references(() => users.id),
  usedForEntity: text('used_for_entity'), // Entity type it was used for
  usedForEntityId: text('used_for_entity_id'), // Entity ID
  generatedDocumentId: text('generated_document_id'),

  // Metrics
  timeSpent: integer('time_spent'), // Time spent in seconds
  changesCount: integer('changes_count'), // Number of changes made
  completionScore: integer('completion_score'), // How complete was the template used

  // Feedback
  userRating: integer('user_rating'), // 1-5 rating
  feedback: text('feedback'),

  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/**
 * IND Submissions Table
 *
 * Central submission tracking table that links IND projects to eCTD documents.
 * Provides unified workflow tracking and session persistence.
 */
export const indSubmissions = pgTable(
  'ind_submissions',
  {
    id: serial('id').primaryKey(),
    submissionId: text('submission_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),

    // Session Management
    sessionId: text('session_id'),
    isActive: boolean('is_active').default(true).notNull(),

    // IND Project Link
    indProjectId: text('ind_project_id').references(() => indProjects.projectId),

    // Phase Tracking
    currentPhase: text('current_phase').default('ind-wizard').notNull(), // ind-wizard, ectd-coauthor, submission-review
    phases: json('phases').notNull(), // { ind-wizard: { status, completedAt }, ectd-coauthor: { status, completedAt } }

    // Product Information (Core Data)
    drugName: text('drug_name').notNull(),
    indication: text('indication').notNull(),
    sponsor: text('sponsor').notNull(),
    phase: text('phase').notNull(), // Phase I, II, III
    targetSubmissionDate: timestamp('target_submission_date'),

    // IND Wizard Progress
    indWizardStatus: text('ind_wizard_status').default('draft').notNull(), // draft, in-progress, completed
    indStepsCompleted: json('ind_steps_completed').notNull(), // { step1: true, step2: true, ... }
    indStepData: json('ind_step_data').notNull(), // Complete data from all 7 steps

    // eCTD Co-Author Progress
    ectdStatus: text('ectd_status').default('not-started').notNull(), // not-started, in-progress, completed
    ectdModulesCompleted: json('ectd_modules_completed'), // { module2: true, module3: false, ... }
    ectdDocumentIds: json('ectd_document_ids'), // Array of document IDs created

    // Data Handoff Summary (Generated at IND Step 7)
    submissionSummary: json('submission_summary'), // Summary data for eCTD templates
    module2Data: json('module_2_data'), // Quality/CMC data
    module3Data: json('module_3_data'), // Manufacturing data
    module5Data: json('module_5_data'), // Clinical protocol data

    // Regulatory and Compliance
    regulatoryStrategy: text('regulatory_strategy'),
    complianceScore: integer('compliance_score').default(0),
    deficiencies: json('deficiencies'),

    // User and Timestamps
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    submittedAt: timestamp('submitted_at'),
  },
  table => ({
    submissionIdIdx: index('submission_id_idx').on(table.submissionId),
    sessionIdIdx: index('session_id_idx').on(table.sessionId),
    indProjectIdIdx: index('submission_ind_project_idx').on(table.indProjectId),
    orgIdx: index('submission_org_idx').on(table.organizationId),
    statusIdx: index('submission_status_idx').on(table.indWizardStatus, table.ectdStatus),
  })
);

// ==========================================================================================
// ECTD CO-AUTHOR TABLES
// ==========================================================================================
// Tables for eCTD Co-Author module - section management, canvas layout, and annotations

export const coauthorSections = pgTable(
  'coauthor_sections',
  {
    id: serial('id').primaryKey(), // Surrogate primary key for multi-tenant support
    sectionId: varchar('section_id').notNull(), // e.g., '1.1', '2.7', '3.2' (not unique globally)
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    sessionId: varchar('session_id'), // Links to IND session if applicable
    submissionId: varchar('submission_id'), // Links to submission

    // Section Information
    title: text('title').notNull(), // e.g., 'Module 1: Admin'
    moduleNumber: text('module_number'), // e.g., '1', '2', '3', '4', '5'
    sectionType: text('section_type'), // administrative, quality, nonclinical, clinical

    // Canvas Position
    x: integer('x').notNull().default(50), // X coordinate on canvas
    y: integer('y').notNull().default(50), // Y coordinate on canvas

    // Status and Workflow
    status: text('status').notNull().default('pending'), // pending, in-progress, complete, critical, review
    connections: json('connections').default([]), // Array of section IDs this connects to

    // Metadata
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('coauthor_section_org_idx').on(table.organizationId),
    sessionIdx: index('coauthor_section_session_idx').on(table.sessionId),
    submissionIdx: index('coauthor_section_submission_idx').on(table.submissionId),
    statusIdx: index('coauthor_section_status_idx').on(table.status),
    sectionOrgUnique: uniqueIndex('coauthor_section_lookup_idx').on(
      table.sectionId,
      table.organizationId
    ),
  })
);

export const coauthorAnnotations = pgTable(
  'coauthor_annotations',
  {
    id: serial('id').primaryKey(),
    sectionId: integer('section_id')
      .notNull()
      .references(() => coauthorSections.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Annotation Content
    notes: text('notes').notNull(), // The actual annotation text

    // AI-Generated Advice
    aiAdvice: text('ai_advice'), // AI-generated suggestions for this section
    adviceGeneratedAt: timestamp('advice_generated_at'),

    // Metadata
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sectionIdx: index('coauthor_annotation_section_idx').on(table.sectionId),
    orgIdx: index('coauthor_annotation_org_idx').on(table.organizationId),
  })
);

/**
 * eCTD Co-Author Documents Table
 *
 * Stores documents created/edited in the eCTD Co-Author module
 */
export const coauthorDocuments = pgTable(
  'coauthor_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Document Information
    title: text('title').notNull(),
    content: text('content'), // HTML content from TipTap editor
    sections: json('sections'), // JSONB field containing module, version, and other information
    status: text('status').default('draft').notNull(), // draft, in-progress, review, approved, finalized
    templateId: integer('template_id'), // Template reference

    // User tracking and metadata
    createdBy: text('created_by'), // User who created the document
    clientWorkspace: text('client_workspace'), // Client workspace
    completionPercentage: integer('completion_percentage'), // Document completion percentage
    regulatoryComplianceScore: integer('regulatory_compliance_score'), // Compliance score
    metadata: json('metadata'), // Additional document-specific metadata

    // eCTD Module association
    ectdModuleId: integer('ectd_module_id').references(() => ectdModules.id),
    moduleNumber: text('module_number'), // e.g., "3.2.S.4.1" for quick lookups
    moduleName: text('module_name'), // Cached module name for display

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('coauthor_document_org_idx').on(table.organizationId),
    statusIdx: index('coauthor_document_status_idx').on(table.status),
    moduleIdx: index('coauthor_document_module_idx').on(table.ectdModuleId),
    moduleNumberIdx: index('coauthor_document_module_number_idx').on(table.moduleNumber),
  })
);

/**
 * Co-Author Document Versions Table
 *
 * Stores version history for eCTD Co-Author documents
 * Each version represents a snapshot of the document at a specific point in time
 */
export const coauthorDocumentVersions = pgTable(
  'coauthor_document_versions',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => coauthorDocuments.id),
    versionNumber: integer('version_number').notNull(),
    content: text('content'), // Full HTML content at this version
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by'), // User ID as text
    changeSummary: text('change_summary'), // What changed in this version
  },
  table => ({
    documentIdx: index('coauthor_version_document_idx').on(table.documentId),
    versionIdx: index('coauthor_version_number_idx').on(table.documentId, table.versionNumber),
    createdAtIdx: index('coauthor_version_created_idx').on(table.createdAt),
    // Ensure unique version numbers per document
    uniqueDocumentVersion: unique('unique_document_version').on(
      table.documentId,
      table.versionNumber
    ),
  })
);

/**
 * Co-Author Document Status History Table
 *
 * Tracks all status transitions for eCTD Co-Author documents
 * Provides audit trail for document lifecycle management
 */
export const coauthorStatusHistory = pgTable(
  'coauthor_status_history',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => coauthorDocuments.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Status Transition Information
    fromStatus: text('from_status'), // null for initial status
    toStatus: text('to_status').notNull(), // draft, in-review, approved, published

    // Change Context
    reason: text('reason'), // Reason for status change
    comments: text('comments'), // Additional comments or feedback

    // For approval workflow
    isApproval: boolean('is_approval').default(false), // Whether this is an approval action
    approvalLevel: text('approval_level'), // Level of approval if applicable (e.g., 'manager', 'director', 'fda')

    // User Information
    changedById: integer('changed_by_id')
      .notNull()
      .references(() => users.id),
    changedByName: text('changed_by_name').notNull(), // Store name for display even if user is deleted
    changedByRole: text('changed_by_role'), // User's role at time of change

    // Email Notification Tracking
    notificationSent: boolean('notification_sent').default(false),
    notificationSentAt: timestamp('notification_sent_at'),
    notificationRecipients: json('notification_recipients'), // Array of email addresses

    // Metadata
    metadata: json('metadata'), // Additional context-specific data
    changedAt: timestamp('changed_at').defaultNow().notNull(),
  },
  table => ({
    documentIdx: index('coauthor_status_document_idx').on(table.documentId),
    orgIdx: index('coauthor_status_org_idx').on(table.organizationId),
    statusIdx: index('coauthor_status_to_idx').on(table.toStatus),
    changedByIdx: index('coauthor_status_changed_by_idx').on(table.changedById),
    changedAtIdx: index('coauthor_status_changed_at_idx').on(table.changedAt),
  })
);

/**
 * Component Content Management System (CCMS) Tables
 * For granular component-based storage and versioning
 */

/**
 * Components Table - Single Source of Truth for reusable content
 */
export const components = pgTable(
  'components',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Unique Document Identifier
    udi: varchar('udi', { length: 255 }).notNull(), // e.g., "3.2.S.4.1-paragraph-a1b2c3d4"

    // Component Information
    type: text('type').notNull(), // heading, paragraph, table, list, figure, cross-reference
    level: integer('level'), // For headings: 1-6
    content: json('content').notNull(), // The actual content (text, structured data for tables, etc.)

    // Regulatory Context
    moduleContext: text('module_context'), // e.g., "Module 3.2.S - Drug Substance"
    sectionNumber: text('section_number'), // e.g., "3.2.S.4.1"

    // Metadata
    sourceFile: text('source_file'), // Original file this was extracted from
    extractedAt: timestamp('extracted_at').notNull(),
    wordCount: integer('word_count'),
    checksum: text('checksum'), // For detecting changes

    // Usage tracking
    usageCount: integer('usage_count').default(0), // How many documents use this
    lastUsedAt: timestamp('last_used_at'),

    // Status
    status: text('status').default('active').notNull(), // active, deprecated, archived
    tags: json('tags'), // Array of tags for categorization

    // eCTD 4.0 Priority Number for display order management
    priorityNumber: integer('priority_number').default(0),
    displayOrder: integer('display_order').default(0),

    // Context of Use (COU) - Mandate Section 2.2
    contextOfUse: text('context_of_use'), // Regulatory purpose: clinical, quality, nonclinical, administrative
    contextGroup: text('context_group'), // Combined COU + keywords for eCTD placement
    controlledVocabulary: json('controlled_vocabulary'), // Enforced metadata terms

    // Lifecycle Management (LCM) - eCTD 4.0
    lifecycleState: text('lifecycle_state').default('new'), // new, replace, delete
    replacedUdi: text('replaced_udi'), // UDI of component being replaced
    replacementMapping: json('replacement_mapping'), // 1-to-N replacement relationships

    // Source Data Reference - Mandate Table 2
    sourceDataReference: json('source_data_reference'), // Links to LIMS, CDISC, raw data
    dataTraceability: json('data_traceability'), // Full lineage tracking

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('component_org_idx').on(table.organizationId),
    udiIdx: uniqueIndex('component_udi_idx').on(table.udi, table.organizationId),
    typeIdx: index('component_type_idx').on(table.type),
    moduleIdx: index('component_module_idx').on(table.moduleContext),
    statusIdx: index('component_status_idx').on(table.status),
    priorityIdx: index('component_priority_idx').on(table.priorityNumber),
    displayOrderIdx: index('component_display_order_idx').on(table.displayOrder),
    contextOfUseIdx: index('component_context_of_use_idx').on(table.contextOfUse),
    lifecycleStateIdx: index('component_lifecycle_state_idx').on(table.lifecycleState),
  })
);

/**
 * Component Versions Table - Version history for each component
 */
export const componentVersions = pgTable(
  'component_versions',
  {
    id: serial('id').primaryKey(),
    componentId: integer('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Version Information
    versionNumber: integer('version_number').notNull(),
    versionLabel: text('version_label'), // e.g., "FDA Comments Addressed"

    // Content at this version
    content: json('content').notNull(),
    diff: json('diff'), // Changes from previous version

    // Change tracking
    changeDescription: text('change_description'),
    changeType: text('change_type'), // minor, major, formatting

    // Compliance
    complianceStatus: text('compliance_status'), // compliant, needs-review, non-compliant
    complianceNotes: text('compliance_notes'),
    validatedAgainst: json('validated_against'), // List of regulations checked

    // User tracking
    createdById: integer('created_by_id').references(() => users.id),
    createdByName: text('created_by_name'),
    approvedById: integer('approved_by_id').references(() => users.id),
    approvedAt: timestamp('approved_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    componentIdx: index('component_version_comp_idx').on(table.componentId),
    versionIdx: uniqueIndex('component_version_unique_idx').on(
      table.componentId,
      table.versionNumber
    ),
    createdAtIdx: index('component_version_created_idx').on(table.createdAt),
  })
);

/**
 * Document Components Table - Links documents to their components
 */
export const documentComponents = pgTable(
  'document_components',
  {
    id: serial('id').primaryKey(),
    documentId: integer('document_id')
      .notNull()
      .references(() => coauthorDocuments.id, { onDelete: 'cascade' }),
    componentId: integer('component_id')
      .notNull()
      .references(() => components.id),
    componentVersionId: integer('component_version_id').references(() => componentVersions.id),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Position and structure
    position: integer('position').notNull(), // Order in document
    parentComponentId: integer('parent_component_id'), // For nested components
    depth: integer('depth').default(0), // Nesting level

    // Override content (if different from component)
    overrideContent: json('override_content'),
    isOverridden: boolean('is_overridden').default(false),

    // Locking
    isLocked: boolean('is_locked').default(false),
    lockedById: integer('locked_by_id').references(() => users.id),
    lockedAt: timestamp('locked_at'),
    lockReason: text('lock_reason'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    documentIdx: index('doc_component_doc_idx').on(table.documentId),
    componentIdx: index('doc_component_comp_idx').on(table.componentId),
    positionIdx: index('doc_component_position_idx').on(table.documentId, table.position),
    lockedIdx: index('doc_component_locked_idx').on(table.isLocked),
  })
);

/**
 * Component Cross References Table - Track component relationships
 */
export const componentCrossReferences = pgTable(
  'component_cross_references',
  {
    id: serial('id').primaryKey(),
    sourceComponentId: integer('source_component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    targetComponentId: integer('target_component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Reference Information
    referenceType: text('reference_type').notNull(), // see-also, based-on, supersedes, related
    referenceText: text('reference_text'), // The text that creates the reference

    // Validation
    isValid: boolean('is_valid').default(true),
    validatedAt: timestamp('validated_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    sourceIdx: index('cross_ref_source_idx').on(table.sourceComponentId),
    targetIdx: index('cross_ref_target_idx').on(table.targetComponentId),
    typeIdx: index('cross_ref_type_idx').on(table.referenceType),
  })
);

/**
 * Component Sequence References Table
 * Tracks UDI usage across eCTD sequences for cross-sequence component referencing
 * Implements eCTD 4.0 requirement: "UDI enables documents to be referenced and reused
 * across different submission units or sequences without physically resubmitting the file"
 */
export const componentSequenceReferences = pgTable(
  'component_sequence_references',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Component being referenced
    componentId: integer('component_id')
      .notNull()
      .references(() => components.id, { onDelete: 'cascade' }),
    componentVersionId: integer('component_version_id').references(() => componentVersions.id),
    udi: varchar('udi', { length: 255 }).notNull(), // Denormalized for fast lookups

    // Sequence/Submission information
    sequenceNumber: text('sequence_number').notNull(), // e.g., "SN0001", "SN0013"
    submissionId: integer('submission_id'), // Reference to submission if exists
    applicationNumber: text('application_number'), // IND number, NDA number, etc.

    // Document context where this component was used
    documentId: integer('document_id').references(() => coauthorDocuments.id, {
      onDelete: 'set null',
    }),
    documentTitle: text('document_title'),
    moduleContext: text('module_context'), // e.g., "Module 3.2.S - Drug Substance"
    sectionNumber: text('section_number'), // e.g., "3.2.S.4.1"

    // eCTD 4.0 Lifecycle management
    ectdOperation: text('ectd_operation'), // new, replace, delete, append
    replacedUdi: varchar('replaced_udi', { length: 255 }), // UDI of component this replaces

    // Tracking
    firstUsedInSequence: boolean('first_used_in_sequence').default(false), // Is this the first time in this sequence?
    reusedFromSequence: text('reused_from_sequence'), // Which sequence was it originally from?

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    componentIdx: index('seq_ref_component_idx').on(table.componentId),
    udiIdx: index('seq_ref_udi_idx').on(table.udi),
    sequenceIdx: index('seq_ref_sequence_idx').on(table.sequenceNumber),
    orgIdx: index('seq_ref_org_idx').on(table.organizationId),
    documentIdx: index('seq_ref_document_idx').on(table.documentId),
    moduleIdx: index('seq_ref_module_idx').on(table.moduleContext),
    // Composite index for "where is this UDI used?" queries
    udiSequenceIdx: index('seq_ref_udi_sequence_idx').on(table.udi, table.sequenceNumber),
  })
);

// Component Sequence References Insert Schema
export const insertComponentSequenceReferenceSchema = createInsertSchemaOmit(
  componentSequenceReferences,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

// Component Sequence References Types
export type ComponentSequenceReference = InferSelectModel<typeof componentSequenceReferences>;
export type InsertComponentSequenceReference = z.infer<
  typeof insertComponentSequenceReferenceSchema
>;

/**
 * Document Vectors Table - Semantic embeddings for RAG/Search
 * Implements Phase 3 Regulatory Intelligence Layer requirements
 */
export const documentVectors = pgTable(
  'document_vectors',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Source references
    componentId: integer('component_id').references(() => components.id, { onDelete: 'cascade' }),
    componentVersionId: integer('component_version_id').references(() => componentVersions.id, {
      onDelete: 'cascade',
    }),
    documentId: integer('document_id').references(() => coauthorDocuments.id, {
      onDelete: 'cascade',
    }),

    // Chunk information
    chunkText: text('chunk_text').notNull(), // The actual text that was embedded
    chunkIndex: integer('chunk_index').notNull().default(0), // Position in source
    chunkSize: integer('chunk_size').notNull(), // Number of tokens

    // Embedding data - proper pgvector support
    embedding: vector('embedding', { dimensions: 3072 }), // OpenAI text-embedding-3-large (3072 dimensions)
    embeddingModel: text('embedding_model').notNull().default('text-embedding-3-large'),

    // Regulatory context
    moduleContext: text('module_context'), // e.g., "Module 3.2.S - Drug Substance"
    sectionNumber: text('section_number'), // e.g., "3.2.S.4.1"
    regulatoryEntities: json('regulatory_entities'), // NER-extracted entities

    // Metadata for RAG
    metadata: json('metadata'), // Additional context for retrieval
    tags: text('tags').array(), // Searchable tags

    // Performance and tracking
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
    accessCount: integer('access_count').default(0),
  },
  table => ({
    // HNSW index for fast similarity search (will be created via raw SQL)
    componentIdx: index('doc_vector_component_idx').on(table.componentId),
    documentIdx: index('doc_vector_document_idx').on(table.documentId),
    moduleIdx: index('doc_vector_module_idx').on(table.moduleContext),
    createdAtIdx: index('doc_vector_created_idx').on(table.createdAt),
  })
);

// Document Vectors Insert Schema
export const insertDocumentVectorSchema = createInsertSchemaOmit(documentVectors, {
  id: true,
  createdAt: true,
  updatedAt: true,
  lastAccessedAt: true,
  accessCount: true,
});

// Document Vectors Types
export type DocumentVector = InferSelectModel<typeof documentVectors>;
export type InsertDocumentVector = z.infer<typeof insertDocumentVectorSchema>;

// Co-Author Status History Insert Schema
export const insertCoauthorStatusHistorySchema = createInsertSchemaOmit(coauthorStatusHistory, {
  id: true,
  changedAt: true,
});

// Co-Author Status History Types
export type CoauthorStatusHistory = InferSelectModel<typeof coauthorStatusHistory>;
export type InsertCoauthorStatusHistory = z.infer<typeof insertCoauthorStatusHistorySchema>;

/**
 * eCTD Co-Author Import History Table
 *
 * Tracks imports from IND submissions into eCTD documents with full audit trail
 */
export const coauthorImportHistory = pgTable(
  'coauthor_import_history',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Import Source
    sourceType: text('source_type').notNull(), // 'ind_submission', 'ind_document', 'cmc_data', 'csr_data'
    sourceId: text('source_id').notNull(), // ID of the source record (submission_id, document_id, etc.)
    indSubmissionId: text('ind_submission_id').references(() => indSubmissions.submissionId),

    // Import Target
    targetDocumentId: integer('target_document_id')
      .notNull()
      .references(() => coauthorDocuments.id, { onDelete: 'cascade' }),
    targetModule: text('target_module').notNull(), // e.g., 'Module 2.5', 'Module 2.7'

    // Import Details
    importType: text('import_type').notNull(), // 'full', 'partial', 'merge'
    sectionsImported: json('sections_imported').notNull(), // Array of section identifiers that were imported
    fieldMappings: json('field_mappings').notNull(), // Mapping of source fields to target sections

    // Import Result
    status: text('status').notNull(), // 'pending', 'in_progress', 'completed', 'failed'
    progress: integer('progress').default(0), // 0-100

    // Content Changes
    contentBefore: text('content_before'), // Snapshot of content before import
    contentAfter: text('content_after'), // Snapshot of content after import
    changesSummary: json('changes_summary'), // Summary of what was changed

    // Data Mapping Configuration
    mappingConfiguration: json('mapping_configuration'), // Flexible field mapping rules
    transformationsApplied: json('transformations_applied'), // Any transformations applied during import

    // Conflict Resolution
    conflictResolution: text('conflict_resolution'), // 'merge', 'overwrite', 'skip'
    conflicts: json('conflicts'), // Array of conflicts encountered

    // Error Handling
    errorMessage: text('error_message'),
    errorDetails: json('error_details'),

    // User Information
    importedById: integer('imported_by_id')
      .notNull()
      .references(() => users.id),
    importedByName: text('imported_by_name').notNull(),

    // Timestamps
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),

    // Metadata
    metadata: json('metadata'), // Additional import-specific metadata
  },
  table => ({
    orgIdx: index('coauthor_import_org_idx').on(table.organizationId),
    targetDocIdx: index('coauthor_import_target_doc_idx').on(table.targetDocumentId),
    sourceIdx: index('coauthor_import_source_idx').on(table.sourceType, table.sourceId),
    statusIdx: index('coauthor_import_status_idx').on(table.status),
    indSubmissionIdx: index('coauthor_import_ind_submission_idx').on(table.indSubmissionId),
    importedByIdx: index('coauthor_import_by_idx').on(table.importedById),
    startedAtIdx: index('coauthor_import_started_idx').on(table.startedAt),
  })
);

// Co-Author Import History Insert Schema
export const insertCoauthorImportHistorySchema = createInsertSchemaOmit(coauthorImportHistory, {
  id: true,
  startedAt: true,
});

// Co-Author Import History Types
export type CoauthorImportHistory = InferSelectModel<typeof coauthorImportHistory>;
export type InsertCoauthorImportHistory = z.infer<typeof insertCoauthorImportHistorySchema>;

/**
 * ======================================================================================
 * COAUTHOR VALIDATION SYSTEM
 * ======================================================================================
 *
 * Tables for comprehensive validation rules and history tracking
 */

// CoAuthor Validation Rules table - configurable validation rules
export const coauthorValidationRules = pgTable(
  'coauthor_validation_rules',
  {
    id: serial('id').primaryKey(),
    ruleId: text('rule_id').notNull().unique(),
    organizationId: integer('organization_id').references(() => organizations.id),

    // Module and Section
    module: text('module').notNull(), // Module 1, Module 2, Module 3, Module 4, Module 5
    section: text('section'), // Specific section within module (e.g., '2.3', '3.2.S.1')

    // Agency-specific rule
    agency: text('agency').notNull(), // FDA, EMA, PMDA, HealthCanada, ALL

    // Rule Classification
    category: text('category').notNull(), // structure, content, formatting, compliance, completeness
    ruleType: text('rule_type').notNull(), // required_section, min_word_count, format_check, terminology, reference_check
    severity: text('severity').notNull(), // critical, major, minor, informational

    // Rule Details
    ruleName: text('rule_name').notNull(),
    description: text('description').notNull(),
    checkLogic: json('check_logic').notNull(), // JSON containing rule parameters
    remediationText: text('remediation_text').notNull(),

    // Auto-fix Capabilities
    autoFixAvailable: boolean('auto_fix_available').default(false),
    autoFixLogic: json('auto_fix_logic'),

    // Status
    isActive: boolean('is_active').default(true),

    // Metadata
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    moduleIdx: index('validation_rules_module_idx').on(table.module),
    agencyIdx: index('validation_rules_agency_idx').on(table.agency),
    severityIdx: index('validation_rules_severity_idx').on(table.severity),
    categoryIdx: index('validation_rules_category_idx').on(table.category),
    ruleTypeIdx: index('validation_rules_type_idx').on(table.ruleType),
  })
);

// CoAuthor Validation History table - tracks all validation runs
export const coauthorValidationHistory = pgTable(
  'coauthor_validation_history',
  {
    id: serial('id').primaryKey(),
    validationId: text('validation_id').notNull().unique(),
    organizationId: integer('organization_id').references(() => organizations.id),
    documentId: integer('document_id').references(() => coauthorDocuments.id),

    // Document Context
    documentVersion: integer('document_version'),
    module: text('module').notNull(),
    agency: text('agency').notNull(),

    // Validation Summary
    totalIssues: integer('total_issues').default(0),
    criticalIssues: integer('critical_issues').default(0),
    majorIssues: integer('major_issues').default(0),
    minorIssues: integer('minor_issues').default(0),
    informationalIssues: integer('informational_issues').default(0),

    // Compliance Scoring
    complianceScore: real('compliance_score'), // 0-100 percentage
    passedRules: integer('passed_rules').default(0),
    failedRules: integer('failed_rules').default(0),
    skippedRules: integer('skipped_rules').default(0),

    // Detailed Results
    validationResults: json('validation_results').notNull(), // Detailed results with all issues

    // Audit Information
    performedBy: text('performed_by').notNull(),
    performedByUserId: integer('performed_by_user_id').references(() => users.id),
    performedAt: timestamp('performed_at').defaultNow().notNull(),

    // Export Information
    exportedAt: timestamp('exported_at'),
    reportPath: text('report_path'),
    reportFormat: text('report_format'), // PDF, XLSX, JSON

    // Metadata
    metadata: json('metadata'), // Additional validation context
  },
  table => ({
    documentIdx: index('validation_history_document_idx').on(table.documentId),
    performedAtIdx: index('validation_history_performed_idx').on(table.performedAt),
    agencyIdx: index('validation_history_agency_idx').on(table.agency),
    complianceIdx: index('validation_history_compliance_idx').on(table.complianceScore),
  })
);

// Insert schemas for validation system
export const insertCoauthorValidationRuleSchema = createInsertSchemaOmit(coauthorValidationRules, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCoauthorValidationHistorySchema = createInsertSchemaOmit(
  coauthorValidationHistory,
  {
    id: true,
    performedAt: true,
  }
);

// Types for validation system
export type CoauthorValidationRule = InferSelectModel<typeof coauthorValidationRules>;
export type InsertCoauthorValidationRule = z.infer<typeof insertCoauthorValidationRuleSchema>;
export type CoauthorValidationHistory = InferSelectModel<typeof coauthorValidationHistory>;
export type InsertCoauthorValidationHistory = z.infer<typeof insertCoauthorValidationHistorySchema>;

// ============================================================================
// REGULATORY SUBMISSION CENTER TABLES
// ============================================================================
// Production-ready tables for intelligent task management and stage-gate controls

/**
 * Regulatory Submissions Table
 *
 * Tracks all regulatory submission types (IND, NDA, BLA, MAA, etc.)
 */
export const regulatorySubmissions = pgTable(
  'regulatory_submissions',
  {
    id: serial('id').primaryKey(),
    submissionId: text('submission_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),

    // Submission Details
    submissionType: text('submission_type').notNull(), // IND, NDA, BLA, MAA, ANDA, etc.
    drugName: text('drug_name').notNull(),
    indication: text('indication').notNull(),
    sponsor: text('sponsor').notNull(),
    targetMarket: text('target_market'), // US, EU, JP, etc.

    // Status and Progress
    status: text('status').default('planning').notNull(), // planning, in-progress, under-review, submitted, approved, rejected
    currentGate: text('current_gate').default('initiation').notNull(), // initiation, authoring, review, assembly, submission
    progressPercentage: integer('progress_percentage').default(0),

    // Dates and Deadlines
    targetSubmissionDate: timestamp('target_submission_date').notNull(),
    actualSubmissionDate: timestamp('actual_submission_date'),
    regulatoryDeadline: timestamp('regulatory_deadline'),

    // Compliance and Risk
    complianceScore: integer('compliance_score').default(0),
    riskLevel: text('risk_level').default('medium'), // low, medium, high, critical
    priorityLevel: text('priority_level').default('normal'), // low, normal, high, urgent

    // Team and Assignment
    leadRegulatory: integer('lead_regulatory').references(() => users.id),
    leadQa: integer('lead_qa').references(() => users.id),
    leadClinical: integer('lead_clinical').references(() => users.id),
    teamMembers: json('team_members'), // Array of user IDs

    // Metadata
    metadata: json('metadata'), // Additional submission-specific data
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    submissionIdIdx: index('reg_submission_id_idx').on(table.submissionId),
    orgIdx: index('reg_submission_org_idx').on(table.organizationId),
    statusIdx: index('reg_submission_status_idx').on(table.status),
    typeIdx: index('reg_submission_type_idx').on(table.submissionType),
    gateIdx: index('reg_submission_gate_idx').on(table.currentGate),
  })
);

/**
 * Regulatory Tasks Table
 *
 * Individual tasks within a regulatory submission workflow
 */
export const regulatoryTasks = pgTable(
  'regulatory_tasks',
  {
    id: serial('id').primaryKey(),
    taskId: text('task_id').notNull().unique(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => regulatorySubmissions.submissionId),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Task Details
    title: text('title').notNull(),
    description: text('description'),
    taskType: text('task_type').notNull(), // document-preparation, review, approval, data-entry, validation
    category: text('category'), // regulatory, clinical, quality, manufacturing, safety

    // Assignment and Ownership
    assignedTo: integer('assigned_to').references(() => users.id),
    assignedBy: integer('assigned_by').references(() => users.id),
    assignedAt: timestamp('assigned_at'),
    teamId: integer('team_id'),

    // Status and Progress
    status: text('status').default('pending').notNull(), // pending, in-progress, review, completed, blocked, cancelled
    priority: text('priority').default('normal').notNull(), // low, normal, high, urgent, critical
    estimatedHours: real('estimated_hours'),
    actualHours: real('actual_hours'),
    progressPercentage: integer('progress_percentage').default(0),

    // Dates and Deadlines
    dueDate: timestamp('due_date').notNull(),
    startDate: timestamp('start_date'),
    completedAt: timestamp('completed_at'),

    // Gate Association
    stageGate: text('stage_gate'), // initiation, authoring, review, assembly, submission
    isGatekeeper: boolean('is_gatekeeper').default(false), // Task blocks gate progression

    // Documents and Deliverables
    documentIds: json('document_ids'), // Array of associated document IDs
    deliverables: json('deliverables'), // Expected outputs

    // AI and Automation
    aiPriorityScore: real('ai_priority_score'), // AI-calculated priority
    automationStatus: text('automation_status'), // manual, semi-automated, automated

    // Metadata
    metadata: json('metadata'),
    createdById: integer('created_by_id').references(() => users.id),
    lastModifiedBy: integer('last_modified_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    taskIdIdx: index('reg_task_id_idx').on(table.taskId),
    submissionIdx: index('reg_task_submission_idx').on(table.submissionId),
    assignedToIdx: index('reg_task_assigned_idx').on(table.assignedTo),
    statusIdx: index('reg_task_status_idx').on(table.status),
    dueDateIdx: index('reg_task_due_date_idx').on(table.dueDate),
    priorityIdx: index('reg_task_priority_idx').on(table.priority),
  })
);

/**
 * Stage Gates Table
 *
 * Defines the 5 regulatory stage gates and their requirements
 */
export const stageGates = pgTable(
  'stage_gates',
  {
    id: serial('id').primaryKey(),
    gateId: text('gate_id').notNull().unique(),
    submissionId: text('submission_id')
      .notNull()
      .references(() => regulatorySubmissions.submissionId),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Gate Information
    gateName: text('gate_name').notNull(), // Initiation, Authoring, Review, Assembly, Submission
    gateOrder: integer('gate_order').notNull(), // 1-5
    description: text('description'),

    // Status and Progress
    status: text('status').default('pending').notNull(), // pending, in-progress, completed, blocked
    completionPercentage: integer('completion_percentage').default(0),

    // Requirements
    requiredTasks: json('required_tasks'), // Array of task IDs that must be completed
    requiredDocuments: json('required_documents'), // Array of document types required
    requiredApprovals: json('required_approvals'), // Array of role-based approvals needed
    exitCriteria: json('exit_criteria'), // Conditions to pass the gate

    // Dates
    plannedDate: timestamp('planned_date'),
    actualStartDate: timestamp('actual_start_date'),
    actualCompletionDate: timestamp('actual_completion_date'),

    // Approval Status
    qaApproved: boolean('qa_approved').default(false),
    regulatoryApproved: boolean('regulatory_approved').default(false),
    clinicalApproved: boolean('clinical_approved').default(false),
    finalApproved: boolean('final_approved').default(false),

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    gateIdIdx: index('stage_gate_id_idx').on(table.gateId),
    submissionIdx: index('stage_gate_submission_idx').on(table.submissionId),
    statusIdx: index('stage_gate_status_idx').on(table.status),
    orderIdx: index('stage_gate_order_idx').on(table.gateOrder),
  })
);

/**
 * Gate Approvals Table
 *
 * Tracks approvals at each stage gate with e-signatures
 */
export const gateApprovals = pgTable(
  'gate_approvals',
  {
    id: serial('id').primaryKey(),
    approvalId: text('approval_id').notNull().unique(),
    gateId: text('gate_id')
      .notNull()
      .references(() => stageGates.gateId),
    submissionId: text('submission_id')
      .notNull()
      .references(() => regulatorySubmissions.submissionId),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Approval Details
    approverRole: text('approver_role').notNull(), // qa, regulatory, clinical, management
    approverId: integer('approver_id')
      .notNull()
      .references(() => users.id),
    approverName: text('approver_name').notNull(),

    // Decision and Status
    decision: text('decision').notNull(), // approved, rejected, conditional, deferred
    status: text('status').default('pending').notNull(), // pending, completed, expired
    comments: text('comments'),
    conditions: text('conditions'), // For conditional approvals

    // E-Signature (21 CFR Part 11 Compliance)
    signatureHash: text('signature_hash').notNull(),
    signatureMeaning: text('signature_meaning').notNull(), // e.g., "I approve this gate transition"
    signatureTimestamp: timestamp('signature_timestamp').notNull(),
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent'),

    // Verification
    verificationMethod: text('verification_method'), // password, biometric, token
    verificationToken: text('verification_token'),

    // Dates
    requestedAt: timestamp('requested_at').notNull(),
    respondedAt: timestamp('responded_at'),
    expiresAt: timestamp('expires_at'),

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    approvalIdIdx: index('gate_approval_id_idx').on(table.approvalId),
    gateIdx: index('gate_approval_gate_idx').on(table.gateId),
    approverIdx: index('gate_approval_approver_idx').on(table.approverId),
    statusIdx: index('gate_approval_status_idx').on(table.status),
  })
);

// taskDependencies already defined earlier in the file - removed duplicate

/**
 * Proof Audit Logs Table
 *
 * 21 CFR Part 11 compliant audit trail for the Proof System (Phase 4.1).
 * Immutable hash-chained audit entries for:
 * - Graph compilation and transitions
 * - ZK proof generation and verification
 * - Delta verification and tamper detection
 * - Certificate generation and validation
 */
export const proofAuditLogs = pgTable(
  'proof_audit_logs',
  {
    id: serial('id').primaryKey(),
    entryId: text('entry_id').notNull().unique(),
    organizationId: integer('organization_id').references(() => organizations.id),
    workflowRunId: text('workflow_run_id'),

    // Event Details
    eventType: text('event_type').notNull(), // GRAPH_COMPILE, ZK_PROOF_GENERATED, CERTIFICATE_GENERATED, etc.
    actorId: text('actor_id'),
    actorRole: text('actor_role'),

    // Proof Data (redacted for compliance)
    details: json('details').notNull(),

    // Hash Chain Integrity (required for 21 CFR Part 11 § 11.10(e))
    previousHash: text('previous_hash'),
    hashChain: text('hash_chain').notNull(),

    // Trusted Timestamp (NTP-verified)
    timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
    timestampSource: text('timestamp_source').default('server').notNull(), // server, ntp, tsa

    // Immutability marker - row cannot be updated after insert
    immutable: boolean('immutable').default(true).notNull(),
  },
  table => ({
    entryIdIdx: uniqueIndex('proof_audit_entry_id_idx').on(table.entryId),
    orgIdx: index('proof_audit_org_idx').on(table.organizationId),
    workflowIdx: index('proof_audit_workflow_idx').on(table.workflowRunId),
    eventTypeIdx: index('proof_audit_event_type_idx').on(table.eventType),
    timestampIdx: index('proof_audit_timestamp_idx').on(table.timestamp),
    hashChainIdx: index('proof_audit_hash_chain_idx').on(table.hashChain),
  })
);

export const insertProofAuditLogSchema = createInsertSchemaOmit(proofAuditLogs, {
  id: true,
  timestamp: true,
  immutable: true,
});

export type ProofAuditLog = InferSelectModel<typeof proofAuditLogs>;
export type InsertProofAuditLog = z.infer<typeof insertProofAuditLogSchema>;

/**
 * Regulatory Audit Logs Table
 *
 * Complete audit trail for 21 CFR Part 11 compliance
 */
export const regulatoryAuditLogs = pgTable(
  'regulatory_audit_logs',
  {
    id: serial('id').primaryKey(),
    auditId: text('audit_id').notNull().unique(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Entity Reference
    entityType: text('entity_type').notNull(), // submission, task, gate, approval, document
    entityId: text('entity_id').notNull(),
    submissionId: text('submission_id'), // Optional reference to submission

    // Action Details
    action: text('action').notNull(), // created, modified, deleted, approved, rejected, signed, exported
    actionCategory: text('action_category').notNull(), // data-change, status-change, approval, system
    previousValue: json('previous_value'),
    newValue: json('new_value'),
    changeReason: text('change_reason'),

    // User Information
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    userName: text('user_name').notNull(),
    userRole: text('user_role'),

    // System Information
    ipAddress: text('ip_address').notNull(),
    userAgent: text('user_agent'),
    sessionId: text('session_id'),

    // Compliance Fields
    isGxpRelevant: boolean('is_gxp_relevant').default(false),
    requiresJustification: boolean('requires_justification').default(false),
    justification: text('justification'),

    // Timestamps
    timestamp: timestamp('timestamp').defaultNow().notNull(),

    // Metadata
    metadata: json('metadata'),
  },
  table => ({
    auditIdIdx: index('reg_audit_id_idx').on(table.auditId),
    entityIdx: index('reg_audit_entity_idx').on(table.entityType, table.entityId),
    userIdx: index('reg_audit_user_idx').on(table.userId),
    timestampIdx: index('reg_audit_timestamp_idx').on(table.timestamp),
    submissionIdx: index('reg_audit_submission_idx').on(table.submissionId),
  })
);

// ============================================================================
// INSERT SCHEMAS
// ============================================================================

export const insertIndProjectSchema = createInsertSchemaOmit(indProjects, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndTemplateSchema = createInsertSchemaOmit(indTemplates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertWorkflowProgressSchema = createInsertSchemaOmit(workflowProgress, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndTemplateUsageLogSchema = createInsertSchemaOmit(indTemplateUsageLogs, {
  id: true,
  createdAt: true,
});

export const insertIndSubmissionSchema = createInsertSchemaOmit(indSubmissions, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCoauthorSectionSchema = createInsertSchemaOmit(coauthorSections, {
  createdAt: true,
  updatedAt: true,
});

export const insertCoauthorAnnotationSchema = createInsertSchemaOmit(coauthorAnnotations, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Regulatory Submission Center Insert Schemas
export const insertRegulatorySubmissionSchema = createInsertSchemaOmit(regulatorySubmissions, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegulatoryTaskSchema = createInsertSchemaOmit(regulatoryTasks, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStageGateSchema = createInsertSchemaOmit(stageGates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGateApprovalSchema = createInsertSchemaOmit(gateApprovals, {
  id: true,
  createdAt: true,
});

// insertTaskDependencySchema already defined earlier - removed duplicate

export const insertRegulatoryAuditLogSchema = createInsertSchemaOmit(regulatoryAuditLogs, {
  id: true,
  timestamp: true,
});

/**
 * ======================================================================================
 * COMPREHENSIVE CDISC INTEGRATION SYSTEM - ENTIRE PLATFORM
 * ======================================================================================
 *
 * CDISC (Clinical Data Interchange Standards Consortium) tables for:
 * - Protocol Representation Model (PRM)
 * - CDASH (Clinical Data Acquisition Standards Harmonization)
 * - SDTM (Study Data Tabulation Model)
 * - ADaM (Analysis Data Model)
 * - Define-XML metadata
 * - SEND (Standard for Exchange of Nonclinical Data)
 * - Product Quality (PQ) domains
 * - Medical Device domains
 *
 * Full multi-tenant support with RLS policies
 * Complete audit trail for 21 CFR Part 11 compliance
 */

// ============================================================================
// 1. PROTOCOL DESIGNER - CDISC Protocol Representation Model (PRM)
// ============================================================================

// PRM Studies - Core study protocol information
export const cdiscPrmStudies = pgTable(
  'cdisc_prm_studies',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull().unique(),
    protocolId: varchar('protocol_id', { length: 100 }).notNull(),
    protocolTitle: text('protocol_title').notNull(),
    protocolVersion: varchar('protocol_version', { length: 20 }).notNull(),
    studyPhase: varchar('study_phase', { length: 20 }), // Phase I, II, III, IV
    studyType: varchar('study_type', { length: 50 }), // Interventional, Observational
    therapeuticArea: text('therapeutic_area'),
    indication: text('indication'),
    primaryObjective: text('primary_objective'),
    secondaryObjectives: json('secondary_objectives'),
    studyDesign: text('study_design'),
    blindingSchema: varchar('blinding_schema', { length: 50 }), // Open, Single, Double
    randomization: json('randomization'), // Randomization details
    populationDescription: text('population_description'),
    plannedSubjects: integer('planned_subjects'),
    studyDuration: integer('study_duration'), // in days
    regulatoryRequirements: json('regulatory_requirements'),
    protocolStatus: varchar('protocol_status', { length: 50 }).default('draft'),
    approvalDate: date('approval_date'),
    amendmentHistory: json('amendment_history'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: text('created_by'),
    lastModifiedBy: text('last_modified_by'),
  },
  table => ({
    tenantStudyIdx: uniqueIndex('prm_tenant_study_idx').on(table.tenantId, table.studyId),
    protocolIdx: index('prm_protocol_idx').on(table.protocolId),
    phaseIdx: index('prm_phase_idx').on(table.studyPhase),
  })
);

// PRM Study Arms - Treatment arms and cohorts
export const cdiscPrmStudyArms = pgTable(
  'cdisc_prm_study_arms',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    armCode: varchar('arm_code', { length: 20 }).notNull(),
    armName: text('arm_name').notNull(),
    armDescription: text('arm_description'),
    armType: varchar('arm_type', { length: 50 }), // Treatment, Control, Placebo
    plannedSubjects: integer('planned_subjects'),
    treatmentDescription: text('treatment_description'),
    dosing: json('dosing'), // Dosing regimen details
    duration: integer('duration'), // in days
    sequenceNumber: integer('sequence_number'),
    isActive: boolean('is_active').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyArmIdx: uniqueIndex('prm_study_arm_idx').on(table.studyId, table.armCode),
  })
);

// PRM Study Epochs - Study periods/phases
export const cdiscPrmEpochs = pgTable(
  'cdisc_prm_epochs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    epochCode: varchar('epoch_code', { length: 20 }).notNull(),
    epochName: text('epoch_name').notNull(),
    epochType: varchar('epoch_type', { length: 50 }), // Screening, Treatment, Follow-up
    duration: integer('duration'), // in days
    sequenceNumber: integer('sequence_number'),
    description: text('description'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyEpochIdx: uniqueIndex('prm_study_epoch_idx').on(table.studyId, table.epochCode),
  })
);

// PRM Study Visits - Scheduled visits
export const cdiscPrmVisits = pgTable(
  'cdisc_prm_visits',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    visitNum: varchar('visit_num', { length: 20 }).notNull(),
    visitName: text('visit_name').notNull(),
    visitLabel: text('visit_label'),
    epochCode: varchar('epoch_code', { length: 20 }),
    visitDay: integer('visit_day'), // Study day
    visitWindow: json('visit_window'), // {lower: -3, upper: 3}
    visitType: varchar('visit_type', { length: 50 }), // Scheduled, Unscheduled
    procedures: json('procedures'), // List of procedures
    assessments: json('assessments'), // List of assessments
    sequenceNumber: integer('sequence_number'),
    isMandatory: boolean('is_mandatory').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyVisitIdx: uniqueIndex('prm_study_visit_idx').on(table.studyId, table.visitNum),
  })
);

// PRM Endpoints - Primary and secondary endpoints
export const cdiscPrmEndpoints = pgTable(
  'cdisc_prm_endpoints',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    endpointId: varchar('endpoint_id', { length: 50 }).notNull(),
    endpointType: varchar('endpoint_type', { length: 20 }).notNull(), // Primary, Secondary, Exploratory
    endpointName: text('endpoint_name').notNull(),
    endpointDescription: text('endpoint_description'),
    measurementType: varchar('measurement_type', { length: 50 }), // Continuous, Binary, Time-to-event
    analysisMethod: text('analysis_method'),
    timepoint: text('timepoint'),
    successCriteria: text('success_criteria'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyEndpointIdx: uniqueIndex('prm_study_endpoint_idx').on(table.studyId, table.endpointId),
  })
);

// ============================================================================
// 2. STUDY DESIGNER - CDASH Forms Implementation
// ============================================================================

// CDASH Form Templates - Standardized CRF templates
export const cdiscCdashForms = pgTable(
  'cdisc_cdash_forms',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    formId: varchar('form_id', { length: 100 }).notNull(),
    formName: text('form_name').notNull(),
    formLabel: text('form_label'),
    domain: varchar('domain', { length: 20 }).notNull(), // DM, AE, CM, LB, VS, etc.
    formType: varchar('form_type', { length: 50 }), // Enrollment, Visit, Event
    cdashVersion: varchar('cdash_version', { length: 20 }).default('1.1'),
    formStructure: json('form_structure'), // Complete form definition
    fields: json('fields'), // Array of field definitions
    validationRules: json('validation_rules'),
    isStandard: boolean('is_standard').default(true),
    isActive: boolean('is_active').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    tenantFormIdx: uniqueIndex('cdash_tenant_form_idx').on(table.tenantId, table.formId),
    domainIdx: index('cdash_domain_idx').on(table.domain),
  })
);

// CDASH Field Definitions - Individual form fields
export const cdiscCdashFields = pgTable(
  'cdisc_cdash_fields',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    formId: varchar('form_id', { length: 100 })
      .notNull()
      .references(() => cdiscCdashForms.formId),
    fieldName: varchar('field_name', { length: 50 }).notNull(),
    cdashVariable: varchar('cdash_variable', { length: 40 }).notNull(),
    fieldLabel: text('field_label'),
    fieldType: varchar('field_type', { length: 30 }), // text, number, date, select
    dataType: varchar('data_type', { length: 30 }), // Char, Num, Date
    fieldLength: integer('field_length'),
    required: boolean('required').default(false),
    controlledTerminology: varchar('controlled_terminology', { length: 100 }),
    codeList: json('code_list'), // Allowed values
    validationRules: json('validation_rules'),
    sdtmMapping: varchar('sdtm_mapping', { length: 40 }), // Target SDTM variable
    sequenceNumber: integer('sequence_number'),
    isCore: boolean('is_core').default(false),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    formFieldIdx: uniqueIndex('cdash_form_field_idx').on(table.formId, table.fieldName),
    variableIdx: index('cdash_variable_idx').on(table.cdashVariable),
  })
);

// CDASH to SDTM Mappings
export const cdiscCdashSdtmMappings = pgTable(
  'cdisc_cdash_sdtm_mappings',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }),
    cdashDomain: varchar('cdash_domain', { length: 20 }).notNull(),
    cdashVariable: varchar('cdash_variable', { length: 40 }).notNull(),
    sdtmDomain: varchar('sdtm_domain', { length: 20 }).notNull(),
    sdtmVariable: varchar('sdtm_variable', { length: 40 }).notNull(),
    mappingType: varchar('mapping_type', { length: 30 }), // Direct, Derived, Conditional
    mappingLogic: text('mapping_logic'),
    transformationRule: text('transformation_rule'),
    isActive: boolean('is_active').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    cdashSdtmIdx: uniqueIndex('cdash_sdtm_idx').on(
      table.cdashDomain,
      table.cdashVariable,
      table.sdtmVariable
    ),
  })
);

// ============================================================================
// 3. CSR DATABASE INTELLIGENCE - CDISC Reporting
// ============================================================================

// CSR Templates - Clinical Study Report templates
export const cdiscCsrTemplates = pgTable(
  'cdisc_csr_templates',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    templateId: varchar('template_id', { length: 100 }).notNull(),
    templateName: text('template_name').notNull(),
    templateType: varchar('template_type', { length: 50 }), // ICH E3, FDA, EMA
    sections: json('sections'), // CSR section structure
    tflSpecs: json('tfl_specs'), // Table, Figure, Listing specifications
    dataRequirements: json('data_requirements'),
    version: varchar('version', { length: 20 }).default('1.0'),
    isActive: boolean('is_active').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    tenantTemplateIdx: uniqueIndex('csr_tenant_template_idx').on(table.tenantId, table.templateId),
  })
);

// TFL Metadata - Tables, Figures, Listings definitions
export const cdiscCsrTfl = pgTable(
  'cdisc_csr_tfl',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }),
    tflId: varchar('tfl_id', { length: 50 }).notNull(),
    tflType: varchar('tfl_type', { length: 20 }).notNull(), // Table, Figure, Listing
    tflNumber: varchar('tfl_number', { length: 20 }).notNull(),
    title: text('title').notNull(),
    description: text('description'),
    population: varchar('population', { length: 50 }), // ITT, PP, Safety
    datasets: json('datasets'), // Required ADaM datasets
    programmingLogic: text('programming_logic'),
    shellTemplate: text('shell_template'), // Shell/mock
    outputFormat: varchar('output_format', { length: 20 }), // RTF, PDF, HTML
    csrSection: varchar('csr_section', { length: 50 }),
    priority: varchar('priority', { length: 20 }).default('medium'),
    status: varchar('status', { length: 30 }).default('planned'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyTflIdx: uniqueIndex('csr_study_tfl_idx').on(table.studyId, table.tflId),
    tflNumberIdx: index('csr_tfl_number_idx').on(table.tflNumber),
  })
);

// Statistical Analysis Plan (SAP) in CDISC format
export const cdiscCsrSap = pgTable(
  'cdisc_csr_sap',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    sapVersion: varchar('sap_version', { length: 20 }).notNull(),
    sapDate: date('sap_date'),
    populations: json('populations'), // Analysis populations
    endpoints: json('endpoints'), // Statistical endpoints
    analysisSets: json('analysis_sets'),
    statisticalMethods: json('statistical_methods'),
    missingDataHandling: text('missing_data_handling'),
    interimAnalyses: json('interim_analyses'),
    multiplicity: text('multiplicity'),
    sampleSizeCalculation: json('sample_size_calculation'),
    adamDatasets: json('adam_datasets'), // Required ADaM datasets
    status: varchar('status', { length: 30 }).default('draft'),
    approvalDate: date('approval_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studySapIdx: uniqueIndex('csr_study_sap_idx').on(table.studyId, table.sapVersion),
  })
);

// CSR Reports - Clinical Safety Reports
export const csrReports = pgTable('csr_reports', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
  reportId: text('report_id').notNull().unique(),
  reportTitle: text('report_title').notNull(),
  title: text('title'),
  sponsor: text('sponsor'),
  indication: text('indication'),
  phase: text('phase'),
  reportDate: date('report_date'),
  reportType: text('report_type'), // periodic, expedited, annual
  studyId: text('study_id'),
  status: text('status').default('draft').notNull(), // draft, in_review, submitted, approved
  submissionDate: timestamp('submission_date'),
  dueDate: timestamp('due_date'),
  uploadDate: timestamp('upload_date').defaultNow().notNull(),
  sampleSize: integer('sample_size'),
  durationWeeks: integer('duration_weeks'),
  studyDesign: text('study_design'),
  primaryEndpoint: text('primary_endpoint'),
  secondaryEndpoints: text('secondary_endpoints'),
  deletedAt: timestamp('deleted_at'),
  content: json('content'),
  metadata: json('metadata'),
  complianceStatus: text('compliance_status'),
  regulatoryAgency: text('regulatory_agency'), // FDA, EMA, PMDA, etc.
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// CSR Details - Study-level details for protocol/design analytics
export const csrDetails = pgTable('csr_details', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id')
    .notNull()
    .references(() => csrReports.id),
  studyDesign: text('study_design'),
  primaryObjective: text('primary_objective'),
  secondaryObjective: text('secondary_objective'),
  primaryEndpoint: text('primary_endpoint'),
  secondaryEndpoints: text('secondary_endpoints'),
  inclusionCriteria: text('inclusion_criteria'),
  exclusionCriteria: text('exclusion_criteria'),
  sampleSize: integer('sample_size'),
  dropoutRate: real('dropout_rate'),
  blinding: text('blinding'),
  randomization: text('randomization'),
  statisticalMethods: text('statistical_methods'),
  efficacyResults: text('efficacy_results'),
  safetyResults: text('safety_results'),
  adverseEvents: text('adverse_events'),
  seriousEvents: text('serious_events'),
  patientReportedOutcome: text('patient_reported_outcome'),
  biomarkerUsed: text('biomarker_used'),
  endpoints: json('endpoints'),
  results: json('results'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Protocols - high-level protocol records used by strategy services
export const protocols = pgTable('protocols', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
  title: text('title').notNull(),
  indication: text('indication'),
  phase: text('phase'),
  status: text('status').default('draft').notNull(),
  version: text('version'),
  content: json('content'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Strategic Reports - portfolio/strategy analysis outputs
export const strategicReports = pgTable('strategic_reports', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
  reportId: text('report_id').notNull().unique(),
  title: text('title').notNull(),
  summary: text('summary'),
  content: json('content'),
  status: text('status').default('draft').notNull(),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Generic Reports - used by intelligence and analytics services
export const reports = pgTable('reports', {
  id: serial('id').primaryKey(),
  organizationId: integer('organization_id')
    .notNull()
    .references(() => organizations.id),
  clientWorkspaceId: integer('client_workspace_id').references(() => clientWorkspaces.id),
  reportType: text('report_type').notNull(),
  title: text('title').notNull(),
  status: text('status').default('draft').notNull(),
  content: json('content'),
  metadata: json('metadata'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// Report Details - supplemental data linked to reports
export const reportDetails = pgTable('report_details', {
  id: serial('id').primaryKey(),
  reportId: integer('report_id')
    .notNull()
    .references(() => reports.id),
  section: text('section'),
  details: json('details'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// ADaM Dataset Specifications
export const cdiscAdamSpecs = pgTable(
  'cdisc_adam_specs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }),
    datasetName: varchar('dataset_name', { length: 40 }).notNull(),
    datasetLabel: text('dataset_label'),
    datasetClass: varchar('dataset_class', { length: 40 }), // ADSL, BDS, OCCDS
    datasetStructure: json('dataset_structure'),
    variables: json('variables'), // Variable specifications
    derivations: json('derivations'), // Derivation rules
    sourceDatasets: json('source_datasets'), // SDTM sources
    keyVariables: json('key_variables'),
    analysisVariables: json('analysis_variables'),
    version: varchar('version', { length: 20 }).default('1.0'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyDatasetIdx: uniqueIndex('adam_study_dataset_idx').on(table.studyId, table.datasetName),
  })
);

// ============================================================================
// 4. eCTD CO-AUTHOR - CDISC Dataset Generation
// ============================================================================

// Define-XML Generation Configuration
export const cdiscEctdDefineXml = pgTable(
  'cdisc_ectd_define_xml',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    defineVersion: varchar('define_version', { length: 20 }).default('2.1'),
    defineId: varchar('define_id', { length: 100 }).notNull(),
    creationDateTime: timestamp('creation_date_time').defaultNow().notNull(),
    studyName: text('study_name'),
    studyDescription: text('study_description'),
    protocolName: text('protocol_name'),
    datasetMetadata: json('dataset_metadata'), // All dataset definitions
    variableMetadata: json('variable_metadata'), // All variable definitions
    codeLists: json('code_lists'), // Controlled terminology
    valueLevelMetadata: json('value_level_metadata'),
    whereClauseDef: json('where_clause_def'),
    computationMethods: json('computation_methods'),
    comments: json('comments'),
    standards: json('standards'), // SDTM, ADaM versions
    status: varchar('status', { length: 30 }).default('draft'),
    xmlContent: text('xml_content'), // Generated XML
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyDefineIdx: uniqueIndex('ectd_study_define_idx').on(table.studyId, table.defineId),
  })
);

// Dataset Packaging Configuration
export const cdiscEctdDatasets = pgTable(
  'cdisc_ectd_datasets',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    datasetType: varchar('dataset_type', { length: 20 }).notNull(), // SDTM, ADaM, SEND
    datasetName: varchar('dataset_name', { length: 40 }).notNull(),
    datasetLabel: text('dataset_label'),
    datasetLocation: text('dataset_location'), // File path/URI
    fileFormat: varchar('file_format', { length: 20 }).default('xpt'), // xpt, sas7bdat
    fileSize: integer('file_size'), // in bytes
    recordCount: integer('record_count'),
    variableCount: integer('variable_count'),
    splitMethod: varchar('split_method', { length: 50 }), // For split datasets
    datasetMd5: varchar('dataset_md5', { length: 32 }),
    isSupplemental: boolean('is_supplemental').default(false),
    version: varchar('version', { length: 20 }),
    status: varchar('status', { length: 30 }).default('pending'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyDatasetIdx: uniqueIndex('ectd_study_dataset_idx').on(table.studyId, table.datasetName),
  })
);

// Reviewer's Guide Templates
export const cdiscEctdReviewersGuide = pgTable(
  'cdisc_ectd_reviewers_guide',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    guideVersion: varchar('guide_version', { length: 20 }).notNull(),
    guideType: varchar('guide_type', { length: 30 }), // SDRG, ADRG
    sections: json('sections'), // Guide sections
    conformanceFindings: json('conformance_findings'),
    dataIssues: json('data_issues'),
    traceabilityMatrix: json('traceability_matrix'),
    customDomains: json('custom_domains'),
    derivationDetails: json('derivation_details'),
    validationResults: json('validation_results'),
    status: varchar('status', { length: 30 }).default('draft'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyGuideIdx: uniqueIndex('ectd_study_guide_idx').on(table.studyId, table.guideVersion),
  })
);

// Study Data Standardization Plan (SDSP)
export const cdiscEctdSdsp = pgTable(
  'cdisc_ectd_sdsp',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    sdspVersion: varchar('sdsp_version', { length: 20 }).notNull(),
    standardsUsed: json('standards_used'), // CDISC standards and versions
    domainsPlan: json('domains_plan'), // Planned domains
    controlledTerminology: json('controlled_terminology'),
    customVariables: json('custom_variables'),
    dataFlowDiagram: text('data_flow_diagram'),
    mappingStrategy: text('mapping_strategy'),
    validationPlan: text('validation_plan'),
    deliverySchedule: json('delivery_schedule'),
    status: varchar('status', { length: 30 }).default('draft'),
    approvalDate: date('approval_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studySdspIdx: uniqueIndex('ectd_study_sdsp_idx').on(table.studyId, table.sdspVersion),
  })
);

// ============================================================================
// 5. IND WIZARD - CDISC Clinical Data Integration
// ============================================================================

// IND CDISC Integration
export const cdiscIndIntegration = pgTable(
  'cdisc_ind_integration',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    indNumber: varchar('ind_number', { length: 50 }).notNull(),
    studyId: varchar('study_id', { length: 100 }),
    submissionType: varchar('submission_type', { length: 50 }), // Initial, Amendment, Annual
    clinicalDataPackage: json('clinical_data_package'), // SDTM/ADaM datasets
    nonclinicalDataPackage: json('nonclinical_data_package'), // SEND datasets
    integratedAnalyses: json('integrated_analyses'), // ISS/ISE references
    dataSubmissionDate: date('data_submission_date'),
    dataStatus: varchar('data_status', { length: 30 }).default('pending'),
    validationStatus: varchar('validation_status', { length: 30 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    indIntegrationIdx: uniqueIndex('ind_integration_idx').on(table.indNumber, table.studyId),
  })
);

// SEND Domains - Nonclinical data
export const cdiscIndSend = pgTable(
  'cdisc_ind_send',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    domain: varchar('domain', { length: 20 }).notNull(), // DM, EX, BW, CL, etc.
    domainLabel: text('domain_label'),
    datasetName: varchar('dataset_name', { length: 40 }).notNull(),
    speciesCode: varchar('species_code', { length: 20 }),
    studyType: varchar('study_type', { length: 50 }), // Tox, PK, Carcinogenicity
    testArticle: text('test_article'),
    dataStructure: json('data_structure'),
    variables: json('variables'),
    controlledTerms: json('controlled_terms'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    sendDomainIdx: uniqueIndex('send_domain_idx').on(table.studyId, table.domain),
  })
);

// Integrated Summary of Safety (ISS)
export const cdiscIndIss = pgTable(
  'cdisc_ind_iss',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    issId: varchar('iss_id', { length: 100 }).notNull(),
    indNumber: varchar('ind_number', { length: 50 }).notNull(),
    pooledStudies: json('pooled_studies'), // List of study IDs
    poolingStrategy: text('pooling_strategy'),
    safetyPopulation: json('safety_population'),
    adverseEvents: json('adverse_events'), // AE summary
    seriousAe: json('serious_ae'), // SAE summary
    deathsSummary: json('deaths_summary'),
    labAbnormalities: json('lab_abnormalities'),
    vitalSigns: json('vital_signs'),
    exposureData: json('exposure_data'),
    demographicData: json('demographic_data'),
    analysisDatasets: json('analysis_datasets'), // ADaM datasets used
    status: varchar('status', { length: 30 }).default('draft'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    issIdx: uniqueIndex('iss_idx').on(table.issId),
  })
);

// Integrated Summary of Efficacy (ISE)
export const cdiscIndIse = pgTable(
  'cdisc_ind_ise',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    iseId: varchar('ise_id', { length: 100 }).notNull(),
    indNumber: varchar('ind_number', { length: 50 }).notNull(),
    pooledStudies: json('pooled_studies'), // List of study IDs
    poolingRationale: text('pooling_rationale'),
    efficacyPopulation: json('efficacy_population'),
    primaryEndpoints: json('primary_endpoints'),
    secondaryEndpoints: json('secondary_endpoints'),
    subgroupAnalyses: json('subgroup_analyses'),
    doseResponse: json('dose_response'),
    timeToEvent: json('time_to_event'),
    analysisDatasets: json('analysis_datasets'), // ADaM datasets used
    status: varchar('status', { length: 30 }).default('draft'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    iseIdx: uniqueIndex('ise_idx').on(table.iseId),
  })
);

// ============================================================================
// 6. REGULATORY INTELLIGENCE - CDISC Compliance
// ============================================================================

// CDISC Validation Rules Repository
export const cdiscComplianceRules = pgTable(
  'cdisc_compliance_rules',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    ruleId: varchar('rule_id', { length: 50 }).notNull(),
    ruleCategory: varchar('rule_category', { length: 50 }), // Structure, Content, Terminology
    standard: varchar('standard', { length: 30 }), // SDTM, ADaM, SEND, CDASH
    standardVersion: varchar('standard_version', { length: 20 }),
    agency: varchar('agency', { length: 20 }), // FDA, EMA, PMDA
    ruleType: varchar('rule_type', { length: 30 }), // Error, Warning, Info
    severity: varchar('severity', { length: 20 }), // Critical, Major, Minor
    description: text('description'),
    checkLogic: text('check_logic'), // Validation logic
    errorMessage: text('error_message'),
    remediationGuidance: text('remediation_guidance'),
    isActive: boolean('is_active').default(true),
    effectiveDate: date('effective_date'),
    expirationDate: date('expiration_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    ruleIdx: uniqueIndex('compliance_rule_idx').on(table.ruleId, table.standard),
    agencyIdx: index('compliance_agency_idx').on(table.agency),
  })
);

// Compliance Check Results
export const cdiscComplianceResults = pgTable(
  'cdisc_compliance_results',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    checkRunId: varchar('check_run_id', { length: 100 }).notNull(),
    checkDate: timestamp('check_date').defaultNow().notNull(),
    standard: varchar('standard', { length: 30 }),
    datasetName: varchar('dataset_name', { length: 40 }),
    ruleId: varchar('rule_id', { length: 50 }),
    findingType: varchar('finding_type', { length: 30 }), // Error, Warning, Info
    findingMessage: text('finding_message'),
    recordId: varchar('record_id', { length: 100 }),
    variableName: varchar('variable_name', { length: 40 }),
    value: text('value'),
    expectedValue: text('expected_value'),
    isResolved: boolean('is_resolved').default(false),
    resolutionDate: timestamp('resolution_date'),
    resolutionNotes: text('resolution_notes'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    checkRunIdx: index('compliance_check_run_idx').on(table.checkRunId),
    studyCheckIdx: index('compliance_study_check_idx').on(table.studyId, table.checkDate),
  })
);

// Regulatory Agency Preferences
export const cdiscComplianceAgencyPrefs = pgTable(
  'cdisc_compliance_agency_prefs',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    agency: varchar('agency', { length: 20 }).notNull(), // FDA, EMA, PMDA, HC, TGA
    region: varchar('region', { length: 50 }),
    preferredStandards: json('preferred_standards'), // CDISC versions
    requiredDomains: json('required_domains'),
    mandatoryVariables: json('mandatory_variables'),
    submissionFormat: json('submission_format'),
    specialRequirements: json('special_requirements'),
    guidanceDocuments: json('guidance_documents'),
    effectiveDate: date('effective_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    agencyPrefIdx: uniqueIndex('agency_pref_idx').on(table.agency, table.region),
  })
);

// CDISC Standards Version Control
export const cdiscComplianceVersions = pgTable(
  'cdisc_compliance_versions',
  {
    id: serial('id').primaryKey(),
    standard: varchar('standard', { length: 30 }).notNull(),
    version: varchar('version', { length: 20 }).notNull(),
    releaseDate: date('release_date'),
    implementationDate: date('implementation_date'),
    retirementDate: date('retirement_date'),
    changes: json('changes'), // Change summary
    impactedDomains: json('impacted_domains'),
    migrationNotes: text('migration_notes'),
    isSupported: boolean('is_supported').default(true),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    standardVersionIdx: uniqueIndex('standard_version_idx').on(table.standard, table.version),
  })
);

// ============================================================================
// 7. VAULT DMS - CDISC Document Management
// ============================================================================

// CDISC Document Repository
export const cdiscDocsRepository = pgTable(
  'cdisc_docs_repository',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    docId: varchar('doc_id', { length: 100 }).notNull(),
    studyId: varchar('study_id', { length: 100 }),
    docType: varchar('doc_type', { length: 50 }).notNull(), // aCRF, Define-XML, SDRG, ADRG
    docName: text('doc_name').notNull(),
    docVersion: varchar('doc_version', { length: 20 }),
    filePath: text('file_path'),
    fileSize: integer('file_size'),
    mimeType: varchar('mime_type', { length: 100 }),
    linkedDatasets: json('linked_datasets'), // Associated CDISC datasets
    annotations: json('annotations'), // Document annotations
    status: varchar('status', { length: 30 }).default('draft'),
    checksum: varchar('checksum', { length: 64 }), // SHA-256
    isLocked: boolean('is_locked').default(false),
    lockedBy: text('locked_by'),
    lockedAt: timestamp('locked_at'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    createdBy: text('created_by'),
    lastModifiedBy: text('last_modified_by'),
  },
  table => ({
    docIdx: uniqueIndex('docs_doc_idx').on(table.docId, table.docVersion),
    studyDocIdx: index('docs_study_doc_idx').on(table.studyId, table.docType),
  })
);

// Annotated CRF Management
export const cdiscDocsAcrf = pgTable(
  'cdisc_docs_acrf',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 })
      .notNull()
      .references(() => cdiscPrmStudies.studyId),
    acrfVersion: varchar('acrf_version', { length: 20 }).notNull(),
    formName: text('form_name'),
    pageNumber: integer('page_number'),
    fieldName: varchar('field_name', { length: 50 }),
    cdashVariable: varchar('cdash_variable', { length: 40 }),
    sdtmDomain: varchar('sdtm_domain', { length: 20 }),
    sdtmVariable: varchar('sdtm_variable', { length: 40 }),
    annotation: text('annotation'),
    coordinates: json('coordinates'), // {x, y, width, height}
    isRequired: boolean('is_required').default(false),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    acrfIdx: index('acrf_idx').on(table.studyId, table.acrfVersion),
  })
);

// Define-XML Artifacts
export const cdiscDocsDefineArtifacts = pgTable(
  'cdisc_docs_define_artifacts',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    defineId: varchar('define_id', { length: 100 })
      .notNull()
      .references(() => cdiscEctdDefineXml.defineId),
    artifactType: varchar('artifact_type', { length: 50 }), // Stylesheet, PDF, Schema
    artifactName: text('artifact_name'),
    artifactPath: text('artifact_path'),
    version: varchar('version', { length: 20 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    defineArtifactIdx: index('define_artifact_idx').on(table.defineId, table.artifactType),
  })
);

// ============================================================================
// 8. CMC & STABILITY - Product Quality CDISC
// ============================================================================

// Product Quality (PQ) Domains
export const cdiscPqDomains = pgTable(
  'cdisc_pq_domains',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    productId: varchar('product_id', { length: 100 }).notNull(),
    batchId: varchar('batch_id', { length: 100 }),
    domain: varchar('domain', { length: 20 }).notNull(), // IS, RS, MS, etc.
    domainLabel: text('domain_label'),
    testCategory: varchar('test_category', { length: 50 }), // Identity, Potency, Purity
    testName: text('test_name'),
    testMethod: text('test_method'),
    specification: text('specification'),
    results: json('results'), // Test results
    units: varchar('units', { length: 50 }),
    testDate: date('test_date'),
    laboratoryId: varchar('laboratory_id', { length: 50 }),
    analystId: varchar('analyst_id', { length: 50 }),
    equipmentId: varchar('equipment_id', { length: 50 }),
    complianceStatus: varchar('compliance_status', { length: 30 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    pqDomainIdx: index('pq_domain_idx').on(table.productId, table.domain),
    batchPqIdx: index('batch_pq_idx').on(table.batchId, table.testCategory),
  })
);

// Stability Data in CDISC Format
export const cdiscPqStability = pgTable(
  'cdisc_pq_stability',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    batchId: varchar('batch_id', { length: 100 }).notNull(),
    storageCondition: varchar('storage_condition', { length: 50 }), // 25C/60RH, 40C/75RH
    orientation: varchar('orientation', { length: 30 }), // Upright, Inverted
    container: varchar('container', { length: 100 }),
    timepoint: varchar('timepoint', { length: 20 }), // 0M, 3M, 6M, 12M
    timepointValue: integer('timepoint_value'), // in days
    parameter: varchar('parameter', { length: 100 }),
    result: decimal('result', { precision: 15, scale: 5 }),
    units: varchar('units', { length: 50 }),
    specification: text('specification'),
    conformance: boolean('conformance').default(true),
    oos: boolean('oos').default(false), // Out of specification
    testDate: date('test_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    stabilityStudyIdx: index('stability_study_idx').on(table.studyId, table.batchId),
    timepointIdx: index('stability_timepoint_idx').on(table.timepoint),
  })
);

// Manufacturing Batch Records in CDISC Format
export const cdiscPqManufacturing = pgTable(
  'cdisc_pq_manufacturing',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    batchId: varchar('batch_id', { length: 100 }).notNull(),
    productId: varchar('product_id', { length: 100 }).notNull(),
    processStep: varchar('process_step', { length: 100 }),
    stepSequence: integer('step_sequence'),
    parameter: varchar('parameter', { length: 100 }),
    targetValue: decimal('target_value', { precision: 15, scale: 5 }),
    actualValue: decimal('actual_value', { precision: 15, scale: 5 }),
    lowerLimit: decimal('lower_limit', { precision: 15, scale: 5 }),
    upperLimit: decimal('upper_limit', { precision: 15, scale: 5 }),
    units: varchar('units', { length: 50 }),
    equipment: varchar('equipment', { length: 100 }),
    operator: varchar('operator', { length: 100 }),
    startTime: timestamp('start_time'),
    endTime: timestamp('end_time'),
    duration: integer('duration'), // in minutes
    inProcess: boolean('in_process').default(false),
    deviation: boolean('deviation').default(false),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    batchManufacturingIdx: index('batch_manufacturing_idx').on(table.batchId, table.stepSequence),
  })
);

// ============================================================================
// 9. MEDICAL DEVICE - Device-specific CDISC
// ============================================================================

// Device Exposure (DX) Domain
export const cdiscDeviceDx = pgTable(
  'cdisc_device_dx',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    subjectId: varchar('subject_id', { length: 50 }).notNull(),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    deviceName: text('device_name'),
    deviceType: varchar('device_type', { length: 50 }),
    udi: varchar('udi', { length: 100 }), // Unique Device Identifier
    serialNumber: varchar('serial_number', { length: 100 }),
    lotNumber: varchar('lot_number', { length: 100 }),
    implantDate: date('implant_date'),
    explantDate: date('explant_date'),
    exposureDuration: integer('exposure_duration'), // in days
    anatomicalLocation: varchar('anatomical_location', { length: 100 }),
    laterality: varchar('laterality', { length: 20 }), // Left, Right, Bilateral
    deviceSize: varchar('device_size', { length: 50 }),
    reasonForUse: text('reason_for_use'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studySubjectDeviceIdx: index('device_study_subject_idx').on(
      table.studyId,
      table.subjectId,
      table.deviceId
    ),
  })
);

// Device Events (DE) Domain
export const cdiscDeviceDe = pgTable(
  'cdisc_device_de',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    subjectId: varchar('subject_id', { length: 50 }).notNull(),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    eventId: varchar('event_id', { length: 100 }).notNull(),
    eventTerm: text('event_term'),
    eventType: varchar('event_type', { length: 50 }), // Malfunction, Deficiency, Failure
    eventDate: date('event_date'),
    severity: varchar('severity', { length: 30 }), // Mild, Moderate, Severe
    relationship: varchar('relationship', { length: 50 }), // Related, Possibly Related, Not Related
    outcome: varchar('outcome', { length: 50 }),
    actionTaken: text('action_taken'),
    reportedToFda: boolean('reported_to_fda').default(false),
    mdrReportNumber: varchar('mdr_report_number', { length: 50 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    deviceEventIdx: index('device_event_idx').on(table.studyId, table.subjectId, table.eventId),
  })
);

// Device-Subject Relationships
export const cdiscDeviceRelationships = pgTable(
  'cdisc_device_relationships',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    subjectId: varchar('subject_id', { length: 50 }).notNull(),
    deviceId: varchar('device_id', { length: 100 }).notNull(),
    relationshipType: varchar('relationship_type', { length: 50 }), // Primary, Companion, Accessory
    startDate: date('start_date'),
    endDate: date('end_date'),
    devicePerformance: json('device_performance'), // Performance metrics
    patientReportedOutcomes: json('patient_reported_outcomes'),
    clinicianAssessments: json('clinician_assessments'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    deviceRelIdx: index('device_rel_idx').on(table.studyId, table.subjectId, table.deviceId),
  })
);

// ============================================================================
// 10. TASK MANAGEMENT - CDISC Workflow Integration
// ============================================================================

// CDISC Deliverables
export const cdiscTaskDeliverables = pgTable(
  'cdisc_task_deliverables',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    taskId: varchar('task_id', { length: 100 }).notNull(),
    deliverableId: varchar('deliverable_id', { length: 100 }).notNull(),
    deliverableType: varchar('deliverable_type', { length: 50 }), // Dataset, Document, Program
    cdiscStandard: varchar('cdisc_standard', { length: 30 }), // SDTM, ADaM, CDASH
    deliverableName: text('deliverable_name'),
    description: text('description'),
    assignedTo: text('assigned_to'),
    dueDate: date('due_date'),
    completionDate: date('completion_date'),
    status: varchar('status', { length: 30 }).default('pending'),
    priority: varchar('priority', { length: 20 }).default('medium'),
    dependencies: json('dependencies'), // Other deliverable IDs
    validationStatus: varchar('validation_status', { length: 30 }),
    reviewStatus: varchar('review_status', { length: 30 }),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    taskDeliverableIdx: uniqueIndex('task_deliverable_idx').on(table.taskId, table.deliverableId),
  })
);

// CDISC Milestones
export const cdiscTaskMilestones = pgTable(
  'cdisc_task_milestones',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    studyId: varchar('study_id', { length: 100 }).notNull(),
    milestoneId: varchar('milestone_id', { length: 100 }).notNull(),
    milestoneName: text('milestone_name'),
    milestoneType: varchar('milestone_type', { length: 50 }), // DBL, SDTM, ADaM, TLF
    targetDate: date('target_date'),
    actualDate: date('actual_date'),
    deliverables: json('deliverables'), // List of deliverable IDs
    completionCriteria: json('completion_criteria'),
    status: varchar('status', { length: 30 }).default('pending'),
    approvalRequired: boolean('approval_required').default(true),
    approvedBy: text('approved_by'),
    approvalDate: date('approval_date'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyMilestoneIdx: uniqueIndex('study_milestone_idx').on(table.studyId, table.milestoneId),
  })
);

// Dataset Preparation Workflows
export const cdiscTaskWorkflows = pgTable(
  'cdisc_task_workflows',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    workflowId: varchar('workflow_id', { length: 100 }).notNull(),
    workflowName: text('workflow_name'),
    workflowType: varchar('workflow_type', { length: 50 }), // SDTM, ADaM, Define-XML
    studyId: varchar('study_id', { length: 100 }),
    steps: json('steps'), // Workflow steps
    currentStep: integer('current_step').default(1),
    totalSteps: integer('total_steps'),
    startDate: timestamp('start_date'),
    completionDate: timestamp('completion_date'),
    status: varchar('status', { length: 30 }).default('pending'),
    automationLevel: varchar('automation_level', { length: 30 }), // Manual, Semi-Auto, Fully-Auto
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    workflowIdx: uniqueIndex('workflow_idx').on(table.workflowId),
  })
);

// Validation Task Queues
export const cdiscTaskValidationQueue = pgTable(
  'cdisc_task_validation_queue',
  {
    id: serial('id').primaryKey(),
    tenantId: integer('tenant_id')
      .notNull()
      .references(() => organizations.id),
    queueId: varchar('queue_id', { length: 100 }).notNull(),
    studyId: varchar('study_id', { length: 100 }),
    datasetName: varchar('dataset_name', { length: 40 }),
    validationType: varchar('validation_type', { length: 50 }), // Structure, Content, Business
    priority: varchar('priority', { length: 20 }).default('medium'),
    scheduledTime: timestamp('scheduled_time'),
    startTime: timestamp('start_time'),
    endTime: timestamp('end_time'),
    status: varchar('status', { length: 30 }).default('queued'),
    resultsSummary: json('results_summary'),
    errorCount: integer('error_count').default(0),
    warningCount: integer('warning_count').default(0),
    retryCount: integer('retry_count').default(0),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    queueIdx: index('validation_queue_idx').on(table.status, table.priority),
    studyQueueIdx: index('validation_study_queue_idx').on(table.studyId, table.validationType),
  })
);

// ============================================================================
// CDISC INTEGRATION SCHEMAS AND TYPES
// ============================================================================

// Create insert schemas for all CDISC tables
export const insertCdiscPrmStudySchema = createInsertSchemaOmit(cdiscPrmStudies, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscPrmStudyArmSchema = createInsertSchemaOmit(cdiscPrmStudyArms, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscPrmEpochSchema = createInsertSchemaOmit(cdiscPrmEpochs, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscPrmVisitSchema = createInsertSchemaOmit(cdiscPrmVisits, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscPrmEndpointSchema = createInsertSchemaOmit(cdiscPrmEndpoints, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscCdashFormSchema = createInsertSchemaOmit(cdiscCdashForms, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscCdashFieldSchema = createInsertSchemaOmit(cdiscCdashFields, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscCdashSdtmMappingSchema = createInsertSchemaOmit(cdiscCdashSdtmMappings, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscCsrTemplateSchema = createInsertSchemaOmit(cdiscCsrTemplates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscCsrTflSchema = createInsertSchemaOmit(cdiscCsrTfl, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCdiscCsrSapSchema = createInsertSchemaOmit(cdiscCsrSap, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCsrReportSchema = createInsertSchemaOmit(csrReports, {
  id: true,
  createdAt: true,
  updatedAt: true,
  uploadDate: true,
});

export const insertCdiscAdamSpecSchema = createInsertSchemaOmit(cdiscAdamSpecs, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for CDISC tables
export type CdiscPrmStudy = InferSelectModel<typeof cdiscPrmStudies>;
export type InsertCdiscPrmStudy = z.infer<typeof insertCdiscPrmStudySchema>;

export type CdiscPrmStudyArm = InferSelectModel<typeof cdiscPrmStudyArms>;
export type InsertCdiscPrmStudyArm = z.infer<typeof insertCdiscPrmStudyArmSchema>;

export type CdiscPrmEpoch = InferSelectModel<typeof cdiscPrmEpochs>;
export type InsertCdiscPrmEpoch = z.infer<typeof insertCdiscPrmEpochSchema>;

export type CdiscPrmVisit = InferSelectModel<typeof cdiscPrmVisits>;
export type InsertCdiscPrmVisit = z.infer<typeof insertCdiscPrmVisitSchema>;

export type CdiscPrmEndpoint = InferSelectModel<typeof cdiscPrmEndpoints>;
export type InsertCdiscPrmEndpoint = z.infer<typeof insertCdiscPrmEndpointSchema>;

export type CdiscCdashForm = InferSelectModel<typeof cdiscCdashForms>;
export type InsertCdiscCdashForm = z.infer<typeof insertCdiscCdashFormSchema>;

export type CdiscCdashField = InferSelectModel<typeof cdiscCdashFields>;
export type InsertCdiscCdashField = z.infer<typeof insertCdiscCdashFieldSchema>;

export type CdiscCdashSdtmMapping = InferSelectModel<typeof cdiscCdashSdtmMappings>;
export type InsertCdiscCdashSdtmMapping = z.infer<typeof insertCdiscCdashSdtmMappingSchema>;

export type CdiscCsrTemplate = InferSelectModel<typeof cdiscCsrTemplates>;
export type InsertCdiscCsrTemplate = z.infer<typeof insertCdiscCsrTemplateSchema>;

export type CdiscCsrTfl = InferSelectModel<typeof cdiscCsrTfl>;
export type InsertCdiscCsrTfl = z.infer<typeof insertCdiscCsrTflSchema>;

export type CdiscCsrSap = InferSelectModel<typeof cdiscCsrSap>;
export type InsertCdiscCsrSap = z.infer<typeof insertCdiscCsrSapSchema>;

export type CsrReport = InferSelectModel<typeof csrReports>;
export type InsertCsrReport = z.infer<typeof insertCsrReportSchema>;

export type CdiscAdamSpec = InferSelectModel<typeof cdiscAdamSpecs>;
export type InsertCdiscAdamSpec = z.infer<typeof insertCdiscAdamSpecSchema>;

// ============================================================================
// TYPES (keeping existing types)
// ============================================================================

export type IndProject = InferSelectModel<typeof indProjects>;
export type InsertIndProject = z.infer<typeof insertIndProjectSchema>;

export type IndTemplate = InferSelectModel<typeof indTemplates>;
export type InsertIndTemplate = z.infer<typeof insertIndTemplateSchema>;

export type WorkflowProgress = InferSelectModel<typeof workflowProgress>;
export type InsertWorkflowProgress = z.infer<typeof insertWorkflowProgressSchema>;

export type IndTemplateUsageLog = InferSelectModel<typeof indTemplateUsageLogs>;
export type InsertIndTemplateUsageLog = z.infer<typeof insertIndTemplateUsageLogSchema>;

export type IndSubmission = InferSelectModel<typeof indSubmissions>;
export type InsertIndSubmission = z.infer<typeof insertIndSubmissionSchema>;

export type CoauthorSection = InferSelectModel<typeof coauthorSections>;
export type InsertCoauthorSection = z.infer<typeof insertCoauthorSectionSchema>;

export type CoauthorAnnotation = InferSelectModel<typeof coauthorAnnotations>;
export type InsertCoauthorAnnotation = z.infer<typeof insertCoauthorAnnotationSchema>;

// Regulatory Submission Center Types
export type RegulatorySubmission = InferSelectModel<typeof regulatorySubmissions>;
export type InsertRegulatorySubmission = z.infer<typeof insertRegulatorySubmissionSchema>;

export type RegulatoryTask = InferSelectModel<typeof regulatoryTasks>;
export type InsertRegulatoryTask = z.infer<typeof insertRegulatoryTaskSchema>;

export type StageGate = InferSelectModel<typeof stageGates>;
export type InsertStageGate = z.infer<typeof insertStageGateSchema>;

export type GateApproval = InferSelectModel<typeof gateApprovals>;
export type InsertGateApproval = z.infer<typeof insertGateApprovalSchema>;

export type RegulatoryAuditLog = InferSelectModel<typeof regulatoryAuditLogs>;
export type InsertRegulatoryAuditLog = z.infer<typeof insertRegulatoryAuditLogSchema>;

// ============================================================================
// FORESIGHTAI™ TRANSLATIONAL INTELLIGENCE ENGINE
// ============================================================================

/**
 * Biomarker-Endpoint Relationships Table
 * Core of the translational knowledge graph connecting preclinical markers to clinical outcomes
 */
export const biomarkerEndpoints = pgTable(
  'biomarker_endpoints',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    biomarkerId: varchar('biomarker_id', { length: 255 }).notNull(),
    biomarkerName: text('biomarker_name').notNull(),
    biomarkerType: text('biomarker_type'), // protein, gene, metabolite, imaging, clinical
    endpointId: varchar('endpoint_id', { length: 255 }).notNull(),
    endpointName: text('endpoint_name').notNull(),
    endpointType: text('endpoint_type'), // primary, secondary, exploratory, safety
    correlationScore: real('correlation_score').default(0),
    evidenceCount: integer('evidence_count').default(0),
    phase: text('phase'), // 0, I, II, III, IV
    indication: text('indication'),
    species: text('species'), // human, mouse, rat, dog, monkey
    dataSource: text('data_source'), // csr, clinical_trial, publication, rwe
    confidence: real('confidence').default(0.5),
    metadata: json('metadata'),
    organizationId: integer('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      biomarkerEndpointIdx: index('biomarker_endpoint_idx').on(table.biomarkerId, table.endpointId),
      phaseIdx: index('phase_idx').on(table.phase),
      organizationIdx: index('biomarker_org_idx').on(table.organizationId),
    };
  }
);

/**
 * Clinical Outcomes Table
 * Stores actual clinical outcomes linked to biomarker-endpoint relationships
 */
export const clinicalOutcomes = pgTable(
  'clinical_outcomes',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: varchar('study_id', { length: 255 }).notNull(),
    biomarkerEndpointId: uuid('biomarker_endpoint_id').references(() => biomarkerEndpoints.id),
    outcomeType: text('outcome_type').notNull(), // success, failure, partial, inconclusive
    outcomeValue: json('outcome_value'), // Flexible storage for various outcome metrics
    phase: text('phase'),
    patientCount: integer('patient_count'),
    timepoint: text('timepoint'), // Week 12, Month 6, etc
    statisticalSignificance: real('statistical_significance'),
    adverseEvents: json('adverse_events'),
    failureReasons: text('failure_reasons').array(),
    metadata: json('metadata'),
    organizationId: integer('organization_id').references(() => organizations.id),
    capturedAt: timestamp('captured_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => {
    return {
      studyIdx: index('outcome_study_idx').on(table.studyId),
      biomarkerEndpointIdx: index('outcome_biomarker_endpoint_idx').on(table.biomarkerEndpointId),
    };
  }
);

/**
 * ForesightAI Predictions Table
 * Stores predictive scores and recommendations for studies
 */
export const foresightPredictions = pgTable(
  'foresight_predictions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: varchar('study_id', { length: 255 }).notNull(),
    phase: text('phase').notNull(),
    predictionType: text('prediction_type').notNull(), // success_score, enrollment_rate, safety_risk
    successScore: real('success_score'),
    confidenceInterval: json('confidence_interval'), // {lower: 0.65, upper: 0.85}
    riskFactors: json('risk_factors'), // [{factor: 'small_sample', impact: -0.15}]
    recommendations: json('recommendations'), // [{type: 'protocol', action: 'increase_dose'}]
    similarTrials: json('similar_trials'), // [{id: 'NCT123', similarity: 0.92}]
    failurePatterns: json('failure_patterns'), // [{pattern: 'dose_toxicity', probability: 0.23}]
    modelVersion: text('model_version'),
    organizationId: integer('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    expiresAt: timestamp('expires_at'),
  },
  table => {
    return {
      studyPhaseIdx: index('prediction_study_phase_idx').on(table.studyId, table.phase),
      orgIdx: index('prediction_org_idx').on(table.organizationId),
    };
  }
);

/**
 * Clinical Feedback Loop Table
 * Captures real-world outcomes for continuous learning
 */
export const clinicalFeedback = pgTable(
  'clinical_feedback',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: varchar('study_id', { length: 255 }).notNull(),
    predictionId: uuid('prediction_id').references(() => foresightPredictions.id),
    phase: text('phase'),
    feedbackType: text('feedback_type').notNull(), // outcome, protocol_change, safety_event
    actualOutcome: text('actual_outcome'),
    predictedOutcome: text('predicted_outcome'),
    accuracyScore: real('accuracy_score'),
    learningPoints: json('learning_points'), // Extracted insights for model improvement
    impactOnModel: json('impact_on_model'), // How this feedback affects future predictions
    verified: boolean('verified').default(false),
    verifiedBy: text('verified_by'),
    organizationId: integer('organization_id').references(() => organizations.id),
    capturedAt: timestamp('captured_at').defaultNow().notNull(),
    processedAt: timestamp('processed_at'),
  },
  table => {
    return {
      studyIdx: index('feedback_study_idx').on(table.studyId),
      predictionIdx: index('feedback_prediction_idx').on(table.predictionId),
    };
  }
);

/**
 * Translational Patterns Table
 * Stores learned patterns from preclinical to clinical translation
 */
export const translationalPatterns = pgTable(
  'translational_patterns',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    patternName: text('pattern_name').notNull(),
    patternType: text('pattern_type').notNull(), // success, failure, correlation, anomaly
    preclinicalMarkers: json('preclinical_markers'), // Array of markers
    clinicalEndpoints: json('clinical_endpoints'), // Array of endpoints
    successRate: real('success_rate'),
    occurrenceCount: integer('occurrence_count').default(1),
    indication: text('indication'),
    phase: text('phase'),
    species: text('species').array(),
    confidence: real('confidence').default(0.5),
    lastObserved: timestamp('last_observed'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => {
    return {
      patternTypeIdx: index('pattern_type_idx').on(table.patternType),
      indicationIdx: index('pattern_indication_idx').on(table.indication),
    };
  }
);

// Insert schemas for ForesightAI tables
export const insertBiomarkerEndpointSchema = createInsertSchemaOmit(biomarkerEndpoints, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertClinicalOutcomeSchema = createInsertSchemaOmit(clinicalOutcomes, {
  id: true,
  createdAt: true,
});

export const insertForesightPredictionSchema = createInsertSchemaOmit(foresightPredictions, {
  id: true,
  createdAt: true,
});

export const insertClinicalFeedbackSchema = createInsertSchemaOmit(clinicalFeedback, {
  id: true,
  capturedAt: true,
});

export const insertTranslationalPatternSchema = createInsertSchemaOmit(translationalPatterns, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for ForesightAI tables
export type BiomarkerEndpoint = InferSelectModel<typeof biomarkerEndpoints>;
export type InsertBiomarkerEndpoint = z.infer<typeof insertBiomarkerEndpointSchema>;

export type ClinicalOutcome = InferSelectModel<typeof clinicalOutcomes>;
export type InsertClinicalOutcome = z.infer<typeof insertClinicalOutcomeSchema>;

export type ForesightPrediction = InferSelectModel<typeof foresightPredictions>;
export type InsertForesightPrediction = z.infer<typeof insertForesightPredictionSchema>;

export type ClinicalFeedback = InferSelectModel<typeof clinicalFeedback>;
export type InsertClinicalFeedback = z.infer<typeof insertClinicalFeedbackSchema>;

export type TranslationalPattern = InferSelectModel<typeof translationalPatterns>;
export type InsertTranslationalPattern = z.infer<typeof insertTranslationalPatternSchema>;

// ============================================================================
// PHASE 0/I PRODUCTION MODULES
// ============================================================================

/**
 * Dose Escalation Studies Table
 * Manages dose escalation trials for Phase 0/I oncology and other studies
 */
export const doseEscalationStudies = pgTable(
  'dose_escalation_studies',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: varchar('study_id', { length: 255 }).notNull().unique(),
    protocolNumber: text('protocol_number').notNull(),
    title: text('title').notNull(),
    indication: text('indication').notNull(),
    phase: text('phase').notNull(), // 0, I, Ib
    escalationMethod: text('escalation_method').notNull(), // fibonacci, 3+3, boin, crm, mTPI
    startingDose: decimal('starting_dose', { precision: 10, scale: 4 }).notNull(),
    doseUnit: text('dose_unit').notNull(), // mg, mg/kg, mg/m2
    maxDose: decimal('max_dose', { precision: 10, scale: 4 }),
    targetToxicityRate: real('target_toxicity_rate').default(0.33), // For BOIN/CRM
    toxicityWindow: integer('toxicity_window').default(28), // DLT evaluation period in days
    status: text('status').default('active').notNull(), // active, completed, terminated, suspended
    currentDoseLevel: integer('current_dose_level').default(1),
    mtdDetermined: boolean('mtd_determined').default(false),
    mtdDose: decimal('mtd_dose', { precision: 10, scale: 4 }),
    recommendedPhase2Dose: decimal('rp2d', { precision: 10, scale: 4 }),
    totalPatients: integer('total_patients').default(0),
    dltsObserved: integer('dlts_observed').default(0),
    safetyRunIn: boolean('safety_run_in').default(false),
    stoppingRulesMet: boolean('stopping_rules_met').default(false),
    stoppingReason: text('stopping_reason'),
    regulatoryCompliance: json('regulatory_compliance'), // FDA/EMA guideline checks
    escalationParameters: json('escalation_parameters'), // Method-specific parameters
    organizationId: integer('organization_id').references(() => organizations.id),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdIdx: index('dose_study_id_idx').on(table.studyId),
    statusIdx: index('dose_study_status_idx').on(table.status),
    orgIdx: index('dose_study_org_idx').on(table.organizationId),
  })
);

/**
 * Dose Levels Table
 * Predefined dose levels for escalation studies
 */
export const doseLevels = pgTable(
  'dose_levels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: uuid('study_id')
      .notNull()
      .references(() => doseEscalationStudies.id),
    levelNumber: integer('level_number').notNull(),
    doseAmount: decimal('dose_amount', { precision: 10, scale: 4 }).notNull(),
    doseUnit: text('dose_unit').notNull(),
    escalationPercentage: real('escalation_percentage'), // % increase from previous level
    maxPatientsPerCohort: integer('max_patients_per_cohort').default(3),
    minPatientsPerCohort: integer('min_patients_per_cohort').default(3),
    patientsEnrolled: integer('patients_enrolled').default(0),
    patientsEvaluable: integer('patients_evaluable').default(0),
    dltsInCohort: integer('dlts_in_cohort').default(0),
    toxicityRate: real('toxicity_rate'),
    pharmacokineticData: json('pharmacokinetic_data'),
    pharmacodynamicData: json('pharmacodynamic_data'),
    biomarkerData: json('biomarker_data'),
    status: text('status').default('pending').notNull(), // pending, enrolling, completed, skipped
    decisionDate: timestamp('decision_date'),
    decisionRationale: text('decision_rationale'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyLevelIdx: uniqueIndex('dose_level_idx').on(table.studyId, table.levelNumber),
  })
);

/**
 * Dose Cohorts Table
 * Patient cohorts within each dose level
 */
export const doseCohorts = pgTable(
  'dose_cohorts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: uuid('study_id')
      .notNull()
      .references(() => doseEscalationStudies.id),
    doseLevelId: uuid('dose_level_id')
      .notNull()
      .references(() => doseLevels.id),
    cohortNumber: integer('cohort_number').notNull(),
    patientId: text('patient_id').notNull(),
    enrollmentDate: date('enrollment_date').notNull(),
    firstDoseDate: date('first_dose_date'),
    lastDoseDate: date('last_dose_date'),
    dltEvaluationStartDate: date('dlt_evaluation_start_date'),
    dltEvaluationEndDate: date('dlt_evaluation_end_date'),
    evaluableForDlt: boolean('evaluable_for_dlt').default(true),
    dltOccurred: boolean('dlt_occurred').default(false),
    dltDetails: json('dlt_details'),
    discontinuationDate: date('discontinuation_date'),
    discontinuationReason: text('discontinuation_reason'),
    bestResponse: text('best_response'),
    adverseEvents: json('adverse_events'),
    concomitantMedications: json('concomitant_medications'),
    pkSamples: json('pk_samples'),
    biomarkerResults: json('biomarker_results'),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyPatientIdx: uniqueIndex('cohort_patient_idx').on(table.studyId, table.patientId),
    doseLevelIdx: index('cohort_dose_level_idx').on(table.doseLevelId),
  })
);

/**
 * DLT Events Table
 * Dose-Limiting Toxicity events tracking
 */
export const dltEvents = pgTable(
  'dlt_events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    studyId: uuid('study_id')
      .notNull()
      .references(() => doseEscalationStudies.id),
    cohortId: uuid('cohort_id')
      .notNull()
      .references(() => doseCohorts.id),
    patientId: text('patient_id').notNull(),
    eventDate: date('event_date').notNull(),
    ctcaeGrade: integer('ctcae_grade').notNull(), // 3, 4, 5
    systemOrganClass: text('system_organ_class').notNull(),
    preferredTerm: text('preferred_term').notNull(),
    description: text('description'),
    relatedness: text('relatedness').notNull(), // definitely, probably, possibly, unlikely, unrelated
    seriousness: text('seriousness').notNull(), // serious, non-serious
    outcome: text('outcome'), // resolved, resolving, not resolved, fatal, unknown
    actionTaken: text('action_taken'), // dose reduced, dose delayed, discontinued, none
    doseModification: json('dose_modification'),
    rechallenge: boolean('rechallenge').default(false),
    rechallengeOutcome: text('rechallenge_outcome'),
    reportedToFda: boolean('reported_to_fda').default(false),
    reportedToIrb: boolean('reported_to_irb').default(false),
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    studyIdx: index('dlt_study_idx').on(table.studyId),
    cohortIdx: index('dlt_cohort_idx').on(table.cohortId),
    patientIdx: index('dlt_patient_idx').on(table.patientId),
  })
);

/**
 * IND Narratives Table
 * Master table for IND narrative documents
 */
export const indNarratives = pgTable(
  'ind_narratives',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    narrativeId: varchar('narrative_id', { length: 255 }).notNull().unique(),
    indNumber: text('ind_number'),
    protocolNumber: text('protocol_number').notNull(),
    title: text('title').notNull(),
    drugName: text('drug_name').notNull(),
    indication: text('indication').notNull(),
    phase: text('phase').notNull(),
    narrativeType: text('narrative_type').notNull(), // initial, amendment, annual_report
    version: integer('version').default(1),
    status: text('status').default('draft').notNull(), // draft, in_review, approved, submitted
    complianceScore: real('compliance_score'),
    complianceChecks: json('compliance_checks'), // 21 CFR 312 compliance results
    crossReferences: json('cross_references'), // Links between sections and data sources
    sourceData: json('source_data'), // CSR IDs and other data sources used
    generatedSections: integer('generated_sections').default(0),
    totalSections: integer('total_sections').default(0),
    lastGeneratedAt: timestamp('last_generated_at'),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),
    submittedToFda: boolean('submitted_to_fda').default(false),
    submissionDate: date('submission_date'),
    fdaResponseDate: date('fda_response_date'),
    fdaResponse: text('fda_response'),
    organizationId: integer('organization_id').references(() => organizations.id),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    narrativeIdIdx: index('narrative_id_idx').on(table.narrativeId),
    indNumberIdx: index('ind_number_idx').on(table.indNumber),
    statusIdx: index('narrative_status_idx').on(table.status),
    orgIdx: index('narrative_org_idx').on(table.organizationId),
  })
);

/**
 * IND Narrative Sections Table
 * Individual sections of IND narratives
 */
export const indNarrativeSections = pgTable(
  'ind_narrative_sections',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    narrativeId: uuid('narrative_id')
      .notNull()
      .references(() => indNarratives.id),
    sectionNumber: text('section_number').notNull(), // 1.1, 2.3.4, etc.
    sectionTitle: text('section_title').notNull(),
    sectionType: text('section_type').notNull(), // pharmacology, toxicology, cmc, clinical, statistical
    templateId: text('template_id'),
    content: text('content'),
    htmlContent: text('html_content'),
    wordCount: integer('word_count').default(0),
    dataSource: json('data_source'), // CSR sections, lab data, etc.
    citations: json('citations'),
    tables: json('tables'),
    figures: json('figures'),
    reviewStatus: text('review_status').default('pending'), // pending, reviewed, approved, rejected
    reviewComments: json('review_comments'),
    complianceFlags: json('compliance_flags'),
    version: integer('version').default(1),
    previousVersionId: uuid('previous_version_id'),
    createdBy: text('created_by'),
    lastModifiedBy: text('last_modified_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    narrativeIdx: index('section_narrative_idx').on(table.narrativeId),
    sectionNumberIdx: index('section_number_idx').on(table.sectionNumber),
  })
);

/**
 * Cross-Species PK/PD Analysis Table
 * Allometric scaling and cross-species comparisons
 */
export const crossSpeciesPkpd = pgTable(
  'cross_species_pkpd',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisId: varchar('analysis_id', { length: 255 }).notNull().unique(),
    studyId: text('study_id').notNull(),
    drugName: text('drug_name').notNull(),
    indication: text('indication'),
    analysisType: text('analysis_type').notNull(), // allometric, physiologic, in_vitro_in_vivo
    sourceSpecies: text('source_species').array().notNull(), // mouse, rat, dog, monkey
    targetSpecies: text('target_species').default('human').notNull(),
    scalingMethod: text('scaling_method').notNull(), // simple_allometric, mle, physiologic_pk
    allometricExponent: real('allometric_exponent').default(0.75), // For dose scaling
    clearanceExponent: real('clearance_exponent').default(0.75),
    volumeExponent: real('volume_exponent').default(1.0),
    humanEquivalentDose: decimal('human_equivalent_dose', { precision: 10, scale: 4 }),
    humanPredictedCmax: decimal('human_predicted_cmax', { precision: 12, scale: 4 }),
    humanPredictedAuc: decimal('human_predicted_auc', { precision: 12, scale: 4 }),
    humanPredictedT12: decimal('human_predicted_t12', { precision: 8, scale: 2 }),
    safetyMargin: real('safety_margin').default(10), // Safety factor for first-in-human
    noaelDose: decimal('noael_dose', { precision: 10, scale: 4 }),
    mabelDose: decimal('mabel_dose', { precision: 10, scale: 4 }),
    padDose: decimal('pad_dose', { precision: 10, scale: 4 }),
    recommendedStartingDose: decimal('recommended_starting_dose', { precision: 10, scale: 4 }),
    confidenceInterval: json('confidence_interval'),
    validationMetrics: json('validation_metrics'),
    regulatoryGuidelines: json('regulatory_guidelines'), // FDA, EMA guidelines met
    organizationId: integer('organization_id').references(() => organizations.id),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    analysisIdIdx: index('pkpd_analysis_id_idx').on(table.analysisId),
    studyIdx: index('pkpd_study_idx').on(table.studyId),
    orgIdx: index('pkpd_org_idx').on(table.organizationId),
  })
);

/**
 * Species Comparison Matrices Table
 * Detailed PK/PD parameters across species
 */
export const speciesComparisons = pgTable(
  'species_comparisons',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => crossSpeciesPkpd.id),
    species: text('species').notNull(), // mouse, rat, dog, monkey, human
    bodyWeight: real('body_weight').notNull(), // kg
    doseAdministered: decimal('dose_administered', { precision: 10, scale: 4 }).notNull(),
    doseUnit: text('dose_unit').notNull(),
    route: text('route').notNull(), // iv, po, sc, im
    cmax: decimal('cmax', { precision: 12, scale: 4 }),
    tmax: real('tmax'),
    auc0inf: decimal('auc0_inf', { precision: 12, scale: 4 }),
    auc0last: decimal('auc0_last', { precision: 12, scale: 4 }),
    t12: real('t12'),
    clearance: real('clearance'),
    volumeDistribution: real('volume_distribution'),
    bioavailability: real('bioavailability'),
    proteinBinding: real('protein_binding'),
    metabolites: json('metabolites'),
    tissueDistribution: json('tissue_distribution'),
    toxicologyFindings: json('toxicology_findings'),
    efficacyEndpoints: json('efficacy_endpoints'),
    dataSource: text('data_source'),
    studyReferences: json('study_references'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    analysisIdx: index('comparison_analysis_idx').on(table.analysisId),
    speciesIdx: index('comparison_species_idx').on(table.species),
  })
);

/**
 * PK/PD Compartmental Models Table
 * Compartmental analysis parameters
 */
export const pkpdCompartments = pgTable(
  'pkpd_compartments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    analysisId: uuid('analysis_id')
      .notNull()
      .references(() => crossSpeciesPkpd.id),
    modelType: text('model_type').notNull(), // one_compartment, two_compartment, three_compartment, pbpk
    species: text('species').notNull(),
    centralVolume: real('central_volume'),
    peripheralVolume1: real('peripheral_volume1'),
    peripheralVolume2: real('peripheral_volume2'),
    clearanceCentral: real('clearance_central'),
    intercompartmentalClearance1: real('intercompartmental_clearance1'),
    intercompartmentalClearance2: real('intercompartmental_clearance2'),
    absorptionRate: real('absorption_rate'),
    eliminationRate: real('elimination_rate'),
    distributionRate: real('distribution_rate'),
    modelParameters: json('model_parameters'),
    covariateEffects: json('covariate_effects'),
    populationVariability: json('population_variability'),
    residualError: json('residual_error'),
    goodnessOfFit: json('goodness_of_fit'),
    diagnosticPlots: json('diagnostic_plots'),
    validationResults: json('validation_results'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    analysisIdx: index('compartment_analysis_idx').on(table.analysisId),
    speciesIdx: index('compartment_species_idx').on(table.species),
  })
);

// Insert schemas for new tables
export const insertDoseEscalationStudySchema = createInsertSchemaOmit(doseEscalationStudies, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDoseLevelSchema = createInsertSchemaOmit(doseLevels, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDoseCohortSchema = createInsertSchemaOmit(doseCohorts, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDltEventSchema = createInsertSchemaOmit(dltEvents, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndNarrativeSchema = createInsertSchemaOmit(indNarratives, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertIndNarrativeSectionSchema = createInsertSchemaOmit(indNarrativeSections, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertCrossSpeciesPkpdSchema = createInsertSchemaOmit(crossSpeciesPkpd, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSpeciesComparisonSchema = createInsertSchemaOmit(speciesComparisons, {
  id: true,
  createdAt: true,
});

export const insertPkpdCompartmentSchema = createInsertSchemaOmit(pkpdCompartments, {
  id: true,
  createdAt: true,
});

// Type definitions for new tables
export type DoseEscalationStudy = InferSelectModel<typeof doseEscalationStudies>;
export type InsertDoseEscalationStudy = z.infer<typeof insertDoseEscalationStudySchema>;

export type DoseLevel = InferSelectModel<typeof doseLevels>;
export type InsertDoseLevel = z.infer<typeof insertDoseLevelSchema>;

export type DoseCohort = InferSelectModel<typeof doseCohorts>;
export type InsertDoseCohort = z.infer<typeof insertDoseCohortSchema>;

export type DltEvent = InferSelectModel<typeof dltEvents>;
export type InsertDltEvent = z.infer<typeof insertDltEventSchema>;

export type IndNarrative = InferSelectModel<typeof indNarratives>;
export type InsertIndNarrative = z.infer<typeof insertIndNarrativeSchema>;

export type IndNarrativeSection = InferSelectModel<typeof indNarrativeSections>;
export type InsertIndNarrativeSection = z.infer<typeof insertIndNarrativeSectionSchema>;

export type CrossSpeciesPkpd = InferSelectModel<typeof crossSpeciesPkpd>;
export type InsertCrossSpeciesPkpd = z.infer<typeof insertCrossSpeciesPkpdSchema>;

export type SpeciesComparison = InferSelectModel<typeof speciesComparisons>;
export type InsertSpeciesComparison = z.infer<typeof insertSpeciesComparisonSchema>;

export type PkpdCompartment = InferSelectModel<typeof pkpdCompartments>;
export type InsertPkpdCompartment = z.infer<typeof insertPkpdCompartmentSchema>;

/**
 * ======================================================================================
 * BIOTECH AI INTELLIGENCE RAG SYSTEM
 * ======================================================================================
 *
 * Tables for Retrieval-Augmented Generation system specialized for biotech documents
 * Supports vector embeddings, semantic search, and knowledge graph integration
 */

/**
 * RAG Documents Table
 * Stores metadata for ingested documents
 */
export const ragDocuments = pgTable(
  'rag_documents',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    documentId: text('document_id').notNull().unique(),
    title: text('title').notNull(),
    documentType: text('document_type').notNull(), // pdf, word, csr, protocol, regulatory, patent, literature
    source: text('source'), // file_upload, pubmed, patent_db, clinicaltrials.gov, etc.
    sourceUrl: text('source_url'),
    fileHash: text('file_hash'),
    fileName: text('file_name'),
    fileSize: integer('file_size'),
    mimeType: text('mime_type'),
    status: text('status').default('pending').notNull(), // pending, processing, indexed, failed, archived
    processingStatus: json('processing_status'), // { stage, progress, errors }
    language: text('language').default('en'),
    pageCount: integer('page_count'),
    wordCount: integer('word_count'),
    chunkCount: integer('chunk_count'),

    // Biotech specific metadata
    therapeuticArea: text('therapeutic_area'),
    indication: text('indication'),
    phase: text('phase'),
    compound: text('compound'),
    sponsor: text('sponsor'),
    regulatoryAgency: text('regulatory_agency'),
    documentDate: date('document_date'),

    // Vector and search metadata
    embedModel: text('embed_model').default('text-embedding-3-small'),
    embeddingDimensions: integer('embedding_dimensions').default(1536),
    averageEmbedding: json('average_embedding'), // Document-level embedding

    // Access control
    confidential: boolean('confidential').default(false),
    accessLevel: text('access_level').default('organization'), // public, organization, workspace, restricted
    allowedUsers: json('allowed_users'), // Array of user IDs

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    indexedAt: timestamp('indexed_at'),
    lastAccessedAt: timestamp('last_accessed_at'),
  },
  table => ({
    orgIdx: index('rag_documents_org_idx').on(table.organizationId),
    typeIdx: index('rag_documents_type_idx').on(table.documentType),
    statusIdx: index('rag_documents_status_idx').on(table.status),
    therapeuticIdx: index('rag_documents_therapeutic_idx').on(table.therapeuticArea),
    compoundIdx: index('rag_documents_compound_idx').on(table.compound),
    dateIdx: index('rag_documents_date_idx').on(table.documentDate),
  })
);

/**
 * RAG Chunks Table
 * Stores document chunks with vector embeddings
 * Supports pgvector for similarity search
 */
export const ragChunks = pgTable(
  'rag_chunks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => ragDocuments.id, { onDelete: 'cascade' }),
    chunkId: text('chunk_id').notNull().unique(),
    chunkIndex: integer('chunk_index').notNull(),
    content: text('content').notNull(),
    contentHash: text('content_hash'),

    // Position and context
    pageNumber: integer('page_number'),
    sectionTitle: text('section_title'),
    subsectionTitle: text('subsection_title'),
    paragraphIndex: integer('paragraph_index'),
    startOffset: integer('start_offset'),
    endOffset: integer('end_offset'),

    // Vector embedding - proper pgvector support
    embedding: vector('embedding', { dimensions: 1536 }), // OpenAI text-embedding-3-small (1536 dimensions)
    embeddingModel: text('embedding_model').default('text-embedding-3-small'),

    // Chunk metadata
    tokenCount: integer('token_count'),
    characterCount: integer('character_count'),
    chunkType: text('chunk_type'), // paragraph, table, figure, list, header, footer
    language: text('language').default('en'),

    // Biotech entity extraction
    entities: json('entities'), // { drugs: [], targets: [], diseases: [], biomarkers: [], etc. }
    keywords: json('keywords'), // Array of extracted keywords
    concepts: json('concepts'), // Medical/scientific concepts
    references: json('references'), // Citations and references found in chunk

    // Search optimization
    searchVector: text('search_vector'), // Full text search vector
    relevanceScore: real('relevance_score'), // Pre-computed relevance for common queries
    accessCount: integer('access_count').default(0),

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastAccessedAt: timestamp('last_accessed_at'),
  },
  table => ({
    documentIdx: index('rag_chunks_document_idx').on(table.documentId),
    chunkIndexIdx: index('rag_chunks_index_idx').on(table.documentId, table.chunkIndex),
    sectionIdx: index('rag_chunks_section_idx').on(table.sectionTitle),
  })
);

/**
 * RAG Queries Table
 * Tracks search queries and performance
 */
export const ragQueries = pgTable(
  'rag_queries',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: integer('user_id').references(() => users.id),
    queryId: text('query_id').notNull().unique(),

    // Query details
    query: text('query').notNull(),
    enhancedQuery: text('enhanced_query'), // Query after enhancement
    queryType: text('query_type'), // search, qa, summary, analysis, comparison
    queryVector: json('query_vector'), // Query embedding

    // Search parameters
    searchMode: text('search_mode').default('hybrid'), // semantic, keyword, hybrid
    topK: integer('top_k').default(10),
    minScore: real('min_score'),
    filters: json('filters'), // Document type, date range, etc.

    // Results
    resultsCount: integer('results_count'),
    results: json('results'), // Cached search results
    responseTime: real('response_time'), // in milliseconds

    // Performance metrics
    precision: real('precision'),
    recall: real('recall'),
    relevanceFeedback: json('relevance_feedback'), // User feedback on results

    // Session tracking
    sessionId: text('session_id'),
    conversationId: text('conversation_id'),
    followUp: boolean('follow_up').default(false),
    parentQueryId: text('parent_query_id'),

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('rag_queries_org_idx').on(table.organizationId),
    userIdx: index('rag_queries_user_idx').on(table.userId),
    sessionIdx: index('rag_queries_session_idx').on(table.sessionId),
    typeIdx: index('rag_queries_type_idx').on(table.queryType),
    createdIdx: index('rag_queries_created_idx').on(table.createdAt),
  })
);

/**
 * RAG Knowledge Graph Table
 * Stores biotech entity relationships for graph-based retrieval
 */
export const ragKnowledgeGraph = pgTable(
  'rag_knowledge_graph',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Entity information
    entityId: text('entity_id').notNull(),
    entityType: text('entity_type').notNull(), // drug, target, disease, pathway, biomarker, gene, protein
    entityName: text('entity_name').notNull(),
    entityAliases: json('entity_aliases'), // Alternative names

    // Relationship
    relationshipType: text('relationship_type'), // inhibits, activates, treats, causes, associates_with
    relatedEntityId: text('related_entity_id'),
    relatedEntityType: text('related_entity_type'),
    relatedEntityName: text('related_entity_name'),

    // Relationship metadata
    confidence: real('confidence').default(1.0),
    evidence: json('evidence'), // { sources: [], publications: [], trials: [] }
    strength: real('strength'), // Relationship strength score
    direction: text('direction'), // unidirectional, bidirectional

    // Source tracking
    sourceDocumentIds: json('source_document_ids'), // Array of document IDs
    sourceChunkIds: json('source_chunk_ids'), // Array of chunk IDs

    // Scientific metadata
    mechanism: text('mechanism'),
    therapeuticClass: text('therapeutic_class'),
    molecularWeight: real('molecular_weight'),
    chemicalFormula: text('chemical_formula'),
    uniprotId: text('uniprot_id'),
    pubchemId: text('pubchem_id'),
    drugbankId: text('drugbank_id'),

    // Graph metrics
    centrality: real('centrality'), // Node importance in graph
    clustering: real('clustering'), // Local clustering coefficient

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('rag_knowledge_org_idx').on(table.organizationId),
    entityIdx: index('rag_knowledge_entity_idx').on(table.entityId, table.entityType),
    relatedIdx: index('rag_knowledge_related_idx').on(
      table.relatedEntityId,
      table.relatedEntityType
    ),
    typeIdx: index('rag_knowledge_type_idx').on(table.entityType),
    relationshipIdx: index('rag_knowledge_relationship_idx').on(table.relationshipType),
    uniqueRelationship: uniqueIndex('rag_knowledge_unique_rel').on(
      table.entityId,
      table.relatedEntityId,
      table.relationshipType
    ),
  })
);

/**
 * RAG Sources Table
 * Tracks regulatory document sources for automated crawling
 */
export const ragSources = pgTable(
  'rag_sources',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    sourceName: text('source_name').notNull(), // FDA, EMA, ICH, WHO, etc.
    sourceType: text('source_type').notNull(), // rss_feed, api, web_scraping
    sourceUrl: text('source_url').notNull(),
    documentType: text('document_type'), // guidance, warning_letter, epar, etc.

    // Crawling configuration
    isActive: boolean('is_active').default(true),
    crawlFrequency: text('crawl_frequency'), // daily, weekly, monthly
    lastCrawledAt: timestamp('last_crawled_at'),
    nextCrawlAt: timestamp('next_crawl_at'),

    // Statistics
    documentsIngested: integer('documents_ingested').default(0),
    lastDocumentDate: date('last_document_date'),
    failureCount: integer('failure_count').default(0),

    // Configuration
    crawlConfig: json('crawl_config'), // { selectors, patterns, limits, etc. }
    authentication: json('authentication'), // Encrypted API keys if needed
    rateLimit: integer('rate_limit').default(10), // Requests per minute

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('rag_sources_org_idx').on(table.organizationId),
    sourceNameIdx: index('rag_sources_name_idx').on(table.sourceName),
    activeIdx: index('rag_sources_active_idx').on(table.isActive),
    nextCrawlIdx: index('rag_sources_next_crawl_idx').on(table.nextCrawlAt),
  })
);

/**
 * RAG Ingestion Jobs Table
 * Tracks document ingestion and processing jobs
 */
export const ragIngestionJobs = pgTable(
  'rag_ingestion_jobs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    jobId: text('job_id').notNull().unique(),
    jobType: text('job_type').notNull(), // single, batch, crawl, scheduled

    // Source information
    source: text('source'), // FDA, EMA, ICH, WHO, user_upload, etc.
    sourceId: uuid('source_id').references(() => ragSources.id),
    documentUrl: text('document_url'),
    documentTitle: text('document_title'),
    documentType: text('document_type'),

    // Job status
    status: text('status').default('queued').notNull(), // queued, processing, completed, failed, cancelled
    priority: integer('priority').default(5), // 1-10, higher is more urgent
    retryCount: integer('retry_count').default(0),
    maxRetries: integer('max_retries').default(3),

    // Processing details
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    failedAt: timestamp('failed_at'),
    processingTime: real('processing_time'), // in seconds

    // Results
    documentId: uuid('document_id').references(() => ragDocuments.id),
    chunksProcessed: integer('chunks_processed'),
    entitiesExtracted: integer('entities_extracted'),
    error: text('error'),
    errorDetails: json('error_details'),

    // Progress tracking
    progress: integer('progress').default(0), // 0-100
    progressMessage: text('progress_message'),
    stages: json('stages'), // { parsing: complete, chunking: in_progress, embedding: pending }

    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('rag_jobs_org_idx').on(table.organizationId),
    statusIdx: index('rag_jobs_status_idx').on(table.status),
    priorityIdx: index('rag_jobs_priority_idx').on(table.priority, table.createdAt),
    sourceIdx: index('rag_jobs_source_idx').on(table.source),
    createdIdx: index('rag_jobs_created_idx').on(table.createdAt),
  })
);

// Insert schemas for RAG tables
export const insertRagDocumentSchema = createInsertSchemaOmit(ragDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRagChunkSchema = createInsertSchemaOmit(ragChunks, {
  id: true,
  createdAt: true,
});

export const insertRagQuerySchema = createInsertSchemaOmit(ragQueries, {
  id: true,
  createdAt: true,
});

export const insertRagKnowledgeGraphSchema = createInsertSchemaOmit(ragKnowledgeGraph, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRagSourceSchema = createInsertSchemaOmit(ragSources, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRagIngestionJobSchema = createInsertSchemaOmit(ragIngestionJobs, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for RAG tables
export type RagDocument = InferSelectModel<typeof ragDocuments>;
export type InsertRagDocument = z.infer<typeof insertRagDocumentSchema>;

export type RagSource = InferSelectModel<typeof ragSources>;
export type InsertRagSource = z.infer<typeof insertRagSourceSchema>;

export type RagIngestionJob = InferSelectModel<typeof ragIngestionJobs>;
export type InsertRagIngestionJob = z.infer<typeof insertRagIngestionJobSchema>;

export type RagChunk = InferSelectModel<typeof ragChunks>;
export type InsertRagChunk = z.infer<typeof insertRagChunkSchema>;

export type RagQuery = InferSelectModel<typeof ragQueries>;
export type InsertRagQuery = z.infer<typeof insertRagQuerySchema>;

export type RagKnowledgeGraph = InferSelectModel<typeof ragKnowledgeGraph>;
export type InsertRagKnowledgeGraph = z.infer<typeof insertRagKnowledgeGraphSchema>;

// CoAuthor Documents insert schemas and types
export const insertCoauthorDocumentSchema = createInsertSchemaOmit(coauthorDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type CoauthorDocument = InferSelectModel<typeof coauthorDocuments>;
export type InsertCoauthorDocument = z.infer<typeof insertCoauthorDocumentSchema>;

// CoAuthor Document Versions insert schemas and types
export const insertCoauthorDocumentVersionSchema = createInsertSchemaOmit(
  coauthorDocumentVersions,
  {
    id: true,
    createdAt: true,
  }
);

export type CoauthorDocumentVersion = InferSelectModel<typeof coauthorDocumentVersions>;
export type InsertCoauthorDocumentVersion = z.infer<typeof insertCoauthorDocumentVersionSchema>;

/**
 * ======================================================================================
 * PHASE 3 AI REGULATORY INTELLIGENCE TABLES
 * ======================================================================================
 *
 * Tables for Phase 3 deployment of Regulatory Intelligence Layer and eCTD 4.0 automation
 * Includes NER extraction, global change management, and audit trail for 21 CFR Part 11
 */

// AI Audit Log for comprehensive tracking of all AI operations
export const aiAuditLog = pgTable(
  'ai_audit_log',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    transactionId: uuid('transaction_id').unique().notNull(),
    userId: text('user_id'),
    aiService: varchar('ai_service', { length: 50 }).notNull(), // 'ner-extract', 'generate-embedding', 'consistency-check'
    promptFull: text('prompt_full'),
    modelUsed: varchar('model_used', { length: 50 }),
    responseStructured: json('response_structured'),
    affectedUdis: json('affected_udis'), // Array of component UDIs
    tokensUsed: integer('tokens_used').default(0),
    success: boolean('success').default(false),
    approvalStatus: varchar('approval_status', { length: 20 }),
    digitalSignature: text('digital_signature'),
    createdAt: timestamp('created_at').defaultNow(),
    ipAddress: varchar('ip_address', { length: 45 }),
    sessionId: varchar('session_id'),
  },
  table => ({
    transactionIdx: index('ai_audit_transaction_idx').on(table.transactionId),
    serviceIdx: index('ai_audit_service_idx').on(table.aiService),
    createdIdx: index('ai_audit_created_idx').on(table.createdAt),
  })
);

// Change Requests for global change management
export const changeRequests = pgTable(
  'change_requests',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    entityType: varchar('entity_type', { length: 100 }).notNull(),
    originalValue: text('original_value').notNull(),
    newValue: text('new_value').notNull(),
    affectedUdis: json('affected_udis'), // Array of component UDIs
    stagingData: json('staging_data'),
    status: varchar('status', { length: 20 }).default('pending').notNull(), // 'pending', 'approved', 'rejected', 'completed', 'failed'
    priority: varchar('priority', { length: 20 }).default('medium'), // 'low', 'medium', 'high', 'critical'
    reason: text('reason'),
    targetDate: timestamp('target_date'),
    digitalSignature: text('digital_signature'),
    initiatedBy: text('initiated_by').notNull(),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),
    reviewNotes: text('review_notes'),
    organizationId: integer('organization_id').references(() => organizations.id),
    executedBy: text('executed_by'),
    executedAt: timestamp('executed_at'),
    completedAt: timestamp('completed_at'),
    executionSummary: json('execution_summary'),
    error: text('error'),
    failureReason: text('failure_reason'),
    failedAt: timestamp('failed_at'),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    statusIdx: index('change_requests_status_idx').on(table.status),
    orgIdx: index('change_requests_org_idx').on(table.organizationId),
    createdIdx: index('change_requests_created_idx').on(table.createdAt),
  })
);

// eCTD 4.0 Context Groups for eliminating document duplication
export const contextGroups = pgTable(
  'context_groups',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    groupType: varchar('group_type', { length: 50 }).notNull(), // 'module', 'section', 'document'
    contextOfUse: varchar('context_of_use', { length: 100 }).notNull(), // e.g., "3.2.S.4.1"
    priorityNumber: integer('priority_number').default(0),
    organizationId: integer('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    orgIdx: index('context_groups_org_idx').on(table.organizationId),
    contextIdx: index('context_groups_context_idx').on(table.contextOfUse),
  })
);

// Context Members - links components to context groups
export const contextMembers = pgTable(
  'context_members',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    contextGroupId: uuid('context_group_id').references(() => contextGroups.id),
    componentUdi: varchar('component_udi', { length: 255 }).notNull(), // Reference to component, not duplication
    version: varchar('version', { length: 20 }).notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(), // 'active', 'replaced', 'deleted'
    sequenceReferences: json('sequence_references'), // ['SN0000', 'SN0001', ...]
    createdAt: timestamp('created_at').defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow(),
  },
  table => ({
    groupIdx: index('context_members_group_idx').on(table.contextGroupId),
    udiIdx: index('context_members_udi_idx').on(table.componentUdi),
    statusIdx: index('context_members_status_idx').on(table.status),
  })
);

// Replacement Rules for eCTD 4.0 flexible patterns
export const replacementRules = pgTable(
  'replacement_rules',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ruleType: varchar('rule_type', { length: 20 }).notNull(), // '1-to-N', 'N-to-1', 'N-to-M'
    sourceUdis: json('source_udis').notNull(), // Array of source component UDIs
    targetUdis: json('target_udis').notNull(), // Array of target component UDIs
    sequenceReferences: json('sequence_references'), // Sequences affected by this rule
    appliedAt: timestamp('applied_at'),
    createdBy: text('created_by').notNull(),
    organizationId: integer('organization_id').references(() => organizations.id),
    createdAt: timestamp('created_at').defaultNow(),
  },
  table => ({
    orgIdx: index('replacement_rules_org_idx').on(table.organizationId),
    typeIdx: index('replacement_rules_type_idx').on(table.ruleType),
    createdIdx: index('replacement_rules_created_idx').on(table.createdAt),
  })
);

// Insert schemas for Phase 3 tables
export const insertAiAuditLogSchema = createInsertSchemaOmit(aiAuditLog, {
  id: true,
  createdAt: true,
});

export const insertChangeRequestSchema = createInsertSchemaOmit(changeRequests, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContextGroupSchema = createInsertSchemaOmit(contextGroups, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertContextMemberSchema = createInsertSchemaOmit(contextMembers, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertReplacementRuleSchema = createInsertSchemaOmit(replacementRules, {
  id: true,
  createdAt: true,
});

// Type definitions for Phase 3 tables
export type AiAuditLog = InferSelectModel<typeof aiAuditLog>;
export type InsertAiAuditLog = z.infer<typeof insertAiAuditLogSchema>;

export type ChangeRequest = InferSelectModel<typeof changeRequests>;
export type InsertChangeRequest = z.infer<typeof insertChangeRequestSchema>;

export type ContextGroup = InferSelectModel<typeof contextGroups>;
export type InsertContextGroup = z.infer<typeof insertContextGroupSchema>;

export type ContextMember = InferSelectModel<typeof contextMembers>;
export type InsertContextMember = z.infer<typeof insertContextMemberSchema>;

export type ReplacementRule = InferSelectModel<typeof replacementRules>;
export type InsertReplacementRule = z.infer<typeof insertReplacementRuleSchema>;

// Electronic Signatures Table (21 CFR Part 11)

// ============================================================================
// DEVICE DATA CENTER - 510(k) FILE MANAGEMENT SYSTEM
// ============================================================================
/**
 * Device Data Center for 510(k) submissions
 * Supports comprehensive tagging by category, test standard, and device component
 * Includes deep search capabilities and metadata management
 */

// Device Data Center Files table - stores device test and regulatory files
export const deviceDataCenter = pgTable(
  'device_data_center',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Basic file information
    fileName: text('file_name').notNull(),
    fileType: text('file_type').notNull(), // pdf, docx, xlsx, etc.
    fileSize: integer('file_size'),
    storageUrl: text('storage_url'),
    checksum: text('checksum'),

    // Device information
    deviceName: text('device_name'),
    deviceModel: text('device_model'),
    deviceIdentifier: text('device_identifier'), // UDI or internal ID

    // 510(k) specific categorization
    category: text('category').notNull(), // bench_test_report, biocompatibility, predicate_labeling, etc.
    subcategory: text('subcategory'), // More specific categorization

    // Test standards and compliance
    testStandards: text('test_standards').array(), // ISO 10993, IEC 60601, etc.
    testType: text('test_type'), // mechanical, electrical, biocompatibility, etc.
    testDate: date('test_date'),
    testLabName: text('test_lab_name'),
    testLabCertification: text('test_lab_certification'), // ISO 17025, etc.

    // Device components
    deviceComponents: text('device_components').array(), // housing, circuit_board, sensor, etc.
    componentVersion: text('component_version'),

    // Regulatory metadata
    regulatoryStatus: text('regulatory_status'), // draft, under_review, approved, superseded
    submissionNumber: text('submission_number'), // K-number once assigned
    predicateDevice: text('predicate_device'), // K-number of predicate
    predicateKNumber: text('predicate_k_number'), // For predicate evidence files

    // Identity & provenance (comprehensive metadata per specification)
    reportId: text('report_id'), // Report/document unique ID
    version: text('version'), // Document version (semver or custom)
    authorOwner: text('author_owner'), // User reference or name
    confidentiality: text('confidentiality'), // Public, Internal, Confidential

    // Article under test metadata
    lotBatch: text('lot_batch'), // Lot or batch number
    sampleId: text('sample_id'), // Sample identifier
    buildRev: text('build_rev'), // Build revision
    configuration: text('configuration'), // Device configuration
    productCode: text('product_code'), // FDA product code
    deviceClass: text('device_class'), // Class I, II, III

    // Protocol & standardization
    protocolId: text('protocol_id'), // Test protocol identifier
    acceptanceCriteriaRef: text('acceptance_criteria_ref'), // Reference to acceptance criteria

    // Execution metadata
    environment: text('environment'), // Test environment (temp/humidity)
    nSamples: integer('n_samples'), // Number of samples tested
    cycles: integer('cycles'), // Number of test cycles
    sterilizationMethod: text('sterilization_method'), // EO, Radiation, Moist Heat
    sal: text('sal'), // Sterility Assurance Level (e.g., 10^-6)
    agingDuration: text('aging_duration'), // Aging test duration

    // Outcome metadata
    result: text('result'), // Pass, Fail, Not-run
    margin: text('margin'), // Margin vs acceptance (% or units)
    deviations: text('deviations').array(), // List of deviations

    // Regulatory mapping
    sectionRefs: text('section_refs').array(), // eSTAR items or 510(k) section IDs
    rtaChecklistRefs: text('rta_checklist_refs').array(), // RTA checklist references

    // Tags for flexible categorization
    tags: text('tags').array(), // Custom tags for easy searching

    // NEW: Hierarchical multi-category tagging system (complements single category field above)
    categories: text('categories').array(), // Array of category codes for multi-category support
    components: text('components').array(), // Array of component codes (hierarchical device components)
    standardRef: json('standard_ref'), // Structured standard reference: { family, code, edition_year, clause, region }

    // Document relationships
    relatedDocuments: integer('related_documents').array(), // IDs of related documents
    parentDocumentId: integer('parent_document_id'), // For document versioning/hierarchy

    // Searchable metadata
    metadata: json('metadata'), // Flexible JSON for additional metadata (now includes category-specific templates)
    searchableContent: text('searchable_content'), // Extracted text for full-text search

    // Audit fields
    uploadedBy: text('uploaded_by').notNull(),
    reviewedBy: text('reviewed_by'),
    approvedBy: text('approved_by'),
    comments: text('comments'),

    // Timestamps
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
    approvedAt: timestamp('approved_at'),
  },
  table => ({
    // Performance indexes for fast searching
    orgIdx: index('device_data_org_idx').on(table.organizationId),
    categoryIdx: index('device_data_category_idx').on(table.category),
    deviceIdx: index('device_data_device_idx').on(table.deviceName),
    statusIdx: index('device_data_status_idx').on(table.regulatoryStatus),
    // GIN indexes for array searching
    tagsIdx: index('device_data_tags_gin_idx').using('gin', table.tags),
    standardsIdx: index('device_data_standards_gin_idx').using('gin', table.testStandards),
    componentsIdx: index('device_data_components_gin_idx').using('gin', table.deviceComponents),
    // Full-text search index
    contentIdx: index('device_data_content_idx').using(
      'gin',
      sql`to_tsvector('english', ${table.searchableContent})`
    ),
  })
);

// Device Data Center Categories - predefined categories for consistency (hierarchical)
export const deviceDataCategories = pgTable('device_data_categories', {
  id: serial('id').primaryKey(),
  categoryCode: text('category_code').notNull().unique(),
  categoryName: text('category_name').notNull(),
  description: text('description'),
  parentCategory: text('parent_category'),
  parentId: integer('parent_id'), // Hierarchical parent reference
  level: integer('level').default(0), // Hierarchy depth (0=top-level, 1=subcategory, etc.)
  synonyms: text('synonyms').array(), // Aliases for smart search (e.g., "EMC" <-> "60601-1-2")
  requiredFor510k: boolean('required_for_510k').default(false),
  displayOrder: integer('display_order'),
  icon: text('icon'), // Icon name for UI
  color: text('color'), // Color code for UI
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Device Test Standards - reference table for test standards (normalized)
export const deviceTestStandards = pgTable('device_test_standards', {
  id: serial('id').primaryKey(),
  standardCode: text('standard_code').notNull().unique(), // ISO 10993-1, IEC 60601-1, etc.
  standardName: text('standard_name').notNull(),
  standardBody: text('standard_body'), // ISO, IEC, ASTM, etc.
  family: text('family'), // ISO, IEC, AAMI, ASTM, CLSI, FDA
  version: text('version'),
  editionYear: integer('edition_year'), // Normalized edition year (e.g., 2020)
  clause: text('clause'), // Optional clause reference (e.g., "8.2.1")
  region: text('region'), // US, EU, Global
  description: text('description'),
  applicableCategories: text('applicable_categories').array(),
  requiredTests: json('required_tests'), // JSON array of required tests
  effectiveDate: date('effective_date'),
  supersededBy: text('superseded_by'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Device Components Registry - track all device components (hierarchical)
export const deviceComponents = pgTable(
  'device_components',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    componentCode: text('component_code').notNull(),
    componentName: text('component_name').notNull(),
    componentType: text('component_type'), // mechanical, electrical, software, etc.
    parentId: integer('parent_id'), // Hierarchical parent reference (e.g., Hardware -> PCB)
    level: integer('level').default(0), // Hierarchy depth (0=System, 1=Hardware/Software, 2=Specific)
    bomRef: text('bom_ref'), // BOM or configuration ID for traceability
    manufacturer: text('manufacturer'),
    partNumber: text('part_number'),
    version: text('version'),
    specifications: json('specifications'),
    testRequirements: text('test_requirements').array(),
    relatedStandards: text('related_standards').array(),
    status: text('status').default('active'), // active, obsolete, under_review
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgComponentIdx: uniqueIndex('device_components_org_code_idx').on(
      table.organizationId,
      table.componentCode
    ),
  })
);

// Insert schemas for Device Data Center
export const insertDeviceDataCenterSchema = createInsertSchemaOmit(deviceDataCenter, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertDeviceDataCategorySchema = createInsertSchemaOmit(deviceDataCategories, {
  id: true,
  createdAt: true,
});

export const insertDeviceTestStandardSchema = createInsertSchemaOmit(deviceTestStandards, {
  id: true,
  createdAt: true,
});

export const insertDeviceComponentSchema = createInsertSchemaOmit(deviceComponents, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for Device Data Center
export type DeviceDataCenter = InferSelectModel<typeof deviceDataCenter>;
export type InsertDeviceDataCenter = z.infer<typeof insertDeviceDataCenterSchema>;

export type DeviceDataCategory = InferSelectModel<typeof deviceDataCategories>;
export type InsertDeviceDataCategory = z.infer<typeof insertDeviceDataCategorySchema>;

export type DeviceTestStandard = InferSelectModel<typeof deviceTestStandards>;
export type InsertDeviceTestStandard = z.infer<typeof insertDeviceTestStandardSchema>;

export type DeviceComponent = InferSelectModel<typeof deviceComponents>;
export type InsertDeviceComponent = z.infer<typeof insertDeviceComponentSchema>;

// ============================================================================
// 510(k) WORKFLOW MANAGEMENT - COMPLETE END-TO-END TRACKING
// ============================================================================

// 510k Workflow Projects - Enhanced project tracking for 510k submissions
export const fda510kProjects = pgTable(
  'fda_510k_projects',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => projects.id),
    submissionId: integer('submission_id').references(() => fda510kSubmissions.id),

    // Workflow Stage Tracking
    currentStage: text('current_stage').default('setup'), // setup, strategy, evidence_plan, evidence, authoring, estar_rta, submit_ai
    currentStageProgress: integer('current_stage_progress').default(0), // 0-100
    overallProgress: integer('overall_progress').default(0), // 0-100

    // Device Information (Initial Intake)
    deviceName: text('device_name').notNull(),
    deviceClassification: text('device_classification'), // Class I, II, III
    productCode: text('product_code'),
    regulationNumber: text('regulation_number'),
    panelCode: text('panel_code'),

    // Flags for Special Requirements
    hasSoftware: boolean('has_software').default(false),
    hasCybersecurity: boolean('has_cybersecurity').default(false),
    hasSterility: boolean('has_sterility').default(false),
    hasBiocompatibility: boolean('has_biocompatibility').default(true),
    hasClinicalData: boolean('has_clinical_data').default(false),
    hasAI: boolean('has_ai').default(false),

    // Team Assignment
    projectLead: integer('project_lead').references(() => users.id),
    regulatoryLead: integer('regulatory_lead').references(() => users.id),
    qualityLead: integer('quality_lead').references(() => users.id),
    teamMembers: json('team_members'), // Array of user IDs with roles

    // Important Dates
    projectStartDate: timestamp('project_start_date').defaultNow(),
    targetSubmissionDate: date('target_submission_date'),
    actualSubmissionDate: date('actual_submission_date'),

    // Status and Validation
    status: text('status').default('active'), // active, on-hold, completed, archived
    lockedForSubmission: boolean('locked_for_submission').default(false),
    lockedAt: timestamp('locked_at'),
    lockedBy: integer('locked_by').references(() => users.id),

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    org510kProjectIdx: index('fda_510k_projects_org_idx').on(table.organizationId),
    project510kIdx: index('fda_510k_projects_project_idx').on(table.projectId),
    stage510kIdx: index('fda_510k_projects_stage_idx').on(table.currentStage),
  })
);

// 510k Document Templates - Reusable templates for document generation
export const fda510kTemplates = pgTable(
  'fda_510k_templates',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Template Identification
    templateCode: text('template_code').notNull().unique(), // e.g., "FDA_3514", "FDA_3601", "510K_SUMMARY"
    templateName: text('template_name').notNull(),
    templateType: text('template_type').notNull(), // form, letter, summary, narrative
    fdaFormNumber: text('fda_form_number'), // e.g., "FDA 3514"

    // Template Content
    templateContent: text('template_content'), // HTML/Markdown template with placeholders
    placeholders: json('placeholders'), // Array of {key, label, type, required, source}

    // Mapping Configuration
    dataMapping: json('data_mapping'), // Maps workflow data to template placeholders
    validationRules: json('validation_rules'), // Field validation requirements

    // Version Control
    version: text('version').default('1.0'),
    isActive: boolean('is_active').default(true),
    isDraft: boolean('is_draft').default(false),

    // Metadata
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    templateCodeIdx: uniqueIndex('fda_510k_templates_code_idx').on(table.templateCode),
    orgTemplateIdx: index('fda_510k_templates_org_idx').on(table.organizationId),
  })
);

// 510k Document Instances - Generated documents from templates
export const fda510kDocuments = pgTable(
  'fda_510k_documents',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => fda510kProjects.id),
    templateId: integer('template_id').references(() => fda510kTemplates.id),

    // Document Identification
    documentId: text('document_id').notNull().unique(), // System-wide unique ID
    documentType: text('document_type').notNull(), // Same as templateType
    documentName: text('document_name').notNull(),

    // Content and Data
    content: text('content'), // Final rendered content
    formData: json('form_data'), // Structured data for forms
    attachments: json('attachments'), // Array of file references

    // Status and Locking
    status: text('status').default('draft'), // draft, review, approved, locked, submitted
    isLocked: boolean('is_locked').default(false),
    lockedAt: timestamp('locked_at'),
    lockedBy: integer('locked_by').references(() => users.id),

    // Version Control
    version: integer('version').default(1),
    previousVersionId: integer('previous_version_id'), // Reference to previous version
    changeLog: json('change_log'), // Array of changes

    // Digital Signatures
    signatures: json('signatures'), // Array of signature records
    signatureRequired: boolean('signature_required').default(false),

    // Validation and Compliance
    validationStatus: text('validation_status').default('pending'), // pending, passed, failed
    validationErrors: json('validation_errors'),
    complianceScore: integer('compliance_score'), // 0-100

    // Metadata
    createdBy: integer('created_by').references(() => users.id),
    updatedBy: integer('updated_by').references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    documentIdIdx: uniqueIndex('fda_510k_documents_id_idx').on(table.documentId),
    projectDocIdx: index('fda_510k_documents_project_idx').on(table.projectId),
    statusDocIdx: index('fda_510k_documents_status_idx').on(table.status),
  })
);

// 510k Workflow Stage Progress - Track completion of each stage
export const fda510kStageProgress = pgTable(
  'fda_510k_stage_progress',
  {
    id: serial('id').primaryKey(),
    projectId: integer('project_id')
      .notNull()
      .references(() => fda510kProjects.id),

    // Stage Information
    stageName: text('stage_name').notNull(), // setup, strategy, evidence_plan, etc.
    sectionName: text('section_name').notNull(), // device_intake, predicate_search, etc.

    // Progress Tracking
    status: text('status').default('pending'), // pending, in_progress, completed, blocked
    progress: integer('progress').default(0), // 0-100
    isRequired: boolean('is_required').default(true),

    // Data Collection
    collectedData: json('collected_data'), // Form data collected for this section
    validationStatus: text('validation_status').default('pending'), // pending, passed, failed
    validationErrors: json('validation_errors'),

    // Timestamps
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    completedBy: integer('completed_by').references(() => users.id),

    // Metadata
    notes: text('notes'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    projectStageIdx: index('fda_510k_stage_progress_project_idx').on(
      table.projectId,
      table.stageName
    ),
  })
);

// 510k Submission Packages - Final compiled packages for FDA submission
export const fda510kSubmissionPackages = pgTable(
  'fda_510k_submission_packages',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id')
      .notNull()
      .references(() => fda510kProjects.id),
    submissionId: integer('submission_id').references(() => fda510kSubmissions.id),

    // Package Information
    packageId: text('package_id').notNull().unique(), // Unique package identifier
    packageName: text('package_name').notNull(),
    packageType: text('package_type').default('510k'), // 510k, pma, etc.

    // Package Contents
    documents: json('documents'), // Array of document IDs and metadata
    attachments: json('attachments'), // Supporting files
    estarData: json('estar_data'), // eSTAR specific data

    // FDA Submission Details
    submissionMethod: text('submission_method').default('esg'), // esg, paper
    esgTransactionId: text('esg_transaction_id'),
    fdaAcknowledgmentNumber: text('fda_acknowledgment_number'),

    // Package Status
    status: text('status').default('draft'), // draft, ready, submitted, accepted, rejected
    isLocked: boolean('is_locked').default(false),
    lockedAt: timestamp('locked_at'),

    // Validation
    rtaChecklistComplete: boolean('rta_checklist_complete').default(false),
    rtaChecklistResults: json('rta_checklist_results'),
    finalValidation: json('final_validation'),

    // Submission Tracking
    submittedAt: timestamp('submitted_at'),
    submittedBy: integer('submitted_by').references(() => users.id),
    acknowledgmentDate: date('acknowledgment_date'),

    // Metadata
    metadata: json('metadata'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    packageIdIdx: uniqueIndex('fda_510k_packages_id_idx').on(table.packageId),
    projectPackageIdx: index('fda_510k_packages_project_idx').on(table.projectId),
  })
);

// 510k Data Mappings - Maps workflow data to document templates
export const fda510kDataMappings = pgTable(
  'fda_510k_data_mappings',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),

    // Mapping Identification
    mappingCode: text('mapping_code').notNull().unique(),
    mappingName: text('mapping_name').notNull(),

    // Source and Target
    sourceType: text('source_type').notNull(), // workflow, form, database, api
    sourceReference: text('source_reference').notNull(), // Table.field or API endpoint
    targetTemplate: text('target_template').notNull(), // Template code
    targetField: text('target_field').notNull(), // Placeholder in template

    // Transformation Rules
    transformationType: text('transformation_type'), // direct, calculated, conditional
    transformationRules: json('transformation_rules'), // Rules for data transformation

    // Validation
    isRequired: boolean('is_required').default(false),
    validationRules: json('validation_rules'),

    // Metadata
    isActive: boolean('is_active').default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    mappingCodeIdx: uniqueIndex('fda_510k_mappings_code_idx').on(table.mappingCode),
    orgMappingIdx: index('fda_510k_mappings_org_idx').on(table.organizationId),
  })
);

// Insert schemas for new 510k workflow tables
export const insertFda510kProjectSchema = createInsertSchemaOmit(fda510kProjects, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFda510kTemplateSchema = createInsertSchemaOmit(fda510kTemplates, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFda510kDocumentSchema = createInsertSchemaOmit(fda510kDocuments, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFda510kStageProgressSchema = createInsertSchemaOmit(fda510kStageProgress, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFda510kSubmissionPackageSchema = createInsertSchemaOmit(
  fda510kSubmissionPackages,
  {
    id: true,
    createdAt: true,
    updatedAt: true,
  }
);

export const insertFda510kDataMappingSchema = createInsertSchemaOmit(fda510kDataMappings, {
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Type definitions for new 510k workflow tables
export type Fda510kProject = InferSelectModel<typeof fda510kProjects>;
export type InsertFda510kProject = z.infer<typeof insertFda510kProjectSchema>;

export type Fda510kTemplate = InferSelectModel<typeof fda510kTemplates>;
export type InsertFda510kTemplate = z.infer<typeof insertFda510kTemplateSchema>;

export type Fda510kDocument = InferSelectModel<typeof fda510kDocuments>;
export type InsertFda510kDocument = z.infer<typeof insertFda510kDocumentSchema>;

export type Fda510kStageProgress = InferSelectModel<typeof fda510kStageProgress>;
export type InsertFda510kStageProgress = z.infer<typeof insertFda510kStageProgressSchema>;

export type Fda510kSubmissionPackage = InferSelectModel<typeof fda510kSubmissionPackages>;
export type InsertFda510kSubmissionPackage = z.infer<typeof insertFda510kSubmissionPackageSchema>;

export type Fda510kDataMapping = InferSelectModel<typeof fda510kDataMappings>;
export type InsertFda510kDataMapping = z.infer<typeof insertFda510kDataMappingSchema>;

// ============================================================================
// CER (CLINICAL EVALUATION REPORTS) - MDR/IVDR COMPLIANT
// ============================================================================
