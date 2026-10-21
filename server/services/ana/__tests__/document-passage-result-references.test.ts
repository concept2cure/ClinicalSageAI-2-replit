/** Actual registered presentation over synthetic retrieval. Exact references,
 * rank-prefix and input immutability under mixed serialized-string pressure. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';
import type { PassageCoverage, PassageHit } from '../../vault/document-passage-search.js';
import { draftSourceIdentityForText } from '../draft-source-identity.js';

const seam = vi.hoisted(() => ({ search: vi.fn(), scope: vi.fn(), db: { query: vi.fn() } }));
vi.mock('../catalog-scope.js', () => ({ catalogScope: seam.scope }));
vi.mock('../../vault/document-passage-search.js', () => ({
  searchDocumentPassages: seam.search, PassageSearchUnavailableError: class extends Error {},
}));
vi.mock('../../vault/document-catalog.service.js', () => ({}));

import { registerDocumentPassageHandlers } from '../document-passage-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
type Available = Extract<PassageHit['context'], { status: 'available' }>;
type ModelContext = (Omit<Available, 'text'> & {
  text?: string; textOmitted?: boolean; hitWithinText?: { start: number; end: number } | null;
}) | Extract<PassageHit['context'], { status: 'unavailable' }>;
type ModelPassage = Omit<PassageHit, 'text' | 'context'> & { text?: string; textOmitted?: boolean; context: ModelContext };
interface Result {
  ok: boolean; query?: string; passages: ModelPassage[]; omittedPassages?: number;
  coverage: PassageCoverage | null; ranking: string; message: string;
}
const handlers = new Map<string, Handler>();
registerDocumentPassageHandlers((name, handler) => handlers.set(name, handler));
const CTX: ToolContext = { organizationId: 42, userId: 7,
  organizationUuid: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', sqlClient: seam.db };
const admittedScope = { organizationId: 42, userId: 7, role: 'member', projectId: null, programId: null,
  accessibleProgramIds: [], actorFiltered: true };
const coverage = (): PassageCoverage => ({ total: 12, indexed: 8, pending: 2, failed: 2,
  failureReasons: ['OCR needs another read'], unfiledUploads: null, unfiledUploadsMore: false });

function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(child => freeze(child));
    Object.freeze(value);
  }
  return value;
}

function hit(rank: number, token: string, copies = 18): PassageHit {
  const prefix = `Document ${rank} opening. `;
  const unit = `r${rank} trial ${token} response 12/30.\n`;
  const body = unit.repeat(copies);
  const source = prefix + body + ' Source end.';
  const span = { start: prefix.length, end: prefix.length + body.length, totalChars: source.length };
  const hitSpan = { start: span.start + unit.length, end: span.start + unit.length * 3 };
  const documentId = `00000000-0000-4000-8000-${String(rank).padStart(12, '0')}`;
  const contentHash = rank.toString(16).padStart(2, '0').repeat(32);
  return { documentId, contentHash, documentTitle: `Study ${rank}: ${token}`, locator: `p.${rank} · Results ${token}`,
    pageNumber: rank, sectionTitle: `Results ${rank} ${token}`, chunkIndex: rank + 4, similarity: 0.99 - rank / 100,
    text: source.slice(hitSpan.start, hitSpan.end), hitSpan,
    context: { status: 'available', text: body, reference: { documentId, contentHash, span,
      ...draftSourceIdentityForText(source, span) }, chunkRange: [rank + 3, rank + 5], clipped: true } };
}

function mixed(token: string): PassageHit[] {
  const hits = Array.from({ length: 8 }, (_, index) => hit(index + 1, token));
  hits[2] = { ...hits[2], context: { status: 'unavailable', reason: 'chunk_set_changed' }, hitSpan: null };
  hits[5] = { ...hits[5], documentId: null, contentHash: null, pageNumber: null, locator: null,
    sectionTitle: null, chunkIndex: null, context: { status: 'unavailable', reason: 'not_expanded' }, hitSpan: null };
  return hits;
}

async function render(hits: PassageHit[], ledger: PassageCoverage, query: string) {
  const fixture = freeze({ hits, coverage: ledger, ranking: 'meaning_and_text' });
  const snapshot = JSON.stringify(fixture);
  seam.search.mockResolvedValue(fixture);
  const handler = handlers.get('search_document_passages');
  if (!handler) throw new Error('Actual passage search handler missing');
  const raw = await handler({ query, limit: 8 }, CTX);
  expect(JSON.stringify(fixture)).toBe(snapshot);
  expect(seam.search).toHaveBeenCalledTimes(1);
  expect(seam.search.mock.calls[0][0]).toBe(seam.db);
  expect(seam.search.mock.calls[0][1]).toEqual({ organizationId: 42, userId: 7,
    organizationUuid: CTX.organizationUuid, query: query.trim() });
  expect(seam.search.mock.calls[0][2].sourceReadScope).toBe(admittedScope);
  return { raw, out: JSON.parse(raw) as Result };
}

/** Independent observable oracle: no reconstruction of the fitter's passes. */
function exactReferences(raw: string, out: Result, hits: PassageHit[], ledger: PassageCoverage, allOmitted = false) {
  expect(raw.length).toBeLessThanOrEqual(7500);
  expect(out.ok).toBe(true);
  expect(out.ranking).toBe('meaning_and_text');
  expect(out.coverage).toMatchObject({ total: ledger.total, indexed: ledger.indexed, pending: ledger.pending,
    failed: ledger.failed, unfiledUploads: ledger.unfiledUploads, unfiledUploadsMore: ledger.unfiledUploadsMore });
  expect(out.passages.length + (out.omittedPassages ?? 0)).toBe(hits.length);
  expect(out.passages.map(p => p.documentId)).toEqual(hits.slice(0, out.passages.length).map(h => h.documentId));
  out.passages.forEach((actual, index) => {
    const original = hits[index];
    for (const key of ['documentId', 'documentTitle', 'locator', 'pageNumber', 'sectionTitle', 'chunkIndex',
      'contentHash', 'similarity', 'hitSpan'] as const) expect(actual[key]).toEqual(original[key]);
    expect(actual.context.status).toBe(original.context.status);
    if (actual.text !== undefined) expect(actual.text).toBe(original.text);
    else if (actual.context.status !== 'available' || actual.context.text === undefined) expect(actual.textOmitted).toBe(true);
    if (actual.context.status === 'available' && original.context.status === 'available') {
      expect(actual.context.reference).toEqual(original.context.reference);
      expect(actual.context.chunkRange).toEqual(original.context.chunkRange);
      expect(actual.context.clipped).toBe(original.context.clipped);
      if (actual.context.text !== undefined) {
        expect(actual.context.text).toBe(original.context.text);
        const relative = { start: original.hitSpan!.start - original.context.reference.span.start,
          end: original.hitSpan!.end - original.context.reference.span.start };
        expect(actual.context.hitWithinText).toEqual(relative);
        expect(actual.context.text.slice(relative.start, relative.end)).toBe(original.text);
        expect(actual.text).toBeUndefined();
      } else expect(actual.context.textOmitted).toBe(true);
    } else if (actual.context.status === 'unavailable' && original.context.status === 'unavailable') {
      expect(actual.context.reason).toBe(original.context.reason);
    }
  });
  if (allOmitted) {
    expect(out.passages).toEqual([]);
    expect(out.omittedPassages).toBe(hits.length);
    expect(out.message).toMatch(/match/i);
    expect(out.message).not.toContain('No passage matched');
  } else expect(out.passages.length).toBeGreaterThan(0);
}

