/**
 * The RAG pipeline's auxiliary-call cache never serves one tenant another
 * tenant's model output (D6).
 *
 * The pipeline is a process singleton, and its one-hour cache was keyed on the
 * request shape alone. A hit for tenant B returned what tenant A's call
 * produced, under A's placement, with no gateway call, no placement check and
 * no ledger row for B. It also outlived a change to B's own policy (review
 * finding, 2026-09-26).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({ calls: [] as string[] }));
vi.mock('../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({}), EnhancedEmbeddingService: class {} }));
vi.mock('../aiProviderRouter.js', () => ({
  AIProviderRouter: class {},
  getAIRouter: () => ({
    route: async () => {
      const { getTenantScope } = await import('../../db/tenantStore');
      S.calls.push(String(getTenantScope()?.tenantId));
      return { content: `answer for ${getTenantScope()?.tenantId}`, provider: 'anthropic', model: 'm', usage: {} };
    },
  }),
}));
vi.mock('../rag-reranker.js', () => ({ getReranker: () => ({}) }));

import { AdvancedRAGPipeline } from '../advancedRAGPipeline';
import { runWithTenantScope } from '../../db/tenantStore';
import { resetOrgPlacementResolver, setOrgPlacementResolver } from '../ai-gateway/providers/org-placement';

const req = { taskType: 'reasoning' as const, messages: [{ role: 'user' as const, content: 'HyDE: stability of lot 7' }] };
const asTenant = <T>(tenant: string, fn: () => Promise<T>) =>
  runWithTenantScope({ tenantId: tenant, role: null, source: 'test' }, fn);

let pipeline: AdvancedRAGPipeline;
beforeEach(() => {
  S.calls.length = 0;
  vi.spyOn(console, 'log').mockImplementation(() => {});
  pipeline = new AdvancedRAGPipeline({} as never);
});
afterEach(() => {
  resetOrgPlacementResolver();
  vi.restoreAllMocks();
});

const routeCached = (p: AdvancedRAGPipeline) => (p as unknown as { routeCached: (r: typeof req) => Promise<{ content: string; cached?: boolean }> }).routeCached(req);

describe('RAG auxiliary cache — tenant key', () => {
  it('the same request from a second tenant is routed for that tenant, not served from the first tenant’s entry', async () => {
    const a = await asTenant('1', () => routeCached(pipeline));
    const b = await asTenant('2', () => routeCached(pipeline));
    expect(S.calls).toEqual(['1', '2']);
    expect(b.content).toBe('answer for 2');
    expect(b.cached).not.toBe(true);
    expect(a.content).toBe('answer for 1');
  });

  it('a repeat from the same tenant is still served from the cache', async () => {
    await asTenant('1', () => routeCached(pipeline));
    const again = await asTenant('1', () => routeCached(pipeline));
    expect(S.calls).toEqual(['1']);
    expect(again.cached).toBe(true);
  });

  it('a change to the tenant’s placement policy is a new key', async () => {
    let policy: object | null = null;
    setOrgPlacementResolver({ resolve: async () => policy });
    await asTenant('1', () => routeCached(pipeline));
    policy = { allowedSubstrates: ['self_hosted'] };
    await asTenant('1', () => routeCached(pipeline));
    expect(S.calls).toEqual(['1', '1']);
  });

  it('a policy that cannot be read bypasses the cache', async () => {
    await asTenant('1', () => routeCached(pipeline));
    setOrgPlacementResolver({
      resolve: async () => {
        throw new Error('connection reset');
      },
    });
    await asTenant('1', () => routeCached(pipeline));
    expect(S.calls).toEqual(['1', '1']);
  });
});
