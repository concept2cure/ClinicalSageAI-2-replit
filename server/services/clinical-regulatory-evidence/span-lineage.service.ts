/**
 * Span lineage — which characters of a document came from where.
 *
 * The span-grained sibling of source-usage.service.ts. That service answers
 * "which sources was this SECTION drafted from"; this one answers "which source
 * backs these CHARACTERS, and what was done to it". Same canonical source
 * registry (cre_evidence_sources), same citation convention (source /
 * reference_id / payload_sha256), same three reads:
 *
 *   forward       what backs this part of this document        listDocumentSpans
 *   backward      where is this source used                    listSpansCitingSource
 *   propagation   this source moved; what is now stale         listStaleSpans
 *
 * WHY THE CHECKSUM IS CAPTURED HERE AND NOT READ LATER
 * `payloadSha256` records the source's checksum AT THE MOMENT THE SPAN CITED IT.
 * That is what makes staleness provable rather than inferred: when a source's
 * content identity moves, every span still carrying the previous checksum is
 * against superseded content, recorded in the database rather than recomputed in
 * whichever session happens to look. citeSource() does exactly this at section
 * grain; the mechanism is deliberately identical.
 *
 * TENANCY
 * The source end is verified against the caller before anything is written —
 * without it, a caller can cite another tenant's source and the row is stamped
 * with their own organization_id, so it never surfaces but is written all the
 * same. That is the check citeSource() documents, for the same reason.
 *
 * The document end cannot be verified the same way: the reference is
 * polymorphic (no single documents table exists), so there is no one table to
 * join. Rows are stamped with organizationId and the table carries FORCE ROW
 * LEVEL SECURITY with a tenant_isolation_policy — verified applied by
 * tests/schema-contract/document-span-lineage.pglite.test.ts and by the sweep.
 * Callers are therefore responsible for having authorised the document they
 * name. This is stated rather than silently assumed because it is the one place
 * where this service trusts its caller.
 *
 * @module server/services/clinical-regulatory-evidence/span-lineage.service
 */

import { createHash } from 'node:crypto';

import { pool } from '../../db';
import { visibleOrgClause } from './evidence-spine.service';
import { CRE_SOURCE_CITATION } from './source-usage.service';

export class SpanLineageError extends Error {}

/** How a source was used to produce a span. Mirrors the SQL CHECK constraint. */
export type SpanUsage =
  | 'quoted'
  | 'paraphrased'
  | 'summarized'
  | 'derived'
  | 'computed'
  | 'asserted';

export const SPAN_USAGES: readonly SpanUsage[] = [
  'quoted',
  'paraphrased',
  'summarized',
  'derived',
  'computed',
  'asserted',
];

export type SpanProvenanceKind = 'cre_evidence_source' | 'author_assertion';

/**
 * Whether a span still stands against its source's current content. Same
 * vocabulary as source-usage.service's UsageState, so the two grains report
 * staleness in one language rather than two.
 */
export type SpanState = 'current' | 'changed' | 'unverified' | 'unresolved';

export interface DocumentRef {
  /** The table the document lives in — the reference is polymorphic. */
  documentTable: string;
  documentId: string;
  documentVersion?: string | null;
}

export interface SourceSpanInput extends DocumentRef {
  /** Half-open [charStart, charEnd) over the document's canonical text. */
  charStart: number;
  charEnd: number;
  /** The span's text. Hashed, never stored — the hash is how drift is detected. */
  spanText: string;
  sourceId: number | string;
  usage: SpanUsage;
  sourceLocator?: string | null;
  confidence?: number | null;
  createdBy?: string | null;
}

export interface AuthorSpanInput extends DocumentRef {
  charStart: number;
  charEnd: number;
  spanText: string;
  /** The author is the source of record for their own analysis. */
  assertedBy: string;
  assertedAt?: Date;
  signatureId?: string | null;
  usage?: SpanUsage;
  confidence?: number | null;
  createdBy?: string | null;
}

export interface SpanLineageRow {
  id: string;
  documentTable: string;
  documentId: string;
  charStart: number;
  charEnd: number;
  provenanceKind: SpanProvenanceKind;
  referenceId: string | null;
  payloadSha256: string | null;
  sourceLocator: string | null;
  assertedBy: string | null;
  assertedAt: Date | null;
  usage: SpanUsage;
  confidence: number | null;
  /** Present on forward/propagation reads, which join the source. */
  state?: SpanState;
  sourceTitle?: string | null;
}