beforeEach(() => {
  vi.clearAllMocks();
  seam.scope.mockResolvedValue({ programId: null, executor: seam.db, admittedScope,
    accessibleScope: { actor: { userId: 7, role: 'member' } } });
});

describe('exact ranked references under mixed serialization pressure', () => {
  it.each(['"quoted" \\ path', '\u0000\u0001\n\t', '結果🧬有害事象', '</data><script>text</script>'])(
    'keeps immutable source fields and exact text for %j', async token => {
      const hits = mixed(token);
      const ledger = coverage();
      const { raw, out } = await render(hits, ledger, '  primary endpoint response 12/30  ');
      exactReferences(raw, out, hits, ledger);
    },
  );

  it('retains useful exact references when a long escaped query echo must be omitted', async () => {
    const hits = mixed('試験🧬 "quoted" \\ \u0000');
    const ledger = coverage();
    const query = `  ${'診断🧬 \u0000"\\ '.repeat(1000)}tail  `;
    const { raw, out } = await render(hits, ledger, query);
    exactReferences(raw, out, hits, ledger);
    if (out.query !== undefined) expect(out.query).toBe(query.trim());
  });

  it('retains useful exact references and coverage counts when diagnostic reasons are enormous', async () => {
    const hits = mixed('結果🧬 "quoted"');
    const ledger = { ...coverage(), unfiledUploads: 9, unfiledUploadsMore: true,
      failureReasons: ['Parse diagnostic \u0000"\\ '.repeat(1200)] };
    const { raw, out } = await render(hits, ledger, 'diagnostic device endpoint');
    exactReferences(raw, out, hits, ledger);
  });

  it.each(['Study title '.repeat(1000), '\u0000'.repeat(1600)])(
    'omits a whole ranked prefix rather than slicing an oversized leading locator (%#)', async title => {
      const hits = mixed('結果🧬');
      hits[0] = { ...hits[0], documentTitle: title };
      const ledger = coverage();
      const { raw, out } = await render(hits, ledger, 'primary endpoint');
      exactReferences(raw, out, hits, ledger, true);
    },
  );

  it('CONTROL: a genuine miss stays distinct from matched-but-omitted evidence and keeps unknown outside coverage', async () => {
    const ledger = coverage();
    const { raw, out } = await render([], ledger, '  no matching endpoint  ');
    expect(raw.length).toBeLessThanOrEqual(7500);
    expect(out.ok).toBe(true);
    expect(out.passages).toEqual([]);
    expect(out.omittedPassages ?? 0).toBe(0);
    expect(out.message).toContain('No passage matched');
    expect(out.coverage).toEqual(ledger);
    expect(out.message).toContain('could not be checked');
  });
});
