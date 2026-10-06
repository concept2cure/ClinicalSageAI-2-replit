import { describe, expect, it, vi } from 'vitest';
import {
  AdvancedRAGPipeline, type RAGContext, type RetrievedDocument, type RetrievalOptions,
} from '../advancedRAGPipeline.js';

const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const options: RetrievalOptions = { strategy: 'basic', organizationUuid: ORG };
const doc = (id: string, atomType = 'vault_chunk'): RetrievedDocument => ({
  id, chunkId: id, documentId: atomType === 'project_atom' ? undefined : `document-${id}`,
  title: `Source ${id}`, content: `Secret captured passage ${id}. `.repeat(35),
  atomType, initialScore: 0.8, finalScore: 0.8,
});
type Internal = Pick<AdvancedRAGPipeline, 'retrieve' | 'queryWithGeneration'> & {
  revalidateCandidates(documents: RetrievedDocument[], opts: RetrievalOptions): Promise<RetrievedDocument[]>;
};

/** The DB changes between awaits, as it does when a manager confirms withdrawal. */
function harness(documents: RetrievedDocument[]) {
  const withdrawn = new Set<string>();
  const retained = new Set<string>();
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (!sql.includes('FROM vault.document_chunks') && !sql.includes('FROM rag_chunks') && !sql.includes('FROM lumen_data_atoms')) {
      return { rows: [] };
    }
    statements.push({ sql, params });
    const ids = params[0] as string[];
    return { rows: documents.filter(d => ids.includes(d.id) && !withdrawn.has(d.id)).map(d => ({
      id: d.id, document_id: d.documentId, title: `Source ${d.id}`,
      original_file_available: !retained.has(d.id),
    })) };
  });
  const score = vi.fn(async (_question: string, candidates: Array<{ content: string }>) => ({
    scores: candidates.map(() => 1), tokensUsed: 0,
  }));
  const embedBatch = vi.fn(async (texts: string[]) => texts.map(() => ({ embedding: [1, 0] })));
  const routeCached = vi.fn(async () => ({ content: 'Compressed safe source', usage: { totalTokens: 1 } }));
  const route = vi.fn(async (_request: unknown) => ({ content: 'Grounded answer' }));
  const client = { query, release: vi.fn() };
  const instance = Object.create(AdvancedRAGPipeline.prototype) as Internal;
  Object.assign(instance, {
    pool: { query, connect: vi.fn(async () => client) }, reranker: { name: 'controlled', score },
    embeddingService: { embedBatch }, routeCached, aiRouter: { route },
    retrieveCandidates: vi.fn(async () => ({ candidates: documents, tokensUsed: 0, retrievalStrategy: 'basic' })),
  });
  return { instance, withdrawn, retained, score, embedBatch, routeCached, route, query, statements };
}

function generation(h: ReturnType<typeof harness>, documents: RetrievedDocument[]) {
  const context: RAGContext = {
    documents, totalCandidates: documents.length, retrievalStrategy: 'basic', tokensUsed: 0, processingTimeMs: 0,
  };
  Object.assign(h.instance, { retrieve: vi.fn(async () => context) });
}

