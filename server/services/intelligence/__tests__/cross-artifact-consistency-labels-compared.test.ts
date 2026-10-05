import { describe, expect, it } from 'vitest';

import { checkInternalNumericalIntegrity } from '../cross-artifact-consistency';

/**
 * The integrity check says how many labelled figures it actually compared
 * (row 74, S5; ADR-0015 §7). It reads 'clean' both when two statements of a
 * figure agree and when every figure is stated once — the second compared
 * nothing. A sub-agent's verify verdict reads this count so that a text with
 * nothing to compare is never reported as checked and clean.
 */
describe('checkInternalNumericalIntegrity labelsCompared', () => {
  it('is 0 when every labelled figure is stated once (clean, but nothing compared)', () => {
    const report = checkInternalNumericalIntegrity(
      'The study enrolled patients ages 18 to 65 years and the 95% CI 0.12 to 0.30 was reported for the primary endpoint.',
    );
    expect(report.factsExtracted).toBeGreaterThan(0);
    expect(report.verdict).toBe('clean');
    expect(report.labelsCompared).toBe(0);
  });

  it('counts a label stated twice with the same value', () => {
    const report = checkInternalNumericalIntegrity(
      'The protocol enrolled patients ages 18 to 65 years. The synopsis says ages 18 to 65 years were eligible.',
    );
    expect(report.verdict).toBe('clean');
    expect(report.labelsCompared).toBe(1);
  });

  it('counts a label stated twice with different values', () => {
    const report = checkInternalNumericalIntegrity(
      'The protocol enrolled patients ages 18 to 65 years. The synopsis says ages 18 to 75 years were eligible.',
    );
    expect(report.verdict).toBe('review_candidates');
    expect(report.labelsCompared).toBe(1);
  });

  it('is 0 for text with no labelled figure', () => {
    const report = checkInternalNumericalIntegrity('No figures here, only words about the protocol design and its rationale.');
    expect(report.factsExtracted).toBe(0);
    expect(report.labelsCompared).toBe(0);
  });
});
