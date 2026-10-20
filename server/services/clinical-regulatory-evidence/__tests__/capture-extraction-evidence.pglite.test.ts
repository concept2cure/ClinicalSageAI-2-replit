/** Actual capture admission, durable claims and processing SQL under PGlite.
 * Only extraction/original-file/classification/profile I/O is synthetic. */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createHash, randomUUID } from 'node:crypto';

const seam = vi.hoisted(() => ({ query: vi.fn(), extract: vi.fn(), load: vi.fn(), profile: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query: seam.query,
  connect: async () => ({ query: seam.query, release: () => undefined }) } }));
vi.mock('../../../utils/logger.js', () => ({ createScopedLogger: () => ({ warn: vi.fn(), info: vi.fn(), error: vi.fn() }) }));
vi.mock('../dataset-profile.js', () => ({ profileDataset: seam.profile }));
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: seam.extract }));
vi.mock('../../ana/uploaded-file-access.js', () => ({ loadUploadedFile: seam.load }));
vi.mock('../../vault/vault-filing.service.js', () => ({
  resolveVaultView: async () => 'test', resolveOrgVaultView: async () => 'test',
  classifyForFiling: () => ({ evidenceKind: 'protocol', folderId: null, ctdSection: null,
    confidence: 0, needsReview: true, rationale: 'synthetic classification seam' }),
}));

import { processCapturedSource, recordSourceProcessing, type ExtractedCapture } from '../data-room-processing';
import { bootstrapRecoverySchema } from './data-room-processing-recovery.fixture';

const ORIGINAL = Buffer.from('Original synthetic capture bytes, distinct from the extracted text.');
const TEXT = 'Clinical study 🧬 protocol version 2.0.\nSafety endpoint 有害事象 was recorded.';
const NEXT = 'Updated study text.\nThe device result was 8 of 10 batches.';
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const SOURCE_HASH = hash(ORIGINAL);
const split = TEXT.indexOf('\n');
const SPANS = [{ page: 3, start: 0, end: split }, { page: 7, start: split + 1, end: TEXT.length }];
const REVISION = 'capture-extraction:v1' as const;
let organization = 904041;
let program = randomUUID();
let db: PGlite;
const exec = { query: async (sql: string, params?: unknown[]) => {
  const result = await db.query(sql, params);
  return { rows: result.rows as any[], rowCount: result.affectedRows ?? result.rows.length };
} };
const transactionalDb = { query: (sql: string, args?: unknown[]) => seam.query(sql, args),
  connect: async () => ({ query: (sql: string, args?: unknown[]) => seam.query(sql, args), release: () => undefined }) };
const input = (over: Record<string, unknown> = {}) => ({ bytes: Buffer.from(ORIGINAL), fileName: 'Protocol.txt',
  mimeType: 'text/plain', programId: program, processedBy: 'capture-evidence-test', ...over });
const options = () => ({ db: transactionalDb });
const receipt = (text = TEXT, method = 'pdf-ocr', extras: Record<string, unknown> = {}) => ({
  version: 1, sourceSha256: SOURCE_HASH, extractedTextSha256: hash(text), method,
  ...(text === TEXT ? { pageSpans: SPANS.map(span => ({ ...span })), ocrConfidence: 72.5 } : {}), ...extras,
});
const cached = (text = TEXT, method = 'pdf-ocr', evidence: unknown = receipt(text, method)) => ({
  text, method, pageCount: text === TEXT ? 2 : null, words: text.trim().split(/\s+/).length,
  sourceSha256: SOURCE_HASH, extractionRevision: REVISION, extractionEvidence: evidence,
});

