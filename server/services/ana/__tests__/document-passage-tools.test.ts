/**
 * search_document_passages — a miss must never read as an absence.
 *
 * ── The gap it closes ────────────────────────────────────────────────────────
 * Every vault upload is chunked and embedded into vault.document_chunks, and
 * the legacy backlog was swept into it. Nothing AnA could call ever read it:
 * project_knowledge_search scopes to project ATOMS, and the only readers of the
 * vault corpus were the Cortex route and the RAG eval harness. So the passages
 * of the client's own evidence were indexed and unreachable — the same shape as
 * the defect that created them, with the halves swapped.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * The judgement, not the retrieval (the corpus and its tenant predicate are the
 * pipeline's, proven there):
 *   • a hit carries the passage AND where it came from, so it can be cited;
 *   • an empty result states how much of the vault is NOT indexed, because "no
 *     passage matched" over a partly-indexed corpus is a different claim from
 *     "the evidence does not say that";
 *   • an unavailable index is reported as unavailable, with an instruction not
 *     to report absence — never as zero passages;
 *   • no tenant identity on the request is an unavailability, not a miss.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';

const searchDocumentPassages = vi.hoisted(() => vi.fn());

class FakeUnavailable extends Error {
  constructor(reason: string) {
    super(`Passage search is unavailable: ${reason}`);
    this.name = 'PassageSearchUnavailableError';
  }
}

vi.mock('../../vault/document-passage-search.js', () => ({
  searchDocumentPassages,
  PassageSearchUnavailableError: FakeUnavailable,
}));
vi.mock('../../vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: vi.fn(async () => true),
}));

import { registerDocumentPassageHandlers } from '../document-passage-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentPassageHandlers((name, fn) => handlers.set(name, fn));

const CTX: ToolContext = {
  organizationId: 42,
  organizationUuid: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  userId: 7,
};

async function callAs(ctx: ToolContext | undefined, input: Record<string, unknown>) {
  const h = handlers.get('search_document_passages');
  if (!h) throw new Error('search_document_passages is not registered');
  return JSON.parse(await h(input, ctx));
}
const call = (input: Record<string, unknown>) => callAs(CTX, input);

/* Block body, deliberately. An expression-bodied `beforeEach(() =>
   mock.mockReset())` RETURNS the mock instance, which vitest awaits — and a
   mock whose last recorded result was a rejection then surfaces that rejection
   as an unhandled error, failing tests whose subject handled it correctly. */
beforeEach(() => {
  searchDocumentPassages.mockReset();
});

describe('what it returns on a hit', () => {
  it('hands back the passage with the document and locator that make it citable', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [
        {
          documentId: '00000000-0000-4000-8000-000000000001',
          documentTitle: '28-Day Rat Tox Report',
          locator: 'p.41 · 7.2 Results',
          pageNumber: 41,
          sectionTitle: '7.2 Results',
          chunkIndex: 12,
          text: 'No treatment-related mortality was observed at any dose level.',
          similarity: 0.83,
        },
      ],
      coverage: { total: 4, indexed: 4, pending: 0, failed: 0 },
    });
    const out = await call({ query: 'mortality at the high dose' });
    expect(out.ok).toBe(true);
    expect(out.passages).toHaveLength(1);
    expect(out.passages[0].text).toContain('No treatment-related mortality');
    expect(out.passages[0].locator).toBe('p.41 · 7.2 Results');
    expect(out.message).toContain('All 4 document(s) are in the passage index');
    expect(searchDocumentPassages).toHaveBeenCalledWith(
      { organizationId: 42, organizationUuid: CTX.organizationUuid, query: 'mortality at the high dose' },
      { limit: 8 },
    );
  });

  it('caps the requested limit rather than passing it through', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 1, indexed: 1, pending: 0, failed: 0 },
    });
    await call({ query: 'anything', limit: 500 });
    expect(searchDocumentPassages.mock.calls[0][1]).toEqual({ limit: 25 });
  });
});

describe('what it says when it finds nothing', () => {
  it('states how much of the vault is NOT indexed, and refuses to call it absence', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 10, indexed: 3, pending: 6, failed: 1 },
    });
    const out = await call({ query: 'six month assay' });
    expect(out.ok).toBe(true);
    expect(out.passages).toEqual([]);
    expect(out.message).toContain('3 of 10');
    expect(out.message).toContain('6 not indexed yet');
    expect(out.message).toContain('1 failed to index');
    expect(out.message).toContain('not evidence the document does not say it');
    expect(out.message).toContain('read_project_document');
  });

  it('says the coverage is unknown rather than implying it searched everything', async () => {
    // A ledger read that fails must not take the search down, and must not
    // quietly become "all indexed" — the passages are still worth returning,
    // with the caveat attached.
    searchDocumentPassages.mockResolvedValue({
      hits: [
        {
          documentId: null,
          documentTitle: 'Stability summary',
          locator: null,
          pageNumber: null,
          sectionTitle: null,
          chunkIndex: 0,
          text: 'Assay at six months was 98.4 percent.',
          similarity: 0.7,
        },
      ],
      coverage: null,
    });
    const out = await call({ query: 'assay at six months' });
    expect(out.ok).toBe(true);
    expect(out.passages).toHaveLength(1);
    expect(out.message).toContain('could not be read');
    expect(out.message).not.toContain('All ');
  });

  it('says plainly when the vault holds no documents at all', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 0, indexed: 0, pending: 0, failed: 0 },
    });
    const out = await call({ query: 'anything at all' });
    expect(out.message).toContain('No documents are filed in this vault yet');
  });
});

describe('what it says when it could not look', () => {
  it('reports an unavailable index as unavailable, not as zero passages', async () => {
    // mockImplementation, not mockRejectedValue: the latter constructs the
    // rejected promise at setup time, which vitest reports as an unhandled
    // rejection before the handler ever awaits it.
    searchDocumentPassages.mockImplementation(async () => {
      throw new FakeUnavailable('the embedding provider is unreachable');
    });
    const out = await call({ query: 'stability at 6 months' });
    expect(out.ok).toBe(false);
    expect(out.unavailable).toBe(true);
    expect(out.error).toContain('embedding provider is unreachable');
    expect(out.message).toContain('Do not report that the documents do not mention it');
  });

  it('turns an unexpected failure into a stated error, never a silent empty', async () => {
    searchDocumentPassages.mockImplementation(async () => {
      throw new Error('connection reset');
    });
    const out = await call({ query: 'stability at 6 months' });
    expect(out.error).toContain('connection reset');
    expect(out.passages).toBeUndefined();
  });

  it('refuses a query too short to retrieve on', async () => {
    const out = await call({ query: 'x' });
    expect(out.error).toContain('at least 3 characters');
    expect(searchDocumentPassages).not.toHaveBeenCalled();
  });

  it('requires an organization context', async () => {
    // Passed positionally rather than as a default-triggering `undefined`.
    const out = await callAs(undefined, { query: 'anything' });
    expect(out.error).toContain('organization context');
    expect(searchDocumentPassages).not.toHaveBeenCalled();
  });
});
