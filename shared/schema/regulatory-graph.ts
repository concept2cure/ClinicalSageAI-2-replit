/**
 * Regulatory Graph Foundation
 *
 * First-class entities for the regulatory knowledge graph that the rest of the
 * platform (510(k) SE Engine, CER Lifecycle Engine, Reviewer Simulator,
 * Living-File Impact Propagator) hangs off.
 *
 * Existing tables already supplied by `programs.ts`:
 *   - regulatory_programs   (top-level submission container)
 *   - evidence_objects      (atomic evidence units)
 *   - evidence_links        (typed adjacency: supports / contradicts / references / supersedes)
 *
 * What this module adds:
 *   - device_claims          first-class claim entity (target of evidence_links)
 *   - submission_sections    canonical submission-section entity (target of evidence_links)
 *   - regulatory_standards   catalog of ISO / IEC / FDA-recognized consensus standards
 *   - standards_applicability per-program / per-device decision: which standards apply,
 *                             rationale, and the evidence that demonstrates conformance
 *
 * All four are organization-scoped (multi-tenant), versioned, and audit-stamped.
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

import { regulatoryPrograms, evidenceObjects } from './programs';

// ═══════════════════════════════════════════════════════════════════════════════
// DEVICE CLAIMS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Device Claims Table
 *
 * Every regulatory claim about a device (intended use, performance, safety,
 * clinical, labeling, technical) gets a stable id so evidence_links can point
 * at it deterministically. Claims are immutable per `version`; new versions
 * are inserted, old versions are not mutated.
 */
