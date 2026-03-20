/**
 * CTD Client Onboarding Pipeline Schema
 *
 * Tables for managing client CTD project ingestion:
 * - ctdProjects: Top-level CTD project tracking per organization
 * - ctdOnboardingDocuments: Individual documents uploaded to a CTD project
 * - ctdComplianceGaps: Gap analysis results per project/section
 *
 * MULTI-TENANT: All tables include organizationId for RLS isolation.
 *
 * @module shared/schema/ctd-projects
 */

import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  boolean,
  uuid,
  json,
  real,
  index,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations, users, projects } from '../schema';

// ============================================================================
// CTD PROJECTS — Top-level project for client CTD onboarding
// ============================================================================

export const ctdOnboardingProjects = pgTable(
  'ctd_onboarding_projects',
  {
    id: serial('id').primaryKey(),
    uuid: uuid('uuid').defaultRandom().notNull(),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    projectId: integer('project_id').references(() => projects.id),
    name: text('name').notNull(),
    regulatoryRegion: text('regulatory_region').notNull(), // FDA, EMA, PMDA, NMPA, HealthCanada, TGA, MHRA
    submissionType: text('submission_type').notNull(), // IND, NDA, BLA, ANDA, MAA, JNDA, 510k, PMA
    productName: text('product_name').notNull(),
    productType: text('product_type').notNull(), // drug, biologic, device, biosimilar, combination
    therapeuticArea: text('therapeutic_area'),
    indication: text('indication'),
    status: text('status').default('setup').notNull(), // setup, ingesting, validating, active, archived
    completionPercentage: integer('completion_percentage').default(0).notNull(),
    metadata: json('metadata'),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    orgIdx: index('ctd_onb_proj_org_idx').on(table.organizationId),
    statusIdx: index('ctd_onb_proj_status_idx').on(table.status),
    regionIdx: index('ctd_onb_proj_region_idx').on(table.regulatoryRegion),
  })
);

// ============================================================================
// CTD ONBOARDING DOCUMENTS — Individual documents within a CTD project
// ============================================================================

export const ctdOnboardingDocuments = pgTable(
  'ctd_onboarding_documents',
  {
    id: serial('id').primaryKey(),
    uuid: uuid('uuid').defaultRandom().notNull(),
    ctdProjectId: integer('ctd_project_id')
      .notNull()
      .references(() => ctdOnboardingProjects.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    fileName: text('file_name').notNull(),
    fileSize: integer('file_size').notNull(),
    mimeType: text('mime_type').notNull(),
    storagePath: text('storage_path').notNull(),
    ctdModule: integer('ctd_module').notNull(), // 1-5
    ctdSection: text('ctd_section').notNull(), // e.g. "2.3.S", "3.2.P.5"
    sectionTitle: text('section_title').notNull(),
    documentType: text('document_type').notNull(), // cover_letter, study_report, summary, specification, etc.
    status: text('status').default('uploaded').notNull(), // uploaded, processing, extracted, validated, error
    extractionConfidence: real('extraction_confidence'),
    extractedData: json('extracted_data'),
    validationErrors: json('validation_errors'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('ctd_onb_doc_project_idx').on(table.ctdProjectId),
    orgIdx: index('ctd_onb_doc_org_idx').on(table.organizationId),
    moduleIdx: index('ctd_onb_doc_module_idx').on(table.ctdModule),
    statusIdx: index('ctd_onb_doc_status_idx').on(table.status),
  })
);

// ============================================================================
// CTD COMPLIANCE GAPS — Gap analysis results for a CTD project
// ============================================================================

export const ctdComplianceGaps = pgTable(
  'ctd_compliance_gaps',
  {
    id: serial('id').primaryKey(),
    ctdProjectId: integer('ctd_project_id')
      .notNull()
      .references(() => ctdOnboardingProjects.id, { onDelete: 'cascade' }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    ctdModule: integer('ctd_module').notNull(),
    ctdSection: text('ctd_section').notNull(),
    requirementType: text('requirement_type').notNull(), // missing_section, missing_document, incomplete_content, format_issue
    severity: text('severity').notNull(), // critical, major, minor
    description: text('description').notNull(),
    recommendation: text('recommendation'),
    resolved: boolean('resolved').default(false).notNull(),
    resolvedAt: timestamp('resolved_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => ({
    projectIdx: index('ctd_gap_project_idx').on(table.ctdProjectId),
    orgIdx: index('ctd_gap_org_idx').on(table.organizationId),
    severityIdx: index('ctd_gap_severity_idx').on(table.severity),
    resolvedIdx: index('ctd_gap_resolved_idx').on(table.resolved),
  })
);

// ============================================================================
// EXPORT SUMMARY
// ============================================================================

export const CTD_ONBOARDING_TABLES = [
  'ctdOnboardingProjects',
  'ctdOnboardingDocuments',
  'ctdComplianceGaps',
] as const;

export type CtdOnboardingTableName = (typeof CTD_ONBOARDING_TABLES)[number];
