/** Actual registered passage handler over synthetic retrieval/scope I/O.
 * Sizes are serialized UTF-16 lengths; this is not SQL, relevance or round-budget proof. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ToolContext } from '../AnaToolExecutor.js';
import type { PassageCoverage, PassageHit } from '../../vault/document-passage-search.js';

const seam = vi.hoisted(() => ({ search: vi.fn(), scope: vi.fn(), sql: vi.fn() }));
vi.mock('../catalog-scope.js', () => ({ catalogScope: seam.scope }));
vi.mock('../../vault/document-passage-search.js', () => ({
  searchDocumentPassages: seam.search, PassageSearchUnavailableError: class extends Error {},
}));
vi.mock('../../vault/document-catalog.service.js', () => ({}));
vi.mock('../../../db.js', () => ({ pool: { query: seam.sql } }));

import { registerDocumentPassageHandlers } from '../document-passage-tools.js';

type Handler = (input: Record<string, unknown>, ctx?: ToolContext) => Promise<string>;
const handlers = new Map<string, Handler>();
registerDocumentPassageHandlers((name, handler) => handlers.set(name, handler));
const context: ToolContext = { organizationId: 42, userId: 7,
  organizationUuid: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', sqlClient: { query: seam.sql } };
const QUERY = 'device performance at 6 months';
const BUDGET = 7500;
interface Rendered {
  ok: boolean; query?: string; queryOmitted?: boolean; queryChars?: number;
  passages: Array<Partial<PassageHit> & { textOmitted?: boolean }>;
  omittedPassages?: number;
  coverage: (PassageCoverage & { failureReasonsOmitted?: boolean }) | null;
  ranking: 'text' | 'meaning_and_text' | null;
  message: string;
  scope: { actorFiltered: boolean; accessibleProjects?: boolean };
}

function coverage(overrides: Partial<PassageCoverage> = {}): PassageCoverage {
  return { total: 10, indexed: 3, pending: 2, failed: 3, failureReasons: [],
    unfiledUploads: null, unfiledUploadsMore: false, ...overrides };
}
function hit(rank = 1, overrides: Partial<PassageHit> = {}): PassageHit {
  return { documentId: `10000000-0000-4000-8000-${String(rank).padStart(12, '0')}`,
    documentTitle: `Study ${rank}`, locator: `p.${rank} · results`, pageNumber: rank,
    sectionTitle: 'Performance results', chunkIndex: rank, text: `Reported synthetic observation ${rank}.`,
    similarity: 1 - rank / 100, contentHash: 'a'.repeat(64), hitSpan: { start: 10, end: 43 },
    context: { status: 'unavailable', reason: 'no_offsets' }, ...overrides };
}
async function run(hits: PassageHit[] = [], query = QUERY, givenCoverage: PassageCoverage | null = coverage()) {
  seam.search.mockResolvedValue({ hits, coverage: givenCoverage, ranking: 'text' });
  const handler = handlers.get('search_document_passages');
  if (!handler) throw new Error('Actual passage handler not registered');
  const raw = await handler({ query, limit: hits.length || 8 }, context);
  return { raw, out: JSON.parse(raw) as Rendered };
}
function bounded(raw: string) { expect(raw.length).toBeLessThanOrEqual(BUDGET); }
function fullBackendQuery(query: string) {
  expect(seam.search).toHaveBeenCalledExactlyOnceWith(expect.anything(),
    { organizationId: 42, userId: 7, organizationUuid: context.organizationUuid, query: query.trim() },
    expect.objectContaining({ programId: null, sourceReadScope: expect.objectContaining({ actorFiltered: true, userId: 7 }) }));
}

beforeEach(() => {
  vi.resetAllMocks();
  seam.scope.mockResolvedValue({ programId: null, executor: { query: seam.sql },
    accessibleScope: { actor: { userId: 7, role: 'member' }, programIds: [], reconciliationRequired: false },
    admittedScope: { organizationId: 42, userId: 7, role: 'member', projectId: null,
      programId: null, accessibleProgramIds: [], actorFiltered: true } });
});

describe('response query echo never changes the actual retrieval query', () => {
  const echoes = [
    { name: 'long plain query', query: 'study safety '.repeat(1000) },
    { name: 'JSON-escaped control query', query: '\u0000'.repeat(200) },
    { name: 'JSON-escaped quote query', query: '"'.repeat(600) },
    { name: 'Japanese and astral query', query: '診断🧬'.repeat(260) },
  ];
  it.each(echoes.flatMap(example => [false, true].map(hasHit => ({ ...example, hasHit }))))(
    '$name, hit=$hasHit omits only the response echo and remains complete JSON', async ({ query, hasHit }) => {
      expect(JSON.stringify(query).length).toBeGreaterThan(1000);
      const { raw, out } = await run(hasHit ? [hit()] : [], query);
      fullBackendQuery(query);
      bounded(raw);
      expect(out.ok).toBe(true);
      expect(out).not.toHaveProperty('query');
      expect(out.queryOmitted).toBe(true);
      expect(out.queryChars).toBe(query.trim().length);
      expect(out.message).not.toContain(query.trim());
      expect(out.passages).toHaveLength(hasHit ? 1 : 0);
      if (!hasHit) expect(out.message).toContain('No passage matched');
    },
  );

  it('preserves the exact response echo at the serialized 1000-character boundary', async () => {
    const query = 'q'.repeat(998);
    expect(JSON.stringify(query).length).toBe(1000);
    const { raw, out } = await run([], `  ${query}  `);
    fullBackendQuery(query);
    bounded(raw);
    expect(out.query).toBe(query);
    expect(out).not.toHaveProperty('queryOmitted');
    expect(out).not.toHaveProperty('queryChars');
    expect(out.message).toContain(`No passage matched "${query}".`);
  });

  it('omits a serialized 1001-character query instead of silently shortening the search', async () => {
    const query = 'q'.repeat(999);
    expect(JSON.stringify(query).length).toBe(1001);
    const { raw, out } = await run([], query);
    fullBackendQuery(query);
    bounded(raw);
    expect(out.queryOmitted).toBe(true);
    expect(out.queryChars).toBe(999);
    expect(out).not.toHaveProperty('query');
    expect(out.message).not.toContain(query);
  });
});

describe('diagnostic omission preserves coverage facts and source objects', () => {
  it.each([
    { name: 'unknown unfiled count', unfiledUploads: null, unfiledUploadsMore: false },
    { name: 'bounded count with more', unfiledUploads: 20, unfiledUploadsMore: true },
    { name: 'known no unfiled uploads', unfiledUploads: 0, unfiledUploadsMore: false },
  ])('oversized reasons retain counters and $name', async ({ unfiledUploads, unfiledUploadsMore }) => {
    const given = coverage({ unfiledUploads, unfiledUploadsMore, failureReasons: ['TIMEOUT '.repeat(2000), 'Second diagnostic'] });
    const before = globalThis.structuredClone(given);
    Object.freeze(given.failureReasons); Object.freeze(given);
    const { raw, out } = await run([], QUERY, given);
    bounded(raw);
    expect(out.ok).toBe(true);
    expect(out.coverage).toEqual({ ...before, failureReasons: [], failureReasonsOmitted: true });
    expect(out.message).toMatch(/omit|left out|not shown/i);
    expect(out.message).toContain('3 failed to index');
    expect(out.message).not.toContain('TIMEOUT');
    expect(out.message).toContain('No passage matched');
    expect(given).toEqual(before);
  });

  it('uses serialized diagnostic size so control characters do not escape the field limit', async () => {
    const given = coverage({ failureReasons: ['\u0000'.repeat(167)] });
    expect(JSON.stringify(given.failureReasons).length).toBeGreaterThan(1000);
    const { raw, out } = await run([hit()], QUERY, given);
    bounded(raw);
    expect(out.coverage).toEqual({ ...given, failureReasons: [], failureReasonsOmitted: true });
    expect(given.failureReasons).toEqual(['\u0000'.repeat(167)]);
  });

  it('keeps ordinary reasons exactly at their serialized 1000-character boundary', async () => {
    const given = coverage({ failureReasons: ['x'.repeat(996)] });
    expect(JSON.stringify(given.failureReasons).length).toBe(1000);
    const { raw, out } = await run([], QUERY, given);
    bounded(raw);
    expect(out.coverage).toEqual(given);
    expect(out.coverage).not.toHaveProperty('failureReasonsOmitted');
    expect(out.message).toContain(given.failureReasons[0]);
  });

  it('omits the entire reason array one serialized character past the limit', async () => {
    const given = coverage({ failureReasons: ['x'.repeat(997)] });
    expect(JSON.stringify(given.failureReasons).length).toBe(1001);
    const { raw, out } = await run([], QUERY, given);
    bounded(raw);
    expect(out.coverage).toEqual({ ...given, failureReasons: [], failureReasonsOmitted: true });
    expect(out.message).not.toContain(given.failureReasons[0]);
  });

  it('retains explicitly unknown coverage instead of inventing zero or full coverage', async () => {
    const { raw, out } = await run([], QUERY, null);
    bounded(raw);
    expect(out.coverage).toBeNull();
    expect(out.message).toContain('could not be read');
    expect(out.message).not.toContain('All ');
  });
});

describe('an oversized highest-ranked locator is omitted intact, never turned into a miss', () => {
  it.each([
    { name: 'title', huge: { documentTitle: 'Long source title '.repeat(700) } },
    { name: 'locator with escaped controls', huge: { locator: `p.1 ${'\u0000'.repeat(1500)}` } },
    { name: 'section title', huge: { sectionTitle: 'Long source heading '.repeat(700) } },
  ])('cannot keep an oversized $name or rerank around it', async ({ huge }) => {
    const hits = [hit(1, huge), hit(2), hit(3)];
    const before = globalThis.structuredClone(hits);
    const { raw, out } = await run(hits);
    bounded(raw);
    expect(out.ok).toBe(true);
    expect(out.passages).toEqual([]);
    expect(out.omittedPassages).toBe(3);
    expect(out.message).not.toContain('No passage matched');
    expect(out.message).toMatch(/match|found/i);
    expect(out.message).toMatch(/intact|whole|fit|shown/i);
    expect(hits).toEqual(before);
  });

  it('combines huge query, diagnostics and metadata without losing coverage or claiming no match', async () => {
    const query = 'long query '.repeat(1200);
    const given = coverage({ failureReasons: ['long diagnostic '.repeat(1000)], unfiledUploads: 20, unfiledUploadsMore: true });
    const hits = [hit(1, { documentTitle: 'long title '.repeat(1000) }), hit(2)];
    const before = globalThis.structuredClone({ hits, given });
    const { raw, out } = await run(hits, query, given);
    fullBackendQuery(query);
    bounded(raw);
    expect(out).toMatchObject({ ok: true, queryOmitted: true, queryChars: query.trim().length,
      passages: [], omittedPassages: 2, coverage: { ...given, failureReasons: [], failureReasonsOmitted: true } });
    expect(out.message).not.toContain('No passage matched');
    expect({ hits, given }).toEqual(before);
  });
});

describe('ordinary output and existing prefix priority controls', () => {
  it('keeps a genuine small miss and its exact query wording distinct from omitted matches', async () => {
    const { raw, out } = await run();
    bounded(raw);
    expect(out).toMatchObject({ ok: true, query: QUERY, passages: [], coverage: coverage(), ranking: 'text', scope: { actorFiltered: true, accessibleProjects: true } });
    expect(out).not.toHaveProperty('omittedPassages');
    expect(out.message).toContain(`No passage matched "${QUERY}".`);
  });

  it('keeps ordinary passage fields byte-exact and does not mutate retrieval output', async () => {
    const hits = [hit(1), hit(2)];
    const before = globalThis.structuredClone(hits);
    const { raw, out } = await run(hits);
    bounded(raw);
    expect(out.passages).toEqual(before);
    expect(hits).toEqual(before);
    expect(out).not.toHaveProperty('queryOmitted');
    expect(out.coverage).toEqual(coverage());
  });

  it('keeps the highest-ranked text before dropping lower-ranked text', async () => {
    const hits = [1, 2, 3].map(rank => hit(rank, { text: `rank${rank} `.repeat(670) }));
    const { raw, out } = await run(hits);
    bounded(raw);
    expect(out.passages).toHaveLength(3);
    expect(out.passages[0].text).toBe(hits[0].text);
    expect(out.passages.slice(1).map(passage => passage.textOmitted)).toEqual([true, true]);
    expect(out.passages.map(passage => passage.documentId)).toEqual(hits.map(passage => passage.documentId));
    expect(out).not.toHaveProperty('omittedPassages');
  });
});
