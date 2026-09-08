/**
 * RFC 4180 CSV field escaping — the one implementation.
 *
 * ── The defect this exists to close ──────────────────────────────────────────
 * Three CSV writers in this repo each handled quoting differently, and two of
 * them handled it wrongly:
 *
 *   · `intelligent-report-engine.ts` applied `.replace(/,/g, ';')` to the value
 *     column and nothing at all to `fieldLabel` or `sectionPath`. That is not
 *     escaping — it MUTATES the recorded value, so a Part 11 provenance export
 *     whose entire purpose is to prove the report matches the source of record
 *     no longer matched it. Newlines and quotes passed through untouched, and a
 *     multi-line description split one entry across two rows.
 *   · `analytics-routes.ts` interpolated indication and phase names raw. That
 *     one is guaranteed to fire rather than theoretical: `ctgov-normalizer.ts`
 *     builds indications with `conditions.join(', ')`, so every multi-condition
 *     ingested study emits three fields under a two-column header and pushes the
 *     study count into a phantom column. Silent, HTTP 200, plausible-looking
 *     file.
 *   · `ana/citation-export.ts` had it right, and had it privately.
 *
 * A correct escaper that only one of three call sites can reach is not a shared
 * utility. This is that function, moved to where the other two can import it.
 */

/** One CSV field, quoted per RFC 4180 when — and only when — it needs to be. */
export function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = typeof value === 'string' ? value : String(value);
  // RFC 4180: wrap in quotes when the value contains comma / quote / newline.
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/** One CSV record. Fields are escaped; the caller supplies the line ending. */
export function csvRow(fields: readonly unknown[]): string {
  return fields.map(csvEscape).join(',');
}
