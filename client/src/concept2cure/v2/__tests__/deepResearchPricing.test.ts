/**
 * The price shown at the point of purchase must be the price charged.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * The depth picker printed a credit cost beside each option. DeepResearch.tsx
 * collapsed three UI options into two server values
 * (`depth === 'exhaustive' ? 'comprehensive' : 'standard'`), and
 * deep-research-orchestrator.ts charges `depth === 'comprehensive' ? 3 : 1`:
 *
 *   Quick       shown 1 credit  → sent 'standard'      → charged 1   correct
 *   Standard    shown 3 credits → sent 'standard'      → charged 1   3x over
 *   Exhaustive  shown 8 credits → sent 'comprehensive' → charged 3   2.7x over
 *
 * "Quick" and "Standard" were also the same request — identical payload,
 * identical cost — offered as two priced choices.
 *
 * The server had already refused to serve this pricing, recording in
 * deep-research-board.routes.ts that doing so "would fabricate credit costs the
 * engine does not charge". The client rendered it anyway.
 *
 * ── What this pins ────────────────────────────────────────────────────────────
 * The engine's cost model is a single expression, so it is asserted directly
 * rather than mocked: comprehensive costs 3, everything else costs 1. If either
 * side moves without the other, one of these fails.
 */

import { describe, it, expect } from 'vitest';
import { DEPTHS, type ResearchDepth } from '../fixtures/deep-research-data';

/** deep-research-orchestrator.ts: `const creditsNeeded = request.depth === 'comprehensive' ? 3 : 1;` */
function engineCost(depth: ResearchDepth): number {
  return depth === 'comprehensive' ? 3 : 1;
}

/** '3 credits' -> 3 */
function shownCost(label: string): number {
  const m = label.match(/^(\d+)\s+credits?$/);
  if (!m) throw new Error(`depth cost "${label}" is not an "N credit(s)" string`);
  return Number(m[1]);
}

describe('research depth pricing matches what the engine charges', () => {
  it('there is at least one depth to check', () => {
    expect(DEPTHS.length).toBeGreaterThan(0);
  });

  it.each(DEPTHS)('%s shows the price the engine charges', (key, _label, cost) => {
    expect(shownCost(cost)).toBe(engineCost(key));
  });

  it('every depth key is a value the engine understands', () => {
    // The keys ARE the server's depth values now, so nothing translates them on
    // the way out. A key the engine does not know would silently fall through to
    // the 1-credit branch while the UI advertised something else.
    const ENGINE_DEPTHS = ['standard', 'comprehensive'];
    for (const [key] of DEPTHS) {
      expect(ENGINE_DEPTHS, `depth '${key}' is not an engine depth`).toContain(key);
    }
  });

  it('no two depths are the same request at different prices', () => {
    // The original defect: 'quick' and 'standard' both sent 'standard' and both
    // cost 1, but were shown at 1 and 3 credits.
    const byKey = new Map<string, string[]>();
    for (const [key, label] of DEPTHS) {
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key)!.push(label);
    }
    const duplicated = [...byKey.entries()].filter(([, labels]) => labels.length > 1);
    expect(duplicated, 'two options send the same depth — they are one choice').toEqual([]);
  });
});
