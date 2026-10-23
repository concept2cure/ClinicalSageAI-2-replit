/** Shared span integrity primitives; service re-exports preserve existing callers. */
import { createHash } from 'node:crypto';
import { pool } from '../../db';
import type { DocumentRef } from './span-lineage.service';

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

/** Default executor — the pool, i.e. its own transaction per statement.
 *
 *  Resolved at CALL time, not at import. `pool as Queryable` dereferenced the
 *  db module's `pool` export while this file loaded, and this file is loaded
 *  by the lineage gate, which is loaded by every governed writer — so any test
 *  that mocks `../db` without a `pool` export (the CMC route suites mock only
 *  `getPool`) died at import with "No pool export is defined on the mock".
 *  Four suites were red on the trunk for exactly that. */
export const defaultExec: Queryable = {
  query: (sql, params) => (pool as unknown as Queryable).query(sql, params),
};

/** sha256 of the span's text — how a link is detected as stale rather than trusted. */
export function hashSpanText(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Read-only verification of the exact saved words described by live spans.
 * Coverage and text identity are separate checks; neither repairs provenance. */
export async function assertLineageHashesMatchContent(
  organizationId: number, ref: Pick<DocumentRef, 'documentTable' | 'documentId'>,
  content: string, exec: Queryable = defaultExec,
): Promise<void> {
  const spans = await exec.query<{ char_start: number; char_end: number; span_text_sha256: string }>(
    `SELECT char_start, char_end, span_text_sha256 FROM document_span_lineage
      WHERE organization_id=$1 AND document_table=$2 AND document_id=$3 AND deleted_at IS NULL`,
    [organizationId, ref.documentTable, ref.documentId],
  );
  for (const span of spans.rows) {
    const start = Number(span.char_start), end = Number(span.char_end);
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > content.length
      || hashSpanText(content.slice(start, end)) !== span.span_text_sha256) {
      throw new SpanLineageError('Current clause lineage does not describe the saved text.');
    }
  }
}

