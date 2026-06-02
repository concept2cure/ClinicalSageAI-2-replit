import { describe, it, expect } from 'vitest';
import {
  scoreAtom,
  shouldRemember,
  dedupeAtoms,
  orchestrateAtoms,
  DEFAULT_MEMORY_POLICY,
  type MemoryPolicy,
} from '../memory-orchestrator.js';
import type { MemoryLayer, RetrievedMemoryAtom } from '../memory-context-assembler.js';

function atom(partial: Partial<RetrievedMemoryAtom>): RetrievedMemoryAtom {
  return {
    id: partial.id ?? 1,
    layer: partial.layer ?? 'client_memory',
    title: partial.title ?? 'untitled',
    content: partial.content ?? 'body',
    similarity: partial.similarity,
    category: partial.category,
    metadata: partial.metadata,
  };
}

const DAY_MS = 1000 * 60 * 60 * 24;

describe('memory-orchestrator', () => {
  describe('scoreAtom (behaviour-preserving with the previous inlined atomSortScore)', () => {
    it('pins working memory above any semantic atom', () => {
      const wm = atom({ layer: 'working_memory', similarity: 0 });
      const best = atom({
        layer: 'project_memory',
        similarity: 1,
        metadata: { confidence: 1, isVerified: true },
      });
      // Old code returned a flat 2 for working memory; max semantic score is
      // 0.75 + 0.2 + 0.05 = 1.0, so working memory always ranks first.
      expect(scoreAtom(wm)).toBe(2);
      expect(scoreAtom(best)).toBeCloseTo(1.0, 10);
      expect(scoreAtom(wm)).toBeGreaterThan(scoreAtom(best));
    });

    it('combines similarity, confidence, and verified boost with the original weights', () => {
      const a = atom({
        layer: 'client_memory',
        similarity: 0.8,
        metadata: { confidence: 0.5, isVerified: true },
      });
      // 0.8*0.75 + 0.5*0.2 + 0.05 = 0.6 + 0.1 + 0.05 = 0.75
      expect(scoreAtom(a)).toBeCloseTo(0.75, 10);
    });

    it('treats missing similarity/confidence as zero', () => {
      expect(scoreAtom(atom({ layer: 'project_memory' }))).toBe(0);
    });
  });

  describe('per-layer ranking weights (unified formula)', () => {
    it('ignores similarity/confidence for working memory under the default weights', () => {
      // working_memory weights are priorityBoost 2 with zero similarity/confidence
      // weight, so a "rich" working-memory atom still scores exactly the flat 2.
      const rich = atom({
        layer: 'working_memory',
        similarity: 0.95,
        metadata: { confidence: 1, isVerified: true },
      });
      expect(scoreAtom(rich)).toBe(2);
    });

    it('falls back to semantic weights for an unrecognised layer', () => {
      const weird = atom({
        layer: 'mystery' as MemoryLayer,
        similarity: 0.8,
        metadata: { confidence: 0.5, isVerified: true },
      });
      // 0 + 0.8*0.75 + 0.5*0.2 + 0.05 = 0.75
      expect(scoreAtom(weird)).toBeCloseTo(0.75, 10);
    });

    it('lets a custom policy unpin working memory so it ranks by similarity', () => {
      // The shape a future semantic-working-memory step takes: working memory
      // gains a similarity weight and sheds most of its priorityBoost.
      const semanticWorkingMemory: MemoryPolicy = {
        ...DEFAULT_MEMORY_POLICY,
        ranking: {
          byLayer: {
            ...DEFAULT_MEMORY_POLICY.ranking.byLayer,
            working_memory: {
              priorityBoost: 0.2,
              similarityWeight: 0.75,
              confidenceWeight: 0.2,
              verifiedBoost: 0.05,
            },
          },
        },
      };
      const wmWeak = atom({ layer: 'working_memory', similarity: 0.1 });
      const projStrong = atom({ layer: 'project_memory', similarity: 0.95 });

      // Default policy: working memory is pinned on top regardless of similarity.
      expect(scoreAtom(wmWeak)).toBeGreaterThan(scoreAtom(projStrong));
      // Custom policy: a strongly-matching project atom now outranks a weak
      // working-memory atom — proving primacy lives in the weights, not a branch.
      expect(scoreAtom(projStrong, semanticWorkingMemory)).toBeGreaterThan(
        scoreAtom(wmWeak, semanticWorkingMemory)
      );
    });
  });

  describe('shouldRemember (structured forgetting)', () => {
    const oldIso = new Date(Date.now() - 400 * DAY_MS).toISOString();

    it('always keeps working memory', () => {
      expect(shouldRemember(atom({ layer: 'working_memory' }), 180)).toBe(true);
    });

    it('keeps recent semantic atoms and drops stale ones', () => {
      const recent = atom({ metadata: { createdAt: new Date().toISOString() } });
      const stale = atom({ metadata: { createdAt: oldIso } });
      expect(shouldRemember(recent, 180)).toBe(true);
      expect(shouldRemember(stale, 180)).toBe(false);
    });

    it('retains stale atoms when verified or high-importance', () => {
      expect(shouldRemember(atom({ metadata: { createdAt: oldIso, isVerified: true } }), 180)).toBe(
        true
      );
      expect(
        shouldRemember(atom({ metadata: { createdAt: oldIso, importance: 'Critical' } }), 180)
      ).toBe(true);
      expect(
        shouldRemember(atom({ metadata: { createdAt: oldIso, importance: 'low' } }), 180)
      ).toBe(false);
    });

    it('keeps atoms with no/invalid createdAt (cannot prove staleness)', () => {
      expect(shouldRemember(atom({ metadata: {} }), 180)).toBe(true);
      expect(shouldRemember(atom({ metadata: { createdAt: 'not-a-date' } }), 180)).toBe(true);
    });
  });

  describe('dedupeAtoms', () => {
    it('collapses same layer/title/content-prefix to the higher-scoring atom', () => {
      const lower = atom({ id: 1, title: 'Endpoint', content: 'PFS primary', similarity: 0.6 });
      const higher = atom({ id: 2, title: 'Endpoint', content: 'PFS primary', similarity: 0.9 });
      const { deduped, dropped } = dedupeAtoms([lower, higher]);
      expect(dropped).toBe(1);
      expect(deduped).toHaveLength(1);
      expect(deduped[0].id).toBe(2);
    });

    it('keeps atoms that differ by layer', () => {
      const c = atom({ layer: 'client_memory', title: 't', content: 'same' });
      const p = atom({ layer: 'project_memory', title: 't', content: 'same' });
      expect(dedupeAtoms([c, p]).deduped).toHaveLength(2);
    });
  });

  describe('orchestrateAtoms (full pass)', () => {
    it('forgets, dedupes, and ranks with working memory on top', () => {
      const wm = atom({ id: 1, layer: 'working_memory', title: 'wm', content: 'summary' });
      const strong = atom({ id: 10, layer: 'project_memory', title: 'a', similarity: 0.9 });
      const weak = atom({ id: 11, layer: 'client_memory', title: 'b', similarity: 0.3 });
      const dupOfStrong = atom({ id: 12, layer: 'project_memory', title: 'a', similarity: 0.5 });
      const stale = atom({
        id: 13,
        layer: 'client_memory',
        title: 'old',
        similarity: 0.95,
        metadata: { createdAt: new Date(Date.now() - 400 * DAY_MS).toISOString() },
      });

      const { ranked, droppedByForgetting, droppedByDeduplication } = orchestrateAtoms(
        [weak, strong, wm, dupOfStrong, stale],
        180
      );

      expect(droppedByForgetting).toBe(1); // stale dropped
      expect(droppedByDeduplication).toBe(1); // dupOfStrong collapses into strong
      // working memory first (pinned), then strong (0.9) then weak (0.3)
      expect(ranked.map(a => a.id)).toEqual([1, 10, 11]);
      expect(ranked[0].layer).toBe('working_memory');
    });
  });

  it('exposes the reviewed default constants that preserve prior behaviour', () => {
    // Working memory: flat pin of 2 (priorityBoost 2, no similarity/confidence).
    expect(DEFAULT_MEMORY_POLICY.ranking.byLayer.working_memory).toEqual({
      priorityBoost: 2,
      similarityWeight: 0,
      confidenceWeight: 0,
      verifiedBoost: 0,
    });
    // Semantic layers: similarity·0.75 + confidence·0.2 + verified·0.05.
    const semantic = {
      priorityBoost: 0,
      similarityWeight: 0.75,
      confidenceWeight: 0.2,
      verifiedBoost: 0.05,
    };
    expect(DEFAULT_MEMORY_POLICY.ranking.byLayer.client_memory).toEqual(semantic);
    expect(DEFAULT_MEMORY_POLICY.ranking.byLayer.project_memory).toEqual(semantic);
    expect(DEFAULT_MEMORY_POLICY.forgetting.retainImportanceLevels).toEqual(['critical', 'high']);
    expect(DEFAULT_MEMORY_POLICY.dedupeContentKeyLength).toBe(120);
  });
});
