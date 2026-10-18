/**
 * D2 / W2 — capture-level OCR coverage
 * (docs/evidence/D2-OCR-BUDGET/2026-10-18/CONTRACT.md, "Interfaces (exact)",
 * data-room-processing.ts, as amended by Amendment A).
 *
 * Written from the contract only, fail-first against the baseline bytes:
 *   - extractCapture opts into the automatic budget and copies the
 *     extractor's coverage; pageCount is unchanged;
 *   - processing writes provenance.extractionCoverage, strips a stale one,
 *     keeps the previous one when a failed re-read retains persisted text, and
 *     completes a partial read with reasonCode EXTRACTION_PARTIAL while the
 *     stage record and extraction_status stay as they were;
 *   - boundExtraction refuses a pre-extraction whose coverage is malformed.
 *
 * Same sequential PGlite fixture as data-room-processing-recovery: no external
 * database, file loader, model or OCR engine is reached. The extractor is the
 * injected seam.
 */
import { beforeAll, beforeEach, afterAll, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';

const seam = vi.hoisted(() => ({ query: vi.fn(), extract: vi.fn(), load: vi.fn(), profile: vi.fn(), warn: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: seam.query, connect: async () => ({ query: seam.query, release: () => undefined }) } }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ warn: seam.warn, info: vi.fn(), error: vi.fn() }) }));
vi.mock('../dataset-profile.js', () => ({ profileDataset: seam.profile }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'test', resolveOrgVaultView: async () => 'test',
  classifyForFiling: () => ({ evidenceKind: 'protocol', folderId: null, ctdSection: null, confidence: 0, needsReview: true, rationale: 'test seam' }),
}));

import { extractCapture, processCapturedSource } from '../data-room-processing';
import { bootstrapRecoverySchema } from './data-room-processing-recovery.fixture';

let ORG = 902041;
let PROGRAM = randomUUID();
const BODY = 'Clinical study protocol version 2.0. Cardiotoxicity monitoring is required.';
const DIGEST = createHash('sha256').update(BODY).digest('hex');
const REVISION = 'capture-extraction:v1';
let db: PGlite;
const transactionalDb = { query: (sql: string, args?: unknown[]) => seam.query(sql, args), connect: async () => ({ query: (sql: string, args?: unknown[]) => seam.query(sql, args), release: () => undefined }) };
const input = (over: Record<string, unknown> = {}) => ({ bytes: Buffer.from(BODY), fileName: 'Protocol.txt', mimeType: 'text/plain', programId: PROGRAM, processedBy: 'test', ...over });
const opts = () => ({ db: transactionalDb });

const PAGE_BUDGET = { pageCount: 250, pagesRead: 100, limitedBy: 'page_budget' } as const;
const TIME_BUDGET = { pageCount: 40, pagesRead: 17, limitedBy: 'time_budget' } as const;
const OCR_FAILED = { pageCount: 7, pagesRead: null, limitedBy: 'ocr_failed' } as const;
const COMPLETE_OCR = { pageCount: 3, pagesRead: 3, limitedBy: null } as const;

const exec = {
  query: async (sql: string, params?: unknown[]) => {
    const result = await db.query(sql, params);
    return { rows: result.rows as any[], rowCount: result.affectedRows ?? result.rows.length };
  },
};

async function seed(status: string) {
  const fileId = randomUUID();
  const storagePath = `uploads/org-${ORG}/${fileId}`;
  await exec.query(`INSERT INTO file_uploads (id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES ($1,$2,'Protocol.txt','text/plain',$3,$4,$5,'uploaded')`, [fileId, ORG, Buffer.byteLength(BODY), storagePath, DIGEST]);
  const r = await exec.query(`INSERT INTO cre_evidence_sources
      (organization_id, client_program_id, source_type, title, checksum, stored_artifact_ref, is_current, extraction_status, extracted_text, provenance, metadata, deleted_at, client_workspace_id)
    VALUES ($1,$2,'client_document','Protocol.txt',$3,$4,true,$5,NULL,$6::jsonb,$7::jsonb,NULL,NULL)
    RETURNING id`, [ORG, PROGRAM, DIGEST, storagePath, status,
    JSON.stringify({ fileUploadId: fileId }), JSON.stringify({ mimeType: 'text/plain', unrelated: 'preserve' })]);
  return Number(r.rows[0].id);
}

