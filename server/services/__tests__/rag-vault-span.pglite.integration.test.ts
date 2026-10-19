/**
 * The vault neighbour query in AdvancedRAGPipeline.expandContext, executed for
 * real against PGlite (docs/evidence/D2-PASSAGE-CONTEXT/2026-10-19/CONTRACT.md).
 *
 * Written from the contract alone. The stub-executor suite proves the shape of
 * the statement; this one runs it. The schema is the disposition harness's
 * (the real 20261006 disposition migration and the 20261008e catalog
 * attribution, each applied twice), so vaultDataEligibleSql and supersededSql
 * execute against the tables they were written for. The chunk coordinates
 * the harness's minimal `vault.document_chunks` lacks are added with the types
 * migrations/20260905b_vault_document_chunks.sql gives them. Chunks are cut by
 * the production chunker with its production defaults.
 *
 * Two kinds of case:
 *   - NEW BEHAVIOUR: the window is one exact span of the stored extracted text,
 *     with an identity the existing helper re-derives; coordinates that do not
 *     verify are reported, never approximated; the hit's own content hash pins
 *     the read. At the commit before the change these fail: the window came
 *     back as chunk texts joined with '\n\n' and no context was reported.
 *   - FENCES (controls): tenant, withdrawal, supersession and the read-scope
 *     content-hash pin drop the candidate. These held before the change and
 *     must still hold; they assert nothing the change introduced.
 *
 * One seam, the established one (rag-actor-programme-scope.test.ts): the
 * read-scope admission wrapper and its revalidation are replaced, so the
 * scoped call runs the SAME statement on the PGlite executor. Admission itself
 * is proven by its own suites; the organization identity check and the
 * neighbour query still run for real.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { randomUUID } from 'node:crypto';

const seam = vi.hoisted(() => ({
  db: null as null | { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
}));
vi.mock('../vault/retrieval-source-access.js', async original => ({ ...(await original() as object),
  withRetrievalReadScope: async (scope: unknown, run: (q: unknown, current: unknown) => Promise<unknown>) => {
    if (!seam.db) throw new Error('PGlite executor not ready');
    return run(seam.db, scope);
  },
}));
vi.mock('../ana/source-read-scope.js', async original => ({ ...(await original() as object),
  revalidateAnaSourceReadScope: async (_q: unknown, scope: unknown) => scope,
}));

import { AdvancedRAGPipeline, type RetrievedDocument } from '../advancedRAGPipeline.js';
import {
  createDispositionHarness, insertVaultSuccessor, type DispositionHarness, type DispositionFixture,
} from '../document-data-disposition/__tests__/disposition-fixture.js';
import { chunkExtractedText, type DocumentTextChunk } from '../vault/document-chunking.service.js';
import { draftSourceIdentityForText } from '../ana/draft-source-identity.js';

/** The contract's constants, restated rather than imported: this file must load at the baseline. */
const SIDE = 1000;
const MAX = 12000;
/** The disposition harness's document hash (disposition-fixture.ts). */
const HASH = 'a'.repeat(64);

interface Reference {
  documentId: string; contentHash: string; span: { start: number; end: number; totalChars: number };
  version: number; extractedTextSha256: string; spanSha256: string;
}
type Context =
  | { status: 'available'; text: string; reference: Reference; chunkRange: [number, number]; clipped: boolean }
  | { status: 'unavailable'; reason: string };
type Expanded = RetrievedDocument & { passageContext?: Context; hitSpan?: { start: number; end: number } | null };
interface SourceScope {
  organizationId: number; userId: number; role: string; projectId: number | null; programId: string | null;
  accessibleProgramIds: string[]; actorFiltered: true;
}
type Internal = {
  expandContext(documents: RetrievedDocument[], window: number, organizationUuid?: string, organizationId?: number,
    sourceOptions?: { sourceReadScope?: SourceScope }): Promise<Expanded[]>;
};

