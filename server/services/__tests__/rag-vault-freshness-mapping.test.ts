import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  AdvancedRAGPipeline, type RetrievedDocument, type RetrievalOptions,
} from '../advancedRAGPipeline.js';

const ORG = '20000000-0000-4000-8000-000000000001';
const DOC = '30000000-0000-4000-8000-000000000001';
const CHUNK = '40000000-0000-4000-8000-000000000001';
const PROGRAM = '50000000-0000-4000-8000-000000000001';
const FILE_HASH = 'b'.repeat(64);
const TEXT = '日本語 β 𝄞 own literal [.*] passage.';
const SOURCE = `prefix ${TEXT} suffix`;
const EXTRACTION_HASH = createHash('sha256').update(SOURCE, 'utf8').digest('hex');
const START = 'prefix '.length;
const END = START + TEXT.length;
const options: RetrievalOptions = { strategy: 'basic', organizationUuid: ORG };
type Row = Record<string, unknown>;
type Snapshot = { extractedTextSha256: string | null; charStart: number | null; charEnd: number | null };
type Passage = RetrievedDocument & { vaultPassageSnapshot?: Snapshot };
type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Row[] }>;
type Internal = {
  searchVaultSimilar(query: string, limit: number, threshold: number, organizationUuid?: string,
    needEmbeddings?: boolean, hybrid?: boolean): Promise<Passage[]>;
  vaultLexicalArm(client: { query: Query }, args: {
    query: string; limit: number; organizationUuid: string; keyless: boolean;
  }): Promise<Passage[]>;
  revalidateCandidates(documents: RetrievedDocument[], opts: RetrievalOptions): Promise<Passage[]>;
};

function snapshot(overrides: Partial<Snapshot> = {}): Snapshot {
  return { extractedTextSha256: EXTRACTION_HASH, charStart: START, charEnd: END, ...overrides };
}
function hit(overrides: Partial<Passage> = {}): Passage {
  return {
    id: CHUNK, chunkId: CHUNK, documentId: DOC, programId: PROGRAM, contentHash: FILE_HASH,
    content: TEXT, title: 'Study report', atomType: 'vault_chunk', initialScore: 0.9, finalScore: 0.9,
    ...overrides,
  };
}
function currentRow(overrides: Row = {}): Row {
  return {
    id: CHUNK, document_id: DOC, program_id: PROGRAM, content_hash: FILE_HASH,
    title: 'Study report', original_file_available: true,
    chunk_text: TEXT, char_start: START, char_end: END,
    extracted_text_sha256: EXTRACTION_HASH, chunk_in_extraction: true, ...overrides,
  };
}
function initialRow(overrides: Row = {}): Row {
  return {
    chunk_id: CHUNK, document_id: DOC, program_id: PROGRAM, content_hash: FILE_HASH,
    title: 'Study report', content: TEXT, page_number: 2, section_title: 'Methods',
    chunk_index: 0, similarity: 0.9,
    char_start: START, char_end: END, extracted_text_sha256: EXTRACTION_HASH, ...overrides,
  };
}

/** Controlled SQL rows only: this executes the actual mapper and fence, not PostgreSQL. */
function pipeline(row: Row) {
  const query = vi.fn(async (sql: string, _params: unknown[] = []): Promise<{ rows: Row[] }> => ({
    rows: /FROM\s+vault\.document_chunks/.test(sql) ? [row] : [],
  }));
  const client = { query, release: vi.fn() };
  const p = Object.create(AdvancedRAGPipeline.prototype) as Internal;
  Object.assign(p, {
    pool: { query, connect: vi.fn(async () => client) },
    embeddingService: { embed: vi.fn(async () => ({ embedding: [1, 0] })) },
  });
  return { p, query, client };
}

describe('the existing Vault retrieval mappers pin the extraction selected with the hit', () => {
  it('dense retrieval pins the same-statement extraction fingerprint and UTF-16 coordinates', async () => {
    const h = pipeline(initialRow());
    const docs = await h.p.searchVaultSimilar('passage', 5, 0.1, ORG, false, false);
    expect(docs).toHaveLength(1);
    expect(docs[0].content).toBe(TEXT);
    expect(docs[0].vaultPassageSnapshot).toEqual(snapshot());
    const [sql, params] = h.query.mock.calls.find(([s]) => /WITH scoped AS MATERIALIZED/.test(s))!;
    expect(sql).toMatch(/sha256\(convert_to\(d\.extracted_text,\s*'UTF8'\)\)/);
    expect(sql).toContain('extracted_text_sha256');
    expect(sql).toContain('c.char_start');
    expect(sql).toContain('c.char_end');
    expect(params[3]).toBe(ORG);
    expect(sql).toContain('p.deleted_at IS NULL');
    expect(sql).toContain('vault.documents succ');
  });

  it('lexical retrieval pins its own snapshot even without an embedding provider', async () => {
    const h = pipeline(initialRow());
    const docs = await h.p.vaultLexicalArm(h.client, {
      query: 'passage', limit: 5, organizationUuid: ORG, keyless: true,
    });
    expect(docs).toHaveLength(1);
    expect(docs[0].vaultPassageSnapshot).toEqual(snapshot());
    expect(docs[0].lexicalOnly).toBe(true);
    const [sql, params] = h.query.mock.calls.find(([s]) => /websearch_to_tsquery/.test(s))!;
    expect(sql).toMatch(/sha256\(convert_to\(d\.extracted_text,\s*'UTF8'\)\)/);
    expect(sql).toContain('extracted_text_sha256');
    expect(sql).toContain('c.char_start');
    expect(sql).toContain('c.char_end');
    expect(params[2]).toBe(ORG);
  });

  it('pins explicit NULL extraction and coordinates without inventing source identity', async () => {
    const h = pipeline(initialRow({ extracted_text_sha256: null, char_start: null, char_end: null }));
    const [doc] = await h.p.vaultLexicalArm(h.client, {
      query: 'passage', limit: 5, organizationUuid: ORG, keyless: true,
    });
    expect(doc.vaultPassageSnapshot).toEqual({ extractedTextSha256: null, charStart: null, charEnd: null });
    expect(doc.hitSpan).toBeUndefined();
    expect(doc.passageContext).toBeUndefined();
  });
});

