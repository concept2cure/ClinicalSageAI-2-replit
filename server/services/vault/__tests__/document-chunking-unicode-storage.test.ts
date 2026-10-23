/**
 * The real Vault chunk writer over PGlite's SQL and UTF-8 parameter transport.
 * Only the pool connection is replaced; chunking, eligibility SQL, page mapping,
 * transaction/INSERT statements, passage verification and identities run as-is.
 * Minimal tables below model only the columns those statements use. This runs
 * as the database owner: it does not qualify native PostgreSQL RLS or embeddings.
 */
import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ pg: null as PGlite | null, embeddingService: vi.fn() }));

function database(): PGlite {
  if (!h.pg) throw new Error('Unicode storage test database is not ready');
  return h.pg;
}

async function query(sql: string, params: unknown[] = []) {
  const result = await database().query(sql, params);
  // PGlite SELECT has affectedRows=0; pg reports the returned row count.
  return { rows: result.rows, rowCount: result.rows.length || result.affectedRows || 0 };
}

vi.mock('../../../db.js', () => ({
  pool: {
    query: (sql: string, params?: unknown[]) => query(sql, params),
    connect: async () => ({ query, release: () => undefined }),
  },
}));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: h.embeddingService }));

import { chunkAndEmbedDocument } from '../document-chunking.service';
import { buildPassageContext, type ChunkCoordinate } from '../passage-context-span';
import { draftSourceIdentityForText } from '../../ana/draft-source-identity';
import type { PageSpan } from '../../ocr/page-offsets';

const ORG = 42;
const PROGRAM = '10000000-0000-4000-8000-000000000042';
const DOC = '20000000-0000-4000-8000-000000000042';
const HASH = 'a'.repeat(64);

interface StoredChunk extends ChunkCoordinate {
  charStart: number;
  charEnd: number;
  pageNumber: number | null;
  embeddingModel: string | null;
  tokenCount: number;
  vectorizedAt: string | null;
}

beforeAll(async () => {
  h.pg = new PGlite();
  await database().exec(`
    CREATE TABLE public.regulatory_programs (id uuid PRIMARY KEY, organization_id integer NOT NULL);
    CREATE TABLE public.document_data_dispositions (
      organization_id integer NOT NULL, program_id uuid NOT NULL,
      vault_document_id uuid, linked_ids jsonb NOT NULL DEFAULT '{}', source_sha256 text
    );
    CREATE SCHEMA vault;
    CREATE TABLE vault.documents (
      id uuid PRIMARY KEY, program_id uuid NOT NULL REFERENCES public.regulatory_programs(id),
      content_hash text NOT NULL, extracted_text text NOT NULL
    );
    CREATE TABLE vault.document_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      document_id uuid NOT NULL REFERENCES vault.documents(id), chunk_index integer NOT NULL,
      chunk_text text NOT NULL, char_start integer NOT NULL, char_end integer NOT NULL,
      page_number integer, embedding_model text, token_count integer NOT NULL, vectorized_at timestamptz,
      UNIQUE (document_id, chunk_index)
    );
  `);
  await database().query('INSERT INTO public.regulatory_programs VALUES ($1,$2)', [PROGRAM, ORG]);
});

beforeEach(async () => {
  // tenant-isolation-safe: isolated PGlite fixture contains this test's one organization only.
  await database().exec('TRUNCATE vault.document_chunks, vault.documents, public.document_data_dispositions');
  h.embeddingService.mockReset();
  h.embeddingService.mockImplementation(() => { throw new Error('Embedding must stay off in this keyless test'); });
});

afterAll(async () => { await h.pg?.close(); });