async function state(id: number) {
  const r = await exec.query('SELECT * FROM cre_evidence_sources WHERE id=$1', [id]);
  return r.rows[0];
}
async function stage(id: number) { return (await state(id)).metadata?.dataRoomProcessing; }

beforeAll(async () => {
  db = new PGlite();
  await bootstrapRecoverySchema(db);
}, 60000);

beforeEach(async () => {
  ORG += 1; PROGRAM = randomUUID();
  await exec.query('INSERT INTO regulatory_programs(id,organization_id) VALUES($1,$2)', [PROGRAM, ORG]);
  seam.query.mockReset().mockImplementation(exec.query);
  seam.warn.mockReset();
  seam.profile.mockReset().mockResolvedValue(null);
  seam.extract.mockReset().mockResolvedValue({ text: BODY, method: 'plain-text', pageSpans: [] });
  seam.load.mockReset().mockImplementation(async (fileId: string) => {
    const r = await exec.query('SELECT storage_path FROM file_uploads WHERE id=$1', [fileId]);
    return { fileId, storagePath: r.rows[0]?.storage_path, buffer: Buffer.from(BODY), fileName: 'Protocol.txt', mimeType: 'text/plain', integrity: 'verified' };
  });
});

afterAll(async () => { await db.close(); });

const TWO_SPANS = [{ page: 1, start: 0, end: 36 }, { page: 2, start: 37, end: BODY.length }];

describe('extractCapture — coverage is copied from the extractor', () => {
  it('opts into the automatic budget: extractDocumentText receives { pdfOcrBudget: { maxPages: 100, maxDurationMs: 600_000 } }', async () => {
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-text', pageSpans: TWO_SPANS });
    await extractCapture(Buffer.from(BODY), 'application/pdf', 'binder.pdf');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    expect(seam.extract).toHaveBeenCalledWith(expect.any(Buffer), 'application/pdf', 'binder.pdf',
      { pdfOcrBudget: { maxPages: 100, maxDurationMs: 600_000 } });
  });

  it('copies a page_budget coverage onto the capture', async () => {
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', confidence: 88, pageSpans: TWO_SPANS, coverage: { ...PAGE_BUDGET } });
    const captured = await extractCapture(Buffer.from(BODY), 'application/pdf', 'binder.pdf');
    expect(captured.text).toBe(BODY);
    expect((captured as { coverage?: unknown }).coverage).toEqual(PAGE_BUDGET);
  });

  it('copies an ocr_failed coverage from a thin text layer', async () => {
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-text', coverage: { ...OCR_FAILED } });
    const captured = await extractCapture(Buffer.from(BODY), 'application/pdf', 'scan.pdf');
    expect(captured.method).toBe('pdf-text');
    expect((captured as { coverage?: unknown }).coverage).toEqual(OCR_FAILED);
  });

  it('CONTROL: pageCount is still the number of page spans, not the coverage page count', async () => {
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', confidence: 88, pageSpans: TWO_SPANS, coverage: { ...PAGE_BUDGET } });
    const captured = await extractCapture(Buffer.from(BODY), 'application/pdf', 'binder.pdf');
    expect(captured.pageCount).toBe(2);
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', coverage: { ...PAGE_BUDGET } });
    expect((await extractCapture(Buffer.from(BODY), 'application/pdf', 'binder.pdf')).pageCount).toBeNull();
  });

  it('CONTROL: an extraction without coverage yields a capture without coverage', async () => {
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-text', pageSpans: TWO_SPANS });
    const captured = await extractCapture(Buffer.from(BODY), 'application/pdf', 'protocol.pdf');
    expect(captured).not.toHaveProperty('coverage');
    expect(captured.pageCount).toBe(2);
  });
});

