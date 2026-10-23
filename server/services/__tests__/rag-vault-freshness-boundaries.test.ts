import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AdvancedRAGPipeline, type RetrievedDocument, type RetrievalOptions,
} from '../advancedRAGPipeline.js';
import type { AIRequest } from '../aiProviderRouter.js';

const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ORIGINAL_HASH = 'a'.repeat(64);
const options: RetrievalOptions = {
  strategy: 'basic', organizationUuid: ORG, useContextExpansion: false,
};
type PassageSnapshot = {
  extractedTextSha256: string | null; charStart: number | null; charEnd: number | null;
};
type VaultCandidate = RetrievedDocument & { vaultPassageSnapshot?: PassageSnapshot };
type CurrentRow = {
  id: string; document_id?: string; program_id?: string; content_hash?: string;
  title: string; original_file_available: boolean; chunk_text: string | null;
  char_start: number | null; char_end: number | null;
  extracted_text_sha256: string | null; chunk_in_extraction: boolean | null;
};
const sha = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const passage = (id: string): VaultCandidate => {
  const content = `Study ${id}: validated diagnostic sensitivity is 97 percent. `.repeat(20);
  return {
    id, chunkId: id, documentId: `document-${id}`, programId: 'programme', contentHash: ORIGINAL_HASH,
    atomType: 'vault_chunk', title: `Study ${id}`, content, initialScore: 0.8, finalScore: 0.8,
    vaultPassageSnapshot: { extractedTextSha256: sha(content), charStart: 0, charEnd: content.length },
  };
};

/** SQL/provider seams are synthetic; retrieve, reranking, MMR, compression and all fences are production. */
function harness(documents: VaultCandidate[]) {
  const current = new Map<string, CurrentRow>(documents.map(d => [d.id, {
    id: d.id, document_id: d.documentId, program_id: d.programId, content_hash: d.contentHash,
    title: d.title, original_file_available: true, chunk_text: d.content,
    char_start: d.vaultPassageSnapshot?.charStart ?? null,
    char_end: d.vaultPassageSnapshot?.charEnd ?? null,
    extracted_text_sha256: d.vaultPassageSnapshot?.extractedTextSha256 ?? sha(d.content),
    chunk_in_extraction: true,
  }]));
  const statements: string[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (!/FROM (vault\.document_chunks|rag_chunks|lumen_data_atoms)/.test(sql)) return { rows: [] };
    statements.push(sql);
    const ids = params[0] as string[];
    return { rows: ids.flatMap(id => { const row = current.get(id); return row ? [{ ...row }] : []; }) };
  });
  const score = vi.fn(async (_question: string, candidates: Array<{ content: string }>) => ({
    scores: candidates.map(() => 1), tokensUsed: 0,
  }));
  const embedBatch = vi.fn(async (texts: string[]) => texts.map(() => ({ embedding: [1, 0] })));
  const routeCached = vi.fn(async (_request: AIRequest) => ({
    content: 'Cached compressed passage', usage: { totalTokens: 1 }, cached: true,
  }));
  const client = { query, release: vi.fn() };
  const instance = Object.create(AdvancedRAGPipeline.prototype) as AdvancedRAGPipeline;
  Object.assign(instance, {
    pool: { query, connect: vi.fn(async () => client) }, reranker: { name: 'controlled', score },
    embeddingService: { embedBatch }, routeCached,
    retrieveCandidates: vi.fn(async () => ({ candidates: documents, tokensUsed: 0, retrievalStrategy: 'basic' })),
  });
  const update = (id: string, patch: Partial<CurrentRow>) => {
    const row = current.get(id);
    if (!row) throw new Error('Unknown fixture source');
    current.set(id, { ...row, ...patch });
  };
  return { instance, current, update, score, embedBatch, routeCached, query, statements };
}

describe('Vault freshness before the first text provider, with context expansion disabled', () => {
  it('rejects a changed extraction basis even when the own hit text still survives', async () => {
    const source = passage('first');
    const h = harness([source]);
    h.update(source.id, { extracted_text_sha256: sha(`${source.content} Corrected neighboring OCR.`) });
    const result = await h.instance.retrieve('sensitivity?', { ...options, useReranking: true });
    expect(result.documents).toEqual([]);
    expect(h.score).not.toHaveBeenCalled();
    expect(h.embedBatch).not.toHaveBeenCalled();
    expect(h.routeCached).not.toHaveBeenCalled();
  });

  it('rejects a previously indexed own text absent from the current extraction', async () => {
    const source = passage('old-index');
    const h = harness([source]);
    // Both the candidate and the row were selected after re-extraction; their hashes agree.
    h.update(source.id, { chunk_in_extraction: false });
    const result = await h.instance.retrieve('sensitivity?', { ...options, useReranking: true });
    expect(result.documents).toEqual([]);
    expect(h.score).not.toHaveBeenCalled();
  });

  it('rejects same-ID chunk text replacement without refreshing old ranked content', async () => {
    const source = passage('same-id');
    const h = harness([source]);
    h.update(source.id, { chunk_text: 'The current same-ID row contains a different passage.' });
    const result = await h.instance.retrieve('sensitivity?', { ...options, useReranking: true });
    expect(result.documents).toEqual([]);
    expect(h.score).not.toHaveBeenCalled();
  });

  it.each(['expandedContent', 'compressedContent'] as const)('refuses unpinned derived %s before reranking', async field => {
    const source = passage('unknown-basis');
    delete source.vaultPassageSnapshot;
    source[field] = 'Derived text with no retained extraction basis.';
    const h = harness([source]);
    const result = await h.instance.retrieve('sensitivity?', { ...options, useReranking: true });
    expect(result.documents).toEqual([]);
    expect(h.score).not.toHaveBeenCalled();
  });
});

