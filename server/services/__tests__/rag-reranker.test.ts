import { describe, it, expect, vi, afterEach } from 'vitest';
import type { AIRequest, AIResponse } from '../aiProviderRouter';
import {
  LlmJudgeReranker,
  CrossEncoderReranker,
  crossEncoderConfigFromEnv,
  getReranker,
  type Reranker,
} from '../rag-reranker';
import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline';

function aiResponse(content: string): AIResponse {
  return {
    content,
    provider: 'openai',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 7, estimatedCost: 0 },
    latencyMs: 1,
    requestId: 'r',
    cached: false,
  };
}

const docs = [
  { title: 'A', content: 'alpha content' },
  { title: 'B', content: 'beta content' },
  { title: 'C', content: 'gamma content' },
];

describe('LlmJudgeReranker', () => {
  it('normalizes 0-100 judge scores to [0,1] aligned to input order', async () => {
    const route = vi.fn(async (_req: AIRequest) => aiResponse('{"1": 90, "2": 40, "3": 10}'));
    const r = new LlmJudgeReranker(route);
    const { scores, tokensUsed } = await r.score('q', docs);
    expect(scores).toEqual([0.9, 0.4, 0.1]);
    expect(tokensUsed).toBe(7);
    expect(route).toHaveBeenCalledTimes(1);
  });

  it('defaults missing indices to neutral 0.5', async () => {
    const route = vi.fn(async () => aiResponse('{"1": 80}'));
    const r = new LlmJudgeReranker(route);
    const { scores } = await r.score('q', docs);
    expect(scores).toEqual([0.8, 0.5, 0.5]);
  });

  it('returns neutral scores (not a throw) when the judge output is unparseable', async () => {
    const route = vi.fn(async () => aiResponse('not json'));
    const r = new LlmJudgeReranker(route);
    const { scores } = await r.score('q', docs);
    expect(scores).toEqual([0.5, 0.5, 0.5]);
  });

  it('handles an empty candidate set without calling the model', async () => {
    const route = vi.fn(async () => aiResponse('{}'));
    const r = new LlmJudgeReranker(route);
    expect(await r.score('q', [])).toEqual({ scores: [], tokensUsed: 0 });
    expect(route).not.toHaveBeenCalled();
  });
});

describe('CrossEncoderReranker', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('scatters ranked results back into input order and clamps to [0,1]', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: { body?: string }) =>
      new Response(
        JSON.stringify({
          results: [
            { index: 2, relevance_score: 0.95 },
            { index: 0, relevance_score: 0.42 },
            { index: 1, relevance_score: 1.7 }, // out of range -> clamps to 1
          ],
        }),
        { status: 200 }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const r = new CrossEncoderReranker({ provider: 'cohere', apiKey: 'k', model: 'rerank-v3.5' });
    const { scores, tokensUsed } = await r.score('q', docs);
    expect(scores).toEqual([0.42, 1, 0.95]); // aligned to input order 0,1,2
    expect(tokensUsed).toBe(0);
    expect(r.name).toBe('cohere:rerank-v3.5');

    // sends query + documents + top_n to the provider endpoint
    const init = fetchMock.mock.calls[0][1] as { body: string };
    const body = JSON.parse(init.body);
    expect(body).toMatchObject({ model: 'rerank-v3.5', query: 'q', top_n: 3 });
    expect(body.documents).toHaveLength(3);
  });

  it('throws on a non-OK HTTP response (so the pipeline can fall back)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 429 })));
    const r = new CrossEncoderReranker({ provider: 'voyage', apiKey: 'k', model: 'rerank-2' });
    await expect(r.score('q', docs)).rejects.toThrow(/HTTP 429/);
  });

  it('throws when the response is missing the results array', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ data: [] }), { status: 200 })));
    const r = new CrossEncoderReranker({ provider: 'cohere', apiKey: 'k', model: 'm' });
    await expect(r.score('q', docs)).rejects.toThrow(/results/);
  });

  it('rejects an unknown provider with no endpoint', () => {
    expect(() => new CrossEncoderReranker({ provider: 'mystery', apiKey: 'k', model: 'm' })).toThrow(
      /endpoint/
    );
  });
});

describe('crossEncoderConfigFromEnv / getReranker', () => {
  const route = vi.fn(async () => aiResponse('{}'));

  it('returns null unless provider + key + model are all set', () => {
    expect(crossEncoderConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      crossEncoderConfigFromEnv({ RAG_RERANKER_PROVIDER: 'cohere' } as NodeJS.ProcessEnv)
    ).toBeNull();
    expect(
      crossEncoderConfigFromEnv({
        RAG_RERANKER_PROVIDER: 'cohere',
        RAG_RERANKER_API_KEY: 'k',
        RAG_RERANKER_MODEL: 'rerank-v3.5',
      } as NodeJS.ProcessEnv)
    ).toMatchObject({ provider: 'cohere', apiKey: 'k', model: 'rerank-v3.5' });
  });

  it('falls back to the LLM judge when env is unset', () => {
    const r = getReranker(route, {} as NodeJS.ProcessEnv);
    expect(r.name).toBe('llm_judge');
  });

  it('selects the cross-encoder when fully configured', () => {
    const r = getReranker(route, {
      RAG_RERANKER_PROVIDER: 'cohere',
      RAG_RERANKER_API_KEY: 'k',
      RAG_RERANKER_MODEL: 'rerank-v3.5',
    } as NodeJS.ProcessEnv);
    expect(r.name).toBe('cohere:rerank-v3.5');
  });
});

// Pipeline-side wiring: applyReranker blends the provider's score with the
// embedding score, preserves passthrough fields, and falls back safely.
type WithReranker = {
  reranker: Reranker;
  applyReranker(
    query: string,
    docs: RetrievedDocument[],
    governedVerdict?: boolean
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }>;
};

