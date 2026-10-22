/**
 * search_document_passages fits its own result under the model-facing cap
 * (docs/evidence/D2-PASSAGE-CONTEXT/2026-10-19/CONTRACT.md, Amendment A).
 *
 * Written from the contract alone, through the same seam as
 * document-passage-tools.test.ts: catalogScope and searchDocumentPassages are
 * replaced, and the registered handler renders what they return.
 *
 * ── Why ──────────────────────────────────────────────────────────────────────
 * capToolResultForModel cuts any tool result over 8,000 characters, keeping its
 * head and tail. A hit now carries its chunk (up to ~4,000 characters) and a
 * context span (up to ~6,000) that repeats the chunk, and the default limit is
 * 8: left alone, the cut would leave the model about one hit, cut mid-text.
 * The P-24 rule is that a handler fits its own result instead.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 *   • PASSAGE_RESULT_BUDGET is 7,500 and no serialized result exceeds it;
 *   • rank order holds, and a dropped passage is always the lowest-ranked one;
 *   • an available context is sent once: `text` is omitted and
 *     context.hitWithinText locates the hit inside context.text;
 *   • three passes, each complete before the next, lowest rank first:
 *     (1) context.text goes and the hit's text comes back (context.textOmitted),
 *     (2) the hit's text goes (textOmitted), (3) whole passages go from the end
 *     (omittedPassages), including the last if its complete locator cannot fit;
 *   • reference, chunkRange, clipped, hitSpan and locators are never dropped
 *     from a passage that is kept;
 *   • the message routes to read_project_document by the reference's offsets
 *     when text was left out, and asks for a smaller limit or a narrower query
 *     when passages were.
 * Controls: the ok:false / unavailable / refusal paths are unchanged.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';
import { draftSourceIdentityForText } from '../draft-source-identity.js';

const searchDocumentPassages = vi.hoisted(() => vi.fn());
const scope = vi.hoisted(() => ({ read: vi.fn(), db: { query: vi.fn() } }));
vi.mock('../catalog-scope.js', () => ({ catalogScope: scope.read }));

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
vi.mock('../../vault/document-catalog.service.js', async () => ({
  withAnaSourceReadScope: (await import('./support/source-read-tool-fixture.js')).syntheticReadWrapper,
  isDocumentCatalogEnabled: vi.fn(async () => true),
}));

import { PASSAGE_RESULT_BUDGET, registerDocumentPassageHandlers } from '../document-passage-tools.js';

/** The contract's figure, restated: the size checks must not lean on the export they also verify. */
const BUDGET = 7500;

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentPassageHandlers((name, fn) => handlers.set(name, fn));

const CTX: ToolContext = {
  organizationId: 42,
  organizationUuid: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
  userId: 7,
  sqlClient: scope.db,
};

// ── Synthetic hits, shaped like PassageHit ───────────────────────────────────

interface Span { start: number; end: number }
interface Reference {
  documentId: string; contentHash: string; span: Span & { totalChars: number };
  version: 2; extractedTextSha256: string; spanSha256: string;
}
type Context =
  | { status: 'available'; text: string; reference: Reference; chunkRange: [number, number]; clipped: boolean }
  | { status: 'unavailable'; reason: string };
interface Hit {
  documentId: string | null; documentTitle: string; locator: string | null; pageNumber: number | null;
  sectionTitle: string | null; chunkIndex: number | null; text: string; similarity: number;
  contentHash: string | null; hitSpan: Span | null; context: Context;
}
type Rendered = Record<string, any>;

const uuidFor = (rank: number) => `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`;
const hashFor = (rank: number) => rank.toString(16).padStart(2, '0').repeat(32);

/** Unique words, so every slice of one document is distinguishable from every other. */
function sourceText(rank: number, length: number): string {
  const words: string[] = [];
  let size = 0;
  for (let i = 0; size < length; i++) {
    const word = `r${rank}w${i.toString(36).padStart(4, '0')}`;
    words.push(word);
    size += word.length + 1;
  }
  return words.join(' ').slice(0, length);
}

function located(rank: number) {
  return {
    documentId: uuidFor(rank), documentTitle: `Study report ${rank}`, locator: `p.${rank} · 7.${rank} Results`,
    pageNumber: rank, sectionTitle: `7.${rank} Results`, chunkIndex: rank + 4,
    similarity: Number((0.95 - rank * 0.01).toFixed(2)), contentHash: hashFor(rank),
  };
}

