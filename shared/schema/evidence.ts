/**
 * Evidence Graph Schema (Phase 1, WO-1.2) — Truth Engine foundation
 *
 *  - submissionEvidenceLinks: bidirectional provenance between a submission
 *    section/claim and its source document.
 *
 * RECONCILE (RECONCILE.md, WO-1.0):
 *  - The table `evidence_links` ALREADY EXISTS (shared/schema/programs.ts) as a
 *    UUID-keyed evidence_objects -> target graph. To avoid a duplicate/clobbering
 *    table and an export-name collision, Phase-1 document provenance lives in
 *    `submission_evidence_links`. A future task may unify the two graphs.
 *  - The source document is referenced POLYMORPHICALLY (sourceDocumentTable +
 *    sourceDocumentId) because no single public.documents table exists.
 *  - The pgvector embedding column lands on coauthor_documents (declared in
 *    shared/schema.ts), not here.
 *  - consistency_findings is DEFERRED to Phase 3 and is intentionally absent.
 *
 * MULTI-TENANT: organizationId on every row.
 *
 * @module shared/schema/evidence
 */

import {
  integer,
  pgTable,
  serial,
  text,
  real,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { organizations, users } from '../schema';
import { submissions } from './submissions';

// ============================================================================
// SUBMISSION EVIDENCE LINKS — provenance edges (claim/section <-> source doc)
// ============================================================================

export const submissionEvidenceLinks = pgTable(
  'submission_evidence_links',
  {
    id: serial('id').primaryKey(),
    submissionId: integer('submission_id')
      .notNull()
      .references(() => submissions.id),
    targetSectionCode: text('target_section_code').notNull(), // "2.7.3"
    sourceDocumentTable: text('source_document_table').notNull(), // coauthor_documents|ctd_onboarding_documents|unified_documents|vault_documents
    sourceDocumentId: integer('source_document_id').notNull(), // polymorphic id within sourceDocumentTable
    sourceLocator: text('source_locator'), // page/section/anchor
    direction: text('direction').default('derives_from').notNull(), // derives_from|cited_by|supports|contradicts
    confidence: real('confidence'), // 0..1
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
    submissionIdx: index('idx_sub_evlinks_submission_id').on(table.submissionId),
    sourceDocumentIdx: index('idx_sub_evlinks_source_document').on(
      table.sourceDocumentTable,
      table.sourceDocumentId
    ),
    orgIdx: index('idx_sub_evlinks_organization_id').on(table.organizationId),
  })
);

// ============================================================================
// INFERRED TYPES
// ============================================================================

export type SubmissionEvidenceLink = typeof submissionEvidenceLinks.$inferSelect;
export type NewSubmissionEvidenceLink = typeof submissionEvidenceLinks.$inferInsert;