let harness: DispositionHarness;
beforeAll(async () => {
  harness = await createDispositionHarness();
  seam.db = harness.db;
  await harness.pg.exec(`
    ALTER TABLE organizations ADD COLUMN uuid uuid NOT NULL DEFAULT gen_random_uuid();
    ALTER TABLE vault.document_chunks ADD COLUMN chunk_index INTEGER;
    ALTER TABLE vault.document_chunks ADD COLUMN char_start INTEGER;
    ALTER TABLE vault.document_chunks ADD COLUMN char_end INTEGER;
  `);
});
afterAll(async () => { await harness.close(); });

function pipeline(f: DispositionFixture): Internal {
  const instance = Object.create(AdvancedRAGPipeline.prototype) as Internal;
  Object.assign(instance, { pool: f.db });
  return instance;
}

/** ~17k characters of unique, headed paragraphs: five or six chunks at the production defaults. */
function studyText(): string {
  return Array.from({ length: 60 }, (_, i) => {
    const n = String(i).padStart(2, '0');
    return `Paragraph ${n}. Subject cohort ${i} completed visit ${i % 7} with assessment ${i * 13} ` +
      `recorded at site ${100 + i}; ` + 'the investigator noted no protocol deviation. '.repeat(4);
  }).join('\n\n');
}

interface Seeded {
  stored: string;
  chunks: DocumentTextChunk[];
  ids: string[];
  uuid: string;
  hit(index?: number, overrides?: Partial<RetrievedDocument>): RetrievedDocument;
}

/**
 * Store `stored` as the fixture document's extracted text and replace its
 * chunks with the production chunker's cut of `basis` (the stored text unless
 * a backfill-style basis is given). `offsets: false` writes legacy chunks with
 * no coordinates.
 */
async function seedDocument(f: DispositionFixture, opts: { stored?: string; basis?: string; offsets?: boolean } = {}): Promise<Seeded> {
  const stored = opts.stored ?? studyText();
  const chunks = chunkExtractedText(opts.basis ?? stored);
  expect(chunks.length).toBeGreaterThanOrEqual(5);
  const uuid = randomUUID();
  await f.pg.query('UPDATE organizations SET uuid=$2 WHERE id=$1', [f.org, uuid]);
  // tenant-isolation-safe: isolated PGlite fixture; f.vault is the document the harness just seeded for this fixture organization.
  await f.pg.query('UPDATE vault.documents SET extracted_text=$2 WHERE id=$1 AND organization_id=$3', [f.vault, stored, f.org]);
  // tenant-isolation-safe: isolated PGlite fixture; removes the harness's placeholder chunk of this fixture's own document.
  await f.pg.query('DELETE FROM vault.document_chunks WHERE document_id=$1', [f.vault]);
  const ids = chunks.map(() => randomUUID());
  const withOffsets = opts.offsets !== false;
  for (const c of chunks) {
    // tenant-isolation-safe: isolated PGlite fixture; the parent is this fixture organization's own document.
    await f.pg.query(`INSERT INTO vault.document_chunks (id,document_id,chunk_index,chunk_text,char_start,char_end)
      VALUES ($1,$2,$3,$4,$5,$6)`,
    [ids[c.index], f.vault, c.index, c.text, withOffsets ? c.charStart : null, withOffsets ? c.charEnd : null]);
  }
  return {
    stored, chunks, ids, uuid,
    hit: (index = 2, overrides = {}) => ({
      id: ids[index], chunkId: ids[index], documentId: f.vault, programId: f.program, contentHash: HASH,
      chunkIndex: index, atomType: 'vault_chunk', title: 'Study PDF', content: chunks[index].text,
      initialScore: 1, finalScore: 1, ...overrides,
    }),
  };
}

/** The contract's span for a hit at `index` with a ±`window` neighbourhood (no clipping, no surrogates here). */
function expectedSpan(chunks: DocumentTextChunk[], index: number, window: number) {
  const first = chunks[Math.max(0, index - window)];
  const last = chunks[Math.min(chunks.length - 1, index + window)];
  const hit = chunks[index];
  const start = Math.max(first.charStart, hit.charStart - SIDE);
  const end = Math.min(last.charEnd, hit.charEnd + SIDE);
  expect(end - start).toBeLessThanOrEqual(MAX);
  return { start, end, clipped: start > first.charStart || end < last.charEnd, chunkRange: [first.index, last.index] };
}

