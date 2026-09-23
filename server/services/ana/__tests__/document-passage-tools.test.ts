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

  it('gives the RECORDED reason a document failed to index, not just a count', async () => {
    // chunk_error has been written on every indexing failure since the ledger
    // existed and read by nothing, so a document whose passages could not be
    // built was indistinguishable from one nobody had reached — and "1 failed"
    // is a number nobody can act on.
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: {
        total: 4,
        indexed: 2,
        pending: 1,
        failed: 1,
        failureReasons: ['Embedding provider refused: 429 rate limited'],
      },
    });
    const out = await call({ query: 'assay at six months' });
    expect(out.message).toContain('1 failed to index');
    expect(out.message).toContain('429 rate limited');
  });

  it('does not invent a reason when none was recorded', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 4, indexed: 2, pending: 1, failed: 1, failureReasons: [] },
    });
    const out = await call({ query: 'assay at six months' });
    expect(out.message).toContain('1 failed to index');
    // No empty parenthetical where a reason would go. ('document(s)' elsewhere
    // in the note is why this is anchored to the clause rather than the string.)
    expect(out.message).not.toContain('failed to index (');
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

  it('an EMPTY index is reported as empty, not as a provider failure or a miss', async () => {
    // The state most deployments will actually be in: the catalog is on (free
    // at ingest) and the passage index is not (it embeds every upload). The
    // search used to embed the query first and fail at the provider, so the
    // tool reported "the embedding provider is unreachable" — infrastructure
    // blame for a switch being off. The service now answers from coverage
    // without embedding anything, and the message names the switch.
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 6, indexed: 0, pending: 6, failed: 0 },
    });
    const out = await call({ query: 'assay at six months' });
    expect(out.ok).toBe(true);
    expect(out.unavailable).toBeUndefined();
    expect(out.message).toContain('None of the 6 document(s)');
    expect(out.message).toContain('nothing was searched');
    expect(out.message).toContain('ana.vault_chunking');
    expect(out.message).not.toContain('embedding provider');
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

/**
 * The corpus is keyed to vault documents, so a file the client attached in chat
 * and never filed cannot be in it at all — `vault.document_chunks.document_id`
 * carries a hard foreign key to `vault.documents`. Its text reaches retrieval
 * only as one bounded-prefix atom, which holds the opening of the file and
 * cannot cite a page.
 *
 * The coverage line did not know that. It said "All 4 document(s) are in the
 * passage index" while the very file the question was about sat outside it, so
 * a miss read as an exhaustive search — the one thing this tool's coverage
 * reporting exists to prevent, for the one class of file most likely to be
 * asked about.
 */
describe('what it says about the files that are not in this index at all', () => {
  it('will not claim full coverage while chat uploads sit outside the corpus', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 4, indexed: 4, pending: 0, failed: 0, unfiledUploads: 3, unfiledUploadsMore: false },
    });
    const out = await call({ query: 'the primary endpoint' });
    expect(out.message).toContain('All 4 document(s) are in the passage index');
    expect(out.message).toContain('3 file(s) the client attached in chat are NOT in this index');
    expect(out.message).toContain('only the opening of each');
    expect(out.message).toContain('file_chat_upload_to_vault');
  });

  it('marks the count as a floor when there are more than it probed for', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 2, indexed: 1, pending: 1, failed: 0, unfiledUploads: 20, unfiledUploadsMore: true },
    });
    const out = await call({ query: 'the primary endpoint' });
    expect(out.message).toContain('20+ file(s)');
  });

  it('says nothing extra when there is nothing outside', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 4, indexed: 4, pending: 0, failed: 0, unfiledUploads: 0, unfiledUploadsMore: false },
    });
    const out = await call({ query: 'the primary endpoint' });
    expect(out.message).not.toContain('attached in chat');
  });

  it('an uncounted probe is reported as unchecked, never as zero', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 4, indexed: 4, pending: 0, failed: 0, unfiledUploads: null, unfiledUploadsMore: false },
    });
    const out = await call({ query: 'the primary endpoint' });
    expect(out.message).toContain('could not be checked');
  });

  it('covers an EMPTY vault too — no documents filed is not "nothing to search"', async () => {
    searchDocumentPassages.mockResolvedValue({
      hits: [],
      coverage: { total: 0, indexed: 0, pending: 0, failed: 0, unfiledUploads: 2, unfiledUploadsMore: false },
    });
    const out = await call({ query: 'the primary endpoint' });
    expect(out.message).toContain('No documents are filed in this vault yet');
    expect(out.message).toContain('2 file(s) the client attached in chat');
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