/** A hit whose context is one exact span of its document, with the hit inside it. */
function available(rank: number, contextChars: number, hitChars: number): Hit {
  const source = sourceText(rank, contextChars + 3000);
  const span = { start: 1500, end: 1500 + contextChars, totalChars: source.length };
  const hitStart = span.start + Math.floor((contextChars - hitChars) / 2);
  const hitSpan = { start: hitStart, end: hitStart + hitChars };
  return {
    ...located(rank),
    text: source.slice(hitSpan.start, hitSpan.end),
    hitSpan,
    context: {
      status: 'available',
      text: source.slice(span.start, span.end),
      reference: { documentId: uuidFor(rank), contentHash: hashFor(rank), span, ...draftSourceIdentityForText(source, span) },
      chunkRange: [rank + 3, rank + 5],
      clipped: true,
    },
  };
}

function unavailable(rank: number, textChars: number, reason = 'no_offsets'): Hit {
  return { ...located(rank), text: sourceText(rank, textChars), hitSpan: null, context: { status: 'unavailable', reason } };
}

/** A hit retrieval could not expand at all: no document, no index (expandContext passes it through). */
function unexpanded(rank: number, textChars: number): Hit {
  return {
    documentId: null, documentTitle: `Annex ${rank}`, locator: null, pageNumber: null, sectionTitle: null,
    chunkIndex: null, text: sourceText(rank, textChars), similarity: 0.5, contentHash: null, hitSpan: null,
    context: { status: 'unavailable', reason: 'not_expanded' },
  };
}

const COVERAGE = {
  total: 30, indexed: 30, pending: 0, failed: 0, failureReasons: [], unfiledUploads: 0, unfiledUploadsMore: false,
};

async function render(hits: Hit[], input: Record<string, unknown> = {}) {
  searchDocumentPassages.mockResolvedValue({ hits, coverage: COVERAGE, ranking: 'meaning_and_text' });
  const handler = handlers.get('search_document_passages');
  if (!handler) throw new Error('search_document_passages is not registered');
  const raw = await handler({ query: 'primary endpoint responder rate', limit: hits.length, ...input }, CTX);
  return { raw, out: JSON.parse(raw) as Record<string, any> };
}

const contextTextOf = (h: Hit) => (h.context.status === 'available' ? h.context.text : undefined);
const contextTextDropped = (p: Rendered) => p.context?.status === 'available' && p.context.text === undefined;
const textDropped = (p: Rendered) => p.text === undefined && p.textOmitted === true;
/** The indices where `flag` holds form a suffix of `[0, n)`. */
function isSuffix(flags: boolean[]): boolean {
  const first = flags.indexOf(true);
  return first < 0 || flags.slice(first).every(Boolean);
}

/** Everything the contract says about any fitted result, whatever pass it needed. */
function expectFitted(hits: Hit[], raw: string, out: Record<string, any>): Rendered[] {
  expect(raw.length).toBeLessThanOrEqual(BUDGET);
  expect(out.ok).toBe(true);
  const passages = out.passages as Rendered[];
  const omitted = Number(out.omittedPassages ?? 0);
  expect(passages.length).toBeGreaterThanOrEqual(1);
  // Pass 3 drops from the end: what is kept is the top of the ranking, in order.
  expect(passages.length + omitted).toBe(hits.length);

  passages.forEach((p, i) => {
    const h = hits[i];
    for (const key of ['documentId', 'documentTitle', 'locator', 'pageNumber', 'sectionTitle', 'chunkIndex', 'contentHash'] as const) {
      expect(p[key]).toEqual(h[key]);
    }
    expect(p.hitSpan ?? null).toEqual(h.hitSpan);
    expect(p.context.status).toBe(h.context.status);
    if (p.text !== undefined) expect(p.text).toBe(h.text);
    if (h.context.status === 'available') {
      expect(p.context.reference).toEqual(h.context.reference);
      expect(p.context.chunkRange).toEqual(h.context.chunkRange);
      expect(p.context.clipped).toBe(h.context.clipped);
      if (p.context.text !== undefined) {
        // Sent once: the hit is inside context.text, located by hitWithinText.
        expect(p.context.text).toBe(h.context.text);
        expect(p.text).toBeUndefined();
        const within = { start: h.hitSpan!.start - h.context.reference.span.start, end: h.hitSpan!.end - h.context.reference.span.start };
        expect(p.context.hitWithinText).toEqual(within);
        expect(p.context.text.slice(p.context.hitWithinText.start, p.context.hitWithinText.end)).toBe(h.text);
      } else {
        expect(p.context.textOmitted).toBe(true);
        // Pass 1 restores the hit's text; only pass 2 takes it away.
        if (p.text === undefined) expect(p.textOmitted).toBe(true);
      }
    } else {
      expect(p.context.reason).toBe(h.context.reason);
      if (p.text === undefined) expect(p.textOmitted).toBe(true);
    }
  });

  // Lowest rank first, within each pass.
  const avail = passages.filter(p => p.context.status === 'available');
  expect(isSuffix(avail.map(contextTextDropped))).toBe(true);
  expect(isSuffix(passages.map(textDropped))).toBe(true);
  // Each pass completes before the next begins.
  if (passages.some(textDropped)) expect(avail.every(contextTextDropped)).toBe(true);
  if (omitted > 0) {
    expect(passages.every(textDropped)).toBe(true);
    expect(avail.every(contextTextDropped)).toBe(true);
  }

  const message = String(out.message);
  if (passages.some(p => contextTextDropped(p) || textDropped(p))) {
    expect(message).toContain('read_project_document');
    expect(message).toMatch(/offset/);
    expect(message).toMatch(/max_chars/);
  }
  if (omitted > 0) {
    expect(message).toMatch(/limit/);
    expect(message).toMatch(/narrow/i);
  }
  return passages;
}