const ids = (docs: RetrievedDocument[]) => docs.map(d => d.id);

describe('NEW: the vault window is one exact span of the stored extracted text', () => {
  it('expandedContent is extracted_text.slice(span) read from the same row set, never joined chunk text', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const [doc] = await pipeline(f).expandContext([s.hit(2)], 1, s.uuid);
    expect(doc).toBeDefined();
    const span = expectedSpan(s.chunks, 2, 1);

    expect(doc.expandedContent).toBe(s.stored.slice(span.start, span.end));
    // The defect this replaces: overlap repeated at every seam, '\n\n' invented between chunks.
    expect(doc.expandedContent).not.toBe(s.chunks.slice(1, 4).map(c => c.text).join('\n\n'));
    const headings = doc.expandedContent?.match(/Paragraph \d\d\./g) ?? [];
    expect(headings.length).toBeGreaterThan(0);
    expect(new Set(headings).size).toBe(headings.length);
    // The hit's own content stands; the hit is fully inside the span.
    expect(doc.content).toBe(s.chunks[2].text);
    expect(doc.hitSpan).toEqual({ start: s.chunks[2].charStart, end: s.chunks[2].charEnd });
    expect(span.start).toBeLessThanOrEqual(s.chunks[2].charStart);
    expect(span.end).toBeGreaterThanOrEqual(s.chunks[2].charEnd);
  });

  it('reports the context as available with a reference the existing identity helper re-derives', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const [doc] = await pipeline(f).expandContext([s.hit(2)], 1, s.uuid);
    const span = expectedSpan(s.chunks, 2, 1);
    const ctx = doc?.passageContext;
    expect(ctx?.status).toBe('available');
    if (ctx?.status !== 'available') return;
    expect(ctx.text).toBe(doc.expandedContent);
    expect(ctx.chunkRange).toEqual(span.chunkRange);
    expect(ctx.clipped).toBe(span.clipped);
    const totalChars = s.stored.length;
    expect(ctx.reference).toEqual({
      documentId: f.vault, contentHash: HASH, span: { start: span.start, end: span.end, totalChars },
      ...draftSourceIdentityForText(s.stored, { start: span.start, end: span.end, totalChars }),
    });
    // Verification the way a consumer does it: re-derive from the stored text.
    const stored = (await f.pg.query<{ extracted_text: string }>(
      // tenant-isolation-safe: isolated PGlite fixture; reads back this fixture organization's own document.
      'SELECT extracted_text FROM vault.documents WHERE id=$1 AND organization_id=$2', [f.vault, f.org])).rows[0].extracted_text;
    const { version, extractedTextSha256, spanSha256 } = ctx.reference;
    expect(draftSourceIdentityForText(stored, ctx.reference.span)).toEqual({ version, extractedTextSha256, spanSha256 });
    expect(stored.slice(ctx.reference.span.start, ctx.reference.span.end)).toBe(ctx.text);
  });

  it('legacy chunks with NULL offsets: no_offsets, and no expandedContent at all', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f, { offsets: false });
    const result = await pipeline(f).expandContext([s.hit(2)], 1, s.uuid);
    expect(ids(result)).toEqual([s.ids[2]]);
    expect(result[0].passageContext).toEqual({ status: 'unavailable', reason: 'no_offsets' });
    expect(result[0].expandedContent).toBeUndefined();
    expect(result[0].hitSpan ?? null).toBeNull();
    expect(result[0].content).toBe(s.chunks[2].text);
  });

  it('a backfill-style basis (chunked from the trimmed text, stored untrimmed): basis_mismatch, not approximated', async () => {
    const f = await harness.seed();
    const stored = `\n\n   ${studyText()}\n`;
    // document-chunking-backfill.service.ts chunks `(extracted_text ?? '').trim()`.
    const basis = stored.trim();
    expect(stored.indexOf(basis)).toBeGreaterThan(0);
    const s = await seedDocument(f, { stored, basis });
    const result = await pipeline(f).expandContext([s.hit(2)], 1, s.uuid);
    expect(ids(result)).toEqual([s.ids[2]]);
    expect(result[0].passageContext).toEqual({ status: 'unavailable', reason: 'basis_mismatch' });
    expect(result[0].expandedContent).toBeUndefined();
    expect(result[0].hitSpan ?? null).toBeNull();
    expect(result[0].content).toBe(s.chunks[2].text);
  });

  it('a re-chunked document (the hit id is gone, its neighbours are not): chunk_set_changed', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const stale = s.hit(2, { id: randomUUID(), chunkId: randomUUID() });
    const result = await pipeline(f).expandContext([stale], 1, s.uuid);
    expect(result).toHaveLength(1);
    expect(result[0].passageContext).toEqual({ status: 'unavailable', reason: 'chunk_set_changed' });
    expect(result[0].expandedContent).toBeUndefined();
  });

  it("the hit's own content hash pins the read even without a source read scope", async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const p = pipeline(f);
    expect(ids(await p.expandContext([s.hit(2)], 1, s.uuid))).toEqual([s.ids[2]]);
    expect(await p.expandContext([s.hit(2, { contentHash: 'f'.repeat(64) })], 1, s.uuid)).toEqual([]);
  });
});

