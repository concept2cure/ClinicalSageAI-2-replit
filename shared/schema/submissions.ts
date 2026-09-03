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
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uuid,
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
    documentType: text('document_type'), // classifier hint for pathway leaf→slot matching (e.g. 'protocol', 'cer')
    leafGuid: text('leaf_guid'),
    parentLeafId: integer('parent_leaf_id'),
    /** MD5 of the leaf's RENDERED bytes — the eCTD index-md5 contract. */
    checksum: text('checksum'),
    /** SHA-256 of the SOURCE document's content when this leaf was written.
     *  NULL means no pin was taken, which reads as unknown — never as
     *  unchanged. Distinct from `checksum` above: different algorithm, and
     *  different subject (source content vs. rendered output). See
     *  migrations/20260814e_submission_leaf_source_pin.sql. */
    documentContentSha256: text('document_content_sha256'),
    documentPinnedAt: timestamp('document_pinned_at', { withTimezone: true }),
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
// SUBMISSION ORCHESTRATOR RUNS / STEPS
// ============================================================================
// Mirrors migrations/0018_submission_orchestrator.sql with the tenant-scope
// column added by migrations/20260629_orchestrator_tenant_scope.sql and the
// canonical submission FK added by
// migrations/20260629_orchestrator_submission_id_fk.sql (Path-to-GA §C.4).
//
// `submissionIdFk` is the canonical FK back to public.submissions(id). It is
// NULLABLE during the Path B transition window — new writes from callers
// that supply the FK dual-write both `submissionId` (legacy TEXT, still
// NOT NULL) and `submissionIdFk` (joinable INTEGER). Legacy callers leave
// the FK NULL until a per-tenant data-archaeology backfill resolves them.

export const submissionOrchestratorRuns = pgTable('submission_orchestrator_runs', {
  runId: uuid('run_id').primaryKey(),
  organizationId: integer('organization_id').references(() => organizations.id),
  submissionId: text('submission_id').notNull(),
  /**
   * Canonical FK back to public.submissions(id). Nullable for Path B
   * backward compatibility — see migration header
   * (20260629_orchestrator_submission_id_fk.sql) for the NOT NULL deferral
   * rationale.
   */
  submissionIdFk: integer('submission_id_fk').references(() => submissions.id),
  applicationNumber: text('application_number').notNull(),
  region: text('region').notNull(),
  submissionType: text('submission_type').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  status: text('status').notNull(),
  steps: jsonb('steps').notNull().default([]),
});

export const submissionOrchestratorSteps = pgTable('submission_orchestrator_steps', {
  id: serial('id').primaryKey(),
  runId: uuid('run_id')
    .notNull()
    .references(() => submissionOrchestratorRuns.runId),
  organizationId: integer('organization_id').references(() => organizations.id),
  /**
   * Mirror of the parent run's canonical FK back to public.submissions(id).
   * Nullable for the same Path B reason as the parent table.
   */
  submissionIdFk: integer('submission_id_fk').references(() => submissions.id),
  stepKey: text('step_key').notNull(),
  eventType: text('event_type').notNull(),
  status: text('status').notNull(),
  inputHash: text('input_hash').notNull(),
  outputHash: text('output_hash'),
  outputRef: text('output_ref'),
  error: text('error'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
});

/**
 * rendered_leaf_files — the retained bytes of a server-rendered filing document.
 *
 * The IND lifecycle routes used to render a safety report or annual report to
 * PDF, keep an md5, and discard the bytes; the leaf carried no document
 * reference at all, so every filed lifecycle sequence assembled with zero leaf
 * files and was permanently dispatch-blocked. A row here is what a leaf points
 * at instead: the storage handle plus the digests of the bytes as filed.
 *
 * The bytes live behind the storage provider — `get(vaultVersionId, orgId)` is
 * the only tenant boundary for object bytes, since object storage sits outside
 * RLS — so this table holds the pointer, never the content.
 *
 * Migration migrations/20260903_rendered_leaf_files.sql.
 */
export const renderedLeafFiles = pgTable(
  'rendered_leaf_files',
  {
    id: serial('id').primaryKey(),
    organizationId: integer('organization_id').notNull(),
    /** Storage-provider handle; fetched with get(vaultVersionId, organizationId). */
    vaultVersionId: text('vault_version_id').notNull(),
    /** Digest of the bytes as rendered; re-verified when the leaf is materialized. */
    sha256: text('sha256').notNull(),
    /** The digest the eCTD index carries — stored as filed, never recomputed. */
    md5: text('md5').notNull(),
    mime: text('mime').notNull(),
    byteSize: integer('byte_size').notNull(),
    fileName: text('file_name').notNull(),
    /** ind_safety_report | e2b_r3_icsr | ind_annual_report | ind_letter_of_authorization. */
    renderedFrom: text('rendered_from').notNull(),
    /** The CTD section the bytes were rendered for, when known. */
    sectionCode: text('section_code'),
    createdBy: integer('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    orgVersionUq: unique('rendered_leaf_files_org_version_idx').on(t.organizationId, t.vaultVersionId),
    orgIdx: index('rendered_leaf_files_org_idx').on(t.organizationId),
  }),
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
export type SubmissionOrchestratorRun = typeof submissionOrchestratorRuns.$inferSelect;
export type NewSubmissionOrchestratorRun = typeof submissionOrchestratorRuns.$inferInsert;
export type SubmissionOrchestratorStep = typeof submissionOrchestratorSteps.$inferSelect;
export type NewSubmissionOrchestratorStep = typeof submissionOrchestratorSteps.$inferInsert;
export type RenderedLeafFile = typeof renderedLeafFiles.$inferSelect;
export type NewRenderedLeafFile = typeof renderedLeafFiles.$inferInsert;
