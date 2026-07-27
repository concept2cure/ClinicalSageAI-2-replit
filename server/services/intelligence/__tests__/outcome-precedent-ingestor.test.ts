/**
 * Precedent-ingest confidence — the honest, evidence-derived replacement for the
 * former hardcoded 0.9 (Phase 8 confidence-hygiene). Pure.
 */

import { describe, it, expect } from 'vitest';
import { deriveIngestConfidence } from '../outcome-precedent-ingestor';

describe('deriveIngestConfidence', () => {
  it('scales 0.5..0.9 with the number of completeness signals present', () => {
    expect(deriveIngestConfidence([false, false, false, false, false])).toBe(0.5); // bare record
    expect(deriveIngestConfidence([true, true, true, true, true])).toBe(0.9);      // fully documented
  });

  it('a well-documented outcome ranks above a sparse one', () => {
    const rich = deriveIngestConfidence([true, true, true, true, true]);
    const sparse = deriveIngestConfidence([true, false, false, false, false]);
    expect(rich).toBeGreaterThan(sparse);
    expect(sparse).toBe(0.58);
  });

  it('never exceeds 0.9 — >0.9 stays reserved for human-curated precedents', () => {
    for (let n = 0; n <= 5; n++) {
      const signals = Array.from({ length: 5 }, (_, i) => i < n);
      expect(deriveIngestConfidence(signals)).toBeLessThanOrEqual(0.9);
    }
  });
});