async function seed(over: { current?: boolean; organization?: number } = {}) {
  const org = over.organization ?? organization;
  const fileId = randomUUID();
  const storagePath = `uploads/org-${org}/${fileId}`;
  await exec.query(`INSERT INTO file_uploads (id,organization_id,original_name,mime_type,file_size,storage_path,checksum_sha256,status)
    VALUES ($1,$2,'Protocol.txt','text/plain',$3,$4,$5,'uploaded')`, [fileId, org, ORIGINAL.length, storagePath, SOURCE_HASH]);
  const result = await exec.query(`INSERT INTO cre_evidence_sources
    (organization_id,client_program_id,source_type,title,checksum,stored_artifact_ref,is_current,
     extraction_status,extracted_text,provenance,metadata,deleted_at,client_workspace_id)
    VALUES ($1,$2,'client_document','Protocol.txt',$3,$4,$5,'pending',NULL,$6::jsonb,$7::jsonb,NULL,NULL) RETURNING id`,
  [org, program, SOURCE_HASH, storagePath, over.current ?? true,
    JSON.stringify({ fileUploadId: fileId, unrelatedProvenance: 'preserve' }),
    JSON.stringify({ mimeType: 'text/plain', unrelatedMetadata: 'preserve' })]);
  return Number(result.rows[0].id);
}
async function state(id: number) { return (await exec.query('SELECT * FROM cre_evidence_sources WHERE id=$1', [id])).rows[0]; }
async function reopen(id: number, keepText: boolean) {
  const stage = (await state(id)).metadata.dataRoomProcessing;
  const expired = { ...stage, state: 'running', claimedAt: '2000-01-01T00:00:00.000Z',
    leaseExpiresAt: '2000-01-01T00:15:00.000Z', completedAt: null };
  await exec.query(`UPDATE cre_evidence_sources SET metadata=jsonb_set(metadata,'{dataRoomProcessing}',$2::jsonb),
    extracted_text=CASE WHEN $3 THEN extracted_text ELSE NULL END WHERE id=$1`, [id, JSON.stringify(expired), keepText]);
}
async function primeReceipt(id: number) {
  expect((await processCapturedSource(organization, id, input(), options())).status).toBe('completed');
  // Prime a historical persisted receipt independently, so retention/clearing
  // assertions remain meaningful even on the baseline that never writes one.
  await exec.query(`UPDATE cre_evidence_sources SET provenance=provenance||$2::jsonb WHERE id=$1`,
    [id, JSON.stringify({ extractionEvidence: receipt() })]);
}

beforeAll(async () => { db = new PGlite(); await bootstrapRecoverySchema(db); }, 60000);
afterAll(async () => { await db.close(); });
beforeEach(async () => {
  organization += 1; program = randomUUID();
  await exec.query('INSERT INTO regulatory_programs(id,organization_id) VALUES($1,$2)', [program, organization]);
  seam.query.mockReset().mockImplementation(exec.query);
  seam.profile.mockReset().mockResolvedValue(null);
  seam.extract.mockReset().mockResolvedValue({ text: TEXT, method: 'pdf-ocr', confidence: 72.5,
    pageSpans: SPANS.map(span => ({ ...span })) });
  seam.load.mockReset().mockImplementation(async (fileId: string) => {
    const row = (await exec.query('SELECT storage_path FROM file_uploads WHERE id=$1', [fileId])).rows[0];
    return { fileId, storagePath: row?.storage_path, buffer: Buffer.from(ORIGINAL), fileName: 'Protocol.txt',
      mimeType: 'text/plain', integrity: 'verified' };
  });
});

