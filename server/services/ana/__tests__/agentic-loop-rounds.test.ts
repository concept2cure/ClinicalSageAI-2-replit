/**
 * Tests for resolveMaxRounds — the effort → tool-round ceiling used to scale
 * AnA's agentic depth. Pure.
 */

import { describe, it, expect } from 'vitest';
import { resolveMaxRounds } from '../agentic-loop.js';

describe('resolveMaxRounds', () => {
  it('scales the round ceiling by effort', () => {
    expect(resolveMaxRounds('fast')).toBe(4);
    expect(resolveMaxRounds('balanced')).toBe(6);
    expect(resolveMaxRounds('thorough')).toBe(10);
  });

  it('lifts the old flat cap of 5 for the default (balanced) turn', () => {
    expect(resolveMaxRounds('balanced')).toBeGreaterThan(5);
  });

  it('falls back to the balanced ceiling for unknown/absent effort', () => {
    expect(resolveMaxRounds(undefined)).toBe(6);
    expect(resolveMaxRounds(null)).toBe(6);
    expect(resolveMaxRounds('nonsense')).toBe(6);
  });

  it('never returns fewer rounds than needed to chain a real investigation', () => {
    // extract → search → cross-check → reconcile → draft is 5 steps; the old
    // flat cap of 5 could cut the draft. Every tier now clears that chain.
    for (const effort of ['fast', 'balanced', 'thorough'] as const) {
      expect(resolveMaxRounds(effort)).toBeGreaterThanOrEqual(4);
    }
    expect(resolveMaxRounds('balanced')).toBeGreaterThanOrEqual(6);
  });
});
