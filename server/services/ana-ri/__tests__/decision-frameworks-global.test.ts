/**
 * Global decision frameworks — the trade-off layer must cover the cross-market
 * strategic choices (reference-first vs parallel, accelerated vs full data, MRCT
 * vs local bridging), be detectable by trade-off language, carry a basis, and
 * respect the tone floor.
 */

import { describe, it, expect } from 'vitest';
import {
  DECISION_FRAMEWORKS,
  detectRelevantFrameworks,
  buildDecisionFrameworkBlock,
} from '../decision-frameworks';

const NEW_IDS = [
  'g-reference-first-vs-parallel',
  'g-accelerated-take-or-wait',
  'g-mrct-vs-local-bridging',
];

describe('global decision frameworks', () => {
  it('registers each framework with both options, tilts, howToDecide and basis', () => {
    const byId = new Map(DECISION_FRAMEWORKS.map(f => [f.id, f]));
    for (const id of NEW_IDS) {
      const f = byId.get(id);
      expect(f, `${id} must exist`).toBeTruthy();
      expect(f!.optionA.trim().length).toBeGreaterThan(0);
      expect(f!.optionB.trim().length).toBeGreaterThan(0);
      expect(f!.tiltsTowardA.length).toBeGreaterThan(0);
      expect(f!.tiltsTowardB.length).toBeGreaterThan(0);
      expect(f!.howToDecide.trim().length).toBeGreaterThan(0);
      expect(f!.basis.trim().length).toBeGreaterThan(0);
    }
  });

  it('respects the tone floor (no exclamation marks or emoji)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const id of NEW_IDS) {
      const f = DECISION_FRAMEWORKS.find(x => x.id === id)!;
      const text = `${f.choice} ${f.theTradeoff} ${f.optionA} ${f.optionB} ${f.howToDecide} ${f.basis} ${f.tiltsTowardA.join(' ')} ${f.tiltsTowardB.join(' ')}`;
      expect(text).not.toContain('!');
      expect(emoji.test(text)).toBe(false);
    }
  });

  it('detects the relevant framework from trade-off language', () => {
    expect(detectRelevantFrameworks('should we file the US first or in parallel with the EU').map(f => f.id))
      .toContain('g-reference-first-vs-parallel');
    expect(detectRelevantFrameworks('do we take accelerated approval now or wait for the full data').map(f => f.id))
      .toContain('g-accelerated-take-or-wait');
    expect(detectRelevantFrameworks('include Japan in the MRCT or run a bridging study').map(f => f.id))
      .toContain('g-mrct-vs-local-bridging');
  });

  it('renders a non-empty block for a matched choice', () => {
    const block = buildDecisionFrameworkBlock({ message: 'reference market first or parallel filing', forceGeneric: true });
    expect(block.length).toBeGreaterThan(0);
    expect(block).toMatch(/reliance|reference/i);
  });
});
