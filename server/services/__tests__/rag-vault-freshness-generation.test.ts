import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AdvancedRAGPipeline, type RAGContext, type RetrievedDocument, type RetrievalOptions,
} from '../advancedRAGPipeline.js';
import type { AIRequest } from '../aiProviderRouter.js';
import { buildPassageContext } from '../vault/passage-context-span.js';

const ORG = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const ORIGINAL_HASH = 'a'.repeat(64);
const HIT = 'The device sensitivity was 94% in the prespecified population.';
const PREFIX = 'Validated diagnostics study. ';
const EXTRACTION = `${PREFIX}${HIT} The comparator was independently adjudicated.`;
const UPDATED_EXTRACTION = `${PREFIX}${HIT} The comparator was reclassified after review.`;
const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('hex');
const options: RetrievalOptions = { strategy: 'basic', organizationUuid: ORG, useContextExpansion: false };

// A local intersection keeps the fail-first tests compilable before the mapper
// adds this internal snapshot to RetrievedDocument. It is not a new test-only API.
type VaultCandidate = RetrievedDocument & {
  vaultPassageSnapshot?: { extractedTextSha256: string | null; charStart: number | null; charEnd: number | null };
};
function candidate(overrides: Partial<VaultCandidate> = {}): VaultCandidate {
  return {
    id: 'chunk-1', chunkId: 'chunk-1', documentId: 'document-1',
    programId: 'program-1', contentHash: ORIGINAL_HASH, atomType: 'vault_chunk',
    title: 'Diagnostics validation', content: HIT, initialScore: 1, finalScore: 1,
    vaultPassageSnapshot: {
      extractedTextSha256: sha256(EXTRACTION), charStart: PREFIX.length, charEnd: PREFIX.length + HIT.length,
    },
    ...overrides,
  };
}

/** SQL and provider replies are synthetic; generation and every fence are real. */
function harness(documents: VaultCandidate[]) {
  const current = new Map(documents.map(doc => [doc.id, {
    id: doc.id, document_id: doc.documentId, program_id: doc.programId,
    content_hash: doc.contentHash, title: doc.title, original_file_available: true,
    chunk_text: doc.content, char_start: PREFIX.length, char_end: PREFIX.length + HIT.length,
    extracted_text_sha256: sha256(EXTRACTION), chunk_in_extraction: true,
  }]));
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (!sql.includes('FROM vault.document_chunks')) return { rows: [] };
    const ids = params[0] as string[];
    return { rows: ids.flatMap(id => {
      const row = current.get(id);
      return row ? [{ ...row }] : [];
    }) };
  });
  const route = vi.fn(async (_request: AIRequest) => ({ content: 'Sensitivity was 94% [Source 1].' }));
  const routeCached = vi.fn(async (_request: AIRequest) => ({
    content: '{"sufficient":true,"grounded":true}', usage: { totalTokens: 2 },
  }));
  const context: RAGContext = {
    documents, totalCandidates: documents.length, retrievalStrategy: 'basic', tokensUsed: 0, processingTimeMs: 0,
  };
  const instance = Object.create(AdvancedRAGPipeline.prototype) as AdvancedRAGPipeline;
  const client = { query, release: vi.fn() };
  Object.assign(instance, {
    retrieve: vi.fn(async () => context), aiRouter: { route }, routeCached,
    pool: { query, connect: vi.fn(async () => client) },
  });
  const reextract = (id: string, text = UPDATED_EXTRACTION) => {
    const row = current.get(id);
    if (!row) throw new Error('Missing test source');
    row.extracted_text_sha256 = sha256(text);
    row.chunk_in_extraction = text.includes(row.chunk_text);
  };
  return { instance, route, routeCached, current, reextract };
}

function availableContext(text = EXTRACTION) {
  const result = buildPassageContext({
    documentId: 'document-1', contentHash: ORIGINAL_HASH, extractedText: text,
    hit: { chunkId: 'chunk-1', chunkIndex: 0 },
    chunks: [{ id: 'chunk-1', chunkIndex: 0, charStart: PREFIX.length, charEnd: PREFIX.length + HIT.length, text: HIT }],
  });
  expect(result.context.status).toBe('available');
  return result.context;
}

