/**
 * project_knowledge_search has a model-free path (row 74, slice S3).
 *
 * The project intent's retrieval defaults to strategy 'advanced' (HyDE plus
 * multi-query: model calls before a row is read) and an LLM-as-judge rerank
 * (a model call per search). A sub-agent's tools run where a model may not be
 * called (ai-gateway/model-call-scope.ts): there those calls would be refused,
 * and the reranker would silently fall back to embedding order. So under
 * ctx.modelCalls 'refuse', or inside the refusal scope itself, the tool asks
 * for what it can actually get —
 * strategy 'basic', no reranking — the same choice search_document_passages
 * already makes for in-agent retrieval (vault/document-passage-search.ts).
 *
 * Without the flag the call is exactly what it was.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const rag = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>> }));

vi.mock('../../ragRouter', async importOriginal => {
  const real = await importOriginal<Record<string, unknown>>();
  return {
    ...real,
    ragRouter: {
      ...(real.ragRouter as object),
      retrieve: async (params: Record<string, unknown>) => {
        rag.calls.push(params);
        return { documents: [] };
      },
    },
  };
});

import { getToolHandler } from '../AnaToolExecutor';
import { runRefusingModelCalls } from '../../ai-gateway/model-call-scope';

const CTX = { organizationId: 7, userId: 3, projectId: 12, organizationUuid: '11111111-2222-4333-8444-555555555555' };
const search = (ctx: Record<string, unknown>) =>
  getToolHandler('project_knowledge_search')!({ query: 'primary endpoint' }, ctx as any);

beforeEach(() => {
  rag.calls = [];
});

describe('project_knowledge_search', () => {
  it("under modelCalls 'refuse', retrieves with no model call: basic strategy, no reranking", async () => {
    await search({ ...CTX, modelCalls: 'refuse' });
    expect(rag.calls).toHaveLength(1);
    expect(rag.calls[0]).toMatchObject({ strategy: 'basic', useReranking: false, intent: 'project_scoped' });
  });

  it('inside a model-call refusal scope, with no ctx flag, takes the same model-free path (what the gateway enforces decides)', async () => {
    await runRefusingModelCalls({ runId: 'agent_1', parentRunId: 'run_1', tool: 'project_knowledge_search' }, () =>
      search(CTX),
    );
    expect(rag.calls).toHaveLength(1);
    expect(rag.calls[0], 'asked for model calls the gateway will refuse').toMatchObject({
      strategy: 'basic',
      useReranking: false,
    });
  });

  it('otherwise asks for exactly what it always did', async () => {
    await search(CTX);
    expect(rag.calls).toHaveLength(1);
    expect(rag.calls[0]).toMatchObject({ useReranking: true, intent: 'project_scoped' });
    expect(rag.calls[0]).not.toHaveProperty('strategy');
  });
});