describe('the canonical Vault fence decodes its selected freshness metadata strictly', () => {
  it.each<[string, Row]>([
    ['missing chunk text', { chunk_text: undefined }],
    ['non-text chunk', { chunk_text: 7 }],
    ['missing extraction fingerprint', { extracted_text_sha256: undefined }],
    ['malformed extraction fingerprint', { extracted_text_sha256: 'not-a-sha256' }],
    ['missing start', { char_start: undefined }],
    ['string start', { char_start: String(START) }],
    ['nonfinite end', { char_end: Number.POSITIVE_INFINITY }],
    ['missing membership fact', { chunk_in_extraction: undefined }],
    ['string membership fact', { chunk_in_extraction: 'true' }],
  ])('refuses %s rather than interpreting absent proof as legacy NULL', async (_name, invalid) => {
    const h = pipeline(currentRow(invalid));
    await expect(h.p.revalidateCandidates([hit()], options)).rejects.toThrow('record could not be verified');
  });

  it('first-pins a plain current legacy candidate after comparing its text', async () => {
    const h = pipeline(currentRow());
    const [doc] = await h.p.revalidateCandidates([hit()], options);
    expect(doc.content).toBe(TEXT);
    expect(doc.vaultPassageSnapshot).toEqual(snapshot());
    expect(doc.hitSpan).toBeUndefined();
    expect(doc.passageContext).toBeUndefined();
  });

  it.each([
    { expandedContent: 'Unknown old expanded text' },
    { compressedContent: 'Unknown old compressed text' },
  ])('refuses unknown derived basis without refreshing its stale text', async derived => {
    const h = pipeline(currentRow());
    const result = await h.p.revalidateCandidates([hit(derived)], options);
    expect(result).toEqual([]);
  });
});

describe('honest legacy hit-only behavior remains available', () => {
  it('preserves unchanged NULL-extraction and NULL-offset own text without a span claim', async () => {
    const h = pipeline(currentRow({ extracted_text_sha256: null, char_start: null,
      char_end: null, chunk_in_extraction: null }));
    const doc = hit({ vaultPassageSnapshot: snapshot({ extractedTextSha256: null, charStart: null, charEnd: null }),
      passageContext: { status: 'unavailable', reason: 'no_offsets' } });
    const [current] = await h.p.revalidateCandidates([doc], options);
    expect(current.content).toBe(TEXT);
    expect(current.passageContext).toEqual({ status: 'unavailable', reason: 'no_offsets' });
    expect(current.expandedContent).toBeUndefined();
    expect(current.hitSpan).toBeUndefined();
  });

  it('retains a current literal hit with shifted backfill coordinates, without inventing a remap', async () => {
    const h = pipeline(currentRow({ char_start: 0, char_end: TEXT.length }));
    const doc = hit({ vaultPassageSnapshot: snapshot({ charStart: 0, charEnd: TEXT.length }),
      passageContext: { status: 'unavailable', reason: 'basis_mismatch' } });
    const [current] = await h.p.revalidateCandidates([doc], options);
    expect(current.content).toBe(TEXT);
    expect(current.passageContext).toEqual({ status: 'unavailable', reason: 'basis_mismatch' });
    expect(current.expandedContent).toBeUndefined();
    expect(current.hitSpan).toBeUndefined();
  });

  it('does not confuse an unavailable neighboring context with stale own-hit text', async () => {
    const h = pipeline(currentRow());
    const doc = hit({ vaultPassageSnapshot: snapshot(),
      passageContext: { status: 'unavailable', reason: 'chunk_set_changed' } });
    const [current] = await h.p.revalidateCandidates([doc], options);
    expect(current.content).toBe(TEXT);
    expect(current.passageContext).toEqual({ status: 'unavailable', reason: 'chunk_set_changed' });
    expect(current.expandedContent).toBeUndefined();
  });
});
