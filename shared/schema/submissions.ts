/**
 * Submission Core Schema (Phase 1, WO-1.1)
 *
 * The canonical, region-agnostic submission core:
 *  - submissions:        lifecycle-aware submission object (region-agnostic)
 *  - submissionRegions:  per-region projection (pathway + profile versions)
 *  - ectdSequences:      eCTD lifecycle ledger (0000, 0001, ...)
 *  - submissionLeaves:   doc -> CTD-leaf mapping (granularity + lifecycle op)
 *
 * RECONCILE (RECONCILE.md, WO-1.0): none of these tables existed — all
 * CREATE-NEW. submissionLeaves references a document POLYMORPHICALLY
 * (documentTable + documentId) because there is no single public.documents
 * table; this mirrors document_atom_provenance in regulatory-atoms.ts.
 *
 * MULTI-TENANT: every table carries organizationId for tenant isolation.
 *
 * @module shared/schema/submissions
 */

import {
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  index,
  unique,
} from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';

// ============================================================================
// SUBMISSIONS — the living, lifecycle-aware submission object
// ============================================================================

export const submissions = pgTable(
  'submissions',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    productName: text('product_name'),
    applicationType: text('application_type').notNull(), // ind|nda|bla|anda|maa|510k|de_novo|pma|cta
    clientType: text('client_type').notNull(), // pharma|biotech|mdx|ivd
    primaryRegion: text('primary_region').notNull(), // fda|eu|jp
    status: text('status').default('planning').notNull(), // planning|active|submitted|archived
    lifecycleStage: text('lifecycle_stage').default('planning').notNull(), // planning|original|amendment|response|variation|annual|withdrawal
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    orgIdx: index('idx_submissions_organization_id').on(table.organizationId),
    createdByIdx: index('idx_submissions_created_by').on(table.createdBy),
  })
);

// ============================================================================
// SUBMISSION REGIONS — per-region projection of a submission
// ============================================================================

export const submissionRegions = pgTable(
  'submission_regions',
  {
    id: serial('id').primaryKey(),
    submissionId: integer('submission_id')
      .notNull()
      .references(() => submissions.id),
    region: text('region').notNull(), // fda|eu|jp
    pathway: text('pathway').notNull(), // ectd_v322|ectd_v40|estar|mdr|ivdr|ctis
    moduleProfileVersion: text('module_profile_version'),
    validationProfileVersion: text('validation_profile_version'),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    submissionIdx: index('idx_subregions_submission_id').on(table.submissionId),
    orgIdx: index('idx_subregions_organization_id').on(table.organizationId),
    uniqueSubmissionRegion: unique('uq_submission_regions_submission_region').on(
      table.submissionId,
      table.region
    ),
  })
);

// ============================================================================
// ECTD SEQUENCES — the lifecycle ledger (0000, 0001, ...)
// ============================================================================

export const ectdSequences = pgTable(
  'ectd_sequences',
  {
    id: serial('id').primaryKey(),
    submissionId: integer('submission_id')
      .notNull()
      .references(() => submissions.id),
    region: text('region').notNull(), // fda|eu|jp
    sequenceNumber: text('sequence_number').notNull(), // '0000', '0001', ...
    type: text('type').default('original').notNull(), // original|amendment|response|variation|annual|withdrawal
    status: text('status').default('draft').notNull(), // draft|assembling|validated|frozen|dispatched
    validationStatus: text('validation_status'), // pending|passed|failed
    dispatchStatus: text('dispatch_status'), // pending|sent|acknowledged|rejected
    frozenAt: timestamp('frozen_at', { withTimezone: true }),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    submissionIdx: index('idx_ectd_sequences_submission_id').on(table.submissionId),
    orgIdx: index('idx_ectd_sequences_organization_id').on(table.organizationId),
  })
);

// ============================================================================
// SUBMISSION LEAVES — doc -> CTD-leaf mapping (the spine of assembly)
// ============================================================================
// documentTable + documentId are a POLYMORPHIC reference (no hard FK) because
// no single public.documents table exists — see RECONCILE.md §2.

export const submissionLeaves = pgTable(
  'submission_leaves',
  {
    id: serial('id').primaryKey(),
    sequenceId: integer('sequence_id')
      .notNull()
      .references(() => ectdSequences.id),
    sectionCode: text('section_code').notNull(), // "2.5", "3.2.S.4.2", "m1.us.cover"
    title: text('title').notNull(),
    granularity: text('granularity'),
    lifecycleOp: text('lifecycle_op').default('new').notNull(), // new|replace|append|delete
    documentTable: text('document_table'), // coauthor_documents|ctd_onboarding_documents|unified_documents|vault_documents
    documentId: integer('document_id'), // polymorphic id within documentTable
    leafGuid: text('leaf_guid'),
    parentLeafId: integer('parent_leaf_id'),
    checksum: text('checksum'),
    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    sequenceIdx: index('idx_subleaves_sequence_id').on(table.sequenceId),
    documentIdx: index('idx_subleaves_document').on(table.documentTable, table.documentId),
    orgIdx: index('idx_subleaves_organization_id').on(table.organizationId),
    parentIdx: index('idx_subleaves_parent_leaf_id').on(table.parentLeafId),
  })
);

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type Submission = typeof submissions.$inferSelect;
export type NewSubmission = typeof submissions.$inferInsert;
export type SubmissionRegion = typeof submissionRegions.$inferSelect;
export type NewSubmissionRegion = typeof submissionRegions.$inferInsert;
export type EctdSequence = typeof ectdSequences.$inferSelect;
export type NewEctdSequence = typeof ectdSequences.$inferInsert;
export type SubmissionLeaf = typeof submissionLeaves.$inferSelect;
export type NewSubmissionLeaf = typeof submissionLeaves.$inferInsert;
