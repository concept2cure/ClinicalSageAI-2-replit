/** Real capture processor, claims and PostgreSQL-shaped writes under PGlite.
 * Only extractor/original-file/classification/profile I/O is synthetic. */
import { createHash, randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';

const seam = vi.hoisted(() => ({ query: vi.fn(), extract: vi.fn(), load: vi.fn(), profile: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: seam.query } }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock('../dataset-profile.js', () => ({ profileDataset: seam.profile }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'synthetic', resolveOrgVaultView: async () => 'synthetic',
  classifyForFiling: () => ({ evidenceKind: 'protocol', folderId: null, ctdSection: null, confidence: 0, needsReview: true, rationale: 'synthetic' }),
}));

import { processCapturedSource, type ExtractedCapture, type SourceProcessingInput } from '../data-room-processing';
import { bootstrapRecoverySchema } from './data-room-processing-recovery.fixture';

interface Receipt {
  version: number;
  sourceSha256: string;
  extractedTextSha256: string;
  method: string;
  pageSpans: Array<{ page: number; start: number; end: number }>;
  ocrConfidence?: number;
}
interface Candidate {
  text: string; method: string; pageCount: number; words: number;
  sourceSha256: string; extractionRevision: 'capture-extraction:v1';
  coverage?: { pageCount: number; pagesRead: number; limitedBy: 'page_budget' | 'time_budget' | null };
  extractionEvidence?: Receipt;
}
const ORIGINAL = Buffer.from('Synthetic original PDF bytes for cache admission controls.');
const CACHED = '治験 🧬 cached extraction. Device performance requires expert review.';
const FRESH = 'Current synthetic extraction from the verified original.';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const DIGEST = hash(ORIGINAL);
let org = 914200;
let program = randomUUID();
let db: PGlite;
let pauseConnect: { entered: ReturnType<typeof deferred>; release: ReturnType<typeof deferred> } | undefined;

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>(done => { resolve = done; });
  return { promise, resolve };
}
const exec = {
  query: async (sql: string, args?: unknown[]) => {
    const result = await db.query(sql, args);
    return { rows: result.rows as any[], rowCount: result.affectedRows ?? result.rows.length };
  },
};
const transactionalDb = {
  query: (sql: string, args?: unknown[]) => seam.query(sql, args),
  connect: async () => {
    const held = pauseConnect;
    pauseConnect = undefined;
    if (held) { held.entered.resolve(); await held.release.promise; }
    return { query: (sql: string, args?: unknown[]) => seam.query(sql, args), release: () => undefined };
  },
};
function cached(): Candidate {
  return { text: CACHED, method: 'pdf-ocr', pageCount: 2, words: 10,
    sourceSha256: DIGEST, extractionRevision: 'capture-extraction:v1',
    coverage: { pageCount: 2, pagesRead: 2, limitedBy: null },
    extractionEvidence: { version: 1, sourceSha256: DIGEST, extractedTextSha256: hash(CACHED), method: 'pdf-ocr',
      pageSpans: [{ page: 3, start: 0, end: 23 }, { page: 5, start: 24, end: CACHED.length }], ocrConfidence: 85 } };
}
function input(candidate?: Candidate): SourceProcessingInput {
  // Intentional boundary for malformed receipt fixtures; works against the old
  // export before its optional receipt property exists, without import failures.
  return { bytes: Buffer.from(ORIGINAL), fileName: 'Scan.pdf', mimeType: 'application/pdf', programId: program, processedBy: 'cache proof',
    ...(candidate ? { preExtracted: candidate as unknown as ExtractedCapture } : {}) };
}
async function seed() {
  const fileId = randomUUID();
  const path = `uploads/org-${org}/${fileId}`;
  await exec.query(`INSERT INTO file_uploads (id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES ($1,$2,'Scan.pdf','application/pdf',$3,$4,$5,'uploaded')`, [fileId, org, ORIGINAL.length, path, DIGEST]);
  const result = await exec.query(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,stored_artifact_ref,is_current,extraction_status,extracted_text,provenance,metadata,deleted_at,client_workspace_id)
    VALUES ($1,$2,'client_document','Scan.pdf',$3,$4,true,'pending',NULL,$5::jsonb,$6::jsonb,NULL,NULL) RETURNING id`,
  [org, program, DIGEST, path, JSON.stringify({ fileUploadId: fileId }), JSON.stringify({ mimeType: 'application/pdf', unrelated: 'keep' })]);
  return Number(result.rows[0].id);
}
async function state(id: number) { return (await exec.query('SELECT * FROM cre_evidence_sources WHERE id=$1', [id])).rows[0]; }
const options = () => ({ db: transactionalDb });

beforeAll(async () => {
  db = new PGlite();
  await bootstrapRecoverySchema(db);
}, 60_000);
beforeEach(async () => {
  org += 1; program = randomUUID(); pauseConnect = undefined;
  await exec.query('INSERT INTO regulatory_programs(id,organization_id) VALUES($1,$2)', [program, org]);
  seam.query.mockReset().mockImplementation(exec.query);
  seam.profile.mockReset().mockResolvedValue(null);
  seam.extract.mockReset().mockResolvedValue({ text: FRESH, method: 'pdf-ocr', confidence: 40 });
  seam.load.mockReset().mockImplementation(async (fileId: string) => {
    const row = (await exec.query('SELECT storage_path FROM file_uploads WHERE id=$1', [fileId])).rows[0];
    return { fileId, storagePath: row.storage_path, buffer: Buffer.from(ORIGINAL), fileName: 'Scan.pdf', mimeType: 'application/pdf', integrity: 'verified' };
  });
});
afterAll(async () => { await db.close(); });

describe('cached extraction receipt binding', () => {
  it('CONTROL: reuses a valid original/text/method-bound receipt without a fresh extraction', async () => {
    const id = await seed();
    const candidate = cached();
    const result = await processCapturedSource(org, id, input(candidate), options());
    expect(result.status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect(result.extracted).toMatchObject({ text: CACHED, extractionEvidence: candidate.extractionEvidence });
    expect((await state(id)).extracted_text).toBe(CACHED);
  });

  const corruptions: Array<[string, (receipt: Receipt) => void]> = [
    ['original digest', receipt => { receipt.sourceSha256 = 'f'.repeat(64); }],
    ['text digest', receipt => { receipt.extractedTextSha256 = hash(FRESH); }],
    ['method', receipt => { receipt.method = 'image-ocr'; }],
    ['future version', receipt => { receipt.version = 2; }],
    ['nonpositive page', receipt => { receipt.pageSpans[0].page = 0; }],
    ['reversed source pages', receipt => { receipt.pageSpans[1].page = 2; }],
    ['overlapping spans', receipt => { receipt.pageSpans[1].start = 10; }],
    ['out-of-text span', receipt => { receipt.pageSpans[1].end = CACHED.length + 1; }],
    ['fractional span', receipt => { receipt.pageSpans[0].end = 22.5; }],
    ['split surrogate pair', receipt => { receipt.pageSpans[0].end = 4; }],
    ['confidence below scale', receipt => { receipt.ocrConfidence = -1; }],
    ['confidence above scale', receipt => { receipt.ocrConfidence = 101; }],
    ['nonfinite confidence', receipt => { receipt.ocrConfidence = NaN; }],
    ['empty page map', receipt => { receipt.pageSpans = []; }],
  ];
  it.each(corruptions)('re-extracts instead of reusing a cached receipt with %s', async (_name, corrupt) => {
    const id = await seed();
    const candidate = cached();
    corrupt(candidate.extractionEvidence!);
    const result = await processCapturedSource(org, id, input(candidate), options());
    expect(result.status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect(result.extracted?.text).toBe(FRESH);
    expect((await state(id)).extracted_text).toBe(FRESH);
  });

  it.each([null, {}, [], 'untrusted receipt'])('re-extracts instead of treating malformed provided evidence as legacy absence: %j', async evidence => {
    const id = await seed();
    const candidate = Object.assign(cached(), { extractionEvidence: evidence });
    const result = await processCapturedSource(org, id, input(candidate), options());
    expect(result.status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect(result.extracted?.text).toBe(FRESH);
  });

  it('re-extracts when an otherwise matching non-OCR receipt claims an OCR confidence', async () => {
    const id = await seed();
    const candidate = cached();
    candidate.method = 'pdf-text'; candidate.extractionEvidence!.method = 'pdf-text';
    const result = await processCapturedSource(org, id, input(candidate), options());
    expect(result.status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect(result.extracted?.text).toBe(FRESH);
  });

  it('CONTROL: supports a bound legacy pre-extraction without a receipt', async () => {
    const id = await seed();
    const candidate = cached(); delete candidate.extractionEvidence;
    const result = await processCapturedSource(org, id, input(candidate), options());
    expect(result.status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect(result.extracted?.text).toBe(CACHED);
    expect(result.extracted).not.toHaveProperty('extractionEvidence');
  });
});

describe('cache snapshots before asynchronous admission', () => {
  it.each(['receipt', 'spans', 'coverage'] as const)('keeps the original %s when the caller mutates it during admission', async target => {
    const id = await seed();
    const candidate = cached();
    const original = globalThis.structuredClone(candidate);
    const held = { entered: deferred(), release: deferred() };
    pauseConnect = held;
    const pending = processCapturedSource(org, id, input(candidate), options());
    await held.entered.promise;
    try {
      if (target === 'receipt') {
        candidate.extractionEvidence!.extractedTextSha256 = hash(FRESH);
        candidate.extractionEvidence!.ocrConfidence = 1;
      } else if (target === 'spans') {
        candidate.extractionEvidence!.pageSpans[0].end = 8;
        candidate.extractionEvidence!.pageSpans.push({ page: 9, start: CACHED.length, end: CACHED.length });
      } else {
        candidate.coverage!.pageCount = 30;
        candidate.coverage!.pagesRead = 1;
        candidate.coverage!.limitedBy = 'time_budget';
      }
    } finally { held.release.resolve(); }
    const result = await pending;
    expect(result.status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect(result.extracted).toMatchObject({ text: CACHED, extractionEvidence: original.extractionEvidence, coverage: original.coverage });
    expect(result.reasonCode).toBeUndefined();
    expect((await state(id)).provenance.extractionCoverage).toEqual(original.coverage);
  });
});

describe('existing original and current-source authority controls', () => {
  it('CONTROL: a matching cache never bypasses a foreign-tenant source refusal', async () => {
    const id = await seed();
    const result = await processCapturedSource(org + 100_000, id, input(cached()), options());
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'SOURCE_NOT_FOUND' });
    expect(seam.load).not.toHaveBeenCalled(); expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).extracted_text).toBeNull();
  });
  it('CONTROL: a matching cache never bypasses a superseded source refusal', async () => {
    const id = await seed();
    await exec.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [id]);
    const result = await processCapturedSource(org, id, input(cached()), options());
    expect(result).toMatchObject({ status: 'stale_source', reasonCode: 'SOURCE_SUPERSEDED' });
    expect(seam.load).not.toHaveBeenCalled(); expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).extracted_text).toBeNull();
  });
  it('CONTROL: a matching cache still requires verified original bytes', async () => {
    const id = await seed();
    const load = seam.load.getMockImplementation()!;
    seam.load.mockImplementation(async (fileId: string) => ({ ...await load(fileId), buffer: Buffer.from('substituted original') }));
    const result = await processCapturedSource(org, id, input(cached()), options());
    expect(result).toMatchObject({ status: 'blocked', reasonCode: 'ORIGINAL_INTEGRITY_FAILED' });
    expect(seam.extract).not.toHaveBeenCalled(); expect((await state(id)).extracted_text).toBeNull();
  });
});
