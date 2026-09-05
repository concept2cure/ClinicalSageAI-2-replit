/**
 * The vault chunk backfill — what it indexes, what it refuses to claim, and
 * what it must never do on a dry run. The database is injected, so these are
 * assertions about the sweep's own decisions rather than about Postgres.
 *
 * The properties under test are the ones an operator's trust rests on: a dry
 * run spends nothing and writes nothing; a document with no text is reported
 * as skipped WITH its reason rather than counted as indexed; a failure is
 * named rather than folded into the total; and every read is bound to the
 * caller's organization.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const chunkAndEmbedDocument = vi.hoisted(() => vi.fn());
const recordChunkOutcome = vi.hoisted(() => vi.fn(async () => {}));

vi.mock('../document-chunking.service.js', () => ({ chunkAndEmbedDocument, recordChunkOutcome }));
vi.mock('../../../db.js', () => ({ pool: { query: vi.fn(), connect: vi.fn() } }));

import { backfillVaultChunks } from '../document-chunking-backfill.service';

const ORG = 42;
type Row = {
  id: string;
  file_name: string | null;
  extracted_text: string | null;
  catalog_status: string | null;
  chunk_status: string | null;
};

const row = (over: Partial<Row> = {}): Row => ({
  id: `doc-${Math.random().toString(16).slice(2, 8)}`,
  file_name: 'study.pdf',
  extracted_text: 'Real extracted text of the study report.',
  catalog_status: 'extracted',
  chunk_status: null,
  ...over,
});

let queries: Array<{ sql: string; params: unknown[] }>;
const execWith = (rows: Row[]) => ({
  query: vi.fn(async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    return { rows, rowCount: rows.length };
  }),
});

beforeEach(() => {
  queries = [];
  chunkAndEmbedDocument.mockReset();
  recordChunkOutcome.mockClear();
  chunkAndEmbedDocument.mockResolvedValue({ ok: true, chunkCount: 3 });
});

describe('backfillVaultChunks — the dry run', () => {
  it('writes nothing and spends no embeddings', async () => {
    const r = await backfillVaultChunks(ORG, { exec: execWith([row(), row()]) });
    expect(r.dryRun).toBe(true);
    expect(r.examined).toBe(2);
    expect(r.indexed).toBe(0);
    expect(r.chunksWritten).toBe(0);
    expect(chunkAndEmbedDocument).not.toHaveBeenCalled();
    expect(recordChunkOutcome).not.toHaveBeenCalled();
  });

  it('still reports what cannot be indexed, so the report is actionable', async () => {
    const r = await backfillVaultChunks(ORG, {
      exec: execWith([row({ extracted_text: '', catalog_status: 'extraction_failed', file_name: 'scan.pdf' })]),
    });
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].fileName).toBe('scan.pdf');
    expect(r.skipped[0].reason).toMatch(/Extraction failed/);
  });
});

describe('backfillVaultChunks — applying', () => {
  it('indexes documents that have text and counts the chunks written', async () => {
    const r = await backfillVaultChunks(ORG, { apply: true, exec: execWith([row(), row()]) });
    expect(r.indexed).toBe(2);
    expect(r.chunksWritten).toBe(6);
    expect(r.failed).toHaveLength(0);
    expect(chunkAndEmbedDocument).toHaveBeenCalledTimes(2);
    // Every call carries the caller's organization — the writer refuses without it.
    for (const call of chunkAndEmbedDocument.mock.calls) {
      expect(call[0].organizationId).toBe(ORG);
    }
  });

  it('a document with no text is skipped with its reason, never counted as indexed', async () => {
    const r = await backfillVaultChunks(ORG, {
      apply: true,
      exec: execWith([row(), row({ extracted_text: null, catalog_status: null, file_name: 'legacy.doc' })]),
    });
    expect(r.indexed).toBe(1);
    expect(r.skipped).toHaveLength(1);
    expect(r.skipped[0].reason).toMatch(/No extracted text/);
    expect(chunkAndEmbedDocument).toHaveBeenCalledTimes(1);
  });

  it('a failure is named and ledgered, not folded into the total', async () => {
    chunkAndEmbedDocument.mockResolvedValueOnce({ ok: false, chunkCount: 0, error: 'Embedding failed: provider 500' });
    const r = await backfillVaultChunks(ORG, { apply: true, exec: execWith([row({ file_name: 'bad.pdf' })]) });
    expect(r.indexed).toBe(0);
    expect(r.failed).toHaveLength(1);
    expect(r.failed[0].fileName).toBe('bad.pdf');
    expect(r.failed[0].reason).toMatch(/provider 500/);
    // The ledger is written for the failure too, so the next run can retry it.
    expect(recordChunkOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ organizationId: ORG, result: expect.objectContaining({ ok: false }) }),
    );
  });
});

describe('backfillVaultChunks — the candidate set', () => {
  it('is bound to the organization and skips already-indexed documents', async () => {
    await backfillVaultChunks(ORG, { exec: execWith([]) });
    const [q] = queries;
    expect(q.sql).toMatch(/regulatory_programs p ON p\.id = d\.program_id/);
    expect(q.sql).toMatch(/p\.organization_id = \$1/);
    expect(q.params[0]).toBe(ORG);
    // Resumability: only never-attempted documents by default.
    expect(q.sql).toMatch(/c\.chunk_status IS NULL/);
    expect(q.sql).not.toMatch(/chunk_failed/);
    expect(q.sql).toMatch(/d\.deleted_at IS NULL/);
  });

  it('takes previously failed documents only when a retry is asked for', async () => {
    await backfillVaultChunks(ORG, { retryFailed: true, exec: execWith([]) });
    expect(queries[0].sql).toMatch(/chunk_failed/);
  });

  it('clamps the limit so one run cannot sweep an unbounded corpus', async () => {
    await backfillVaultChunks(ORG, { limit: 100000, exec: execWith([]) });
    expect(queries[0].params[1]).toBe(500);
    queries = [];
    await backfillVaultChunks(ORG, { limit: 0, exec: execWith([]) });
    expect(queries[0].params[1]).toBe(1);
  });
});
