/**
 * Global-strategy wisdom — the wisdom pack must surface cross-market strategic
 * heuristics (MRCT/reliance, nitrosamines, comparability, accelerated-approval
 * confirmatory obligations, orphan sequencing), each with a basis and respecting
 * the tone floor (no exclamation marks / emoji).
 */

import { describe, it, expect } from 'vitest';
import { INDUSTRY_WISDOM, selectWisdom } from '../industry-wisdom-pack';

const NEW_IDS = [
  'x-global-mrct-once',
  'x-reliance-leverage',
  'pharma-nitrosamine-early',
  'biotech-comparability-before-pivotal',
  'x-accelerated-confirmatory',
  'biotech-orphan-sequence',
];

describe('global-strategy wisdom', () => {
  it('registers every new heuristic with situation/consequence/veteranMove/basis', () => {
    const byId = new Map(INDUSTRY_WISDOM.map(h => [h.id, h]));
    for (const id of NEW_IDS) {
      const h = byId.get(id);
      expect(h, `${id} must exist`).toBeTruthy();
      expect(h!.situation.trim().length).toBeGreaterThan(0);
      expect(h!.consequence.trim().length).toBeGreaterThan(0);
      expect(h!.veteranMove.trim().length).toBeGreaterThan(0);
      expect(h!.basis.trim().length).toBeGreaterThan(0);
    }
  });

  it('respects the tone floor (no exclamation marks or emoji)', () => {
    const emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u;
    for (const id of NEW_IDS) {
      const h = INDUSTRY_WISDOM.find(x => x.id === id)!;
      const text = `${h.title} ${h.situation} ${h.consequence} ${h.veteranMove} ${h.basis}`;
      expect(text).not.toContain('!');
      expect(emoji.test(text)).toBe(false);
    }
  });

  it('cross-cutting heuristics are selectable for the pharma and biotech segments', () => {
    const pharma = selectWisdom({ segment: 'pharma', limit: 50 }).map(h => h.id);
    const biotech = selectWisdom({ segment: 'biotech', limit: 50 }).map(h => h.id);
    // null-segment (cross-cutting) heuristics remain eligible for any segment.
    expect(pharma).toContain('x-global-mrct-once');
    expect(biotech).toContain('x-accelerated-confirmatory');
    // segment-specific ones surface for their segment.
    expect(pharma).toContain('pharma-nitrosamine-early');
    expect(biotech).toContain('biotech-comparability-before-pivotal');
  });
});
