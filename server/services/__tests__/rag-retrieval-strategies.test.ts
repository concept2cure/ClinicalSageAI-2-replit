import { describe, it, expect, vi } from 'vitest';
import type { AIResponse } from '../aiProviderRouter';
import type { RetrievedDocument } from '../advancedRAGPipeline';
import {
  hydeRetrieval,
  multiQueryRetrieval,
  stepBackRetrieval,
  decomposeRetrieval,
  type StrategyDeps,
} from '../rag-retrieval-strategies';

function aiResponse(content: string): AIResponse {
  return {
    content,
    provider: 'anthropic',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 9, estimatedCost: 0 },
    latencyMs: 1,
    requestId: 'r',
    cached: false,
  };
}

function doc(id: string): RetrievedDocument {
  return { id, content: `c-${id}`, title: `t-${id}`, atomType: 'vault_chunk', initialScore: 0.5, finalScore: 0.5 };
}

/** Build deps whose route returns a fixed content and whose search records queries. */
function makeDeps(routeContent: string) {
  const searched: string[] = [];
  const embedBatch = vi.fn(async (_queries: string[]) => []);
  const deps: StrategyDeps = {
    route: vi.fn(async () => aiResponse(routeContent)),
    embedBatch,
    search: vi.fn(async (q: string) => {
      searched.push(q);
      return [doc(`hit:${q}`)];
    }),
  };
  return { deps, searched, embedBatch };
}

describe('hydeRetrieval', () => {
  it('searches on the hypothetical document, not the raw query', async () => {
    const { deps, searched } = makeDeps('A hypothetical authoritative answer.');
    const out = await hydeRetrieval(deps, 'real question', 5);
    expect(searched).toEqual(['A hypothetical authoritative answer.']);
    expect(out.documents.map(d => d.id)).toEqual(['hit:A hypothetical authoritative answer.']);
    expect(out.tokensUsed).toBe(9);
  });
});

describe('multiQueryRetrieval', () => {
  it('retrieves on the original plus parsed alternatives and pre-warms one batch embed', async () => {
    const { deps, searched, embedBatch } = makeDeps('["alt one", "alt two"]');
    const out = await multiQueryRetrieval(deps, 'original', 6);
    expect(searched).toEqual(['original', 'alt one', 'alt two']);
    expect(embedBatch).toHaveBeenCalledTimes(1);
    expect(embedBatch).toHaveBeenCalledWith(['original', 'alt one', 'alt two']);
    expect(out.tokensUsed).toBe(9);
  });

  it('falls back to the original query when expansion output is unparseable', async () => {
    const { deps, searched } = makeDeps('not json');
    const out = await multiQueryRetrieval(deps, 'original', 6);
    // Fallback uses [query] as the alternatives, so the original is searched
    // twice; mergeByMaxScore dedupes by id, so the result set stays clean.
    expect(searched).toEqual(['original', 'original']);
    expect(out.documents.map(d => d.id)).toEqual(['hit:original']);
  });
});

describe('stepBackRetrieval', () => {
  it('retrieves on the original and the step-back question', async () => {
    const { deps, searched } = makeDeps('What is the governing framework?');
    const out = await stepBackRetrieval(deps, 'narrow question', 6);
    expect(searched).toEqual(['narrow question', 'What is the governing framework?']);
    expect(out.tokensUsed).toBe(9);
  });

  it('degrades to original-only when the step-back echoes the query', async () => {
    const { deps, searched } = makeDeps('narrow question'); // echo -> null
    await stepBackRetrieval(deps, 'narrow question', 6);
    expect(searched).toEqual(['narrow question']);
  });
});

describe('decomposeRetrieval', () => {
  it('retrieves on the original plus each sub-question', async () => {
    const { deps, searched } = makeDeps('["sub one", "sub two"]');
    const out = await decomposeRetrieval(deps, 'compound question', 9);
    expect(searched).toEqual(['compound question', 'sub one', 'sub two']);
    expect(out.tokensUsed).toBe(9);
  });

  it('degrades to original-only when the question is atomic ([])', async () => {
    const { deps, searched } = makeDeps('[]');
    await decomposeRetrieval(deps, 'atomic question', 9);
    expect(searched).toEqual(['atomic question']);
  });
});
