import { describe, it, expect, vi } from 'vitest';
import {
  AdvancedRAGPipeline,
  parsePgVector,
  type RetrievedDocument,
} from '../advancedRAGPipeline';

/**
 * Unit coverage for the MMR embedding-reuse fast path:
 *  - parsePgVector turns the pgvector text form back into a number[]
 *  - applyMmr reuses carried vectors and never calls the embedding service
 *    when every candidate already carries one (the round-trip we removed)
 *  - it still embeds only the stragglers that arrive without a vector
 *  - normalize/dotProduct reproduce cosine similarity
 *
 * The pipeline is created via Object.create so we exercise the prototype
 * methods without running the constructor (no pool / OpenAI / router wiring).
 */

type Mmr = {
  embeddingService: { embedBatch: (...a: unknown[]) => unknown };
  applyMmr(docs: RetrievedDocument[], limit: number, lambda: number): Promise<RetrievedDocument[]>;
  normalize(v: number[]): number[];
  dotProduct(a: number[], b: number[]): number;
};

function makePipeline(embedBatch?: (...a: unknown[]) => unknown): Mmr {
  const p = Object.create(AdvancedRAGPipeline.prototype) as Mmr;
  p.embeddingService = {
    embedBatch:
      embedBatch ??
      (() => {
        throw new Error('embedBatch must not be called when vectors are carried');
      }),
  };
  return p;
}

function doc(id: string, score: number, embedding?: number[]): RetrievedDocument {
  return {
    id,
    content: `content-${id}`,
    title: `title-${id}`,
    atomType: 'vault_chunk',
    initialScore: score,
    finalScore: score,
    embedding,
  };
}

describe('parsePgVector', () => {
  it('parses the pgvector text form', () => {
    expect(parsePgVector('[1,2,3]')).toEqual([1, 2, 3]);
    expect(parsePgVector('[0.5,-0.25,1e-3]')).toEqual([0.5, -0.25, 0.001]);
  });

  it('accepts an already-parsed numeric array', () => {
    expect(parsePgVector([1, 2, 3])).toEqual([1, 2, 3]);
  });

  it('returns undefined for malformed or empty input', () => {
    expect(parsePgVector(undefined)).toBeUndefined();
    expect(parsePgVector(null)).toBeUndefined();
    expect(parsePgVector('')).toBeUndefined();
    expect(parsePgVector('[]')).toBeUndefined();
    expect(parsePgVector('[1,foo,3]')).toBeUndefined();
    expect(parsePgVector([1, 'x', 3])).toBeUndefined();
  });
});

describe('normalize / dotProduct', () => {
  it('dot of unit vectors equals cosine similarity', () => {
    const p = makePipeline();
    const a = [3, 4, 0];
    const b = [4, 0, 3];
    const cos = p.dotProduct(p.normalize(a), p.normalize(b));
    // cos = (3*4)/(5*5) = 12/25
    expect(cos).toBeCloseTo(12 / 25, 10);
  });

  it('maps a zero vector to zeros (no NaN)', () => {
    const p = makePipeline();
    expect(p.normalize([0, 0, 0])).toEqual([0, 0, 0]);
    expect(p.dotProduct([0, 0, 0], [1, 1, 1])).toBe(0);
  });
});

describe('applyMmr', () => {
  it('reuses carried vectors without calling the embedding service', async () => {
    const spy = vi.fn(() => {
      throw new Error('should not embed');
    });
    const p = makePipeline(spy);

    // Two near-identical vectors plus one orthogonal one. With the top two by
    // score being the near-identical pair, MMR should reject the redundant one
    // in favor of the diverse orthogonal candidate.
    const docs = [
      doc('a', 0.9, [1, 0, 0]),
      doc('b', 0.85, [0.999, 0.01, 0]),
      doc('c', 0.8, [0, 1, 0]),
    ];

    const out = await p.applyMmr(docs, 2, 0.5);
    expect(spy).not.toHaveBeenCalled();
    expect(out).toHaveLength(2);
    const ids = out.map(d => d.id);
    expect(ids[0]).toBe('a'); // highest relevance first
    expect(ids).toContain('c'); // diverse pick beats the redundant 'b'
    expect(ids).not.toContain('b');
  });

  it('embeds only the candidates that arrive without a carried vector', async () => {
    const embedBatch = vi.fn(async (texts: string[]) => {
      // The single straggler ('c') gets embedded; return an orthogonal vector.
      expect(texts).toEqual(['content-c']);
      return [{ embedding: [0, 1, 0] }];
    });
    const p = makePipeline(embedBatch as unknown as (...a: unknown[]) => unknown);

    const docs = [
      doc('a', 0.9, [1, 0, 0]),
      doc('b', 0.85, [0.999, 0.01, 0]),
      doc('c', 0.8), // no carried vector → must be embedded
    ];

    const out = await p.applyMmr(docs, 2, 0.5);
    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(out.map(d => d.id)).toContain('c');
  });

  it('falls back to lexical similarity when embedding the straggler fails', async () => {
    const embedBatch = vi.fn(async () => {
      throw new Error('embedding down');
    });
    const p = makePipeline(embedBatch as unknown as (...a: unknown[]) => unknown);

    const docs = [doc('a', 0.9, [1, 0, 0]), doc('b', 0.85), doc('c', 0.8)];

    // Should not throw; degrades to lexical and still returns `limit` docs.
    const out = await p.applyMmr(docs, 2, 0.5);
    expect(out).toHaveLength(2);
    expect(out[0].id).toBe('a');
  });
});
