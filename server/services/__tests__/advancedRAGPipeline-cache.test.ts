import { describe, it, expect, vi } from 'vitest';
import { AdvancedRAGPipeline } from '../advancedRAGPipeline';

/**
 * Unit coverage for the routeCached TTL + LRU behavior:
 *  - identical auxiliary requests are served from cache (no second route call)
 *  - eviction is least-recently-used, and a live hit refreshes recency
 *  - expired entries are dropped rather than served
 *
 * Built via Object.create so we exercise routeCached without the constructor;
 * the cache fields the class initializes inline are set explicitly here.
 */

type Cached = {
  llmCallCache: Map<string, unknown>;
  llmCacheTtlMs: number;
  llmCacheMaxEntries: number;
  aiRouter: { route: ReturnType<typeof vi.fn> };
  routeCached(req: unknown): Promise<{ content: string; cached?: boolean }>;
};

function makeCachePipeline(maxEntries: number, ttlMs = 60 * 60 * 1000): Cached {
  const p = Object.create(AdvancedRAGPipeline.prototype) as Cached;
  p.llmCallCache = new Map();
  p.llmCacheTtlMs = ttlMs;
  p.llmCacheMaxEntries = maxEntries;
  let n = 0;
  p.aiRouter = {
    route: vi.fn(async () => ({ content: `r${n++}`, usage: { totalTokens: 1 }, cached: false })),
  };
  return p;
}

function req(content: string) {
  return { taskType: 'reasoning', messages: [{ role: 'user', content }], maxTokens: 10, temperature: 0 };
}

describe('routeCached', () => {
  it('serves an identical request from cache without a second route call', async () => {
    const p = makeCachePipeline(10);
    const a1 = await p.routeCached(req('a'));
    const a2 = await p.routeCached(req('a'));
    expect(p.aiRouter.route).toHaveBeenCalledTimes(1);
    expect(a2.cached).toBe(true);
    expect(a2.content).toBe(a1.content);
  });

  it('evicts the least-recently-used entry; a hit refreshes recency', async () => {
    const p = makeCachePipeline(2);
    await p.routeCached(req('a')); // [a]
    await p.routeCached(req('b')); // [a,b]
    await p.routeCached(req('a')); // hit -> a becomes MRU, order [b,a]
    expect(p.aiRouter.route).toHaveBeenCalledTimes(2);

    await p.routeCached(req('c')); // insert c, over cap -> evict LRU 'b' -> [a,c]
    expect(p.aiRouter.route).toHaveBeenCalledTimes(3);

    // 'a' was refreshed, so it survived eviction (still cached).
    await p.routeCached(req('a'));
    expect(p.aiRouter.route).toHaveBeenCalledTimes(3);

    // 'b' was the LRU and got evicted, so it must be recomputed.
    await p.routeCached(req('b'));
    expect(p.aiRouter.route).toHaveBeenCalledTimes(4);
  });

  it('drops expired entries instead of serving them', async () => {
    const p = makeCachePipeline(10, -1); // every entry is immediately expired
    await p.routeCached(req('a'));
    await p.routeCached(req('a'));
    expect(p.aiRouter.route).toHaveBeenCalledTimes(2);
    // The expired entry should not accumulate as a stale eviction candidate.
    expect(p.llmCallCache.size).toBe(1);
  });
});
