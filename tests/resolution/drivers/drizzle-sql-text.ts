/**
 * Reconstruct the TEXT of a drizzle `sql` template, for mocks that route on it.
 *
 * One copy, because the two that existed had already diverged in behaviour while
 * carrying the identical comment about the identical bug. A drizzle StringChunk
 * stringifies to "[object Object]" — its text lives in `.value` as a string[] —
 * so `String(queryChunks[0])` matched nothing and every branch of a routing mock
 * fell through to its catch-all. And `sql.join()` (which db/drizzle-queryable.ts
 * uses to rebuild a $1-style query) produces chunks that are THEMSELVES SQL
 * objects, so a flat map over `.value` returned '' for every query issued
 * through `queryableFromDrizzle`. That is what made the span-lineage writes
 * invisible in both mocks: not a wrong branch, an empty string matching none of
 * them.
 *
 * Test-support only. Nothing in server/ routes on reconstructed SQL text.
 */
function chunkText(c: any): string {
  if (c == null) return '';
  if (typeof c === 'string') return c;
  if (Array.isArray(c?.value)) return c.value.join('');
  if (Array.isArray(c?.queryChunks)) return c.queryChunks.map(chunkText).join(' ');
  return '';
}

/** The statement's text, or '' when the object carries none. */
export function sqlText(query: any): string {
  const chunks: any[] = query?.queryChunks ?? [];
  if (chunks.length === 0) return String(query?.sql ?? '');
  return chunks.map(chunkText).join(' ');
}
