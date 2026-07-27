/**
 * @fileoverview Corpus coverage — denominators, missingness, freshness.
 * @module server/services/clinical-regulatory-evidence/coverage-service
 *
 * Work order §8.1: retrieval returns corpus coverage — scanned, eligible,
 * structured, verified and cited counts — so every displayed number arrives with
 * the denominator it was drawn from.
 *
 * Coverage is REPORTED, never inferred. Nothing in this module estimates a count
 * it did not observe; when the corpus is unavailable the honest answer is zero
 * with a note saying why, not a plausible-looking number.
 */

import type { CoverageRecord } from './types';

/**
 * The empty-corpus coverage record. Every count is a real zero and the note says
 * why — this is what the surfaces render until phase 4 (FDA CRL ingestion)
 * lands, and it is a truthful answer rather than a placeholder.
 */
export function emptyCoverage(reason: string): CoverageRecord {
  return {
    scanned: 0,
    eligible: 0,
    structured: 0,
    verified: 0,
    cited: 0,
    exclusionNote: reason,
    freshness: null,
  };
}

/**
 * Assemble a coverage record from observed counts.
 *
 * The narrowing must be monotonic — scanned ≥ eligible ≥ structured ≥ verified ≥
 * cited — because each stage is a subset of the one before it. A caller that
 * produces a non-monotonic set has a counting bug, and silently rendering it
 * would present an impossible corpus as fact. We surface it in the exclusion
 * note rather than clamping the numbers, so the bug stays visible instead of
 * being cosmetically repaired.
 */
export function buildCoverage(counts: {
  scanned: number;
  eligible: number;
  structured: number;
  verified: number;
  cited: number;
  exclusionNote?: string | null;
  freshness?: string | null;
}): CoverageRecord {
  const { scanned, eligible, structured, verified, cited } = counts;
  const monotonic =
    scanned >= eligible && eligible >= structured && structured >= verified && verified >= cited;

  const note = counts.exclusionNote ?? null;
  return {
    scanned,
    eligible,
    structured,
    verified,
    cited,
    exclusionNote: monotonic
      ? note
      : [note, 'Coverage counts are not monotonic — this is a counting defect, not a corpus property.']
          .filter(Boolean)
          .join(' '),
    freshness: counts.freshness ?? null,
  };
}

/**
 * Is this coverage stale relative to the current corpus snapshot? Drives the
 * `stale_recalculate` display state (§13.2). Unknown freshness is NOT treated as
 * fresh — an unanswerable question returns false only because we cannot assert
 * staleness, and callers should show freshness as unknown rather than current.
 */
export function isStale(coverage: CoverageRecord, currentSnapshot: string | null): boolean {
  if (!coverage.freshness || !currentSnapshot) return false;
  return coverage.freshness !== currentSnapshot;
}