describe('withdrawal is rechecked at RAG provider and grounding boundaries', () => {
  it('does not send a candidate withdrawn after initial retrieval to the reranker', async () => {
    const source = doc('withdrawn');
    const h = harness([source]);
    h.withdrawn.add(source.id);
    const result = await h.instance.retrieve('q', { ...options, useReranking: true });
    expect(result.documents).toEqual([]);
    expect(h.score).not.toHaveBeenCalled();
  });

  it('rechecks after reranking before missing candidate vectors are embedded', async () => {
    const sources = [doc('first'), doc('second'), doc('third')];
    const h = harness(sources);
    h.score.mockImplementationOnce(async (_q, candidates) => {
      h.withdrawn.add('first');
      return { scores: candidates.map(() => 1), tokensUsed: 0 };
    });
    await h.instance.retrieve('q', { ...options, useReranking: true, useMmr: true, limit: 1 });
    expect(h.embedBatch).toHaveBeenCalledOnce();
    expect(h.embedBatch.mock.calls[0][0]).toEqual([sources[1].content, sources[2].content]);
  });

  it('rechecks after MMR before compression and does not return stale grounding', async () => {
    const sources = [doc('first'), doc('second')];
    const h = harness(sources);
    h.embedBatch.mockImplementationOnce(async texts => {
      h.withdrawn.add('first');
      return texts.map(() => ({ embedding: [1, 0] }));
    });
    const result = await h.instance.retrieve('q', { ...options, useMmr: true, useCompression: true, limit: 1 });
    expect(result.documents).toEqual([]);
    expect(h.routeCached).not.toHaveBeenCalled();
  });

  it('does not publish compressed grounding withdrawn while compression awaited', async () => {
    const source = doc('first');
    const h = harness([source]);
    h.routeCached.mockImplementationOnce(async () => {
      h.withdrawn.add(source.id);
      return { content: 'Derived stale content', usage: { totalTokens: 1 } };
    });
    const result = await h.instance.retrieve('q', { ...options, useCompression: true });
    expect(result.documents).toEqual([]);
  });

  it('refuses generation when the returned retrieval snapshot is already withdrawn', async () => {
    const source = doc('first');
    const h = harness([source]);
    generation(h, [source]);
    h.withdrawn.add(source.id);
    const result = await h.instance.queryWithGeneration('q', options);
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain('could not find relevant information');
    expect(h.route).not.toHaveBeenCalled();
  });

  it('withholds the entire generated answer when one of its sources changes during generation', async () => {
    const sources = [doc('first'), doc('second')];
    const h = harness(sources);
    generation(h, sources);
    h.route.mockImplementationOnce(async () => {
      h.withdrawn.add('first');
      return { content: 'This answer uses the now withdrawn secret.' };
    });
    const result = await h.instance.queryWithGeneration('q', options);
    expect(result.sources).toEqual([]);
    expect(result.answer).toContain('could not find relevant information');
    expect(result.answer).not.toContain('withdrawn secret');
  });

  it('keeps stored text usable and marks retained data in the generation input', async () => {
    const source = doc('first');
    const h = harness([source]);
    generation(h, [source]);
    h.retained.add(source.id);
    const result = await h.instance.queryWithGeneration('q', options);
    expect(result.sources[0].originalFileAvailable).toBe(false);
    const request = h.route.mock.calls[0][0] as { messages: Array<{ content: string }> };
    expect(request.messages[1].content).toContain('original file unavailable; retained extracted data');
    expect(request.messages[1].content).toContain(source.content);
  });

  it('refuses on a failed policy lookup before a provider sees candidate content', async () => {
    const h = harness([doc('first')]);
    h.query.mockImplementationOnce(async () => { throw new Error('policy store unavailable'); });
    await expect(h.instance.retrieve('q', { ...options, useReranking: true })).rejects.toThrow('policy store unavailable');
    expect(h.score).not.toHaveBeenCalled();
  });
});

describe('batched candidate checks bind their actual corpus identities', () => {
  it('checks each corpus once, binds the atom project, and does not accept an identity mismatch', async () => {
    const sources = [doc('vault'), doc('rag', 'rag_chunk'), doc('atom', 'project_atom')];
    const h = harness(sources);
    const lookup = h.query.getMockImplementation()!;
    h.query.mockImplementation(async (sql, params) => sql.includes('FROM vault.document_chunks')
      ? { rows: [{ id: 'vault', document_id: 'wrong-document', title: 'Wrong source', original_file_available: true }] }
      : lookup(sql, params));
    const result = await h.instance.revalidateCandidates(sources, {
      ...options, artifactScope: { projectId: 17, organizationUuid: ORG }, organizationId: 42,
    });
    expect(result.map(d => d.id)).toEqual(['rag', 'atom']);
    expect(h.statements).toHaveLength(2); // vault override plus two recorded corpus batches
    expect(h.query.mock.calls.filter(([sql]) => /FROM (vault\.document_chunks|rag_chunks|lumen_data_atoms)/.test(sql))).toHaveLength(3);
    const atomQuery = h.statements.find(s => s.sql.includes('FROM lumen_data_atoms a'))!;
    expect(atomQuery.params).toEqual([['atom'], ORG, 17]);
    expect(atomQuery.sql).toContain('organization_id=a.organization_id');
    expect(atomQuery.sql).toContain('document_disposition_atom_references');
  });

  it('preserves database-verified public guidance without a tenant-wide fallback', async () => {
    const source = doc('guidance', 'rag_chunk');
    const h = harness([source]);
    const result = await h.instance.revalidateCandidates([source], { strategy: 'basic', corpus: 'rag_chunks' });
    expect(result.map(d => d.id)).toEqual(['guidance']);
    expect(h.statements[0].params).toEqual([['guidance'], null, null]);
    expect(h.statements[0].sql).toContain('d.organization_id IS NULL');
    expect(h.statements[0].sql).toContain('d.organization_id=$2::int');
  });

  it('refuses private sources without a valid tenant and rejects unknown corpus types', async () => {
    const h = harness([doc('private'), doc('unknown', 'unknown')]);
    const result = await h.instance.revalidateCandidates([doc('private'), doc('unknown', 'unknown')], { strategy: 'basic' });
    expect(result).toEqual([]);
    expect(h.query).not.toHaveBeenCalled();
  });
});