describe('Vault extraction freshness gates actual answer generation', () => {
  it('refuses an already stale retrieval snapshot before dispatching a generator', async () => {
    const h = harness([candidate()]);
    h.reextract('chunk-1'); // Original bytes, chunk ID and hit text all remain identical.
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', options);
    expect(result.sources).toEqual([]);
    expect(result.context.documents).toEqual([]);
    expect(result.answer).toContain('could not find relevant information');
    expect(h.route).not.toHaveBeenCalled();
  });

  it('refuses same-ID chunk text replacement even when original bytes and extraction hash match', async () => {
    const h = harness([candidate()]);
    h.current.get('chunk-1')!.chunk_text = 'The comparator was independently adjudicated.';
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', options);
    expect(result.sources).toEqual([]);
    expect(h.route).not.toHaveBeenCalled();
  });

  it('rechecks after the actual corrective grading await before answer generation', async () => {
    const h = harness([candidate()]);
    h.routeCached.mockImplementationOnce(async () => {
      h.reextract('chunk-1');
      return { content: '{"sufficient":true}', usage: { totalTokens: 2 } };
    });
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', { ...options, useCorrectiveLoop: true });
    expect(h.routeCached).toHaveBeenCalledOnce();
    expect(result.sources).toEqual([]);
    expect(h.route).not.toHaveBeenCalled();
  });

  it('withholds the entire answer when one source changes during generator dispatch', async () => {
    const h = harness([candidate(), candidate({ id: 'chunk-2', chunkId: 'chunk-2', documentId: 'document-2' })]);
    h.route.mockImplementationOnce(async () => {
      h.reextract('chunk-1');
      return { content: 'A stale answer combines both source documents.' };
    });
    const result = await h.instance.queryWithGeneration('Compare the studies', options);
    expect(h.route).toHaveBeenCalledOnce();
    expect(result.sources).toEqual([]);
    expect(result.context.documents).toEqual([]);
    expect(result.answer).not.toContain('A stale answer');
    expect(result.answer).toContain('could not find relevant information');
  });

  it('rechecks after the actual faithfulness await before returning the answer', async () => {
    const h = harness([candidate()]);
    h.routeCached.mockImplementationOnce(async () => ({ content: '{"sufficient":true}', usage: { totalTokens: 2 } }));
    h.routeCached.mockImplementationOnce(async () => {
      h.reextract('chunk-1');
      return { content: '{"grounded":true}', usage: { totalTokens: 2 } };
    });
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', { ...options, useCorrectiveLoop: true });
    expect(h.route).toHaveBeenCalledOnce();
    expect(h.routeCached).toHaveBeenCalledTimes(2);
    expect(result.sources).toEqual([]);
    expect(result.answer).not.toContain('Sensitivity was 94%');
  });

  it('rejects an obsolete available-context fingerprint even without expandedContent', async () => {
    const source = candidate({ passageContext: availableContext(UPDATED_EXTRACTION) });
    expect(source.expandedContent).toBeUndefined();
    const h = harness([source]);
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', options);
    expect(result.sources).toEqual([]);
    expect(h.route).not.toHaveBeenCalled();
  });

  it.each(['compressedContent', 'expandedContent'] as const)('refuses unpinned legacy %s rather than inventing a derivation basis', async field => {
    const source = candidate({ [field]: 'Unknown-basis derived clinical evidence.' });
    delete source.vaultPassageSnapshot;
    const h = harness([source]);
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', options);
    expect(result.sources).toEqual([]);
    expect(h.route).not.toHaveBeenCalled();
  });

  it.each(['compressedContent', 'expandedContent'] as const)('keeps unchanged pinned %s usable with the existing precedence', async field => {
    const derived = field === 'compressedContent' ? 'Sensitivity was 94%.' : `Verified context: ${HIT}`;
    const h = harness([candidate({ [field]: derived })]);
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', options);
    expect(h.route).toHaveBeenCalledOnce();
    expect(result.sources).toHaveLength(1);
    const request = h.route.mock.calls[0][0];
    expect(request.messages[1].content).toContain(derived);
    expect(result.answer).toBe('Sensitivity was 94% [Source 1].');
  });

  it('retains a current available-context reference when no expanded text is requested', async () => {
    const context = availableContext();
    const h = harness([candidate({ passageContext: context })]);
    const result = await h.instance.queryWithGeneration('What was the sensitivity?', options);
    expect(h.route).toHaveBeenCalledOnce();
    expect(result.sources[0].passageContext).toEqual(context);
    expect(result.sources[0].content).toBe(HIT);
  });
});
