/**
 * Program Workbench & Evidence Objects Schema
 *
 * Schema definitions for regulatory programs and evidence object linking.
 * Supports CER, 510(k), IND, and other regulatory submission types.
 *
 * @version 1.0.0
 * @module shared/schema/programs
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  boolean,
  uuid,
  json,
  varchar,
  index,
  uniqueIndex,
  decimal,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

// Import base tables (referenced)
// Note: In production, import from ../schema.ts

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATORY PROGRAMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Regulatory Programs Table
 *
 * A "Program" represents a regulatory submission effort (CER, 510(k), IND, etc.)
 * It's the top-level container for all related evidence, documents, and milestones.
 */
export const regulatoryPrograms = pgTable(
  'regulatory_programs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),

    // Program identification
    name: text('name').notNull(),
    code: varchar('code', { length: 50 }).notNull(), // e.g., "CER-2026-001"
    description: text('description'),

    // Regulatory classification
    programType: text('program_type').notNull(), // 'CER', '510K', 'IND', 'NDA', 'BLA', 'PMA', 'DE_NOVO'
    productType: text('product_type').notNull(), // 'drug', 'biologic', 'device', 'ivd', 'combination'
    deviceClass: text('device_class'), // 'I', 'II', 'III' (for devices)
    regulatoryPath: text('regulatory_path'), // '510k', 'de_novo', 'pma' (for devices)

    // Target agencies
    primaryAgency: text('primary_agency').notNull(), // 'FDA', 'EMA', 'PMDA', etc.
    targetAgencies: json('target_agencies').$type<string[]>().default([]),

    // Product information
    productName: text('product_name').notNull(),
    productCode: varchar('product_code', { length: 50 }),
    indication: text('indication'),
    intendedUse: text('intended_use'),

    // Device-level eSTAR administrative facts (WO-8 Phase 3;
    // migrations/20260903_regulatory_programs_estar_device_fields.sql). The
    // device-profile intake writes them; the eSTAR administrative-data
    // projection reads them as governed sources. Nullable: blank is reported,
    // never guessed.
    commonName: text('common_name'),
    classificationName: text('classification_name'),
    regulationNumber: text('regulation_number'),
    associatedProductCodes: text('associated_product_codes'),
    indicationsForUseCitation: text('indications_for_use_citation'),

    // Predicate/reference (for 510k/CER)
    predicateDevices: json('predicate_devices').$type<PredicateDevice[]>().default([]),
    equivalentDevices: json('equivalent_devices').$type<EquivalentDevice[]>().default([]),

    // Status & workflow
    status: text('status').notNull().default('draft'), // 'draft', 'active', 'in_review', 'submitted', 'approved', 'rejected', 'archived'
    phase: text('phase').default('planning'), // 'planning', 'evidence_collection', 'authoring', 'review', 'submission', 'post_market'
    priority: text('priority').default('medium'), // 'critical', 'high', 'medium', 'low'

    // Timeline
    targetSubmissionDate: timestamp('target_submission_date'),
    actualSubmissionDate: timestamp('actual_submission_date'),
    approvalDate: timestamp('approval_date'),

    // Progress tracking
    progressPercent: integer('progress_percent').default(0),
    completedMilestones: integer('completed_milestones').default(0),
    totalMilestones: integer('total_milestones').default(0),

    // Team
    leadUserId: integer('lead_user_id'),
    teamMembers: json('team_members').$type<TeamMember[]>().default([]),

    // Configuration
    settings: json('settings').$type<ProgramSettings>(),
    metadata: json('metadata'),
    tags: json('tags').$type<string[]>().default([]),

    // Audit fields
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    deletedAt: timestamp('deleted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('reg_programs_org_idx').on(table.organizationId),
    statusIdx: index('reg_programs_status_idx').on(table.status),
    typeIdx: index('reg_programs_type_idx').on(table.programType),
    codeIdx: uniqueIndex('reg_programs_code_idx').on(table.organizationId, table.code),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE OBJECTS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evidence Objects Table
 *
 * Evidence Objects are the atomic units of proof that support regulatory claims.
 * They can be documents, literature citations, test results, clinical data, etc.
 */
export const evidenceObjects = pgTable(
  'evidence_objects',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id').references(() => regulatoryPrograms.id, { onDelete: 'set null' }),

    // Evidence identification
    title: text('title').notNull(),
    code: varchar('code', { length: 100 }), // e.g., "LIT-001", "TEST-2026-001"
    description: text('description'),

    // Evidence classification
    evidenceType: text('evidence_type').notNull(), // 'literature', 'test_report', 'clinical_data', 'standard', 'cer_section', 'approval_letter', 'guidance', 'expert_opinion'
    evidenceCategory: text('evidence_category').notNull(), // 'clinical', 'nonclinical', 'performance', 'biocompatibility', 'safety', 'regulatory', 'manufacturing'
    evidenceLevel: text('evidence_level'), // 'I', 'II', 'III', 'IV', 'V' (evidence hierarchy)

    // Source information
    sourceType: text('source_type').notNull(), // 'internal', 'external', 'literature', 'agency', 'standard_body'
    sourceReference: text('source_reference'), // URL, DOI, document ID
    sourceCitation: text('source_citation'), // Formatted citation

    // Document linkage
    documentId: integer('document_id'), // Link to vault document
    documentVersion: text('document_version'),
    pageRange: text('page_range'), // e.g., "12-15"
    excerpt: text('excerpt'), // Key excerpt from the evidence

    // Quality & validity
    qualityScore: decimal('quality_score', { precision: 3, scale: 2 }), // 0.00-1.00
    relevanceScore: decimal('relevance_score', { precision: 3, scale: 2 }), // 0.00-1.00
    validFrom: timestamp('valid_from'),
    validUntil: timestamp('valid_until'),
    isVerified: boolean('is_verified').default(false),
    verifiedBy: text('verified_by'),
    verifiedAt: timestamp('verified_at'),

    // Literature-specific fields
    authors: json('authors').$type<string[]>(),
    publicationDate: timestamp('publication_date'),
    journal: text('journal'),
    doi: text('doi'),
    pmid: text('pmid'),
    abstract: text('abstract'),

    // Test report-specific fields
    testType: text('test_type'),
    testLab: text('test_lab'),
    testDate: timestamp('test_date'),
    testResults: json('test_results'),

    // Status
    status: text('status').notNull().default('pending'), // 'pending', 'approved', 'rejected', 'superseded'

    // Metadata
    metadata: json('metadata'),
    tags: json('tags').$type<string[]>().default([]),

    // Audit fields
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('evidence_objects_org_idx').on(table.organizationId),
    programIdx: index('evidence_objects_program_idx').on(table.programId),
    typeIdx: index('evidence_objects_type_idx').on(table.evidenceType),
    categoryIdx: index('evidence_objects_category_idx').on(table.evidenceCategory),
    statusIdx: index('evidence_objects_status_idx').on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// EVIDENCE LINKS (Connecting Evidence to Claims/Sections)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Evidence Links Table
 *
 * Links evidence objects to specific targets (claims, sections, requirements).
 * Enables traceability from claims back to supporting evidence.
 */
export const evidenceLinks = pgTable(
  'evidence_links',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),

    // Source (evidence)
    evidenceId: uuid('evidence_id')
      .notNull()
      .references(() => evidenceObjects.id, { onDelete: 'cascade' }),

    // Target (what the evidence supports)
    targetType: text('target_type').notNull(), // 'claim', 'section', 'requirement', 'standard', 'question'
    targetId: text('target_id').notNull(), // ID of the target entity
    targetPath: text('target_path'), // e.g., CTD path "m3/32p3"

    // Link metadata
    linkType: text('link_type').notNull().default('supports'), // 'supports', 'contradicts', 'references', 'supersedes'
    strength: text('strength').default('moderate'), // 'strong', 'moderate', 'weak'
    rationale: text('rationale'), // Why this evidence supports the claim

    // Verification
    isVerified: boolean('is_verified').default(false),
    verifiedBy: text('verified_by'),
    verifiedAt: timestamp('verified_at'),

    // Audit fields
    createdBy: text('created_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => ({
    evidenceIdx: index('evidence_links_evidence_idx').on(table.evidenceId),
    targetIdx: index('evidence_links_target_idx').on(table.targetType, table.targetId),
    orgIdx: index('evidence_links_org_idx').on(table.organizationId),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM MILESTONES
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Program Milestones Table
 *
 * Tracks key milestones and deliverables for regulatory programs.
 */
export const programMilestones = pgTable(
  'program_milestones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    // Milestone details
    name: text('name').notNull(),
    description: text('description'),
    category: text('category').notNull(), // 'planning', 'evidence', 'authoring', 'review', 'submission', 'agency_response'

    // Timeline
    targetDate: timestamp('target_date'),
    actualDate: timestamp('actual_date'),
    durationDays: integer('duration_days'),

    // Status
    status: text('status').notNull().default('pending'), // 'pending', 'in_progress', 'completed', 'overdue', 'at_risk', 'cancelled'
    progress: integer('progress').default(0), // 0-100

    // Dependencies
    dependsOn: json('depends_on').$type<string[]>().default([]), // Array of milestone IDs

    // Assignment
    assigneeId: integer('assignee_id'),
    assigneeName: text('assignee_name'),

    // Deliverables
    deliverables: json('deliverables').$type<MilestoneDeliverable[]>().default([]),

    // Notes
    notes: text('notes'),

    // Audit fields
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('program_milestones_program_idx').on(table.programId),
    statusIdx: index('program_milestones_status_idx').on(table.status),
    targetDateIdx: index('program_milestones_target_idx').on(table.targetDate),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// PROGRAM ACTIVITY LOG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Program Activity Log Table
 *
 * Tracks all activities within a program for audit trail and timeline view.
 */
export const programActivityLog = pgTable(
  'program_activity_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id').notNull(),

    // Activity details
    activityType: text('activity_type').notNull(), // 'created', 'updated', 'evidence_added', 'milestone_completed', 'status_changed', 'comment', 'review_requested', 'approved', 'rejected'
    entityType: text('entity_type'), // 'program', 'evidence', 'milestone', 'document', 'claim'
    entityId: text('entity_id'),

    // Description
    title: text('title').notNull(),
    description: text('description'),
    details: json('details'),

    // Actor
    userId: integer('user_id'),
    userName: text('user_name'),
    userRole: text('user_role'),

    // Audit fields
    timestamp: timestamp('timestamp').defaultNow().notNull(),
    ipAddress: text('ip_address'),
  },
  table => ({
    programIdx: index('program_activity_program_idx').on(table.programId),
    timestampIdx: index('program_activity_timestamp_idx').on(table.timestamp),
    typeIdx: index('program_activity_type_idx').on(table.activityType),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE DEFINITIONS
// ═══════════════════════════════════════════════════════════════════════════════

/** Predicate device for 510(k) submissions */
export interface PredicateDevice {
  id: string;
  name: string;
  kNumber?: string;
  manufacturer?: string;
  clearanceDate?: string;
  productCode?: string;
}

/** Equivalent device for CER submissions */
export interface EquivalentDevice {
  id: string;
  name: string;
  manufacturer?: string;
  ceMarkNumber?: string;
  technicalEquivalence?: string;
  biologicalEquivalence?: string;
  clinicalEquivalence?: string;
}

/** Team member assignment */
export interface TeamMember {
  userId: number;
  name: string;
  email: string;
  role: string; // 'lead', 'author', 'reviewer', 'approver', 'contributor'
  permissions: string[];
  assignedAt: string;
}

/** Program settings */
export interface ProgramSettings {
  autoAssignReviewers?: boolean;
  requireDualApproval?: boolean;
  notifyOnMilestone?: boolean;
  evidenceVerificationRequired?: boolean;
  templateId?: string;
}

/** Milestone deliverable */
export interface MilestoneDeliverable {
  id: string;
  name: string;
  type: string; // 'document', 'evidence', 'review', 'approval'
  status: 'pending' | 'completed' | 'not_applicable';
  documentId?: string;
  completedAt?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS (Zod validation)
// ═══════════════════════════════════════════════════════════════════════════════

export const insertRegulatoryProgramSchema = createInsertSchema(regulatoryPrograms).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEvidenceObjectSchema = createInsertSchema(evidenceObjects).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertEvidenceLinkSchema = createInsertSchema(evidenceLinks).omit({
  id: true,
  createdAt: true,
});

export const insertProgramMilestoneSchema = createInsertSchema(programMilestones).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertProgramActivitySchema = createInsertSchema(programActivityLog).omit({
  id: true,
  timestamp: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPE EXPORTS
// ═══════════════════════════════════════════════════════════════════════════════

export type RegulatoryProgram = InferSelectModel<typeof regulatoryPrograms>;
export type InsertRegulatoryProgram = z.infer<typeof insertRegulatoryProgramSchema>;

export type EvidenceObject = InferSelectModel<typeof evidenceObjects>;
export type InsertEvidenceObject = z.infer<typeof insertEvidenceObjectSchema>;

export type EvidenceLink = InferSelectModel<typeof evidenceLinks>;
export type InsertEvidenceLink = z.infer<typeof insertEvidenceLinkSchema>;

export type ProgramMilestone = InferSelectModel<typeof programMilestones>;
export type InsertProgramMilestone = z.infer<typeof insertProgramMilestoneSchema>;

export type ProgramActivity = InferSelectModel<typeof programActivityLog>;
export type InsertProgramActivity = z.infer<typeof insertProgramActivitySchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const regulatoryProgramsRelations = relations(regulatoryPrograms, ({ many }) => ({
  evidenceObjects: many(evidenceObjects),
  milestones: many(programMilestones),
  activities: many(programActivityLog),
}));

export const evidenceObjectsRelations = relations(evidenceObjects, ({ one, many }) => ({
  program: one(regulatoryPrograms, {
    fields: [evidenceObjects.programId],
    references: [regulatoryPrograms.id],
  }),
  links: many(evidenceLinks),
}));

export const evidenceLinksRelations = relations(evidenceLinks, ({ one }) => ({
  evidence: one(evidenceObjects, {
    fields: [evidenceLinks.evidenceId],
    references: [evidenceObjects.id],
  }),
}));

export const programMilestonesRelations = relations(programMilestones, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [programMilestones.programId],
    references: [regulatoryPrograms.id],
  }),
}));

export const programActivityLogRelations = relations(programActivityLog, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [programActivityLog.programId],
    references: [regulatoryPrograms.id],
  }),
}));
