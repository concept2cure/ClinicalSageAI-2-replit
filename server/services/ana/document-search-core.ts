/**
 * Pure in-document search core for AnA's large-document "working set".
 *
 * When AnA needs to work with a document larger than the per-turn tool-result
 * cap, dumping the whole text into context is wasteful and lossy. Instead she
 * extracts the full text server-side and runs this query-targeted search, which
 * returns only the relevant windows (with char offsets) — so the model sees the
 * passages that matter, not the whole file.
 *
 * Pure and deterministic (no I/O), so the windowing/merging is unit-testable.
 */

export interface SearchWindow {
  excerpt: string;
  charStart: number;
  charEnd: number;
  matchCount: number;
}

export interface QueryResult {
  query: string;
  matchCount: number;
  windows: SearchWindow[];
}

export interface SearchOptions {
  /** Characters of context kept around each match. Default 320. */
  windowChars?: number;
  /** Max merged windows returned per query. Default 4. */
  maxWindowsPerQuery?: number;
}

/** All case-insensitive match offsets of `needle` in `haystackLower`. */
function allIndexes(haystackLower: string, needleLower: string): number[] {
  if (!needleLower) return [];
  const out: number[] = [];
  let from = 0;
  for (;;) {
    const i = haystackLower.indexOf(needleLower, from);
    if (i === -1) break;
    out.push(i);
    from = i + needleLower.length;
  }
  return out;
}

/**
 * Search the full text for each query and return merged, relevant windows.
 * Overlapping windows from nearby matches are merged so a dense region is one
 * coherent excerpt rather than many fragments.
 */
export function searchWithinText(
  text: string,
  queries: string[],
  opts: SearchOptions = {}
): QueryResult[] {
  const windowChars = Math.max(40, opts.windowChars ?? 320);
  const maxWindows = Math.max(1, opts.maxWindowsPerQuery ?? 4);
  const half = Math.floor(windowChars / 2);
  const lower = text.toLowerCase();

  const results: QueryResult[] = [];
  for (const rawQuery of queries) {
    const query = rawQuery.trim();
    if (!query) continue;
    const idxs = allIndexes(lower, query.toLowerCase());
    if (idxs.length === 0) {
      results.push({ query, matchCount: 0, windows: [] });
      continue;
    }

    // Build raw windows, then merge overlapping ones.
    const raw = idxs.map(i => ({
      start: Math.max(0, i - half),
      end: Math.min(text.length, i + query.length + half),
      matches: 1,
    }));
    raw.sort((a, b) => a.start - b.start);
    const merged: typeof raw = [];
    for (const w of raw) {
      const last = merged[merged.length - 1];
      if (last && w.start <= last.end) {
        last.end = Math.max(last.end, w.end);
        last.matches += w.matches;
      } else {
        merged.push({ ...w });
      }
    }

    const windows: SearchWindow[] = merged
      .sort((a, b) => b.matches - a.matches)
      .slice(0, maxWindows)
      .map(w => ({
        excerpt: text.slice(w.start, w.end).replace(/\s+/g, ' ').trim(),
        charStart: w.start,
        charEnd: w.end,
        matchCount: w.matches,
      }));

    results.push({ query, matchCount: idxs.length, windows });
  }
  return results;
}

/**
 * Extract a lightweight heading outline (numbered sections, ALL-CAPS lines,
 * markdown headings) so AnA can see a large document's structure without
 * reading it whole. Pure heuristic.
 */
export function extractHeadingOutline(text: string, maxHeadings = 40): string[] {
  const out: string[] = [];
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line.length < 3 || line.length > 120) continue;
    const isMarkdown = /^#{1,4}\s+\S/.test(line);
    const isNumbered = /^\d+(\.\d+)*\.?\s+[A-Za-z]/.test(line);
    const isAllCaps = /^[A-Z0-9][A-Z0-9 ,/&()\-]{4,}$/.test(line) && /[A-Z]/.test(line);
    if (isMarkdown || isNumbered || isAllCaps) {
      out.push(line.replace(/^#{1,4}\s+/, ''));
      if (out.length >= maxHeadings) break;
    }
  }
  return out;
}