beforeEach(() => {
  searchDocumentPassages.mockReset();
  scope.read.mockResolvedValue({ programId: null, executor: scope.db, accessibleScope: {
    scope: 'verified-accessible-programs', actor: { userId: 7, role: 'member' },
    programIds: [], reconciliationRequired: false,
  }, admittedScope: { organizationId: 42, userId: 7, role: 'member', projectId: null, programId: null,
    accessibleProgramIds: [], actorFiltered: true } });
});

describe('the budget', () => {
  it('is 7,500 characters: under the 8,000-character cap, so the cap never cuts this result', () => {
    expect(PASSAGE_RESULT_BUDGET).toBe(7500);
  });

  const range = (from: number, n: number) => Array.from({ length: n }, (_, i) => from + i);
  it.each([
    ['the default limit, every context available (~6,000 + a ~4,000 chunk)', () => range(1, 8).map(r => available(r, 6000, 4000))],
    ['8 hits, available and ~4,000-character unavailable alternating', () => range(1, 8).map(r => (r % 2 ? available(r, 6000, 4000) : unavailable(r, 4000)))],
    ['8 hits, every context unavailable (~4,000-character text)', () => range(1, 8).map(r => unavailable(r, 4000, r % 2 ? 'no_offsets' : 'basis_mismatch'))],
    ['12 hits, mostly short contexts', () => range(1, 12).map(r => (r % 3 ? available(r, 1800, 600) : unavailable(r, 900)))],
    ['the maximum limit, every context available', () => range(1, 25).map(r => available(r, 6000, 4000))],
    ['the maximum limit, mixed', () => range(1, 25).map(r => (r % 3 === 0 ? unexpanded(r, 4000) : r % 2 ? available(r, 6000, 4000) : unavailable(r, 4000)))],
  ])('%s: within the budget, in rank order, nothing load-bearing dropped', async (_label, make) => {
    const hits = make();
    const { raw, out } = await render(hits);
    expectFitted(hits, raw, out);
  });
});

describe('the three passes, lowest rank first', () => {
  it('pass 1 alone: the lowest-ranked contexts lose their text first and get the hit back; the top keeps its context', async () => {
    // r1 has the LARGEST context, so dropping by size (or from the top) would take it first.
    const hits = [available(1, 1100, 100), available(2, 1050, 100), available(3, 1050, 100),
      unexpanded(4, 40), unexpanded(5, 40), unexpanded(6, 40), unexpanded(7, 40), unexpanded(8, 40)];
    const { raw, out } = await render(hits);
    const passages = expectFitted(hits, raw, out);
    expect(passages).toHaveLength(8);
    expect(passages[0].context.text).toBe(contextTextOf(hits[0]));
    expect(passages[0].text).toBeUndefined();
    expect(contextTextDropped(passages[2])).toBe(true);
    expect(passages[2].context.textOmitted).toBe(true);
    expect(passages[2].text).toBe(hits[2].text);
    // Pass 2 and pass 3 were not needed.
    expect(passages.some(p => p.textOmitted === true)).toBe(false);
    expect(passages.slice(3).map(p => p.text)).toEqual(hits.slice(3).map(h => h.text));
    expect(Number(out.omittedPassages ?? 0)).toBe(0);
  });

  it('pass 2 starts only once every passage has lost its context text, and takes hit text from the bottom up', async () => {
    // r1's context would fit on its own; pass 1 must still finish (r1 included) before any text goes.
    const hits = [available(1, 1500, 200), ...Array.from({ length: 9 }, (_, i) => unavailable(i + 2, 1500))];
    const { raw, out } = await render(hits);
    const passages = expectFitted(hits, raw, out);
    expect(passages).toHaveLength(10);
    expect(contextTextDropped(passages[0])).toBe(true);
    expect(passages[0].context.textOmitted).toBe(true);
    expect(passages[0].text).toBe(hits[0].text);
    expect(textDropped(passages[9])).toBe(true);
    expect(passages[9].context).toEqual(hits[9].context);
    expect(Number(out.omittedPassages ?? 0)).toBe(0);
  });

  it('pass 3 drops whole passages from the end, counts them, and keeps the top ones', async () => {
    const hits = Array.from({ length: 25 }, (_, i) => available(i + 1, 6000, 4000));
    const { raw, out } = await render(hits);
    const passages = expectFitted(hits, raw, out);
    expect(passages.length).toBeLessThan(25);
    expect(out.omittedPassages).toBe(25 - passages.length);
    expect(passages.map(p => p.documentId)).toEqual(hits.slice(0, passages.length).map(h => h.documentId));
  });

  it('omits every passage when even the top complete locator cannot fit, and says matches existed', async () => {
    // Titles stay exact. An oversized final locator is omitted whole, never cut.
    const hits = [1, 2, 3].map(r => ({ ...unavailable(r, 4000), documentTitle: `Study report ${r} `.padEnd(8000, '.') }));
    const { raw, out } = await render(hits);
    expect(raw.length).toBeLessThanOrEqual(PASSAGE_RESULT_BUDGET);
    expect(out.ok).toBe(true);
    expect(out.passages).toEqual([]);
    expect(out.omittedPassages).toBe(3);
    expect(out.message).toMatch(/match/i);
    expect(out.message).not.toContain('No passage matched');
  });
});

