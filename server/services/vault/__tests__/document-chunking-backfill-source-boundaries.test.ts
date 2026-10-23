/** Actual backfill + chunk writer; SQL replies and embedding provider are controlled seams. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Call = { sql: string; params: unknown[] };
type Candidate = {
  id: string; file_name: string; extracted_text: string; catalog_status: string;
  chunk_status: null; content_hash: string; page_count: null; uncatalogued: false;
};
type EmbeddingCall = { texts: string[]; model: string; tenantId: string | undefined };
const h = vi.hoisted(() => ({
  calls: [] as Call[], candidate: null as Candidate | null, eligible: true,
  insertCount: 0, failInsertAt: -1, releaseCount: 0, providerFails: false,
  embeddingCalls: [] as EmbeddingCall[],
}));

async function query(sql: string, params: unknown[] = []): Promise<{ rows: unknown[]; rowCount: number }> {
  h.calls.push({ sql, params: [...params] });
  if (sql.includes('SELECT d.id, d.file_name, d.extracted_text')) {
    return { rows: h.candidate ? [h.candidate] : [], rowCount: h.candidate ? 1 : 0 };
  }
  if (sql.includes('SELECT 1 FROM vault.documents')) {
    return { rows: h.eligible ? [{ owned: 1 }] : [], rowCount: h.eligible ? 1 : 0 };
  }
  if (sql.includes('INSERT INTO vault.document_chunks')) {
    if (h.insertCount++ === h.failInsertAt) throw new Error('controlled chunk storage failure');
    return { rows: [], rowCount: 1 };
  }
  return { rows: [], rowCount: 0 };
}

vi.mock('../../../db.js', () => ({ pool: {
  query,
  connect: async () => ({ query, release: () => { h.releaseCount++; } }),
} }));
// Every fixture is already catalogued. The extraction upsert is outside this writer-boundary suite.
vi.mock('../document-catalog.service.js', () => ({
  buildExtractionOutcome: vi.fn(), recordExtractionOutcome: vi.fn(),
}));
vi.mock('../../enhancedEmbeddingService.js', () => ({ getEmbeddingService: () => ({
  embedBatch: async (texts: string[], model: string) => {
    const { getTenantScope } = await import('../../../db/tenantStore.js');
    h.embeddingCalls.push({ texts: [...texts], model, tenantId: getTenantScope()?.tenantId });
    if (h.providerFails) throw new Error('controlled embedding refusal');
    return texts.map(() => ({ embedding: [0.1, 0.2, 0.3] }));
  },
}) }));

import { backfillVaultChunks } from '../document-chunking-backfill.service';
import { chunkExtractedText, MAX_CHUNKS } from '../document-chunking.service';

const ORG = 42;
const DOC = '20000000-0000-4000-8000-000000000042';
const TEXT = '\ufeff\r\n  Diagnostic sensitivity β 🧬 94% 日本語。\r\n\t';

function candidate(text: string): void {
  h.candidate = {
    id: DOC, file_name: 'diagnostics-study.pdf', extracted_text: text,
    catalog_status: 'extracted', chunk_status: null, content_hash: 'a'.repeat(64),
    page_count: null, uncatalogued: false,
  };
}
function requiredCall(fragment: string): Call {
  const found = h.calls.find(call => call.sql.includes(fragment));
  if (!found) throw new Error(`Expected a controlled query containing ${fragment}`);
  return found;
}
const inserted = () => h.calls.filter(call => call.sql.includes('INSERT INTO vault.document_chunks'));
const transactionStatements = () => h.calls.map(call => call.sql).filter(sql => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql));

beforeEach(() => {
  h.calls.length = 0;
  h.embeddingCalls.length = 0;
  h.candidate = null;
  h.eligible = true;
  h.insertCount = 0;
  h.failInsertAt = -1;
  h.releaseCount = 0;
  h.providerFails = false;
});

describe('raw backfill source respects the existing writer boundaries', () => {
  it('refuses the entire raw source when edge whitespace puts it above MAX_CHUNKS', async () => {
    // Current canonical defaults: 4000-unit windows and 400-unit overlap.
    const body = 'x'.repeat(4000 + (MAX_CHUNKS - 1) * 3600);
    const raw = `${body}${' '.repeat(3600)}`;
    expect(chunkExtractedText(body)).toHaveLength(MAX_CHUNKS);
    expect(chunkExtractedText(raw)).toHaveLength(MAX_CHUNKS + 1);
    candidate(raw);
    const report = await backfillVaultChunks(ORG, { apply: true, embed: false });
    expect(report).toMatchObject({ examined: 1, indexed: 0, chunksWritten: 0, skipped: [] });
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0]).toMatchObject({ documentId: DOC, fileName: 'diagnostics-study.pdf' });
    expect(report.failed[0].reason).toContain('refusing to index a truncated prefix');
    expect(transactionStatements()).toEqual([]);
    expect(inserted()).toEqual([]);
    expect(h.embeddingCalls).toEqual([]);
    const ledger = requiredCall('UPDATE vault.document_catalog');
    expect(ledger.params.slice(0, 3)).toEqual([DOC, 'chunk_failed', null]);
    expect(ledger.params[4]).toBe(ORG);
  });

  it('sends the exact single-chunk source to the embedding seam under the owning tenant', async () => {
    candidate(TEXT);
    const report = await backfillVaultChunks(ORG, { apply: true, embed: true });
    expect(h.embeddingCalls).toEqual([{
      texts: [TEXT], model: 'text-embedding-3-small', tenantId: String(ORG),
    }]);
    expect(report).toMatchObject({ indexed: 1, chunksWritten: 1, failed: [] });
    const insert = requiredCall('INSERT INTO vault.document_chunks');
    expect(insert.params.slice(2, 6)).toEqual([TEXT, 0, TEXT.length, null]);
    expect(transactionStatements()).toEqual(['BEGIN', 'COMMIT']);
    expect(h.releaseCount).toBe(1);
  });

  it('still indexes every chunk when an unchanged source is exactly at MAX_CHUNKS', async () => {
    const text = 'x'.repeat(4000 + (MAX_CHUNKS - 1) * 3600);
    candidate(text);
    const report = await backfillVaultChunks(ORG, { apply: true, embed: false });
    expect(report).toMatchObject({ indexed: 1, chunksWritten: MAX_CHUNKS, failed: [], skipped: [] });
    expect(inserted()).toHaveLength(MAX_CHUNKS);
    const last = inserted().at(-1);
    if (!last) throw new Error('The exact-limit source must have a last chunk');
    expect(last.params[4]).toBe(text.length);
    expect(transactionStatements()).toEqual(['BEGIN', 'COMMIT']);
    expect(h.embeddingCalls).toEqual([]);
  });

  it('keeps a selected candidate whose current eligibility disappeared away from the provider', async () => {
    candidate(TEXT);
    // The synthetic current writer lookup refuses after a successful candidate selection.
    h.eligible = false;
    const report = await backfillVaultChunks(ORG, { apply: true, embed: true });
    expect(report).toMatchObject({ indexed: 0, chunksWritten: 0 });
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].reason).toContain('not in the caller\'s organization');
    expect(h.embeddingCalls).toEqual([]);
    expect(transactionStatements()).toEqual([]);
    expect(inserted()).toEqual([]);
    expect(requiredCall('SELECT 1 FROM vault.documents').params).toEqual([DOC, ORG]);
  });

  it('keeps a writer failure named and ledgered without committing a partial chunk set', async () => {
    candidate(`\r\n${'x'.repeat(8000)}\t`);
    h.failInsertAt = 1;
    const report = await backfillVaultChunks(ORG, { apply: true, embed: false });
    expect(report).toMatchObject({ indexed: 0, chunksWritten: 0, skipped: [] });
    expect(report.failed).toHaveLength(1);
    expect(report.failed[0].reason).toContain('controlled chunk storage failure');
    expect(transactionStatements()).toEqual(['BEGIN', 'ROLLBACK']);
    expect(h.releaseCount).toBe(1);
    const ledger = requiredCall('UPDATE vault.document_catalog');
    expect(ledger.params.slice(0, 3)).toEqual([DOC, 'chunk_failed', null]);
    expect(h.embeddingCalls).toEqual([]);
  });

  it('preserves the raw source when an embedding refusal falls back to keyless indexing', async () => {
    candidate(TEXT);
    h.providerFails = true;
    const report = await backfillVaultChunks(ORG, { apply: true, embed: true });
    expect(report).toMatchObject({ indexed: 1, chunksWritten: 1, failed: [] });
    expect(h.embeddingCalls[0].texts).toEqual([TEXT]);
    const insert = requiredCall('INSERT INTO vault.document_chunks');
    expect(insert.params.slice(2, 7)).toEqual([TEXT, 0, TEXT.length, null, null]);
    expect(insert.sql).not.toContain('$10::vector');
    expect(transactionStatements()).toEqual(['BEGIN', 'COMMIT']);
    const ledger = requiredCall('UPDATE vault.document_catalog');
    expect(ledger.params.slice(0, 3)).toEqual([DOC, 'chunked', 1]);
    expect(ledger.params[3]).toContain('Not embedded: controlled embedding refusal');
  });
});