describe('capture extraction evidence through real processing SQL', () => {
  it('persists an exact source/text/method receipt with the existing page map and OCR score', async () => {
    const id = await seed();
    const result = await processCapturedSource(organization, id, input(), options());
    expect(result).toMatchObject({ ok: true, processed: true, status: 'completed' });
    const row = await state(id);
    expect(row.checksum).toBe(SOURCE_HASH);
    expect(row.extracted_text).toBe(TEXT);
    expect(hash(TEXT)).not.toBe(SOURCE_HASH);
    expect(row.provenance.extractionEvidence).toEqual(receipt());
    expect(row.provenance.unrelatedProvenance).toBe('preserve');
    expect(row.metadata.unrelatedMetadata).toBe('preserve');
  });

  it('persists a valid supplied receipt without rerunning extraction', async () => {
    const id = await seed();
    expect((await processCapturedSource(organization, id, input({ preExtracted: cached() }), options())).status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).provenance.extractionEvidence).toEqual(receipt());
  });

  it('replaces stale evidence when a successful reread returns different text and method', async () => {
    const id = await seed(); await primeReceipt(id); await reopen(id, false);
    seam.extract.mockResolvedValue({ text: NEXT, method: 'pdf-text',
      pageSpans: [{ page: 11, start: 0, end: NEXT.length }] });
    expect((await processCapturedSource(organization, id, input(), options())).status).toBe('completed');
    const row = await state(id);
    expect(row.extracted_text).toBe(NEXT);
    expect(row.provenance.extractionEvidence).toEqual(receipt(NEXT, 'pdf-text', {
      pageSpans: [{ page: 11, start: 0, end: NEXT.length }],
    }));
    expect(row.provenance.extractionEvidence).not.toHaveProperty('ocrConfidence');
  });

  it('clears a stale receipt when successful legacy cached text has no optional evidence', async () => {
    const id = await seed(); await primeReceipt(id); await reopen(id, false);
    const legacy = { text: NEXT, method: 'plain-text', pageCount: null, words: 10,
      sourceSha256: SOURCE_HASH, extractionRevision: REVISION };
    expect((await processCapturedSource(organization, id, input({ preExtracted: legacy }), options())).status).toBe('completed');
    expect(seam.extract).toHaveBeenCalledTimes(1); // Only the priming read, not cached reuse.
    expect((await state(id)).extracted_text).toBe(NEXT);
    expect((await state(id)).provenance).not.toHaveProperty('extractionEvidence');
  });

  it('keeps the old receipt with retained text when a failed reread produces no text', async () => {
    const id = await seed(); await primeReceipt(id); await reopen(id, true);
    seam.extract.mockResolvedValue({ text: '', method: 'none', confidence: 99,
      pageSpans: [{ page: 999, start: 0, end: 0 }] });
    expect((await processCapturedSource(organization, id, input(), options())).status).toBe('extraction_failed');
    const row = await state(id);
    expect(row.extracted_text).toBe(TEXT);
    expect(row.provenance.extractionEvidence).toEqual(receipt());
  });

  it('clears stale evidence after a failed reread when no readable old text remains', async () => {
    const id = await seed(); await primeReceipt(id); await reopen(id, false);
    seam.extract.mockResolvedValue({ text: '', method: 'none' });
    expect((await processCapturedSource(organization, id, input(), options())).status).toBe('extraction_failed');
    const row = await state(id);
    expect(row.extracted_text).toBeNull();
    expect(row.provenance).not.toHaveProperty('extractionEvidence');
  });

  it('supports a legacy supplied extraction without fabricating evidence or a new read', async () => {
    const id = await seed();
    const legacy = { text: TEXT, method: 'plain-text', pageCount: null, words: 11,
      sourceSha256: SOURCE_HASH, extractionRevision: REVISION };
    expect((await processCapturedSource(organization, id, input({ preExtracted: legacy }), options())).status).toBe('completed');
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).provenance).not.toHaveProperty('extractionEvidence');
  });

  it('does not issue evidence for an empty initial extraction', async () => {
    const id = await seed(); seam.extract.mockResolvedValue({ text: '', method: 'none' });
    expect((await processCapturedSource(organization, id, input(), options())).status).toBe('extraction_failed');
    expect((await state(id)).provenance).not.toHaveProperty('extractionEvidence');
  });
});

describe('existing capture authority and lifecycle remain the write boundary', () => {
  it('refuses a receipt-bearing derived write without a genuine processing authorization', async () => {
    const id = await seed();
    expect(await recordSourceProcessing(exec, organization, id, {
      extracted: cached() as unknown as ExtractedCapture, processedBy: 'unauthorized-probe',
    })).toBe(false);
    expect((await state(id)).extracted_text).toBeNull();
    expect((await state(id)).provenance).not.toHaveProperty('extractionEvidence');
  });

  it.each(['foreign-tenant', 'superseded', 'wrong-workspace'])('retains the %s admission refusal without extraction or a receipt write', async kind => {
    const id = await seed({ ...(kind === 'foreign-tenant' ? { organization: organization + 100000 } : {}),
      ...(kind === 'superseded' ? { current: false } : {}) });
    const result = await processCapturedSource(organization, id,
      input(kind === 'wrong-workspace' ? { expectedWorkspaceId: 41 } : {}), options());
    expect(result).toMatchObject({ ok: false, processed: false });
    expect(seam.extract).not.toHaveBeenCalled();
    expect((await state(id)).extracted_text).toBeNull();
    expect((await state(id)).provenance).not.toHaveProperty('extractionEvidence');
  });

  it('does not attach evidence when the capture is superseded during extraction', async () => {
    const id = await seed();
    seam.extract.mockImplementationOnce(async () => {
      await exec.query('UPDATE cre_evidence_sources SET is_current=false WHERE id=$1', [id]);
      return { text: TEXT, method: 'pdf-ocr', confidence: 72.5, pageSpans: SPANS };
    });
    expect(await processCapturedSource(organization, id, input(), options())).toMatchObject({
      ok: false, processed: false, status: 'stale_source',
    });
    expect((await state(id)).extracted_text).toBeNull();
    expect((await state(id)).provenance).not.toHaveProperty('extractionEvidence');
  });

  it('keeps completed same-identity processing idempotent without a second receipt write', async () => {
    const id = await seed(); await primeReceipt(id);
    const before = await state(id); seam.extract.mockClear();
    expect((await processCapturedSource(organization, id, input(), options())).status).toBe('already_complete');
    const after = await state(id);
    expect(seam.extract).not.toHaveBeenCalled();
    expect(after.metadata.dataRoomProcessing).toEqual(before.metadata.dataRoomProcessing);
    expect(after.provenance).toEqual(before.provenance);
  });
});
