/**
 * The three model egresses that do not go through gateway.route() refuse
 * inside a sub-agent's refusal scope (row 74, S5c; brief §9, T3 (f)).
 *
 * The scope was enforced at route() only. Three paths reach a model without
 * it: the legacy router's LiteLLM branch, the cross-encoder reranker's direct
 * fetch to Cohere or Voyage, and the RAG pipeline's response cache, whose hit
 * returns model output without any call. No sub-agent tool reaches them today,
 * but only because two option branches (no reranking, basic strategy) keep
 * project_knowledge_search off them. Each now refuses on its own, so a
 * regression in those branches fails closed.
 *
 * Each case also runs outside a scope, where nothing changes.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({ gatewayCalls: 0, liteLLMCalls: 0 }));

vi.mock('../ai-gateway/gateway.js', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    getGateway: () => ({
      route: async () => {
        S.gatewayCalls += 1;
        return { content: 'ok', provider: 'anthropic', model: 'm', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
      },
    }),
  };
});
vi.mock('../observability/langfuseService', () => ({
  LangfuseService: class {
    async emitEvent() {}
  },
}));
vi.mock('../ai/LiteLLMAdapter', () => ({
  LiteLLMAdapter: class {
    isEnabled() {
      return true;
    }
    async execute() {
      S.liteLLMCalls += 1;
      return { content: 'litellm', provider: 'anthropic', model: 'm', usage: { inputTokens: 1, outputTokens: 1, totalTokens: 2 } };
    }
  },
}));

import { runRefusingModelCalls } from '../ai-gateway/model-call-scope';
import { AIProviderRouter } from '../aiProviderRouter';
import { CrossEncoderReranker } from '../rag-reranker';
import { AdvancedRAGPipeline } from '../advancedRAGPipeline';

const SCOPE = { runId: 'agent_x', parentRunId: 'run_p', tool: 'project_knowledge_search' };
const refused = { code: 'SUB_AGENT_TOOL_MODEL_CALL', name: 'GatewayPolicyError' };
const inScope = <T>(fn: () => Promise<T>) => runRefusingModelCalls(SCOPE, fn);

const fetchSpy = vi.fn(async () => new Response(JSON.stringify({ results: [{ index: 0, relevance_score: 0.9 }] }), { status: 200 }));
beforeEach(() => {
  S.gatewayCalls = 0;
  S.liteLLMCalls = 0;
  fetchSpy.mockClear();
  vi.stubGlobal('fetch', fetchSpy);
  process.env.ANTHROPIC_API_KEY = 'test-key';
});
afterEach(() => vi.unstubAllGlobals());

describe('AIProviderRouter.route', () => {
  const ask = () => ({ taskType: 'document_analysis' as const, messages: [{ role: 'user' as const, content: 'x' }] });
  it('refuses inside the scope before the LiteLLM branch and before the gateway', async () => {
    const router = new AIProviderRouter({ query: async () => ({ rows: [] }) } as never);
    await expect(inScope(() => router.route(ask()))).rejects.toMatchObject(refused);
    expect(S.liteLLMCalls).toBe(0);
    expect(S.gatewayCalls).toBe(0);
  });
  it('outside the scope, the LiteLLM branch runs as before', async () => {
    const router = new AIProviderRouter({ query: async () => ({ rows: [] }) } as never);
    await router.route(ask());
    expect(S.liteLLMCalls).toBe(1);
  });
});

describe('CrossEncoderReranker.score', () => {
  const reranker = () => new CrossEncoderReranker({ provider: 'cohere', model: 'rerank-v3.5', apiKey: 'k' } as never);
  const docs = [{ id: 'd1', content: 'passage' }] as never;
  it('refuses inside the scope with no fetch', async () => {
    await expect(inScope(() => reranker().score('q', docs))).rejects.toMatchObject(refused);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
  it('outside the scope, it calls the provider as before', async () => {
    await reranker().score('q', docs);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });
});

describe('AdvancedRAGPipeline.routeCached', () => {
  type Cached = {
    llmCallCache: Map<string, unknown>;
    llmCacheTtlMs: number;
    llmCacheMaxEntries: number;
    aiRouter: { route: ReturnType<typeof vi.fn> };
    routeCached(req: unknown): Promise<{ content: string; cached?: boolean }>;
  };
  const pipeline = (): Cached => {
    const p = Object.create(AdvancedRAGPipeline.prototype) as Cached;
    p.llmCallCache = new Map();
    p.llmCacheTtlMs = 60_000;
    p.llmCacheMaxEntries = 10;
    p.aiRouter = { route: vi.fn(async () => ({ content: 'model output', usage: { totalTokens: 1 }, cached: false })) };
    return p;
  };
  const req = { taskType: 'reasoning', messages: [{ role: 'user', content: 'a' }], maxTokens: 10, temperature: 0 };
  it('refuses a cache HIT inside the scope: cached model output is model output', async () => {
    const p = pipeline();
    await p.routeCached(req);
    expect(p.llmCallCache.size).toBe(1);
    await expect(inScope(() => p.routeCached(req))).rejects.toMatchObject(refused);
    expect(p.aiRouter.route).toHaveBeenCalledTimes(1);
  });
  it('outside the scope, the hit is served as before', async () => {
    const p = pipeline();
    await p.routeCached(req);
    expect((await p.routeCached(req)).cached).toBe(true);
  });
});
