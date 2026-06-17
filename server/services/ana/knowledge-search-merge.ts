/**
 * Pure merge/de-duplication for AnA's multi-query project knowledge search.
 *
 * Kept separate from the tool handler (which is DB/embedding-bound) so the
 * merge semantics — stable identity, best-score-wins, matched-query tracking,
 * relevance ranking — are unit-testable without a database.
 */

export interface RetrievedDoc {
  id?: string | number | null;
  documentId?: string | number | null;
  chunkId?: string | number | null;
  title?: string | null;
  locator?: string | null;
  sectionTitle?: string | null;
  pageNumber?: number | null;
  finalScore?: number | null;
  content?: string | null;
  compressedContent?: string | null;
}

export interface MergedPassage {
  rank: number;
  title: string;
  relevance: number;
  locator: string | null;
  matched_queries: string[];
  text: string;
}

export function locatorOf(d: RetrievedDoc): string | null {
  return d.locator || d.sectionTitle || (typeof d.pageNumber === 'number' ? `p.${d.pageNumber}` : null);
}

/**
 * Merge the per-query result sets into one de-duplicated, relevance-ranked
 * passage list. Passages are keyed by stable document/chunk identity (falling
 * back to title|locator); the highest score wins and every sub-query that
 * surfaced a passage is recorded so callers can weight cross-query consensus.
 */
export function mergeMultiQueryResults(
  resultsByQuery: Array<{ query: string; docs: RetrievedDoc[] }>,
  mergedCap: number,
  textCap = 800
): MergedPassage[] {
  const byKey = new Map<
    string,
    { title: string; locator: string | null; text: string; score: number; matchedQueries: Set<string> }
  >();

  for (const { query, docs } of resultsByQuery) {
    for (const d of docs) {
      const locator = locatorOf(d);
      const idPart = d.documentId ?? d.chunkId ?? d.id;
      const key = (idPart != null ? String(idPart) : `${d.title ?? 'Untitled'}|${locator ?? ''}`);
      const score = typeof d.finalScore === 'number' ? d.finalScore : 0;
      const existing = byKey.get(key);
      if (existing) {
        existing.score = Math.max(existing.score, score);
        existing.matchedQueries.add(query);
      } else {
        byKey.set(key, {
          title: d.title || 'Untitled',
          locator,
          text: (d.compressedContent || d.content || '').slice(0, textCap),
          score,
          matchedQueries: new Set([query]),
        });
      }
    }
  }

  return [...byKey.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(0, mergedCap))
    .map((p, i) => ({
      rank: i + 1,
      title: p.title,
      relevance: Number(p.score.toFixed(3)),
      locator: p.locator,
      matched_queries: [...p.matchedQueries],
      text: p.text,
    }));
}
