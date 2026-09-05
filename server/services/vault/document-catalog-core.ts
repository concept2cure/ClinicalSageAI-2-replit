/**
 * Document catalog — the pure core: span arithmetic, read coverage, the
 * catalog-write gate, and extraction-outcome honesty. No DB, no I/O.
 *
 * Split from document-catalog.service.ts the way ana-session-bootstrap-format
 * is split from its loader: the logic that defines the discipline is directly
 * unit-testable here, and only the service wires it to the database. The
 * service re-exports everything below, so callers keep one import path.
 */

// ─────────────────────────────────────────────────────────────────────────────
// Spans + coverage
// ─────────────────────────────────────────────────────────────────────────────

/** Half-open character span [start, end) over a document's extracted text. */
export interface Span {
  start: number;
  end: number;
}

export interface CoverageReport {
  /** Total characters of extracted text the spans are measured against. */
  charCount: number;
  /** Characters covered by the union of the recorded spans (clamped). */
  coveredChars: number;
  /** Maximal uncovered ranges, in order. Empty iff complete. */
  uncovered: Span[];
  /** True only when every character of the text has been served. */
  complete: boolean;
}

/** Merge spans into a minimal sorted set of disjoint spans, clamped to [0, charCount]. */
export function mergeSpans(spans: Span[], charCount: number): Span[] {
  const clamped = spans
    .map(s => ({ start: Math.max(0, Math.floor(s.start)), end: Math.min(charCount, Math.floor(s.end)) }))
    .filter(s => s.end > s.start)
    .sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const s of clamped) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) {
      last.end = Math.max(last.end, s.end);
    } else {
      merged.push({ ...s });
    }
  }
  return merged;
}

/** Exact integer coverage of `spans` over a text of `charCount` characters. */
export function computeCoverage(spans: Span[], charCount: number): CoverageReport {
  if (charCount <= 0) {
    // A document with no extracted text has nothing to cover; "complete" here
    // would launder an extraction failure into a full read, so it is false.
    return { charCount: Math.max(0, charCount), coveredChars: 0, uncovered: [], complete: false };
  }
  const merged = mergeSpans(spans, charCount);
  let covered = 0;
  const uncovered: Span[] = [];
  let cursor = 0;
  for (const s of merged) {
    if (s.start > cursor) uncovered.push({ start: cursor, end: s.start });
    covered += s.end - s.start;
    cursor = s.end;
  }
  if (cursor < charCount) uncovered.push({ start: cursor, end: charCount });
  return { charCount, coveredChars: covered, uncovered, complete: covered === charCount };
}

// ─────────────────────────────────────────────────────────────────────────────
// Extraction outcomes
// ─────────────────────────────────────────────────────────────────────────────

export type CatalogStatus = 'extracted' | 'extraction_failed' | 'cataloged';

export interface ExtractionOutcome {
  status: 'extracted' | 'extraction_failed';
  method: string;
  confidence: number | null;
  error: string | null;
  charCount: number;
  wordCount: number | null;
}

/**
 * Classify an extraction result honestly. Empty text is a FAILURE with a
 * stated reason — never "extracted, zero characters", which downstream would
 * render as a document with nothing in it.
 */
export function buildExtractionOutcome(input: {
  text: string | null;
  method: string;
  confidence?: number;
  error?: string | null;
}): ExtractionOutcome {
  const text = (input.text ?? '').trim();
  if (input.error) {
    return {
      status: 'extraction_failed',
      method: input.method,
      confidence: input.confidence ?? null,
      error: input.error,
      charCount: 0,
      wordCount: null,
    };
  }
  if (text.length === 0) {
    return {
      status: 'extraction_failed',
      method: input.method,
      confidence: input.confidence ?? null,
      error:
        input.method === 'none'
          ? 'No extraction method produced text for this file type.'
          : `Extraction ran (${input.method}) but produced no text.`,
      charCount: 0,
      wordCount: null,
    };
  }
  return {
    status: 'extracted',
    method: input.method,
    confidence: input.confidence ?? null,
    error: null,
    charCount: text.length,
    wordCount: text.split(/\s+/).length,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The catalog-write gate
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogGateVerdict {
  allowed: boolean;
  reason: string | null;
  coverage: CoverageReport;
}

/**
 * The gate. A catalog write is allowed only when the read receipts cover the
 * entire extracted text — exact integer equality, not a percentage heuristic.
 * On refusal the verdict carries the uncovered ranges so the caller can go
 * read exactly what is missing.
 */
export function assertCatalogWriteAllowed(coverage: CoverageReport): CatalogGateVerdict {
  if (coverage.charCount <= 0) {
    return {
      allowed: false,
      reason:
        'This document has no extracted text to read (extraction failed or produced nothing), ' +
        'so a comprehension record cannot honestly be written for it.',
      coverage,
    };
  }
  if (!coverage.complete) {
    const missing = coverage.charCount - coverage.coveredChars;
    const ranges = coverage.uncovered
      .slice(0, 5)
      .map(u => `${u.start}–${u.end}`)
      .join(', ');
    return {
      allowed: false,
      reason:
        `Refusing to catalog: only ${coverage.coveredChars} of ${coverage.charCount} characters have been read ` +
        `(${missing} unread; uncovered ranges: ${ranges}${coverage.uncovered.length > 5 ? ', …' : ''}). ` +
        'Read the remaining ranges with read_project_document (use offset), then catalog.',
      coverage,
    };
  }
  return { allowed: true, reason: null, coverage };
}
