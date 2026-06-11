import { describe, it, expect, vi } from 'vitest';
import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline';

// expandContext is exercised on the rag_chunk path (which uses this.pool.query
// directly); the vault path differs only in wrapping the same query in
// withTenantContext. We drive it via a prototype instance with a stub pool.
type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
type WithExpand = {
  pool: { query: QueryFn };
  expandContext(
    documents: RetrievedDocument[],
    window: number,
    organizationUuid?: string
  ): Promise<RetrievedDocument[]>;
};

function pipelineWith(query: QueryFn): WithExpand {
  const p = Object.create(AdvancedRAGPipeline.prototype) as WithExpand;
  p.pool = { query };
  return p;
}

function ragChunk(id: string, chunkIndex: number, documentId = 'doc-1'): RetrievedDocument {
  return {
    id,
    documentId,
    chunkId: id,
    content: `chunk-${id}`,
    title: 't',
    atomType: 'rag_chunk',
    initialScore: 0.6,
    finalScore: 0.6,
    chunkIndex,
  };
}

describe('AdvancedRAGPipeline.expandContext', () => {
  it('expands a rag_chunk to its ±window neighbours, joined in order', async () => {
    const query = vi.fn(async (_sql: string, _params?: unknown[]) => ({
      rows: [{ content: 'prev' }, { content: 'hit' }, { content: 'next' }],
    }));
    const p = pipelineWith(query);
    const out = await p.expandContext([ragChunk('c', 5)], 1);

    expect(out[0].expandedContent).toBe('prev\n\nhit\n\nnext');
    // window math: chunk_index BETWEEN idx-1 AND idx+1
    expect(query.mock.calls[0][1]).toEqual(['doc-1', 4, 6]);
    expect(out[0].content).toBe('chunk-c'); // original chunk content preserved
  });

  it('does not annotate when the window adds no neighbours (single row)', async () => {
    const query = vi.fn(async () => ({ rows: [{ content: 'only' }] }));
    const out = await pipelineWith(query).expandContext([ragChunk('c', 0)], 2);
    expect(out[0].expandedContent).toBeUndefined();
  });

  it('skips the query entirely when window <= 0', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const out = await pipelineWith(query).expandContext([ragChunk('c', 3)], 0);
    expect(query).not.toHaveBeenCalled();
    expect(out[0].expandedContent).toBeUndefined();
  });

  it('passes through documents without a chunk index (project atoms, memory)', async () => {
    const query = vi.fn(async () => ({ rows: [] }));
    const atom: RetrievedDocument = {
      id: 'a',
      content: 'x',
      title: 't',
      atomType: 'project_atom',
      initialScore: 0.5,
      finalScore: 0.5,
    };
    const out = await pipelineWith(query).expandContext([atom], 1);
    expect(query).not.toHaveBeenCalled();
    expect(out[0].expandedContent).toBeUndefined();
  });

  it('degrades to the bare chunk when the neighbour query fails', async () => {
    const query = vi.fn(async () => {
      throw new Error('db down');
    });
    const out = await pipelineWith(query).expandContext([ragChunk('c', 5)], 1);
    expect(out[0].expandedContent).toBeUndefined();
    expect(out[0].content).toBe('chunk-c'); // result is never dropped
  });
});
