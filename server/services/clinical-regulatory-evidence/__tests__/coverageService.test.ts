/**
 * Coverage denominators (§8.1).
 *
 * Coverage is the sentence a user reads as "18 of 31 comparable studies carry a
 * machine-readable effect". Everything here defends that sentence being true.
 *
 * The monotonicity guard exists because of a real bug caught during phase 2:
 * `structured` was counting OBSERVATIONS while `eligible` counted SOURCES, so a
 * single CSR yielding three observations reported "3 structured of 1 eligible".
 * A reader would have taken that as three independent studies agreeing. The
 * guard surfaced it rather than letting it render, which is exactly its job.
 */
import { describe, expect, it } from 'vitest';

import { buildCoverage, emptyCoverage, isStale } from '../coverage-service';

describe('emptyCoverage', () => {
  it('reports real zeros and explains why', () => {
    const c = emptyCoverage('Nothing ingested yet.');
    expect([c.scanned, c.eligible, c.structured, c.verified, c.cited]).toEqual([0, 0, 0, 0, 0]);
    expect(c.exclusionNote).toBe('Nothing ingested yet.');
  });

  it('leaves freshness null rather than implying the corpus is current', () => {
    expect(emptyCoverage('x').freshness).toBeNull();
  });
});

describe('buildCoverage', () => {
  it('passes a monotonic narrowing through untouched', () => {
    const c = buildCoverage({ scanned: 412, eligible: 96, structured: 31, verified: 18, cited: 11 });
    expect(c.exclusionNote).toBeNull();
    expect(c.scanned).toBe(412);
    expect(c.cited).toBe(11);
  });

  it('flags a non-monotonic set as a counting defect instead of clamping it', () => {
    // The regression: observations counted against a source denominator.
    const c = buildCoverage({ scanned: 3, eligible: 1, structured: 3, verified: 1, cited: 1 });
    expect(c.exclusionNote).toMatch(/not monotonic.*counting defect/i);
    // The numbers are NOT quietly repaired — a cosmetic fix would hide the bug
    // while still rendering a false denominator.
    expect(c.structured).toBe(3);
    expect(c.eligible).toBe(1);
  });

  it('keeps the caller’s note alongside the defect warning', () => {
    const c = buildCoverage({
      scanned: 1,
      eligible: 5,
      structured: 0,
      verified: 0,
      cited: 0,
      exclusionNote: 'Caller note.',
    });
    expect(c.exclusionNote).toContain('Caller note.');
    expect(c.exclusionNote).toMatch(/not monotonic/i);
  });

  it('accepts equality at every step — narrowing need not lose anything', () => {
    const c = buildCoverage({ scanned: 4, eligible: 4, structured: 4, verified: 4, cited: 4 });
    expect(c.exclusionNote).toBeNull();
  });

  it('allows cited to be zero while the rest are not', () => {
    // A CSR-only corpus: real evidence, but no source spans to cite to.
    const c = buildCoverage({ scanned: 3, eligible: 1, structured: 1, verified: 1, cited: 0 });
    expect(c.exclusionNote).toBeNull();
    expect(c.cited).toBe(0);
  });
});

describe('isStale', () => {
  it('is true when the corpus snapshot has moved on', () => {
    const c = buildCoverage({ scanned: 1, eligible: 1, structured: 1, verified: 1, cited: 1, freshness: '2026-07-19' });
    expect(isStale(c, '2026-07-25')).toBe(true);
    expect(isStale(c, '2026-07-19')).toBe(false);
  });

  it('does not claim staleness it cannot establish', () => {
    // Unknown freshness is not evidence of currency; callers show it as unknown
    // rather than treating a false here as "up to date".
    const c = buildCoverage({ scanned: 1, eligible: 1, structured: 1, verified: 1, cited: 1 });
    expect(isStale(c, '2026-07-25')).toBe(false);
    expect(c.freshness).toBeNull();
  });
});