describe('Vault freshness after asynchronous transformations', () => {
  it('rechecks after reranking before embedding candidates for MMR', async () => {
    const sources = [passage('first'), passage('second'), passage('third')];
    const h = harness(sources);
    h.score.mockImplementationOnce(async (_query, candidates) => {
      h.update('first', { extracted_text_sha256: sha('Corrected extraction with the original hit retained elsewhere.') });
      return { scores: candidates.map(() => 1), tokensUsed: 0 };
    });
    const result = await h.instance.retrieve('sensitivity?', {
      ...options, useReranking: true, useMmr: true, limit: 1,
    });
    expect(h.embedBatch).toHaveBeenCalledOnce();
    expect(h.embedBatch.mock.calls[0][0]).toEqual([sources[1].content, sources[2].content]);
    expect(result.documents.map(d => d.id)).toEqual(['second']);
  });

  it('rechecks after MMR before sending a selected source to compression', async () => {
    const sources = [passage('first'), passage('second')];
    const h = harness(sources);
    h.embedBatch.mockImplementationOnce(async texts => {
      h.update('first', { chunk_text: 'Replacement passage under the same chunk ID.' });
      return texts.map(() => ({ embedding: [1, 0] }));
    });
    const result = await h.instance.retrieve('sensitivity?', {
      ...options, useMmr: true, useCompression: true, limit: 1,
    });
    expect(h.embedBatch).toHaveBeenCalledOnce();
    expect(result.documents).toEqual([]);
    expect(h.routeCached).not.toHaveBeenCalled();
  });

  it('does not return cached compression when the extraction changes during its await', async () => {
    const source = passage('cached');
    const h = harness([source]);
    h.routeCached.mockImplementationOnce(async () => {
      h.update(source.id, { extracted_text_sha256: sha(`${source.content} Corrected outside-hit text.`) });
      return { content: 'Old cached diagnostic claim', usage: { totalTokens: 1 }, cached: true };
    });
    const result = await h.instance.retrieve('sensitivity?', { ...options, useCompression: true });
    expect(h.routeCached).toHaveBeenCalledOnce();
    expect(result.documents).toEqual([]);
  });

  it('rejects changed coordinates after compression even with unchanged text and extraction', async () => {
    const source = passage('coordinates');
    const h = harness([source]);
    h.routeCached.mockImplementationOnce(async () => {
      h.update(source.id, { char_start: 10, char_end: source.content.length + 10 });
      return { content: 'Derived passage before coordinate replacement', usage: { totalTokens: 1 }, cached: true };
    });
    const result = await h.instance.retrieve('sensitivity?', { ...options, useCompression: true });
    expect(h.routeCached).toHaveBeenCalledOnce();
    expect(result.documents).toEqual([]);
  });
});

describe('unchanged retrieval and other corpora remain usable', () => {
  it('keeps unchanged own text through real reranking, MMR and cached compression', async () => {
    const sources = [passage('first'), passage('second')];
    const h = harness(sources);
    const result = await h.instance.retrieve('sensitivity?', {
      ...options, useReranking: true, useMmr: true, useCompression: true, limit: 1,
    });
    expect(h.score).toHaveBeenCalledOnce();
    expect(h.embedBatch).toHaveBeenCalledOnce();
    expect(h.routeCached).toHaveBeenCalledOnce();
    expect(h.routeCached.mock.calls[0][0].messages[1].content).toContain(sources[0].content);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].content).toBe(sources[0].content);
    expect(result.documents[0].compressedContent).toBe('Cached compressed passage');
    expect(result.documents[0].contentHash).toBe(ORIGINAL_HASH);
  });

  it('keeps a current plain legacy hit and pins the checked basis before later work', async () => {
    const source = passage('legacy');
    delete source.vaultPassageSnapshot;
    const h = harness([source]);
    const result = await h.instance.retrieve('sensitivity?', options);
    expect(result.documents).toHaveLength(1);
    expect(result.documents[0].content).toBe(source.content);
    expect(result.documents[0]).toMatchObject({ vaultPassageSnapshot: {
      extractedTextSha256: sha(source.content), charStart: null, charEnd: null,
    } });
    expect(h.score).not.toHaveBeenCalled();
    expect(h.embedBatch).not.toHaveBeenCalled();
    expect(h.routeCached).not.toHaveBeenCalled();
  });

  it('does not apply Vault extraction rules to guidance, project atoms or memories', async () => {
    const documents = ['rag_chunk', 'project_atom', 'client_memory', 'project_memory'].map(atomType => ({
      ...passage(atomType), atomType,
    }));
    const h = harness(documents);
    for (const source of documents) {
      h.update(source.id, { chunk_text: null, chunk_in_extraction: false, extracted_text_sha256: null });
    }
    const result = await h.instance.retrieve('sensitivity?', { ...options, organizationId: 42 });
    expect(result.documents.map(d => d.id)).toEqual(documents.map(d => d.id));
    expect(h.statements.some(sql => sql.includes('FROM vault.document_chunks'))).toBe(false);
    expect(h.statements.some(sql => sql.includes('FROM rag_chunks'))).toBe(true);
    expect(h.statements.some(sql => sql.includes('FROM lumen_data_atoms'))).toBe(true);
  });
});
