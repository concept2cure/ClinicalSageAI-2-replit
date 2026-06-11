import { describe, it, expect } from 'vitest';
import { reciprocalRankFusion, normalizeToUnit, RRF_K } from '../rag-fusion';
import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline';

describe('reciprocalRankFusion', () => {
  it('scores a single list as 1/(k + rank), rank 1-based', () => {
    const s = reciprocalRankFusion([['a', 'b', 'c']]);
    expect(s.get('a')).toBeCloseTo(1 / (RRF_K + 1), 12);
    expect(s.get('b')).toBeCloseTo(1 / (RRF_K + 2), 12);
    expect(s.get('c')).toBeCloseTo(1 / (RRF_K + 3), 12);
  });

  it('sums contributions for ids that appear in multiple lists', () => {
    // 'b' is rank 2 in the dense list and rank 1 in the sparse list.
    const dense = ['a', 'b'];
    const sparse = ['b', 'c'];
    const s = reciprocalRankFusion([dense, sparse]);
    expect(s.get('b')).toBeCloseTo(1 / (RRF_K + 2) + 1 / (RRF_K + 1), 12);
    expect(s.get('a')).toBeCloseTo(1 / (RRF_K + 1), 12);
    expect(s.get('c')).toBeCloseTo(1 / (RRF_K + 2), 12);
  });

  it('ranks an item agreed on by both retrievers above either list-leader', () => {
    // 'x' is #1 dense and #1 sparse; 'a' is #1 dense only, 'p' is #1 sparse only.
    const s = reciprocalRankFusion([
      ['a', 'x'],
      ['p', 'x'],
    ]);
    const ranked = [...s.entries()].sort((l, r) => r[1] - l[1]).map(e => e[0]);
    expect(ranked[0]).toBe('x');
  });

  it('honours a custom k and ignores empty ids', () => {
    const s = reciprocalRankFusion([['a', '', 'b']], 10);
    expect(s.get('a')).toBeCloseTo(1 / 11, 12);
    expect(s.get('b')).toBeCloseTo(1 / 13, 12); // empty slot still consumes a rank position
    expect(s.has('')).toBe(false);
  });

  it('returns an empty map for no lists', () => {
    expect(reciprocalRankFusion([]).size).toBe(0);
  });
});

describe('normalizeToUnit', () => {
  it('min-max scales into [0,1]', () => {
    const out = normalizeToUnit(new Map([['a', 4], ['b', 2], ['c', 0]]));
    expect(out.get('a')).toBe(1);
    expect(out.get('b')).toBe(0.5);
    expect(out.get('c')).toBe(0);
  });

  it('maps a uniform set to 1 (no relative signal to discount)', () => {
    const out = normalizeToUnit(new Map([['a', 0.3], ['b', 0.3]]));
    expect(out.get('a')).toBe(1);
    expect(out.get('b')).toBe(1);
  });

  it('handles an empty map', () => {
    expect(normalizeToUnit(new Map()).size).toBe(0);
  });
});

// Pipeline-side fusion: fuseHybrid combines the dense + sparse candidate lists,
// writes the normalized RRF score onto initialScore/finalScore, dedupes with
// dense payloads winning, and trims to the limit.
type WithFuse = {
  fuseHybrid(
    dense: RetrievedDocument[],
    sparse: RetrievedDocument[],
    limit: number
  ): RetrievedDocument[];
};

function pipeline(): WithFuse {
  return Object.create(AdvancedRAGPipeline.prototype) as WithFuse;
}

function doc(id: string, extra: Partial<RetrievedDocument> = {}): RetrievedDocument {
  return {
    id,
    content: `content-${id}`,
    title: `title-${id}`,
    atomType: 'vault_chunk',
    initialScore: 0.99,
    finalScore: 0.99,
    ...extra,
  };
}

describe('AdvancedRAGPipeline.fuseHybrid', () => {
  it('puts the doc both arms agree on first and normalizes scores to [0,1]', () => {
    const dense = [doc('a'), doc('shared')];
    const sparse = [doc('shared'), doc('p')];
    const out = pipeline().fuseHybrid(dense, sparse, 10);

    expect(out[0].id).toBe('shared'); // appears in both -> highest RRF
    expect(out[0].finalScore).toBe(1); // top of min-max range
    expect(out[0].initialScore).toBe(out[0].finalScore); // both rewritten to the fused score
    // every score lands in [0,1]
    for (const d of out) {
      expect(d.finalScore).toBeGreaterThanOrEqual(0);
      expect(d.finalScore).toBeLessThanOrEqual(1);
    }
  });

  it('dedupes by id, preferring the dense payload, and trims to the limit', () => {
    const dense = [doc('x', { content: 'DENSE', embedding: [1, 0] })];
    const sparse = [doc('x', { content: 'SPARSE' }), doc('y'), doc('z')];
    const out = pipeline().fuseHybrid(dense, sparse, 2);

    expect(out).toHaveLength(2); // trimmed
    const x = out.find(d => d.id === 'x');
    expect(x?.content).toBe('DENSE'); // dense payload won the dedupe
    expect(x?.embedding).toEqual([1, 0]); // dense embedding preserved
  });
});
