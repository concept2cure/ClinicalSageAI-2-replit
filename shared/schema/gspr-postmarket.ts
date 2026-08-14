/**
 * GSPR (General Safety and Performance Requirements) + Post-Market Schema
 *
 * Models EU MDR 2017/745 Annex I and IVDR 2017/746 Annex I as a normalized,
 * versioned catalog with per-program applicability mappings. Adds a single
 * `post_market_documents` table with a type discriminator that holds PMS Plan,
 * PMS Report, PMCF Plan, PMCF Evaluation, device PSUR, and SSCP authoring
 * artifacts.
 *
 * Why this is not a duplicate of cerEssentialRequirements:
 *   cerEssentialRequirements is a freetext (requirement, evidence, status)
 *   row keyed to a single cerReport — useful as a CER section snippet, not as
 *   a normalized regulator-grade catalog. The new tables provide the catalog
 *   and the per-program decision history. Evidence linkage targets the same
 *   `evidence_objects` rows used elsewhere on the platform.
 */

import { relations, InferSelectModel } from 'drizzle-orm';
import {
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
  json,
  varchar,
  boolean,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { createInsertSchema } from 'drizzle-zod';
import { z } from 'zod';

import { regulatoryPrograms, evidenceObjects } from './programs';

// ─────────────────────────────────────────────────────────────────────────────
// GSPR catalog — one row per Annex I clause
// ─────────────────────────────────────────────────────────────────────────────

export const gsprRequirements = pgTable(
  'gspr_requirements',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Provenance: which regulation + Annex this clause is from
    regulation: varchar('regulation', { length: 16 }).notNull(),
    // 'MDR' (2017/745) | 'IVDR' (2017/746)
    annex: varchar('annex', { length: 16 }).notNull().default('I'),
    chapter: varchar('chapter', { length: 8 }), // 'I' | 'II' | 'III'
    clause: varchar('clause', { length: 32 }).notNull(), // '1' | '10.4' | '23.1.a'
    title: text('title').notNull(),
    summary: text('summary'), // short prose

    // Scope
    deviceClassScope: text('device_class_scope').array(), // ['I','IIa','IIb','III']
    productTypeScope: text('product_type_scope').array(),
    // ['device','ivd','samd','ai_ml','combination','active_implantable','implantable']
    isImplantableOnly: boolean('is_implantable_only').default(false),
    isSterileOnly: boolean('is_sterile_only').default(false),

    // Cross-refs
    relatedStandards: text('related_standards').array(),
    // e.g. ['ISO 14971:2019','IEC 62304:2006/AMD 1:2015']

    // Lifecycle
    status: varchar('status', { length: 16 }).notNull().default('active'),
    // active | superseded | withdrawn

    metadata: json('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    regClauseIdx: uniqueIndex('gspr_req_reg_clause_idx').on(
      table.regulation,
      table.annex,
      table.clause
    ),
    regulationIdx: index('gspr_req_regulation_idx').on(table.regulation),
    chapterIdx: index('gspr_req_chapter_idx').on(table.chapter),
    statusIdx: index('gspr_req_status_idx').on(table.status),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// GSPR program mappings — per-program decision per requirement
// ─────────────────────────────────────────────────────────────────────────────

export const gsprProgramMappings = pgTable(
  'gspr_program_mappings',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    requirementId: uuid('requirement_id')
      .notNull()
      .references(() => gsprRequirements.id, { onDelete: 'restrict' }),

    // Decision
    applicability: varchar('applicability', { length: 24 }).notNull(),
    // applies | not_applicable | partial | tbd
    rationale: text('rationale'),

    // Evidence linkage
    primaryEvidenceId: uuid('primary_evidence_id').references(() => evidenceObjects.id, {
      onDelete: 'set null',
    }),
    methodOfDemonstration: text('method_of_demonstration'),
    // e.g. 'declaration_of_conformity', 'test_report', 'literature_appraisal',
    //      'clinical_evaluation', 'post_market_data'

    // Conformance lifecycle
    conformanceStatus: varchar('conformance_status', { length: 24 }).notNull().default('not_started'),
    // not_started | in_progress | conformant | non_conformant | needs_evidence
    gapDescription: text('gap_description'),

    // Audit
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),

    metadata: json('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('gspr_map_program_idx').on(table.programId),
    requirementIdx: index('gspr_map_requirement_idx').on(table.requirementId),
    statusIdx: index('gspr_map_status_idx').on(table.conformanceStatus),
    pairIdx: uniqueIndex('gspr_map_pair_idx').on(table.programId, table.requirementId),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Post-market documents — PMS / PMCF / PSUR / SSCP authoring
// ─────────────────────────────────────────────────────────────────────────────

export const postMarketDocuments = pgTable(
  'post_market_documents',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    // Discriminator — which post-market document type
    documentType: varchar('document_type', { length: 32 }).notNull(),
    // pms_plan | pms_report | pmcf_plan | pmcf_evaluation | psur | sscp

    code: varchar('code', { length: 64 }).notNull(),
    version: integer('version').notNull().default(1),
    previousDocumentId: uuid('previous_document_id'),

    title: text('title').notNull(),
    deviceSubjectName: text('device_subject_name'),

    // Reporting period (relevant to PSUR / pms_report / pmcf_evaluation)
    reportingPeriodStart: timestamp('reporting_period_start'),
    reportingPeriodEnd: timestamp('reporting_period_end'),

    // Structured content keyed by document type — interpreted by the
    // post-market service, not by the DB. See PostMarketDocumentContent in
    // shared/schema/post-market-types.ts.
    content: json('content'),

    // Common narratives extracted to columns for indexing / quick reads
    summary: text('summary'),
    risksIdentified: text('risks_identified'),
    benefitRiskConclusion: text('benefit_risk_conclusion'),

    // Lifecycle
    status: varchar('status', { length: 32 }).notNull().default('draft'),
    // draft | under_review | approved | superseded | withdrawn
    locked: boolean('locked').notNull().default(false),
    approvedBy: text('approved_by'),
    approvedAt: timestamp('approved_at'),
    signatureId: uuid('signature_id'), // soft FK to electronic_signatures

    // References
    relatedCerReportId: integer('related_cer_report_id'),
    relatedPredicateKNumber: varchar('related_predicate_k_number', { length: 32 }),

    metadata: json('metadata'),

    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('post_market_program_idx').on(table.programId),
    orgIdx: index('post_market_org_idx').on(table.organizationId),
    typeIdx: index('post_market_type_idx').on(table.documentType),
    statusIdx: index('post_market_status_idx').on(table.status),
    codeVersionIdx: uniqueIndex('post_market_code_version_idx').on(
      table.organizationId,
      table.programId,
      table.documentType,
      table.code,
      table.version
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// PMCF enrolment — Annex XIV Part B §6.2 execution evidence
//
// The PMCF *plan* is a postMarketDocuments row: versioned, approvable,
// lockable. Enrolment progress is the opposite kind of record — it moves
// continuously against a plan that is deliberately frozen — so it lives here
// and points back at the plan via pmcfPlanDocumentId. Full rationale, and the
// CHECK constraints that make the nullable columns honest, are in
// migrations/20260814c_pmcf_enrollment_records.sql.
//
// NULL IS NOT ZERO, in three places:
//   targetEnrollment  null = no planned sample size set (never 0)
//   enrolledCount     null = enrolment NEVER reported; a reported 0 is a fact
//   enrollmentAsOf    present iff enrolledCount is — an undated count is not
//                     evidence
// ─────────────────────────────────────────────────────────────────────────────

/** MDCG 2020-7 §6 PMCF method taxonomy. Mirrors the DB CHECK constraint. */
export const PMCF_ACTIVITY_KINDS = [
  'pmcf_study',
  'registry',
  'survey',
  'cohort_follow_up',
  'literature_review',
  'other',
] as const;
export type PmcfActivityKind = (typeof PMCF_ACTIVITY_KINDS)[number];

/** Lifecycle of the ACTIVITY (not of a document). Mirrors the DB CHECK. */
export const PMCF_ACTIVITY_STATUSES = [
  'planned',
  'enrolling',
  'follow_up',
  'completed',
  'terminated',
] as const;
export type PmcfActivityStatus = (typeof PMCF_ACTIVITY_STATUSES)[number];

export const pmcfEnrollmentRecords = pgTable(
  'pmcf_enrollment_records',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    // FK-free by repo convention — see the migration header.
    programId: uuid('program_id').notNull(),
    pmcfPlanDocumentId: uuid('pmcf_plan_document_id'),

    activityCode: text('activity_code').notNull(),
    activityKind: text('activity_kind').notNull(),
    title: text('title').notNull(),
    status: text('status').notNull().default('planned'),

    primaryEndpoint: text('primary_endpoint'),
    sitesCount: integer('sites_count'),

    /** Planned sample size, or null when none is set. Never 0. */
    targetEnrollment: integer('target_enrollment'),
    /** Subjects enrolled as reported. null = never reported; 0 is a real fact. */
    enrolledCount: integer('enrolled_count'),
    /** The date enrolledCount was true on. Present iff enrolledCount is. */
    enrollmentAsOf: timestamp('enrollment_as_of', { withTimezone: true }),

    dataCollectionThrough: timestamp('data_collection_through', { withTimezone: true }),
    notes: text('notes'),

    createdBy: text('created_by').notNull(),
    updatedBy: text('updated_by').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => ({
    activityUq: uniqueIndex('pmcf_enrollment_records_activity_uq').on(
      table.organizationId,
      table.programId,
      table.activityCode
    ),
    orgProgramIdx: index('pmcf_enrollment_records_org_program_idx').on(
      table.organizationId,
      table.programId
    ),
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// Insert schemas + types
// ─────────────────────────────────────────────────────────────────────────────

export const insertGsprRequirementSchema = createInsertSchema(gsprRequirements).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertGsprProgramMappingSchema = createInsertSchema(gsprProgramMappings).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertPostMarketDocumentSchema = createInsertSchema(postMarketDocuments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type GsprRequirement = InferSelectModel<typeof gsprRequirements>;
export type InsertGsprRequirement = z.infer<typeof insertGsprRequirementSchema>;
export type GsprProgramMapping = InferSelectModel<typeof gsprProgramMappings>;
export type InsertGsprProgramMapping = z.infer<typeof insertGsprProgramMappingSchema>;
export type PostMarketDocument = InferSelectModel<typeof postMarketDocuments>;
export type InsertPostMarketDocument = z.infer<typeof insertPostMarketDocumentSchema>;

export const insertPmcfEnrollmentRecordSchema = createInsertSchema(pmcfEnrollmentRecords).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type PmcfEnrollmentRecord = InferSelectModel<typeof pmcfEnrollmentRecords>;
export type InsertPmcfEnrollmentRecord = z.infer<typeof insertPmcfEnrollmentRecordSchema>;

export type PostMarketDocumentType =
  | 'pms_plan'
  | 'pms_report'
  | 'pmcf_plan'
  | 'pmcf_evaluation'
  | 'psur'
  | 'sscp';

export const gsprRequirementsRelations = relations(gsprRequirements, ({ many }) => ({
  programMappings: many(gsprProgramMappings),
}));

export const gsprProgramMappingsRelations = relations(gsprProgramMappings, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [gsprProgramMappings.programId],
    references: [regulatoryPrograms.id],
  }),
  requirement: one(gsprRequirements, {
    fields: [gsprProgramMappings.requirementId],
    references: [gsprRequirements.id],
  }),
  primaryEvidence: one(evidenceObjects, {
    fields: [gsprProgramMappings.primaryEvidenceId],
    references: [evidenceObjects.id],
  }),
}));

export const postMarketDocumentsRelations = relations(postMarketDocuments, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [postMarketDocuments.programId],
    references: [regulatoryPrograms.id],
  }),
}));
