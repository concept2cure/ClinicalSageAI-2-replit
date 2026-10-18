/**
 * An atom nobody scored is ranked on the signals it has, and the ranking says
 * how many atoms were ranked that way.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * scoreAtom read `metadata.confidence ?? 0`: a memory atom with no recorded
 * confidence was ranked as if its confidence had been measured at zero. Every
 * atom the extractors now store (confidence null) sank below any atom carrying
 * a stamped figure — the old 0.8 column default, the wisdom engine's
 * 0.6 + 0.05·n — however much more relevant it was to the question asked.
 */
import { describe, expect, it } from 'vitest';
import {
  scoreAtom,
  orchestrateAtoms,
  DEFAULT_MEMORY_POLICY,
  SEMANTIC_WORKING_MEMORY_POLICY,
} from '../memory-orchestrator.js';
import type { RetrievedMemoryAtom } from '../memory-context-assembler.js';

function atom(partial: Partial<RetrievedMemoryAtom>): RetrievedMemoryAtom {
  return {
    id: partial.id ?? 1,
    layer: partial.layer ?? 'project_memory',
    title: partial.title ?? `atom ${partial.id ?? 1}`,
    content: partial.content ?? `body ${partial.id ?? 1}`,
    similarity: partial.similarity,
    metadata: partial.metadata,
  };
}

describe('memory ranking without a recorded confidence', () => {
  it('does not score a missing confidence as a confidence of zero', () => {
    const unscored = atom({ similarity: 0.8, metadata: { confidence: null } });
    const measuredZero = atom({ similarity: 0.8, metadata: { confidence: 0 } });
    expect(scoreAtom(unscored), 'an unscored atom ranked as a measured 0% confidence')
      .toBeGreaterThan(scoreAtom(measuredZero));
  });

  it('ranks an unscored atom on the same scale as a scored one', () => {
    // A fully relevant, verified atom reaches the layer's full weight (1.0)
    // whether or not anyone recorded a confidence for it.
    const unscored = atom({ similarity: 1, metadata: { isVerified: true } });
    const scoredFull = atom({ similarity: 1, metadata: { confidence: 1, isVerified: true } });
    expect(scoreAtom(scoredFull)).toBeCloseTo(1, 10);
    expect(scoreAtom(unscored), 'the unscored atom lost the confidence weight').toBeCloseTo(1, 10);
  });

  it('puts a more relevant unscored atom above a less relevant one carrying a stamped 0.8', () => {
    const stamped = atom({ id: 1, similarity: 0.7, metadata: { confidence: 0.8 } });
    const unscored = atom({ id: 2, similarity: 0.9 });
    const { ranked } = orchestrateAtoms([stamped, unscored], 180);
    expect(ranked.map(a => a.id), 'a stamped 0.8 outranked the more relevant unscored atom').toEqual([2, 1]);
  });

  it('orders unscored atoms by similarity, then verification', () => {
    const low = atom({ id: 1, similarity: 0.62 });
    const high = atom({ id: 2, similarity: 0.9 });
    const lowVerified = atom({ id: 3, similarity: 0.62, metadata: { isVerified: true } });
    expect(orchestrateAtoms([low, high, lowVerified], 180).ranked.map(a => a.id)).toEqual([2, 3, 1]);
  });

  it('says how many ranked atoms carry no recorded confidence', () => {
    const result = orchestrateAtoms([
      atom({ id: 1, layer: 'working_memory', title: 'wm' }),
      atom({ id: 2, similarity: 0.9 }),
      atom({ id: 3, layer: 'client_memory', similarity: 0.7, metadata: { confidence: null } }),
      atom({ id: 4, similarity: 0.8, metadata: { confidence: 0.6 } }),
    ], 180);
    // Working memory is not weighted by confidence under the default policy,
    // so it is not counted; the two semantic atoms without one are.
    expect(result.unscored, 'the ranking did not say which atoms it ranked unscored').toBe(2);
  });

  it('counts working memory as unscored only where its layer weighs confidence', () => {
    const wm = atom({ id: 1, layer: 'working_memory', title: 'wm', similarity: 0.7 });
    expect(orchestrateAtoms([wm], 180, DEFAULT_MEMORY_POLICY).unscored).toBe(0);
    expect(orchestrateAtoms([wm], 180, SEMANTIC_WORKING_MEMORY_POLICY).unscored).toBe(1);
  });

  it('control: a recorded confidence still counts with its weight', () => {
    // 0.8·0.75 + 0.5·0.2 + 0.05 = 0.75, unchanged.
    expect(scoreAtom(atom({ similarity: 0.8, metadata: { confidence: 0.5, isVerified: true } }))).toBeCloseTo(0.75, 10);
  });
});
