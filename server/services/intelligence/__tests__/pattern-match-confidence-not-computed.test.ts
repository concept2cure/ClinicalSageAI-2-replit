/**
 * A pattern match carries no confidence it did not compute (2026-10-15).
 *
 * What the code used to do: scanText set matchConfidence to the pattern's
 * hand-set seed value (80-95, uncited, uncalibrated) — 95 for a substring hit
 * on "we chose" (DEF-001, "Missing primary endpoint justification") — labelled
 * 'pattern_seed_value' but still a number, which the pre-mortem tools ranked
 * findings by and printed. A substring hit measures nothing: a match is the
 * phrase that matched plus the pattern's severity and regulatory basis.
 */
import { describe, expect, it } from 'vitest';
import { patternRegistry } from '../pattern-registry';

describe('a pattern match', () => {
  it('is the phrase that matched, with the pattern severity and basis, and no confidence', () => {
    const [match] = patternRegistry.scanText(
      'For the pivotal study we chose overall survival as the endpoint.',
      '2.5',
    );
    expect(match.patternId).toBe('DEF-001');
    expect(match.matchedPhrase).toBe('we chose');
    expect(match.pattern.severity).toBe('critical');
    expect(match.pattern.regulatoryBasis).toBeTruthy();
    expect(match.matchConfidence).toBeNull();
    expect(match.matchConfidenceBasis).toBe('not_computed');
  });

  it('carries no seed value on any match, whatever the pattern', () => {
    const matches = patternRegistry.scanText(
      'Efficacy in the overall population was superior to placebo; we chose the endpoint, ' +
        'and the drug appears to be safe. Preliminary stability data supports a shelf life of 24 months.',
      'document',
    );
    expect(matches.length).toBeGreaterThanOrEqual(4);
    expect(matches.map(m => [m.patternId, m.matchConfidence])).toEqual(
      matches.map(m => [m.patternId, null]),
    );
  });
});