async function source(text: string): Promise<string> {
  // tenant-isolation-safe: DOC is the sole document owned by this isolated fixture organization.
  const result = await database().query<{ extracted_text: string }>(`
    INSERT INTO vault.documents (id,program_id,content_hash,extracted_text) VALUES ($1,$2,$3,$4)
    ON CONFLICT (id) DO UPDATE SET extracted_text=EXCLUDED.extracted_text
    RETURNING extracted_text
  `, [DOC, PROGRAM, HASH, text]);
  return result.rows[0].extracted_text;
}

async function storedChunks(): Promise<StoredChunk[]> {
  // tenant-isolation-safe: exact known fixture document; real writer ownership is tested separately.
  const result = await database().query<StoredChunk>(`
    SELECT id, chunk_index AS "chunkIndex", chunk_text AS text,
      char_start AS "charStart", char_end AS "charEnd", page_number AS "pageNumber",
      embedding_model AS "embeddingModel", token_count AS "tokenCount", vectorized_at AS "vectorizedAt"
    FROM vault.document_chunks WHERE document_id=$1 ORDER BY chunk_index
  `, [DOC]);
  return result.rows;
}

async function write(text: string, pageSpans?: PageSpan[]) {
  return chunkAndEmbedDocument({ documentId: DOC, organizationId: ORG, text, pageSpans, embed: false });
}

function verifyStoredSource(text: string, chunks: StoredChunk[]) {
  expect(chunks.length).toBeGreaterThan(1);
  expect(chunks[0].charStart).toBe(0);
  expect(chunks[chunks.length - 1].charEnd).toBe(text.length);
  for (const chunk of chunks) {
    expect(chunk.text).toBe(text.slice(chunk.charStart, chunk.charEnd));
    expect(Buffer.from(chunk.text, 'utf8').toString('utf8')).toBe(chunk.text);
    const result = buildPassageContext({
      documentId: DOC, contentHash: HASH, extractedText: text,
      hit: { chunkId: chunk.id, chunkIndex: chunk.chunkIndex }, chunks,
    });
    expect(result.context.status).toBe('available');
    if (result.context.status !== 'available') throw new Error(JSON.stringify(result.context));
    const { reference, text: contextText } = result.context;
    expect(contextText).toBe(text.slice(reference.span.start, reference.span.end));
    expect(reference).toEqual({
      documentId: DOC, contentHash: HASH, span: reference.span,
      ...draftSourceIdentityForText(text, reference.span),
    });
    expect(result.hitSpan).toEqual({ start: chunk.charStart, end: chunk.charEnd });
  }
}