export const deviceClaims = pgTable(
  'device_claims',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id').references(() => regulatoryPrograms.id, {
      onDelete: 'cascade',
    }),

    // Stable code within a program (e.g. "CLM-IFU-001"); reused across versions
    code: varchar('code', { length: 80 }).notNull(),
    version: integer('version').notNull().default(1),

    // The claim itself
    claimText: text('claim_text').notNull(),
    claimType: text('claim_type').notNull(), // intended_use | performance | safety | clinical | labeling | technical | indication | contraindication
    sourceDocument: text('source_document'), // where the claim appears (IFU, 510(k) §X, CER §Y)
    sourcePath: text('source_path'), // section path / anchor

    // Population & context (inherited from program if null)
    population: text('population'),
    anatomicalSite: text('anatomical_site'),
    useEnvironment: text('use_environment'),

    // Status & lifecycle
    status: text('status').notNull().default('proposed'),
    // proposed | supported | unsupported | contradicted | withdrawn | superseded
    supersededByClaimId: uuid('superseded_by_claim_id'),

    // Risk linkage (free-form; canonical risk traceability lives on evidence_links)
    riskLevel: text('risk_level'), // low | medium | high | critical
    riskRationale: text('risk_rationale'),

    // Authoring metadata
    metadata: json('metadata'),
    tags: json('tags').$type<string[]>().default([]),

    // Audit fields
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    orgIdx: index('device_claims_org_idx').on(table.organizationId),
    programIdx: index('device_claims_program_idx').on(table.programId),
    typeIdx: index('device_claims_type_idx').on(table.claimType),
    statusIdx: index('device_claims_status_idx').on(table.status),
    codeVersionIdx: uniqueIndex('device_claims_code_version_idx').on(
      table.organizationId,
      table.code,
      table.version
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// SUBMISSION SECTIONS
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Submission Sections Table
 *
 * Canonical section identity per program. evidence_links.target_id may point
 * here so a graph traversal can answer "which sections of submission X are
 * unsupported by current evidence?"
 */
export const submissionSections = pgTable(
  'submission_sections',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),

    // Hierarchy
    parentSectionId: uuid('parent_section_id'),
    sectionCode: varchar('section_code', { length: 80 }).notNull(),
    sectionName: text('section_name').notNull(),
    ordering: integer('ordering').default(0),

    // Framework: 510k | de_novo | pma | estar | cer | ivdr_per | pmcf | psur | sscp | gspr | ind_ctd
    framework: text('framework').notNull(),

    // Required evidence types (from shared/evidenceSchema EvidenceType enum)
    requiredEvidenceTypes: json('required_evidence_types').$type<string[]>().default([]),
    optionalEvidenceTypes: json('optional_evidence_types').$type<string[]>().default([]),

    // Required to ship?
    isRequired: boolean('is_required').notNull().default(true),

    // Authoring status
    status: text('status').notNull().default('not_started'),
    // not_started | drafting | review | approved | locked

    // Authoring metadata
    metadata: json('metadata'),

    // Audit fields
    createdBy: text('created_by'),
    updatedBy: text('updated_by'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('submission_sections_program_idx').on(table.programId),
    frameworkIdx: index('submission_sections_framework_idx').on(table.framework),
    parentIdx: index('submission_sections_parent_idx').on(table.parentSectionId),
    codeIdx: uniqueIndex('submission_sections_code_idx').on(
      table.programId,
      table.framework,
      table.sectionCode
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATORY STANDARDS CATALOG
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Regulatory Standards Catalog
 *
 * Master list of consensus standards relevant to medical-device / IVD
 * submissions. Seeded with FDA-recognized + EU-harmonized ISO/IEC standards.
 * Per-program applicability lives in `standards_applicability`.
 */
export const regulatoryStandards = pgTable(
  'regulatory_standards',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Identity
    code: varchar('code', { length: 80 }).notNull(), // 'ISO 14971:2019'
    title: text('title').notNull(),
    sdo: varchar('sdo', { length: 32 }).notNull(), // ISO | IEC | ASTM | CLSI | AAMI | FDA | other
    version: varchar('version', { length: 32 }), // '2019' / '4.0' / 'Rev D'
    publishedAt: timestamp('published_at'),

    // Scope
    domain: text('domain').notNull(),
    // qms | risk | software | usability | electrical | biocompatibility |
    // sterilization | packaging | cybersecurity | ivd_clinical_performance |
    // labeling | clinical_investigation | symbols | other
    appliesTo: json('applies_to').$type<string[]>().default([]),
    // ['device','ivd','samd','ai_ml','combination']

    // FDA-recognized consensus standard?
    fdaRecognitionNumber: varchar('fda_recognition_number', { length: 32 }),
    fdaRecognized: boolean('fda_recognized').default(false),
    euHarmonized: boolean('eu_harmonized').default(false),
    // Optional jurisdictional list for finer control
    jurisdictions: json('jurisdictions').$type<string[]>().default([]),
    // ['US','EU','UK','JP','CA','AU','BR','CN']

    // Lifecycle
    status: text('status').notNull().default('active'),
    // active | superseded | withdrawn | draft
    supersededByStandardId: uuid('superseded_by_standard_id'),
    withdrawnAt: timestamp('withdrawn_at'),
    effectiveAt: timestamp('effective_at'),

    // Reference
    sourceUrl: text('source_url'),
    summary: text('summary'),

    metadata: json('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    codeIdx: uniqueIndex('regulatory_standards_code_idx').on(table.code),
    sdoIdx: index('regulatory_standards_sdo_idx').on(table.sdo),
    domainIdx: index('regulatory_standards_domain_idx').on(table.domain),
    statusIdx: index('regulatory_standards_status_idx').on(table.status),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// STANDARDS APPLICABILITY (per-program decision + evidence link)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Standards Applicability Table
 *
 * For a given program, records which standards apply, why, who decided, and
 * the evidence object that demonstrates conformance. One row per
 * (program × standard).
 */
export const standardsApplicability = pgTable(
  'standards_applicability',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    organizationId: integer('organization_id').notNull(),
    programId: uuid('program_id')
      .notNull()
      .references(() => regulatoryPrograms.id, { onDelete: 'cascade' }),
    standardId: uuid('standard_id')
      .notNull()
      .references(() => regulatoryStandards.id, { onDelete: 'restrict' }),

    // Decision
    applicability: text('applicability').notNull(),
    // applies | does_not_apply | conditional | tbd
    rationale: text('rationale'),

    // Conformance plan
    conformanceMethod: text('conformance_method'),
    // full_conformance | partial_conformance | declaration_of_conformity |
    // alternative_method | exemption_claimed
    conformanceStatus: text('conformance_status').notNull().default('not_started'),
    // not_started | in_progress | conformant | non_conformant | needs_evidence

    // Evidence linkage (one canonical evidence object per applicability row;
    // additional evidence is wired through evidence_links targeting this row's id)
    primaryEvidenceId: uuid('primary_evidence_id').references(() => evidenceObjects.id, {
      onDelete: 'set null',
    }),
    gapDescription: text('gap_description'),

    // Decision audit
    decidedBy: text('decided_by'),
    decidedAt: timestamp('decided_at'),
    reviewedBy: text('reviewed_by'),
    reviewedAt: timestamp('reviewed_at'),

    metadata: json('metadata'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => ({
    programIdx: index('standards_applicability_program_idx').on(table.programId),
    standardIdx: index('standards_applicability_standard_idx').on(table.standardId),
    statusIdx: index('standards_applicability_status_idx').on(table.conformanceStatus),
    pairIdx: uniqueIndex('standards_applicability_pair_idx').on(
      table.programId,
      table.standardId
    ),
  })
);

// ═══════════════════════════════════════════════════════════════════════════════
// INSERT SCHEMAS
// ═══════════════════════════════════════════════════════════════════════════════

export const insertDeviceClaimSchema = createInsertSchema(deviceClaims).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSubmissionSectionSchema = createInsertSchema(submissionSections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertRegulatoryStandardSchema = createInsertSchema(regulatoryStandards).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertStandardsApplicabilitySchema = createInsertSchema(standardsApplicability).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

export type DeviceClaim = InferSelectModel<typeof deviceClaims>;
export type InsertDeviceClaim = z.infer<typeof insertDeviceClaimSchema>;

export type SubmissionSection = InferSelectModel<typeof submissionSections>;
export type InsertSubmissionSection = z.infer<typeof insertSubmissionSectionSchema>;

export type RegulatoryStandard = InferSelectModel<typeof regulatoryStandards>;
export type InsertRegulatoryStandard = z.infer<typeof insertRegulatoryStandardSchema>;

export type StandardsApplicability = InferSelectModel<typeof standardsApplicability>;
export type InsertStandardsApplicability = z.infer<typeof insertStandardsApplicabilitySchema>;

// ═══════════════════════════════════════════════════════════════════════════════
// RELATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export const deviceClaimsRelations = relations(deviceClaims, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [deviceClaims.programId],
    references: [regulatoryPrograms.id],
  }),
}));

export const submissionSectionsRelations = relations(submissionSections, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [submissionSections.programId],
    references: [regulatoryPrograms.id],
  }),
}));

export const regulatoryStandardsRelations = relations(regulatoryStandards, ({ many }) => ({
  applicabilities: many(standardsApplicability),
}));

export const standardsApplicabilityRelations = relations(standardsApplicability, ({ one }) => ({
  program: one(regulatoryPrograms, {
    fields: [standardsApplicability.programId],
    references: [regulatoryPrograms.id],
  }),
  standard: one(regulatoryStandards, {
    fields: [standardsApplicability.standardId],
    references: [regulatoryStandards.id],
  }),
  primaryEvidence: one(evidenceObjects, {
    fields: [standardsApplicability.primaryEvidenceId],
    references: [evidenceObjects.id],
  }),
}));
