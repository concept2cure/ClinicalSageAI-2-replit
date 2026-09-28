/**
 * ai.embeddings returns a real vector from the embedding provider, or throws.
 *
 * Until 2026-09-23 it sent the text to a CHAT completion with taskType
 * 'embedding' — no chat model serves that — and parsed the reply as a number
 * array, returning `{ embedding: [] }` when it did not parse. It could not
 * produce a vector, and reported that only by being empty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const S = vi.hoisted(() => ({ embed: vi.fn(), route: vi.fn() }));

vi.mock('../../services/ai-gateway/embeddings/embedding-provider', () => ({
  getEmbeddingProvider: () => ({ embed: S.embed }),
}));
vi.mock('../../services/ai-gateway/gateway', () => ({
  getGateway: () => ({ route: S.route }),
}));

import { ai } from '../unified-ai-client';

beforeEach(() => {
  S.embed.mockReset();
  S.route.mockReset();
});

describe('ai.embeddings', () => {
  it('is served by the embedding provider, not a chat completion', async () => {
    S.embed.mockResolvedValue({ embeddings: [[0.1, 0.2]], model: 'text-embedding-3-small', provider: 'openai', inputTokens: 3 });

    const r = await ai.embeddings({ input: 'hello', model: 'text-embedding-3-small', dimensions: 1536 });

    expect(r.embedding).toEqual([0.1, 0.2]);
    expect(S.embed).toHaveBeenCalledWith({ input: 'hello', model: 'text-embedding-3-small', dimensions: 1536 });
    expect(S.route).not.toHaveBeenCalled();
  });

  it('no vector is an error, not an empty embedding', async () => {
    S.embed.mockResolvedValue({ embeddings: [[]], model: 'm', provider: 'openai', inputTokens: 0 });
    await expect(ai.embeddings({ input: 'hello' })).rejects.toThrow(/no vector/);
  });

  it('a provider failure propagates', async () => {
    S.embed.mockImplementation(async () => {
      throw new Error('OPENAI_API_KEY not configured');
    });
    await expect(ai.embeddings({ input: 'hello' })).rejects.toThrow(/OPENAI_API_KEY/);
  });
});