describe('Vault Unicode chunks survive actual SQL storage and source verification', () => {
  it('retains a Japanese supplementary character across the default hard end', async () => {
    const text = 'a'.repeat(3999) + '𠮷' + 'z'.repeat(2000);
    expect(await source(text)).toBe(text);
    expect(await write(text)).toMatchObject({ ok: true, embedded: false });
    const chunks = await storedChunks();
    verifyStoredSource(text, chunks);
    expect(chunks[0].charEnd).toBe(3999);
    expect(h.embeddingService).not.toHaveBeenCalled();
  });

  it('retains the complete overlap character and attributes the adjusted start to its actual page', async () => {
    const text = 'a'.repeat(3599) + '🧬' + 'z'.repeat(2600);
    await source(text);
    expect(await write(text, [
      { page: 1, start: 0, end: 3601 }, { page: 2, start: 3601, end: text.length },
    ])).toMatchObject({ ok: true, embedded: false });
    const chunks = await storedChunks();
    verifyStoredSource(text, chunks);
    expect(chunks[1]).toMatchObject({ charStart: 3601, pageNumber: 2 });
    expect(chunks[0].pageNumber).toBe(1);
  });

  it('replaces the old chunk set through the existing writer and verifies the new Unicode text', async () => {
    const oldText = 'x'.repeat(6500);
    await source(oldText);
    expect(await write(oldText)).toMatchObject({ ok: true });
    const oldIds = new Set((await storedChunks()).map(c => c.id));
    const newText = 'a'.repeat(3999) + '🧬' + 'z'.repeat(2000);
    await source(newText);
    const result = await write(newText);
    expect(result).toMatchObject({ ok: true });
    const chunks = await storedChunks();
    expect(chunks).toHaveLength(result.chunkCount);
    expect(chunks.every(c => !oldIds.has(c.id))).toBe(true);
    verifyStoredSource(newText, chunks);
  });

  it('keeps keyless BMP text, token counts and absent page/vector metadata intact', async () => {
    const text = '日本語の報告αβγ'.repeat(700);
    await source(text);
    expect(await write(text)).toMatchObject({ ok: true, embedded: false });
    const chunks = await storedChunks();
    verifyStoredSource(text, chunks);
    for (const c of chunks) {
      expect(c).toMatchObject({ pageNumber: null, embeddingModel: null, vectorizedAt: null });
      expect(c.tokenCount).toBe(Math.ceil(c.text.length / 4));
    }
    expect(h.embeddingService).not.toHaveBeenCalled();
  });

  it('still refuses a legacy chunk whose split character was replaced in UTF-8 storage', async () => {
    const text = 'a'.repeat(3999) + '𠮷' + 'z'.repeat(2000);
    await source(text);
    // tenant-isolation-safe: deliberately corrupt legacy bytes on the sole fixture document.
    await database().query(`INSERT INTO vault.document_chunks
      (document_id,chunk_index,chunk_text,char_start,char_end,token_count)
      VALUES ($1,0,$2,0,4000,1000)`, [DOC, text.slice(0, 4000)]);
    const chunks = await storedChunks();
    expect(chunks[0].text).toBe('a'.repeat(3999) + '\ufffd');
    const result = buildPassageContext({
      documentId: DOC, contentHash: HASH, extractedText: text,
      hit: { chunkId: chunks[0].id, chunkIndex: 0 }, chunks,
    });
    expect(result.context).toEqual({ status: 'unavailable', reason: 'basis_mismatch' });
  });

  it('still refuses malformed original text instead of issuing a verified identity', () => {
    const text = 'source\ud83eend';
    const span = { start: 0, end: text.length, totalChars: text.length };
    expect(() => draftSourceIdentityForText(text, span)).toThrow('Invalid source text encoding');
    const result = buildPassageContext({
      documentId: DOC, contentHash: HASH, extractedText: text,
      hit: { chunkId: DOC, chunkIndex: 0 },
      chunks: [{ id: DOC, chunkIndex: 0, charStart: 0, charEnd: text.length, text }],
    });
    expect(result.context).toEqual({ status: 'unavailable', reason: 'encoding' });
  });

  it('still refuses a foreign organization without replacing the existing chunks', async () => {
    const text = '日本語'.repeat(2200);
    await source(text);
    expect(await write(text)).toMatchObject({ ok: true });
    const before = await storedChunks();
    const result = await chunkAndEmbedDocument({
      documentId: DOC, organizationId: ORG + 1, text: 'a'.repeat(6000), embed: false,
    });
    expect(result).toMatchObject({ ok: false, chunkCount: 0 });
    expect(result.error).toContain('organization');
    expect(await storedChunks()).toEqual(before);
    expect(h.embeddingService).not.toHaveBeenCalled();
  });

  it('still honors the existing binary-disposition fence before replacing chunks', async () => {
    const text = '日本語'.repeat(2200);
    await source(text);
    expect(await write(text)).toMatchObject({ ok: true });
    const before = await storedChunks();
    await database().query(`INSERT INTO public.document_data_dispositions
      (organization_id,program_id,vault_document_id,source_sha256) VALUES ($1,$2,$3,$4)`,
    [ORG, PROGRAM, DOC, HASH]);
    expect(await write('a'.repeat(6000))).toMatchObject({ ok: false, chunkCount: 0 });
    expect(await storedChunks()).toEqual(before);
    expect(h.embeddingService).not.toHaveBeenCalled();
  });
});