describe('a result that already fits', () => {
  it('is unchanged except that an available context is not sent twice', async () => {
    const hits = [available(1, 600, 200), unavailable(2, 300)];
    const { raw, out } = await render(hits);
    expectFitted(hits, raw, out);
    const [first, second] = hits;
    if (first.context.status !== 'available' || !first.hitSpan) throw new Error('fixture');
    const firstWithoutText: Partial<Hit> = { ...first };
    delete firstWithoutText.text;
    const base = first.context.reference.span.start;
    expect(out.passages).toEqual([
      { ...firstWithoutText, context: { ...first.context, hitWithinText: { start: first.hitSpan.start - base, end: first.hitSpan.end - base } } },
      second,
    ]);
    expect(Number(out.omittedPassages ?? 0)).toBe(0);
    expect(out.coverage).toEqual(COVERAGE);
    expect(out.ranking).toBe('meaning_and_text');
    expect(out.message).toContain('context.text');
  });
});

describe('controls: the paths that return no passages are unchanged', () => {
  it('a miss is still a miss with its coverage note', async () => {
    const { out } = await render([]);
    expect(out.ok).toBe(true);
    expect(out.passages).toEqual([]);
    expect(out.message).toContain('No passage matched');
    expect(out.message).toContain('All 30 document(s) are in the passage index');
  });

  it('an unavailable index is reported as unavailable, not as zero passages', async () => {
    searchDocumentPassages.mockImplementation(async () => {
      throw new FakeUnavailable('the embedding provider is unreachable');
    });
    const handler = handlers.get('search_document_passages')!;
    const out = JSON.parse(await handler({ query: 'stability at 6 months' }, CTX));
    expect(out.ok).toBe(false);
    expect(out.unavailable).toBe(true);
    expect(out.error).toContain('embedding provider is unreachable');
    expect(out.message).toContain('Do not report that the documents do not mention it');
    expect(out.passages).toBeUndefined();
  });

  it('a scope refusal is returned as it was', async () => {
    scope.read.mockResolvedValue({ error: 'Open the source’s project to work with it.', code: 'CROSS_PROJECT' });
    const handler = handlers.get('search_document_passages')!;
    const out = JSON.parse(await handler({ query: 'stability at 6 months' }, CTX));
    expect(out).toEqual({ ok: false, error: 'Open the source’s project to work with it.', code: 'CROSS_PROJECT' });
    expect(searchDocumentPassages).not.toHaveBeenCalled();
  });

  it('an unexpected failure is a stated error, never a silent empty', async () => {
    searchDocumentPassages.mockImplementation(async () => {
      throw new Error('connection reset');
    });
    const handler = handlers.get('search_document_passages')!;
    const out = JSON.parse(await handler({ query: 'stability at 6 months' }, CTX));
    expect(out).toMatchObject({ ok: false, code: 'DOCUMENT_REQUEST_FAILED' });
    expect(out.passages).toBeUndefined();
  });

  it('a query too short to retrieve on is refused before any search', async () => {
    const handler = handlers.get('search_document_passages')!;
    const out = JSON.parse(await handler({ query: 'x' }, CTX));
    expect(out.error).toContain('at least 3 characters');
    expect(searchDocumentPassages).not.toHaveBeenCalled();
  });
});