/** sha256 of the span's text — how a link is detected as stale rather than trusted. */
export function hashSpanText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function assertSpan(charStart: number, charEnd: number): void {
  if (!Number.isInteger(charStart) || !Number.isInteger(charEnd)) {
    throw new SpanLineageError('charStart and charEnd must be integers');
  }
  if (charStart < 0) throw new SpanLineageError('charStart must be >= 0');
  if (charEnd <= charStart) {
    // An empty span attributes nothing to anything; the DB refuses it too.
    throw new SpanLineageError('charEnd must be greater than charStart');
  }
}

function assertUsage(usage: string): asserts usage is SpanUsage {
  if (!SPAN_USAGES.includes(usage as SpanUsage)) {
    throw new SpanLineageError(
      `usage must be one of ${SPAN_USAGES.join(', ')} — got ${JSON.stringify(usage)}`,
    );
  }
}

function spanState(cited: string | null, current: string | null, resolved: boolean): SpanState {
  if (!resolved) return 'unresolved';
  if (!cited || !current) return 'unverified';
  return cited === current ? 'current' : 'changed';
}

/**
 * Record that a span was written from a Data Room source.
 *
 * Idempotent per (document, span, source): re-persisting the same document
 * re-resolves the existing row to the source's current checksum rather than
 * accumulating duplicates. The unique index is what makes that true — the same
 * clause on evidence_links has no constraint behind it and duplicates instead.
 */
export async function recordSourceSpan(
  orgId: number,
  p: SourceSpanInput,
): Promise<{ id: string; citedChecksum: string | null; created: boolean }> {
  assertSpan(p.charStart, p.charEnd);
  assertUsage(p.usage);
  if (!p.documentTable || !p.documentId) {
    throw new SpanLineageError('documentTable and documentId are required');
  }

  const sourceId = Number(p.sourceId);
  if (!Number.isInteger(sourceId) || sourceId <= 0) {
    throw new SpanLineageError('sourceId must be a positive integer');
  }

  // Verify the source is visible to this tenant BEFORE writing. See header.
  const c = visibleOrgClause(orgId, 2);
  const source = await pool.query<{ id: number; checksum: string | null }>(
    `SELECT id, checksum FROM cre_evidence_sources
      WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL LIMIT 1`,
    [sourceId, c.param],
  );
  if (source.rows.length === 0) {
    throw new SpanLineageError('source not found in this organization');
  }
  const checksum = source.rows[0].checksum ?? null;

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
        AND char_start = $4 AND char_end = $5
        AND provenance_kind = $6 AND reference_id = $7 AND deleted_at IS NULL
      LIMIT 1`,
    [
      orgId,
      p.documentTable,
      p.documentId,
      p.charStart,
      p.charEnd,
      CRE_SOURCE_CITATION,
      String(sourceId),
    ],
  );

  if (existing.rows.length > 0) {
    // Re-resolve to the source's current content identity.
    await pool.query(
      `UPDATE document_span_lineage
          SET payload_sha256 = $1,
              span_text_sha256 = $2,
              usage = $3,
              source_locator = COALESCE($4, source_locator),
              confidence = COALESCE($5, confidence),
              updated_at = NOW()
        WHERE id = $6 AND organization_id = $7`,
      [
        checksum,
        hashSpanText(p.spanText),
        p.usage,
        p.sourceLocator ?? null,
        p.confidence ?? null,
        existing.rows[0].id,
        orgId,
      ],
    );
    return { id: existing.rows[0].id, citedChecksum: checksum, created: false };
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO document_span_lineage (
       document_table, document_id, document_version,
       char_start, char_end, span_text_sha256,
       provenance_kind, source, reference_id, payload_sha256, source_locator,
       usage, confidence, organization_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
     RETURNING id`,
    [
      p.documentTable,
      p.documentId,
      p.documentVersion ?? null,
      p.charStart,
      p.charEnd,
      hashSpanText(p.spanText),
      'cre_evidence_source',
      CRE_SOURCE_CITATION,
      String(sourceId),
      checksum,
      p.sourceLocator ?? null,
      p.usage,
      p.confidence ?? null,
      orgId,
      p.createdBy ?? null,
    ],
  );

  return { id: inserted.rows[0].id, citedChecksum: checksum, created: true };
}