describe('capture processing — extractionCoverage and EXTRACTION_PARTIAL', () => {
  it.each([
    ['page_budget', PAGE_BUDGET],
    ['time_budget', TIME_BUDGET],
    ['ocr_failed', OCR_FAILED],
  ] as const)('a %s read completes with EXTRACTION_PARTIAL and records extractionCoverage', async (_kind, coverage) => {
    const id = await seed('pending');
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', pageSpans: TWO_SPANS, coverage: { ...coverage } });
    const done = await processCapturedSource(ORG, id, input(), opts());
    expect(done).toMatchObject({ ok: true, processed: true, status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' });
    expect((done.extracted as { coverage?: unknown } | undefined)?.coverage).toEqual(coverage);
    const row = await state(id);
    expect(row.provenance.extractionCoverage).toEqual(coverage);
    expect(row.extracted_text).toBe(BODY);
    // The stage record and the readable status are unchanged by a partial read.
    expect(row.extraction_status).toBe('extracted');
    expect(row.page_count).toBe(2);
    expect(await stage(id)).toMatchObject({ state: 'completed', reasonCode: null });
  });

  it('a complete OCR read records its coverage and completes with no reasonCode', async () => {
    const id = await seed('pending');
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', pageSpans: TWO_SPANS, coverage: { ...COMPLETE_OCR } });
    const done = await processCapturedSource(ORG, id, input(), opts());
    expect(done.status).toBe('completed');
    expect(done.reasonCode).toBeUndefined();
    expect((await state(id)).provenance.extractionCoverage).toEqual(COMPLETE_OCR);
  });

  it('CONTROL: a read with no coverage completes with no reasonCode and no extractionCoverage', async () => {
    const id = await seed('pending');
    const done = await processCapturedSource(ORG, id, input(), opts());
    expect(done.status).toBe('completed');
    expect(done.reasonCode).toBeUndefined();
    const row = await state(id);
    expect(row.provenance).not.toHaveProperty('extractionCoverage');
    expect(row.extraction_status).toBe('extracted');
    expect(await stage(id)).toMatchObject({ state: 'completed', reasonCode: null });
  });

  it('a complete read strips a stale extractionCoverage, the way it strips extractionError', async () => {
    const id = await seed('pending');
    await exec.query(`UPDATE cre_evidence_sources SET provenance=provenance||$2::jsonb WHERE id=$1`,
      [id, JSON.stringify({ extractionCoverage: PAGE_BUDGET })]);
    expect((await state(id)).provenance.extractionCoverage).toEqual(PAGE_BUDGET);
    const done = await processCapturedSource(ORG, id, input(), opts());
    expect(done.status).toBe('completed');
    expect(done.reasonCode).toBeUndefined();
    expect((await state(id)).provenance).not.toHaveProperty('extractionCoverage');
  });

  it('a later complete re-read of a partially read capture removes its extractionCoverage', async () => {
    const id = await seed('pending');
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', pageSpans: TWO_SPANS, coverage: { ...PAGE_BUDGET } });
    expect((await processCapturedSource(ORG, id, input(), opts())).reasonCode).toBe('EXTRACTION_PARTIAL');
    expect((await state(id)).provenance.extractionCoverage).toEqual(PAGE_BUDGET);
    // Re-open the capture for a re-read: an expired running lease with no
    // readable text, the shape the recovery suite uses for a reclaimable row.
    const done = await stage(id);
    const running = { ...done, state: 'running', claimedAt: '2000-01-01T00:00:00.000Z', leaseExpiresAt: '2000-01-01T00:15:00.000Z', completedAt: null };
    await exec.query(`UPDATE cre_evidence_sources SET extracted_text=NULL,extraction_status='pending',metadata=jsonb_set(metadata,'{dataRoomProcessing}',$2::jsonb) WHERE id=$1`, [id, JSON.stringify(running)]);
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-text', pageSpans: TWO_SPANS });
    const reread = await processCapturedSource(ORG, id, input(), opts());
    expect(reread.status).toBe('completed');
    expect(reread.reasonCode).toBeUndefined();
    expect(seam.extract).toHaveBeenCalledTimes(2);
    const row = await state(id);
    expect(row.extracted_text).toBe(BODY);
    expect(row.provenance).not.toHaveProperty('extractionCoverage');
  });
});

describe('retained text keeps its coverage (Amendment A)', () => {
  /** Re-open a completed capture for a re-read while KEEPING its persisted text. */
  async function reopenKeepingText(id: number) {
    const done = await stage(id);
    const running = { ...done, state: 'running', claimedAt: '2000-01-01T00:00:00.000Z', leaseExpiresAt: '2000-01-01T00:15:00.000Z', completedAt: null };
    await exec.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing}',$2::jsonb) WHERE id=$1`, [id, JSON.stringify(running)]);
  }

  it('a re-read that yields no text keeps the persisted text AND its previous extractionCoverage', async () => {
    const id = await seed('pending');
    seam.extract.mockResolvedValue({ text: BODY, method: 'pdf-ocr', pageSpans: TWO_SPANS, coverage: { ...PAGE_BUDGET } });
    expect((await processCapturedSource(ORG, id, input(), opts())).reasonCode).toBe('EXTRACTION_PARTIAL');
    expect((await state(id)).provenance.extractionCoverage).toEqual(PAGE_BUDGET);
    await reopenKeepingText(id);
    // The failed attempt carries a different coverage; it must not replace the retained one.
    seam.extract.mockResolvedValue({ text: '', method: 'pdf-ocr', coverage: { ...OCR_FAILED } });
    const reread = await processCapturedSource(ORG, id, input(), opts());
    expect(reread.status).toBe('extraction_failed');
    expect(seam.extract).toHaveBeenCalledTimes(2);
    const row = await state(id);
    // The persisted text is retained (the UPDATE's CASE keeps it when the new read has none).
    expect(row.extracted_text).toBe(BODY);
    expect(row.provenance.extractionCoverage).toEqual(PAGE_BUDGET);
  });

  it('a failed read with no persisted text removes a stale extractionCoverage', async () => {
    const id = await seed('pending');
    await exec.query(`UPDATE cre_evidence_sources SET provenance=provenance||$2::jsonb WHERE id=$1`,
      [id, JSON.stringify({ extractionCoverage: PAGE_BUDGET })]);
    seam.extract.mockResolvedValue({ text: '', method: 'plain-text' });
    expect((await processCapturedSource(ORG, id, input(), opts())).status).toBe('extraction_failed');
    const row = await state(id);
    expect(row.extracted_text).toBeNull();
    expect(row.provenance).not.toHaveProperty('extractionCoverage');
  });
});

describe('boundExtraction — pre-extracted coverage must be well formed', () => {
  const CACHED = 'Cached interpretation of the same bytes that must not be trusted.';
  const bound = (coverage: unknown) => ({
    text: CACHED, method: 'pdf-ocr', pageCount: null, words: 10, sourceSha256: DIGEST, extractionRevision: REVISION, coverage,
  });

  it.each([
    ['negative pagesRead', { pageCount: 3, pagesRead: -1, limitedBy: 'page_budget' }],
    ['unknown limitedBy', { pageCount: 3, pagesRead: 3, limitedBy: 'bogus' }],
    ['string pageCount', { pageCount: '250', pagesRead: 100, limitedBy: 'page_budget' }],
    ['non-object coverage', 'partial'],
  ])('a pre-extraction with %s is not reused; the bytes are read again', async (_kind, coverage) => {
    const id = await seed('pending');
    const done = await processCapturedSource(ORG, id, input({ preExtracted: bound(coverage) }), opts());
    expect(done.status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1);
    const row = await state(id);
    expect(row.extracted_text).toBe(BODY);
    expect(row.provenance).not.toHaveProperty('extractionCoverage');
  });

  it('CONTROL: a pre-extraction with well-formed coverage is reused without re-reading', async () => {
    const id = await seed('pending');
    const done = await processCapturedSource(ORG, id, input({ preExtracted: bound({ ...PAGE_BUDGET }) }), opts());
    expect(done.status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).extracted_text).toBe(CACHED);
  });

  it('a reused well-formed partial pre-extraction completes EXTRACTION_PARTIAL with its coverage recorded', async () => {
    const id = await seed('pending');
    const done = await processCapturedSource(ORG, id, input({ preExtracted: bound({ ...OCR_FAILED }) }), opts());
    expect(done).toMatchObject({ status: 'completed', reasonCode: 'EXTRACTION_PARTIAL' });
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).provenance.extractionCoverage).toEqual(OCR_FAILED);
  });
});
