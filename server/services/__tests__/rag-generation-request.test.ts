import { describe, expect, it, vi } from 'vitest';
import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline.js';
import { buildRagGenerationRequest, buildRagSourceText } from '../rag-generation-request.js';

const sources: RetrievedDocument[] = [
  { id: 'chunk-1', documentId: 'document-1', title: 'Compressed', content: 'Raw one', expandedContent: 'Expanded one', compressedContent: 'Compressed one', atomType: 'vault_chunk', initialScore: 1, finalScore: 1 },
  { id: 'chunk-2', documentId: 'document-2', title: 'Expanded', content: 'Raw two', expandedContent: 'Expanded two', compressedContent: '', atomType: 'vault_chunk', initialScore: 1, finalScore: 1 },
  { id: 'chunk-3', documentId: 'document-3', title: 'Raw', content: 'Raw three', atomType: 'vault_chunk', initialScore: 1, finalScore: 1 },
];
const expectedSourceText = '[Source 1: Compressed]\nCompressed one\n\n---\n\n[Source 2: Expanded]\nExpanded two\n\n---\n\n[Source 3: Raw]\nRaw three';
// Literal snapshot of the pre-extraction production request, not inferred from the builder.
const expectedRequest = {
  taskType: 'regulatory_review',
  messages: [
    {
      role: 'system',
      content: 'You are a regulatory affairs expert with deep knowledge of FDA, EMA, and ICH guidelines.\nAnswer questions based ONLY on the provided sources. Be precise and cite sources using [Source N] notation.\nIf the sources don\'t contain enough information to fully answer, say so clearly.',
    },
    { role: 'user', content: `Question: What is recorded?\n\nSources:\n${expectedSourceText}` },
  ],
  maxTokens: 1000,
  temperature: 0.3,
};

function pipeline(documents = sources) {
  const instance = Object.create(AdvancedRAGPipeline.prototype) as AdvancedRAGPipeline;
  const route = vi.fn(async () => ({ content: 'Source-based reply.' }));
  const context = { documents, totalCandidates: documents.length, retrievalStrategy: 'basic', processingTimeMs: 0, tokensUsed: 0 };
  Object.assign(instance, { retrieve: vi.fn(async () => context), aiRouter: { route } });
  return { instance, route };
}

describe('one canonical RAG generation request for production and controlled qualification', () => {
  it('preserves source numbering, separators and compressed/expanded/raw precedence exactly', () => {
    expect(buildRagSourceText(sources)).toBe(expectedSourceText);
    expect(buildRagSourceText([])).toBe('');
  });
  it('preserves the pre-extraction prompt, task, sampling and token budget exactly', () => {
    expect(buildRagGenerationRequest('What is recorded?', expectedSourceText)).toEqual(expectedRequest);
  });
  it('the actual production generation method sends that exact canonical request', async () => {
    const p = pipeline();
    await p.instance.queryWithGeneration('What is recorded?', { strategy: 'basic' });
    expect(p.route).toHaveBeenCalledOnce();
    expect(p.route).toHaveBeenCalledWith(expectedRequest);
  });
  it('retains the explicit generator pin while reusing the canonical request', async () => {
    const p = pipeline();
    await p.instance.queryWithGeneration('What is recorded?', { strategy: 'basic', model: 'candidate-model' });
    expect(p.route).toHaveBeenCalledWith({ ...expectedRequest, model: 'candidate-model' });
  });
  it('retains the existing empty-source refusal without calling a model', async () => {
    const p = pipeline([]);
    const result = await p.instance.queryWithGeneration('What is recorded?', { strategy: 'basic' });
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain('could not find relevant information');
    expect(p.route).not.toHaveBeenCalled();
  });
});