/**
 * Record that a span is the author's own analysis.
 *
 * Original expert prose has no upstream document. Pointing it at one would
 * manufacture a citation that does not exist, which is the specific failure a
 * traceability system must not commit — so the author, the moment and (once
 * signed) the signature are the provenance instead. This satisfies the
 * invariant honestly rather than exempting the span from it.
 */
export async function recordAuthorSpan(
  orgId: number,
  p: AuthorSpanInput,
): Promise<{ id: string; created: boolean }> {
  assertSpan(p.charStart, p.charEnd);
  const usage = p.usage ?? 'asserted';
  assertUsage(usage);
  if (!p.documentTable || !p.documentId) {
    throw new SpanLineageError('documentTable and documentId are required');
  }
  if (!p.assertedBy) {
    throw new SpanLineageError('assertedBy is required for an author assertion');
  }

  const assertedAt = p.assertedAt ?? new Date();

  const existing = await pool.query<{ id: string }>(
    `SELECT id FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
        AND char_start = $4 AND char_end = $5
        AND provenance_kind = 'author_assertion' AND asserted_by = $6
        AND deleted_at IS NULL
      LIMIT 1`,
    [orgId, p.documentTable, p.documentId, p.charStart, p.charEnd, p.assertedBy],
  );

  if (existing.rows.length > 0) {
    await pool.query(
      `UPDATE document_span_lineage
          SET span_text_sha256 = $1,
              usage = $2,
              signature_id = COALESCE($3, signature_id),
              confidence = COALESCE($4, confidence),
              updated_at = NOW()
        WHERE id = $5 AND organization_id = $6`,
      [
        hashSpanText(p.spanText),
        usage,
        p.signatureId ?? null,
        p.confidence ?? null,
        existing.rows[0].id,
        orgId,
      ],
    );
    return { id: existing.rows[0].id, created: false };
  }

  const inserted = await pool.query<{ id: string }>(
    `INSERT INTO document_span_lineage (
       document_table, document_id, document_version,
       char_start, char_end, span_text_sha256,
       provenance_kind, asserted_by, asserted_at, signature_id,
       usage, confidence, organization_id, created_by
     ) VALUES ($1,$2,$3,$4,$5,$6,'author_assertion',$7,$8,$9,$10,$11,$12,$13)
     RETURNING id`,
    [
      p.documentTable,
      p.documentId,
      p.documentVersion ?? null,
      p.charStart,
      p.charEnd,
      hashSpanText(p.spanText),
      p.assertedBy,
      assertedAt,
      p.signatureId ?? null,
      usage,
      p.confidence ?? null,
      orgId,
      p.createdBy ?? p.assertedBy,
    ],
  );

  return { id: inserted.rows[0].id, created: true };
}

function mapRow(r: any): SpanLineageRow {
  return {
    id: r.id,
    documentTable: r.document_table,
    documentId: r.document_id,
    charStart: Number(r.char_start),
    charEnd: Number(r.char_end),
    provenanceKind: r.provenance_kind,
    referenceId: r.reference_id ?? null,
    payloadSha256: r.payload_sha256 ?? null,
    sourceLocator: r.source_locator ?? null,
    assertedBy: r.asserted_by ?? null,
    assertedAt: r.asserted_at ?? null,
    usage: r.usage,
    confidence: r.confidence === null || r.confidence === undefined ? null : Number(r.confidence),
  };
}

/**
 * Forward read: everything backing this document, in document order.
 *
 * This is the click-through — given a character offset the reader clicked, the
 * covering span is the first row whose range contains it.
 */