describe('FENCES (controls, unchanged by the change): the candidate is dropped', () => {
  it("another organization's document of the same shape, asked for under this organization's uuid", async () => {
    const own = await harness.seed();
    const mine = await seedDocument(own);
    const other = await harness.seed();
    const theirs = await seedDocument(other);
    const p = pipeline(own);
    // Positive control: under its own tenant the foreign hit expands.
    expect(ids(await p.expandContext([theirs.hit(2)], 1, theirs.uuid))).toEqual([theirs.ids[2]]);
    expect(await p.expandContext([theirs.hit(2)], 1, mine.uuid)).toEqual([]);
    expect(ids(await p.expandContext([mine.hit(2), theirs.hit(2)], 1, mine.uuid))).toEqual([mine.ids[2]]);
  });

  it('a document whose data was withdrawn (remove_data), while keep_data retains it', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const p = pipeline(f);
    expect(ids(await p.expandContext([s.hit(2)], 1, s.uuid))).toEqual([s.ids[2]]);
    await f.apply('keep_data');
    expect(ids(await p.expandContext([s.hit(2)], 1, s.uuid))).toEqual([s.ids[2]]);
    await f.apply('remove_data');
    expect(await p.expandContext([s.hit(2)], 1, s.uuid)).toEqual([]);
    // Dropped by the predicate, not by deleting the passages.
    expect((await f.pg.query(
      // tenant-isolation-safe: isolated PGlite fixture; counts this fixture organization's own document's chunks.
      'SELECT id FROM vault.document_chunks WHERE document_id=$1', [f.vault])).rows).toHaveLength(s.chunks.length);
  });

  it('a superseded version', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const p = pipeline(f);
    expect(ids(await p.expandContext([s.hit(2)], 1, s.uuid))).toEqual([s.ids[2]]);
    await insertVaultSuccessor(f);
    expect(await p.expandContext([s.hit(2)], 1, s.uuid)).toEqual([]);
  });

  it('a content hash that is not the stored version, under a source read scope', async () => {
    const f = await harness.seed();
    const s = await seedDocument(f);
    const p = pipeline(f);
    const sourceReadScope: SourceScope = { organizationId: f.org, userId: 42, role: 'manager', projectId: null,
      programId: null, accessibleProgramIds: [f.program], actorFiltered: true };
    expect(ids(await p.expandContext([s.hit(2)], 1, s.uuid, f.org, { sourceReadScope }))).toEqual([s.ids[2]]);
    expect(await p.expandContext([s.hit(2, { contentHash: 'f'.repeat(64) })], 1, s.uuid, f.org, { sourceReadScope }))
      .toEqual([]);
  });
});
