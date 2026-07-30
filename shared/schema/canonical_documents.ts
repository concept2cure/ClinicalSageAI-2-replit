/**
 * Canonical documents — the persisted projection behind the ONE governed
 * document pipeline (server/services/regulatory/documentLifecycleOrchestrator).
 *
 * A canonical document carries a single stable UUID identity from authoring
 * through approval, dossier placement, packaging, and audit. The heavy facets
 * still live in their existing tables (unified_documents, submission_leaves,
 * concept2cure_artifacts, …); this row is the thin spine that holds the
 * lifecycle STAGE, the typed source refs that reach each facet, and the
 * append-only, hash-chained per-document audit trail. It is org-scoped by
 * convention (FK-free, matching the c2c_* lifecycle tables) so the migration
 * stays non-destructive and portable across the tenant DBs.
 *
 * @module shared/schema/canonical_documents
 */
import { boolean, integer, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const canonicalDocuments = pgTable('canonical_documents', {
  /** Stable canonical UUID identity — assigned once, never reused. */
  canonicalId: text('canonical_id').primaryKey(),
  organizationId: integer('organization_id').notNull(),
  projectId: text('project_id'),
  title: text('title').notNull(),
  documentType: text('document_type').notNull(),
  /** Monotonic version; a new approved edition increments and supersedes. */
  version: integer('version').notNull().default(1),
  /** Lifecycle stage (shared/regulatory/document-lifecycle DocumentStage). */
  stage: text('stage').notNull().default('authoring'),
  hasContent: boolean('has_content').notNull().default(false),
  contentHash: text('content_hash').notNull().default(''),
  /** ApprovalSignature JSON for the reviewer sign-off (gate for `approved`). */
  reviewSignature: jsonb('review_signature'),
  /** ApprovalSignature JSON for the approver sign-off (gate for `placed`). */
  approvalSignature: jsonb('approval_signature'),
  /** DossierPlacement JSON (gate for `placed` / `packaged`). */
  placement: jsonb('placement'),
  packagingValidated: boolean('packaging_validated').notNull().default(false),
  /** ExportFacet JSON (format + eCTD leaf + md5 & sha256) once packaged. */
  exportFacet: jsonb('export_facet'),
  /** Typed DocumentSourceRef map keyed by source system (the identity bridge). */
  sourceRefs: jsonb('source_refs').notNull().default({}),
  /**
   * The document's authoring outline — the SectionDefinition[] from this type's
   * registry section blueprint, instantiated at creation so "create a document
   * of type X" actually carries X's sections rather than an empty shell.
   */
  outline: jsonb('outline').notNull().default([]),
  /** Append-only, hash-chained DocumentAuditEvent[] — the single per-doc trail. */
  audit: jsonb('audit').notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type CanonicalDocumentRow = typeof canonicalDocuments.$inferSelect;
export type NewCanonicalDocumentRow = typeof canonicalDocuments.$inferInsert;