export async function listDocumentSpans(
  orgId: number,
  ref: Pick<DocumentRef, 'documentTable' | 'documentId'>,
): Promise<SpanLineageRow[]> {
  const { rows } = await pool.query(
    `SELECT l.*, s.checksum AS current_checksum, s.title AS source_title
       FROM document_span_lineage l
       LEFT JOIN cre_evidence_sources s
              ON l.provenance_kind = 'cre_evidence_source'
             AND s.id = NULLIF(l.reference_id, '')::int
             AND s.deleted_at IS NULL
      WHERE l.organization_id = $1
        AND l.document_table = $2
        AND l.document_id = $3
        AND l.deleted_at IS NULL
      ORDER BY l.char_start ASC, l.char_end ASC`,
    [orgId, ref.documentTable, ref.documentId],
  );

  return rows.map((r: any) => {
    const row = mapRow(r);
    if (row.provenanceKind === 'cre_evidence_source') {
      row.state = spanState(r.payload_sha256 ?? null, r.current_checksum ?? null, r.current_checksum !== null);
      row.sourceTitle = r.source_title ?? null;
    } else {
      // An author assertion is not against external content, so it cannot go
      // stale the way a citation can.
      row.state = 'current';
    }
    return row;
  });
}

/**
 * Backward read: every span citing this source, across all documents.
 *
 * Runs in the opposite direction from the forward read — this is the question
 * the Data Room asks ("what does this source affect"), and it is the reason
 * reference_id is indexed.
 */
export async function listSpansCitingSource(
  orgId: number,
  sourceId: number | string,
): Promise<SpanLineageRow[]> {
  const id = Number(sourceId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SpanLineageError('sourceId must be a positive integer');
  }

  const { rows } = await pool.query(
    `SELECT * FROM document_span_lineage
      WHERE organization_id = $1
        AND provenance_kind = 'cre_evidence_source'
        AND reference_id = $2
        AND deleted_at IS NULL
      ORDER BY document_table, document_id, char_start`,
    [orgId, String(id)],
  );
  return rows.map(mapRow);
}

/**
 * Propagation read: spans whose source has moved since they cited it.
 *
 * The comparison is between the checksum recorded at cite time and the source's
 * checksum now. Because the former is stored rather than derived, this is a
 * statement about what actually happened, not a guess reconstructed at read
 * time.
 */
export async function listStaleSpans(orgId: number): Promise<SpanLineageRow[]> {
  const { rows } = await pool.query(
    `SELECT l.*, s.checksum AS current_checksum, s.title AS source_title
       FROM document_span_lineage l
       JOIN cre_evidence_sources s
              ON s.id = NULLIF(l.reference_id, '')::int
             AND s.deleted_at IS NULL
      WHERE l.organization_id = $1
        AND l.provenance_kind = 'cre_evidence_source'
        AND l.deleted_at IS NULL
        AND l.payload_sha256 IS NOT NULL
        AND s.checksum IS NOT NULL
        AND l.payload_sha256 <> s.checksum
      ORDER BY l.document_table, l.document_id, l.char_start`,
    [orgId],
  );
  return rows.map((r: any) => {
    const row = mapRow(r);
    row.state = 'changed';
    row.sourceTitle = r.source_title ?? null;
    return row;
  });
}

/**
 * Which characters of this document have no lineage at all.
 *
 * Phase 4 turns this into the save gate. It is here rather than there because
 * the answer is a property of the lineage table, and because a coverage number
 * that is only computed at enforcement time cannot be shown to an author while
 * they write.
 *
 * Returns the uncovered ranges of [0, contentLength) — merging overlapping
 * spans first, so two sources backing the same sentence do not read as a gap.
 */
export async function findUncoveredRanges(
  orgId: number,
  ref: Pick<DocumentRef, 'documentTable' | 'documentId'>,
  contentLength: number,
): Promise<Array<{ charStart: number; charEnd: number }>> {
  if (contentLength <= 0) return [];

  const spans = await listDocumentSpans(orgId, ref);
  const sorted = spans
    .map((s) => ({ start: s.charStart, end: s.charEnd }))
    .sort((a, b) => a.start - b.start);

  const gaps: Array<{ charStart: number; charEnd: number }> = [];
  let cursor = 0;
  for (const s of sorted) {
    if (s.start > cursor) gaps.push({ charStart: cursor, charEnd: Math.min(s.start, contentLength) });
    cursor = Math.max(cursor, s.end);
    if (cursor >= contentLength) break;
  }
  if (cursor < contentLength) gaps.push({ charStart: cursor, charEnd: contentLength });

  return gaps.filter((g) => g.charEnd > g.charStart);
}