function pipelineWith(reranker: Reranker): WithReranker {
  const p = Object.create(AdvancedRAGPipeline.prototype) as WithReranker;
  p.reranker = reranker;
  return p;
}

function ragDoc(id: string, initialScore: number): RetrievedDocument {
  return {
    id,
    content: `content-${id}`,
    title: `title-${id}`,
    atomType: 'vault_chunk',
    initialScore,
    finalScore: initialScore,
    embedding: [1, 0, 0],
    sourceRow: { id, keep: true },
  };
}

describe('AdvancedRAGPipeline.applyReranker', () => {
  it('blends rerank with embedding score, re-sorts, and preserves passthrough fields', async () => {
    // 'b' starts lower on embedding but the reranker rates it top -> it wins.
    const reranker: Reranker = {
      name: 'stub',
      score: async (_q, ds) => ({ scores: ds.map(d => (d.title === 'title-b' ? 1.0 : 0.1)), tokensUsed: 5 }),
    };
    const p = pipelineWith(reranker);
    const out = await p.applyReranker('q', [ragDoc('a', 0.8), ragDoc('b', 0.4)]);

    expect(out.tokensUsed).toBe(5);
    expect(out.documents[0].id).toBe('b'); // (0.4 + 1.0)/2 = 0.70 > (0.8 + 0.1)/2 = 0.45
    expect(out.documents[0].finalScore).toBeCloseTo(0.7, 10);
    expect(out.documents[0].rerankScore).toBe(1.0);
    // passthrough fields survive the rerank
    expect(out.documents[0].embedding).toEqual([1, 0, 0]);
    expect(out.documents[0].sourceRow).toEqual({ id: 'b', keep: true });
  });

  it('keeps embedding order when the reranker throws', async () => {
    const reranker: Reranker = {
      name: 'boom',
      score: async () => {
        throw new Error('provider down');
      },
    };
    const p = pipelineWith(reranker);
    const input = [ragDoc('a', 0.8), ragDoc('b', 0.4)];
    const out = await p.applyReranker('q', input);
    expect(out.documents.map(d => d.id)).toEqual(['a', 'b']);
    expect(out.tokensUsed).toBe(0);
  });

  it('falls back when the provider returns the wrong number of scores', async () => {
    const reranker: Reranker = {
      name: 'mismatch',
      score: async () => ({ scores: [0.9], tokensUsed: 3 }), // only 1 score for 2 docs
    };
    const p = pipelineWith(reranker);
    const out = await p.applyReranker('q', [ragDoc('a', 0.8), ragDoc('b', 0.4)]);
    expect(out.documents.map(d => d.id)).toEqual(['a', 'b']); // unchanged
  });
});

// A rerank score that decides a governed verdict — a citation run's supported /
// gap status — is high-risk regulatory work. It is produced only by a model
// approved for regulatory review, and a missing or unreadable score fails
// rather than defaulting to 0.5. Until 2026-09-23 the judge always routed as
// structured_output, which any model may serve, and gpt-4o scored citations.
describe('governed verdicts: the LLM judge', () => {
  it('routes as regulatory_review when the score decides a verdict, structured_output otherwise', async () => {
    const route = vi.fn(async (_req: AIRequest) => aiResponse('{"1": 90, "2": 40, "3": 10}'));
    const r = new LlmJudgeReranker(route);
    await r.score('q', docs, { governedVerdict: true });
    await r.score('q', docs);
    expect(route.mock.calls.map(([req]) => req.taskType)).toEqual(['regulatory_review', 'structured_output']);
  });

  it('an unreadable score throws instead of defaulting to 0.5', async () => {
    const r = new LlmJudgeReranker(vi.fn(async () => aiResponse('not json')));
    await expect(r.score('q', docs, { governedVerdict: true })).rejects.toThrow(/unreadable/);
  });

  it('a partial score throws instead of filling the gaps with 0.5', async () => {
    const r = new LlmJudgeReranker(vi.fn(async () => aiResponse('{"1": 80}')));
    await expect(r.score('q', docs, { governedVerdict: true })).rejects.toThrow(/every document/);
  });

  it('a complete score is used as scored', async () => {
    const r = new LlmJudgeReranker(vi.fn(async () => aiResponse('{"1": 90, "2": 40, "3": 10}')));
    expect((await r.score('q', docs, { governedVerdict: true })).scores).toEqual([0.9, 0.4, 0.1]);
  });
});

describe('governed verdicts: the pipeline', () => {
  it('tells the reranker the score decides a verdict', async () => {
    const score = vi.fn(async (_q: string, ds: unknown[], _opts?: unknown) => ({ scores: ds.map(() => 0.5), tokensUsed: 0 }));
    const p = pipelineWith({ name: 'spy', score });
    await p.applyReranker('q', [ragDoc('a', 0.8)], true);
    expect(score.mock.calls[0][2]).toEqual({ governedVerdict: true });
  });

  it('a failed rerank fails the retrieval instead of keeping embedding order', async () => {
    const p = pipelineWith({
      name: 'boom',
      score: async () => {
        throw new Error('no approved model');
      },
    });
    await expect(p.applyReranker('q', [ragDoc('a', 0.8), ragDoc('b', 0.4)], true)).rejects.toThrow('no approved model');
  });

  it('a wrong score count fails the retrieval', async () => {
    const p = pipelineWith({ name: 'mismatch', score: async () => ({ scores: [0.9], tokensUsed: 3 }) });
    await expect(p.applyReranker('q', [ragDoc('a', 0.8), ragDoc('b', 0.4)], true)).rejects.toThrow(/1 scores for 2 docs/);
  });
});
