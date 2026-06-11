/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                          RAG METADATA FILTERS
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Translates the structured `filters` on a retrieval (extracted from the query
 * by self-querying, or passed explicitly) into parameterized SQL predicates on
 * the chunk corpora's joined documents table.
 *
 * Only filters that have a backing column on a given corpus are applied; the
 * rest are silently ignored. In particular NO corpus has a `domain` column, so
 * `filters.domain` is never honoured (documented, not silently surprising).
 */

export interface QueryFilters {
  /** Mapped to the document_type column on the chunk corpora. */
  atomType?: string;
  /** Source system / publisher (rag_documents only). */
  source?: string;
  /** Inclusive document date range. */
  dateRange?: { start: Date; end: Date };
  /** No corpus has a column for this — accepted on the type, never applied. */
  domain?: string;
}

/** The columns a corpus exposes for filtering (null when the corpus lacks one). */
export interface DocFilterColumns {
  documentType: string | null;
  source: string | null;
  date: string | null;
}

/**
 * Append metadata-filter predicates to a parameterized query. Pushes bind values
 * onto `params` (so callers thread their existing param array through) and
 * returns the SQL fragment to splice into the WHERE clause, e.g.
 * `" AND d.document_type ILIKE $4 AND d.created_at >= $5"`. Text filters use
 * ILIKE for case-insensitive exact match (LLM-extracted values vary in case);
 * the date range is half-open-inclusive on both ends.
 */
export function buildDocFilterClause(
  filters: QueryFilters | undefined,
  params: unknown[],
  cols: DocFilterColumns
): string {
  if (!filters) return '';
  let clause = '';
  if (filters.atomType && cols.documentType) {
    params.push(filters.atomType);
    clause += `\n          AND ${cols.documentType} ILIKE $${params.length}`;
  }
  if (filters.source && cols.source) {
    params.push(filters.source);
    clause += `\n          AND ${cols.source} ILIKE $${params.length}`;
  }
  if (filters.dateRange && cols.date) {
    params.push(filters.dateRange.start);
    clause += `\n          AND ${cols.date} >= $${params.length}`;
    params.push(filters.dateRange.end);
    clause += `\n          AND ${cols.date} <= $${params.length}`;
  }
  return clause;
}

/** Column maps per corpus. vault.documents has no `source`; rag_documents has all three. */
export const VAULT_FILTER_COLUMNS: DocFilterColumns = {
  documentType: 'd.document_type',
  source: null,
  date: 'd.created_at',
};
export const RAG_FILTER_COLUMNS: DocFilterColumns = {
  documentType: 'd.document_type',
  source: 'd.source',
  date: 'd.document_date',
};

/**
 * Merge self-query-extracted filters with explicitly-provided ones; explicit
 * wins field-by-field. Returns undefined when neither contributes anything, so
 * callers can skip the filter path entirely.
 */
export function mergeFilters(
  extracted: QueryFilters | undefined,
  explicit: QueryFilters | undefined
): QueryFilters | undefined {
  if (!extracted && !explicit) return undefined;
  const merged: QueryFilters = { ...extracted, ...explicit };
  const hasAny =
    merged.atomType != null || merged.source != null || merged.dateRange != null || merged.domain != null;
  return hasAny ? merged : undefined;
}
