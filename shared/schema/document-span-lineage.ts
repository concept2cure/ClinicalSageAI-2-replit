/**
 * Document Span Lineage — which characters of a document came from where.
 *
 * Mirrors db/migrations/20260803_document_span_lineage.sql. That file carries
 * the full rationale; the short version is that six source→usage primitives
 * already exist and none can express a CHARACTER RANGE against the canonical
 * Data Room sources. `evidence_links` comes closest and does it by packing the
 * range into text (`target_path = 'char:120-180'`), which cannot be indexed or
 * queried, and points at evidence_objects rather than cre_evidence_sources.
 *
 * Two shapes live in one table, discriminated by `provenanceKind`:
 *
 *   'cre_evidence_source'  the span came from a Data Room document. Carries
 *                          referenceId (cre_evidence_sources.id as text) and
 *                          payloadSha256 (that source's checksum when cited,
 *                          which is what makes staleness provable later).
 *
 *   'author_assertion'     the span is the author's own analysis. Carries
 *                          assertedBy/assertedAt and, once e-signed, signatureId.
 *                          Original expert prose has no upstream document, and
 *                          inventing one would be a fabricated citation.
 *
 * A database CHECK enforces that each kind carries its own evidence, so a row
 * that records a claim while saying nothing about its origin cannot be stored.
 *
 * @module shared/schema/document-span-lineage
 */

import {
  index,
  integer,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { organizations } from '../schema';

/** How a source was used to produce a span. Not merely THAT it backs it. */
export const SPAN_USAGE_KINDS = [
  'quoted',
  'paraphrased',
  'summarized',
  'derived',
  'computed',
  'asserted',
] as const;
export type SpanUsageKind = (typeof SPAN_USAGE_KINDS)[number];

/** Where a span came from. */
export const SPAN_PROVENANCE_KINDS = ['cre_evidence_source', 'author_assertion'] as const;
export type SpanProvenanceKind = (typeof SPAN_PROVENANCE_KINDS)[number];

export const documentSpanLineage = pgTable(
  'document_span_lineage',
  {
    id: uuid('id').primaryKey().defaultRandom(),

    // Polymorphic: no single public.documents table exists, and the rule spans
    // every surface. Same modelling as submission_evidence_links.
    documentTable: text('document_table').notNull(),
    documentId: text('document_id').notNull(),
    documentVersion: text('document_version'),

    // Half-open [charStart, charEnd) over the document's canonical text.
    charStart: integer('char_start').notNull(),
    charEnd: integer('char_end').notNull(),
    // Offsets rot silently when text above them is edited; the hash is how a
    // stale link is detected instead of trusted.
    spanTextSha256: text('span_text_sha256').notNull(),

    provenanceKind: text('provenance_kind').notNull().$type<SpanProvenanceKind>(),

    // Canonical-source citation — the authoring_citations convention.
    source: text('source'),
    referenceId: text('reference_id'),
    payloadSha256: text('payload_sha256'),
    sourceLocator: text('source_locator'),

    // Author assertion — the author is the source of record.
    assertedBy: text('asserted_by'),
    assertedAt: timestamp('asserted_at', { withTimezone: true }),
    signatureId: text('signature_id'),

    usage: text('usage').notNull().$type<SpanUsageKind>(),
    confidence: real('confidence'),

    organizationId: integer('organization_id')
      .notNull()
      .references(() => organizations.id),
    createdBy: text('created_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => ({
    // "what backs this part of this document" — the click-through read.
    spanIdx: index('document_span_lineage_span_idx').on(
      table.documentTable,
      table.documentId,
      table.charStart,
      table.charEnd
    ),
    // "where is this source used" — reads in the opposite direction.
    referenceIdx: index('document_span_lineage_reference_idx').on(table.referenceId),
    // "this source moved; what is now stale".
    payloadIdx: index('document_span_lineage_payload_idx').on(table.payloadSha256),
    orgIdx: index('document_span_lineage_org_idx').on(table.organizationId),
    // Makes ON CONFLICT DO NOTHING meaningful so re-persisting reconciles
    // rather than duplicating. COALESCE mirrors the SQL: NULLs would otherwise
    // compare distinct and defeat the constraint.
    uniqueLink: uniqueIndex('document_span_lineage_unique_link').on(
      table.organizationId,
      table.documentTable,
      table.documentId,
      table.charStart,
      table.charEnd,
      table.provenanceKind,
      sql`COALESCE(${table.referenceId}, '')`,
      sql`COALESCE(${table.assertedBy}, '')`
    ),
  })
);

export type DocumentSpanLineage = typeof documentSpanLineage.$inferSelect;
export type NewDocumentSpanLineage = typeof documentSpanLineage.$inferInsert;
