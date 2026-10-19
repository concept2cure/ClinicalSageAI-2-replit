/**
 * Implementer-added regression from the independent correctness review
 * (D2-PASSAGE-CONTEXT): a chunk nested inside the previous one must not let
 * the context end before the hit does. The real chunker never nests chunks;
 * the builder must refuse such input rather than return a context shorter
 * than its own hit.
 */
import { describe, expect, it } from 'vitest';
import { buildPassageContext } from '../passage-context-span';

const T = 'a'.repeat(5000) + 'b'.repeat(1000);
const chunk = (id: string, chunkIndex: number, start: number, end: number) =>
  ({ id, chunkIndex, charStart: start, charEnd: end, text: T.slice(start, end) });

describe('nested chunks', () => {
  it('refuses a following chunk that ends before the hit chunk does', () => {
    const out = buildPassageContext({ documentId: 'd', contentHash: 'h'.repeat(64), extractedText: T,
      hit: { chunkId: 'c0', chunkIndex: 0 }, chunks: [chunk('c0', 0, 0, 5000), chunk('c1', 1, 100, 200)] });
    expect(out.context).toEqual({ status: 'unavailable', reason: 'not_contiguous' });
  });

  it('never returns an available context that does not contain the whole hit', () => {
    const out = buildPassageContext({ documentId: 'd', contentHash: 'h'.repeat(64), extractedText: T,
      hit: { chunkId: 'c1', chunkIndex: 1 }, chunks: [chunk('c0', 0, 0, 3000), chunk('c1', 1, 2500, 5500), chunk('c2', 2, 3000, 6000)] });
    if (out.context.status === 'available') {
      const { start, end } = out.context.reference.span;
      expect(start).toBeLessThanOrEqual(out.hitSpan!.start);
      expect(end).toBeGreaterThanOrEqual(out.hitSpan!.end);
    }
  });
});
