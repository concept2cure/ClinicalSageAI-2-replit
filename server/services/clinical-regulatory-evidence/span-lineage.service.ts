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

/**
 * Anything that can run a query — the pool, or a client inside a transaction.
 *
 * The write paths take one so a caller can enlist lineage in the SAME
 * transaction as the content it describes. That is what makes "content does not
 * persist without its lineage" an invariant rather than an intention: written
 * on the pool, the lineage is a separate commit that can fail on its own and
 * leave saved text with no provenance.
 */
export interface Queryable {
  query: <R = any>(
    sql: string,
    params?: unknown[],
  ) => Promise<{ rows: R[]; rowCount?: number | null }>;
}

/** Default executor — the pool, i.e. its own transaction per statement. */
const defaultExec: Queryable = pool as unknown as Queryable;

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
  exec: Queryable = defaultExec,
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
  const source = await exec.query<{ id: number; checksum: string | null }>(
    `SELECT id, checksum FROM cre_evidence_sources
      WHERE id = $1 AND ${c.sql} AND deleted_at IS NULL LIMIT 1`,
    [sourceId, c.param],
  );
  if (source.rows.length === 0) {
    throw new SpanLineageError('source not found in this organization');
  }
  const checksum = source.rows[0].checksum ?? null;

  const existing = await exec.query<{ id: string }>(
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
    await exec.query(
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

  const inserted = await exec.query<{ id: string }>(
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
  exec: Queryable = defaultExec,
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

  const existing = await exec.query<{ id: string }>(
    `SELECT id FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
        AND char_start = $4 AND char_end = $5
        AND provenance_kind = 'author_assertion' AND asserted_by = $6
        AND deleted_at IS NULL
      LIMIT 1`,
    [orgId, p.documentTable, p.documentId, p.charStart, p.charEnd, p.assertedBy],
  );

  if (existing.rows.length > 0) {
    await exec.query(
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

  const inserted = await exec.query<{ id: string }>(
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

/**
 * Replace this document's author assertions with exactly the spans given.
 *
 * WHY REPLACE RATHER THAN ADD
 * Offsets are positions in a specific version of the text. Insert a word in the
 * first paragraph and every span after it now describes different characters
 * than it did — the rows still resolve, still look healthy, and are wrong.
 * Recording the new spans without retiring the old ones leaves a document whose
 * lineage table answers confidently with stale ranges, which is worse than
 * answering nothing.
 *
 * So each save states the whole set: spans present in `spans` are written or
 * re-resolved, and author assertions for this document that are NOT in the set
 * are soft-deleted. Soft, because a regulated system keeps the record of what
 * was once asserted — `deleted_at` retires a row from the reads without
 * destroying it.
 *
 * Source citations are deliberately untouched. They are written by a different
 * path with its own lifecycle, and a save of the prose must not silently drop
 * the evidence someone attached to it.
 */
export async function replaceAuthorSpans(
  orgId: number,
  ref: DocumentRef,
  spans: Array<{ charStart: number; charEnd: number; spanText: string; usage?: SpanUsage }>,
  p: {
    assertedBy: string;
    /** When the assertion was made. Defaults to now; a backfill passes the
     *  moment the text was actually authored, which is the true answer. */
    assertedAt?: Date;
    signatureId?: string | null;
    createdBy?: string | null;
  },
  exec: Queryable = defaultExec,
): Promise<{ written: number; retired: number }> {
  if (!p.assertedBy) {
    throw new SpanLineageError('assertedBy is required for an author assertion');
  }

  let written = 0;
  for (const s of spans) {
    // `exec` MUST be forwarded. It was not, and the omission was invisible:
    // recordAuthorSpan fell back to `defaultExec` — the pool — so the span
    // INSERTs ran on a different connection from the caller's transaction while
    // the retire UPDATE below correctly used `exec`. Half the operation was
    // transactional and half was not.
    //
    // In the happy path nothing looked wrong: the pool statements autocommit,
    // so the surrounding transaction still read them back and
    // assertLineageCoversContent passed. The damage was on the failure path —
    // a refused save rolled the CONTENT back and left the spans committed,
    // pointing at text that was never persisted. That is the exact failure the
    // gate exists to prevent, hiding inside the gate.
    await recordAuthorSpan(
      orgId,
      {
        ...ref,
        charStart: s.charStart,
        charEnd: s.charEnd,
        spanText: s.spanText,
        usage: s.usage,
        assertedBy: p.assertedBy,
        assertedAt: p.assertedAt,
        signatureId: p.signatureId ?? null,
        createdBy: p.createdBy ?? p.assertedBy,
      },
      exec,
    );
    written++;
  }

  // Retire author assertions for this document that the new text no longer
  // contains. Ranges are compared as a set of (start, end) pairs; anything not
  // in it describes characters that are gone or have moved.
  const keep = spans.map((s) => `${s.charStart}:${s.charEnd}`);
  const { rowCount } = await exec.query(
    `UPDATE document_span_lineage
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND document_table = $2
        AND document_id = $3
        AND provenance_kind = 'author_assertion'
        AND deleted_at IS NULL
        AND (char_start || ':' || char_end) <> ALL($4::text[])`,
    [orgId, ref.documentTable, ref.documentId, keep.length > 0 ? keep : ['']],
  );

  return { written, retired: rowCount ?? 0 };
}

/**
 * Replace this document's automated source citations with exactly the spans
 * given — the source-grain sibling of {@link replaceAuthorSpans}.
 *
 * The verified-quote attribution path (source-attribution.ts) re-runs over the
 * whole document every time an AI draft is accepted. Recording the fresh quotes
 * without retiring the ones the new text no longer contains would leave the
 * lineage table answering confidently with citations against characters that have
 * moved or been edited away — the same stale-range failure replaceAuthorSpans
 * exists to prevent, and the exact opposite of the "a citation can never go
 * stale" guarantee re-verification is meant to give.
 *
 * So each accept states the whole source-span set: spans in `spans` are written
 * or re-resolved (recordSourceSpan is idempotent per document/span/source), and
 * cre_evidence_source spans for this document NOT in the set are soft-deleted.
 * Soft, because a regulated system keeps the record of what was once cited —
 * deleted_at retires a row from the reads without destroying it.
 *
 * Author assertions are deliberately untouched — the mirror of replaceAuthorSpans
 * leaving source citations alone. The caller manages the two kinds side by side.
 *
 * `exec` MUST be the caller's transaction client so the records, the retirements
 * and the content write commit together; a partial write here reintroduces the
 * best-effort-lineage failure the save gate exists to close.
 */
/**
 * Retire every current source span whose recorded quote is no longer the text
 * at its own offsets, and return the ranges that still verify.
 *
 * A source span is a claim that characters [charStart, charEnd) are a verbatim
 * quote of a source, sealed by `span_text_sha256` at record time. An edit that
 * moves or changes that text — a human refining an accepted AI draft — leaves
 * the row pointing at characters it no longer describes. Re-hashing the slice
 * is a check the row itself makes possible; a quote that stayed in place keeps
 * its citation, one that moved is retired rather than left to answer for the
 * wrong words. Nothing here can RE-verify a moved quote (the source text is not
 * stored), so a moved quote is a retired quote, and the author gate then
 * covers it as the author's assertion.
 */
export async function retireStaleSourceSpans(
  orgId: number,
  ref: { documentTable: string; documentId: string },
  content: string,
  exec: Queryable = pool as unknown as Queryable,
): Promise<{ kept: Array<{ charStart: number; charEnd: number }>; retired: number }> {
  const { rows } = await exec.query<{
    id: string;
    char_start: number;
    char_end: number;
    span_text_sha256: string | null;
  }>(
    `SELECT id, char_start, char_end, span_text_sha256
       FROM document_span_lineage
      WHERE organization_id = $1
        AND document_table = $2
        AND document_id = $3
        AND provenance_kind = 'cre_evidence_source'
        AND deleted_at IS NULL`,
    [orgId, ref.documentTable, ref.documentId],
  );
  const kept: Array<{ charStart: number; charEnd: number }> = [];
  const stale: string[] = [];
  for (const r of rows) {
    const start = Number(r.char_start);
    const end = Number(r.char_end);
    const inPlace =
      start >= 0 &&
      end <= content.length &&
      r.span_text_sha256 != null &&
      hashSpanText(content.slice(start, end)) === r.span_text_sha256;
    if (inPlace) kept.push({ charStart: start, charEnd: end });
    else stale.push(String(r.id));
  }
  if (stale.length > 0) {
    await exec.query(
      `UPDATE document_span_lineage
          SET deleted_at = NOW(), updated_at = NOW()
        WHERE id = ANY($1::uuid[])`,
      [stale],
    );
  }
  return { kept, retired: stale.length };
}

export async function replaceSourceSpans(
  orgId: number,
  ref: DocumentRef,
  spans: Array<{
    charStart: number;
    charEnd: number;
    spanText: string;
    sourceId: number | string;
    usage: SpanUsage;
  }>,
  p: { createdBy?: string | null } = {},
  exec: Queryable = defaultExec,
): Promise<{ written: number; retired: number }> {
  let written = 0;
  for (const s of spans) {
    await recordSourceSpan(
      orgId,
      {
        ...ref,
        charStart: s.charStart,
        charEnd: s.charEnd,
        spanText: s.spanText,
        sourceId: s.sourceId,
        usage: s.usage,
        createdBy: p.createdBy ?? null,
      },
      exec,
    );
    written++;
  }

  // Retire cre_evidence_source spans for this document the new set no longer
  // contains. A source span's identity is (char_start, char_end, reference_id) —
  // reference_id is String(sourceId), the same key recordSourceSpan writes and the
  // unique index enforces — so the keep-set is keyed on all three.
  const keep = spans.map((s) => `${s.charStart}:${s.charEnd}:${Number(s.sourceId)}`);
  const { rowCount } = await exec.query(
    `UPDATE document_span_lineage
        SET deleted_at = NOW(), updated_at = NOW()
      WHERE organization_id = $1
        AND document_table = $2
        AND document_id = $3
        AND provenance_kind = 'cre_evidence_source'
        AND deleted_at IS NULL
        AND (char_start || ':' || char_end || ':' || COALESCE(reference_id, '')) <> ALL($4::text[])`,
    [orgId, ref.documentTable, ref.documentId, keep.length > 0 ? keep : ['']],
  );

  return { written, retired: rowCount ?? 0 };
}

/**
 * The save gate: refuse to let content persist without complete lineage.
 *
 * Called INSIDE the transaction that writes the content, after the lineage for
 * that content has been written on the same connection. It re-reads what the
 * transaction actually contains and throws if any character of the new text is
 * unaccounted for.
 *
 * WHY RE-READ RATHER THAN TRUST THE WRITE
 * The writer returning without throwing means the statements were accepted, not
 * that the rows say what they should. A constraint could retire a span the
 * caller expected to keep, an offset could be computed against different text,
 * or a future edit to the capture path could quietly stop covering part of the
 * content. Re-reading inside the transaction asks the database what it is about
 * to commit, which is the only question that matters.
 *
 * Throwing rolls back the content write with it — that is the whole point.
 * Lineage that is best-effort produces documents whose provenance is missing
 * exactly where something went wrong, which is the worst place for it to be
 * missing.
 */
export async function assertLineageCoversContent(
  orgId: number,
  ref: Pick<DocumentRef, 'documentTable' | 'documentId'>,
  content: string,
  exec: Queryable = defaultExec,
): Promise<void> {
  const contentLength = content.length;
  if (contentLength <= 0) return;

  const { rows } = await exec.query<{ char_start: number; char_end: number }>(
    `SELECT char_start, char_end FROM document_span_lineage
      WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
        AND deleted_at IS NULL
      ORDER BY char_start ASC`,
    [orgId, ref.documentTable, ref.documentId],
  );

  const gaps: Array<{ charStart: number; charEnd: number }> = [];
  let cursor = 0;
  for (const r of rows) {
    const start = Number(r.char_start);
    const end = Number(r.char_end);
    if (start > cursor) gaps.push({ charStart: cursor, charEnd: Math.min(start, contentLength) });
    cursor = Math.max(cursor, end);
    if (cursor >= contentLength) break;
  }
  if (cursor < contentLength) gaps.push({ charStart: cursor, charEnd: contentLength });

  // A gap of whitespace is not unattributed content.
  //
  // Clause spans are trimmed, so the separators between them — the space after
  // a comma, the newline between paragraphs — belong to no span by design.
  // Requiring literally every character to be attributed makes the gate
  // unsatisfiable for any multi-clause text, which is not a stricter invariant
  // but a broken one: it would refuse every real save while a single-clause
  // document passed. What must be accounted for is content that asserts
  // something, and whitespace asserts nothing.
  const real = gaps.filter(
    (g) => g.charEnd > g.charStart && content.slice(g.charStart, g.charEnd).trim().length > 0,
  );
  if (real.length > 0) {
    const shown = real
      .slice(0, 5)
      .map((g) => `${g.charStart}-${g.charEnd}`)
      .join(', ');
    throw new SpanLineageError(
      `lineage does not cover the saved content: ${real.length} unattributed range(s) ` +
        `[${shown}${real.length > 5 ? ', …' : ''}] of ${contentLength} characters`,
    );
  }
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
  exec: Queryable = defaultExec,
): Promise<SpanLineageRow[]> {
  const { rows } = await exec.query(
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
  exec: Queryable = defaultExec,
): Promise<SpanLineageRow[]> {
  const id = Number(sourceId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new SpanLineageError('sourceId must be a positive integer');
  }

  const { rows } = await exec.query(
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
export async function listStaleSpans(
  orgId: number,
  exec: Queryable = defaultExec,
): Promise<SpanLineageRow[]> {
  const { rows } = await exec.query(
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

export interface SelectionOrigins {
  documentTable: string;
  documentId: string;
  selection: { charStart: number; charEnd: number; text?: string };
  /** Spans overlapping the selection, in document order. */
  origins: SpanLineageRow[];
  /** Characters inside the selection with no lineage at all. */
  uncovered: Array<{ charStart: number; charEnd: number }>;
  coveragePercent: number;
  counts: {
    total: number;
    fromSources: number;
    authorAsserted: number;
    stale: number;
  };
  generatedAt: string;
}

/**
 * Everything known about where a SELECTED range of a document came from.
 *
 * This is the read behind "select text → Data Origins". A selection rarely
 * lines up with span boundaries — a reader drags across half of one clause and
 * into the next — so the query is overlap, not containment: any span sharing a
 * character with the selection is part of the answer.
 *
 * Uncovered ranges are reported alongside, because "these three sentences trace
 * to a CSR" and "these three sentences trace to a CSR and this fourth one
 * traces to nothing" are different answers, and only the second is honest.
 */
export async function getSelectionOrigins(
  orgId: number,
  ref: Pick<DocumentRef, 'documentTable' | 'documentId'>,
  charStart: number,
  charEnd: number,
  selectionText?: string,
): Promise<SelectionOrigins> {
  assertSpan(charStart, charEnd);

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
        -- Overlap, not containment: half a clause is still that clause's origin.
        AND l.char_start < $5
        AND l.char_end > $4
      ORDER BY l.char_start ASC, l.char_end ASC`,
    [orgId, ref.documentTable, ref.documentId, charStart, charEnd],
  );

  const origins = rows.map((r: any) => {
    const row = mapRow(r);
    if (row.provenanceKind === 'cre_evidence_source') {
      row.state = spanState(
        r.payload_sha256 ?? null,
        r.current_checksum ?? null,
        r.current_checksum !== null,
      );
      row.sourceTitle = r.source_title ?? null;
    } else {
      row.state = 'current';
    }
    return row;
  });

  // Gaps WITHIN the selection — clipped to it, so a reader is told about the
  // text they actually selected rather than the whole document.
  const merged = origins
    .map((o) => ({ start: Math.max(o.charStart, charStart), end: Math.min(o.charEnd, charEnd) }))
    .sort((a, b) => a.start - b.start);

  const uncovered: Array<{ charStart: number; charEnd: number }> = [];
  let cursor = charStart;
  for (const m of merged) {
    if (m.start > cursor) uncovered.push({ charStart: cursor, charEnd: m.start });
    cursor = Math.max(cursor, m.end);
  }
  if (cursor < charEnd) uncovered.push({ charStart: cursor, charEnd });

  const selectedLength = charEnd - charStart;
  const uncoveredLength = uncovered.reduce((n, u) => n + (u.charEnd - u.charStart), 0);

  return {
    documentTable: ref.documentTable,
    documentId: ref.documentId,
    selection: { charStart, charEnd, text: selectionText },
    origins,
    uncovered,
    coveragePercent:
      selectedLength === 0
        ? 0
        : Math.round(((selectedLength - uncoveredLength) / selectedLength) * 100),
    counts: {
      total: origins.length,
      fromSources: origins.filter((o) => o.provenanceKind === 'cre_evidence_source').length,
      authorAsserted: origins.filter((o) => o.provenanceKind === 'author_assertion').length,
      stale: origins.filter((o) => o.state === 'changed').length,
    },
    generatedAt: new Date().toISOString(),
  };
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
