import { describe, it, expect, vi } from 'vitest';
import type { AIRequest, AIResponse } from '../aiProviderRouter';
import { generateStepBackQuery } from '../rag-query-transforms';
import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline';

function aiResponse(content: string): AIResponse {
  return {
    content,
    provider: 'anthropic',
    model: 'test',
    usage: { inputTokens: 0, outputTokens: 0, totalTokens: 11, estimatedCost: 0 },
    latencyMs: 1,
    requestId: 'r',
    cached: false,
  };
}

describe('generateStepBackQuery', () => {
  it('returns the broader question and routes a reasoning request', async () => {
    const route = vi.fn(async (_req: AIRequest) =>
      aiResponse('What are the general requirements for clinical trial informed consent?')
    );
    const { stepBackQuery, tokensUsed } = await generateStepBackQuery(
      route,
      'Does protocol X-12 need re-consent after amendment 3?'
    );
    expect(stepBackQuery).toBe('What are the general requirements for clinical trial informed consent?');
    expect(tokensUsed).toBe(11);
    expect(route.mock.calls[0][0].taskType).toBe('reasoning');
  });

  it('strips wrapping quotes and a "Step-back question:" echo prefix', async () => {
    const route = vi.fn(async () =>
      aiResponse('Step-back question: "What governs pediatric dosing?"')
    );
    const { stepBackQuery } = await generateStepBackQuery(route, 'specific q');
    expect(stepBackQuery).toBe('What governs pediatric dosing?');
  });

  it('returns null when the model just echoes the original (case-insensitive)', async () => {
    const route = vi.fn(async () => aiResponse('  WHAT IS GCP?  '));
    const { stepBackQuery } = await generateStepBackQuery(route, 'What is GCP?');
    expect(stepBackQuery).toBeNull();
  });

  it('returns null on an empty model response', async () => {
    const route = vi.fn(async () => aiResponse('   '));
    const { stepBackQuery, tokensUsed } = await generateStepBackQuery(route, 'q');
    expect(stepBackQuery).toBeNull();
    expect(tokensUsed).toBe(11);
  });
});

// Pipeline wiring: stepBackRetrieval retrieves on the original + the step-back
// query and fuses, and degrades to original-only when no step-back is produced.
type StepBackPipeline = {
  routeCached: (req: AIRequest) => Promise<AIResponse>;
  embeddingService: { embedBatch: (...args: unknown[]) => Promise<unknown> };
  searchInitial: (query: string, ...rest: unknown[]) => Promise<RetrievedDocument[]>;
  stepBackRetrieval(
    query: string,
    limit: number,
    threshold: number
  ): Promise<{ documents: RetrievedDocument[]; tokensUsed: number }>;
};

function doc(id: string, score: number): RetrievedDocument {
  return { id, content: `c-${id}`, title: `t-${id}`, atomType: 'vault_chunk', initialScore: score, finalScore: score };
}

function makePipeline(stepBackText: string) {
  const p = Object.create(AdvancedRAGPipeline.prototype) as StepBackPipeline;
  p.routeCached = vi.fn(async () => aiResponse(stepBackText));
  p.embeddingService = { embedBatch: vi.fn(async () => []) };
  // Return a distinct doc per query so we can prove which queries were searched.
  const searched: string[] = [];
  p.searchInitial = vi.fn(async (q: string) => {
    searched.push(q);
    return [doc(`hit-for:${q}`, 0.5)];
  });
  return { p, searched };
}

describe('AdvancedRAGPipeline.stepBackRetrieval', () => {
  it('retrieves on both the original and the step-back query and merges', async () => {
    const { p, searched } = makePipeline('What is the governing framework?');
    const out = await p.stepBackRetrieval('specific question', 6, 0.5);

    expect(searched).toEqual(['specific question', 'What is the governing framework?']);
    expect(out.documents.map(d => d.id).sort()).toEqual([
      'hit-for:What is the governing framework?',
      'hit-for:specific question',
    ]);
    expect(out.tokensUsed).toBe(11); // from the step-back reasoning call
    expect(p.embeddingService.embedBatch).toHaveBeenCalledTimes(1);
  });

  it('degrades to original-only retrieval when the step-back echoes the query', async () => {
    const { p, searched } = makePipeline('specific question'); // echo -> null
    const out = await p.stepBackRetrieval('specific question', 6, 0.5);

    expect(searched).toEqual(['specific question']); // no second search
    expect(out.documents.map(d => d.id)).toEqual(['hit-for:specific question']);
  });
});
