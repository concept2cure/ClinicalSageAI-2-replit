/**
 * Tests for counterfactual-replay pure helpers.
 *
 * DB-backed replayPattern / replayRecentlyPromoted are exercised through
 * end-to-end tests separately; here we cover the severity-from-confidence
 * mapping that determines warning rank.
 */

import { describe, it, expect } from 'vitest';
import { severityFromConfidence } from '../counterfactual-replay';

describe('severityFromConfidence', () => {
  it('maps to high above 0.8', () => {
    expect(severityFromConfidence(0.95)).toBe('high');
    expect(severityFromConfidence(0.81)).toBe('high');
    expect(severityFromConfidence(0.8)).toBe('high');
  });

  it('maps to medium in [0.55, 0.8)', () => {
    expect(severityFromConfidence(0.79)).toBe('medium');
    expect(severityFromConfidence(0.6)).toBe('medium');
    expect(severityFromConfidence(0.55)).toBe('medium');
  });

  it('maps to low below 0.55', () => {
    expect(severityFromConfidence(0.54)).toBe('low');
    expect(severityFromConfidence(0.3)).toBe('low');
    expect(severityFromConfidence(0)).toBe('low');
  });
});
