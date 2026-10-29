/**
 * OCR off the upload request (MR-08 Stage 3 steps 1(b) and 4–6,
 * docs/work-orders/MR-08-vault-upload-safety-and-document-control.md).
 *
 * A scanned PDF used to be OCR'd page by page inside the upload request, so a
 * long one held the response open past any load balancer's timeout. Now, on
 * real PostgreSQL as app_service under RLS, through the real routes:
 *   - ingest reads a text layer only, returns at once, and records the version
 *     as still being read (`extraction_pending`);
 *   - search says how many versions are not searched yet;
 *   - the sweep reads it through the verified reader, with OCR, records the
 *     outcome and one chained audit row, and indexes its passages;
 *   - two sweeps at once read it once;
 *   - a pending version whose stored file cannot be read is recorded as failed,
 *     with the reason, never left pending forever or read as empty.
 *
 * OCR itself is stubbed: what is under test is when and how often it runs, not
 * Tesseract.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { databaseUrl } from '../setup.db';
import { assertVaultFixtureDatabase, assertVaultFixtureRuntime, closeVaultFixtureRuntime, seedVaultFixtureParent } from './vault-current-access-fixture';

const OCR_TEXT = 'Scanned stability protocol for the drug product, long-term storage at 25 C and 60 percent relative humidity. '.repeat(6);
const ocr = vi.hoisted(() => ({ calls: 0, delayMs: 0 }));
vi.mock('../../server/services/ocr/ocrService', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../server/services/ocr/ocrService')>();
  const ocrPdfToText = async () => {
    ocr.calls += 1;
    if (ocr.delayMs) await new Promise((r) => setTimeout(r, ocr.delayMs));
    return { text: OCR_TEXT, pages: [OCR_TEXT], pageDetails: [{ page: 1, text: OCR_TEXT, confidence: 91, dpi: 300 }],
      confidence: 91, engine: 'pdfjs+tesseract.js' as const, durationMs: 1, coverage: { pageCount: 3, pagesSelected: 3, pagesRead: 3, limitedBy: null } };
  };
  const ocrService = Object.assign(Object.create(Object.getPrototypeOf(real.ocrService)), real.ocrService, { ocrPdfToText });
  return { ...real, ocrService };
});

const RUN = randomUUID().slice(0, 12);
const PROBE = `dbtest-vsweep-${RUN} `;
const CODE = `DBTEST-VSWEEP-${RUN}`;

type Tenant = { orgId: number; orgUuid: string; programId: string };
let owner: Pool;
let userId: number;
let mine: Tenant;

async function app(): Promise<express.Express> {
  const createVaultIngestRoutes = (await import('../../server/routes/vault-ingest')).default;
  const createProjectVaultRoutes = (await import('../../server/routes/c2c/project-vault')).default;
  const { establishRequestTenantScope } = await import('../../server/middleware/establishRequestTenantScope');
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    Object.assign(req, {
      userId, tenantId: mine.orgId, userRole: 'admin',
      user: { id: userId, organizationId: mine.orgId, organizationUuid: mine.orgUuid, role: 'admin' },
    });
    next();
  });
  a.use(establishRequestTenantScope);
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/** A PDF of blank pages: no text layer, so every word in it would need OCR. */
async function scannedPdf(label: string, pages = 3): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.setTitle(label);
  for (let i = 0; i < pages; i++) doc.addPage([612, 792]);
  return Buffer.from(await doc.save());
}

let n = 0;
async function ingest(bytes: Buffer, filename: string, contentType: string, code?: string) {
  n += 1;
  return request(await app()).post('/api/vault/ingest')
    .field('programId', mine.programId).field('documentType', 'OTHER').field('documentCode', code ?? `${CODE}-${n}`)
    .field('documentTitle', filename)
    .attach('file', bytes, { filename, contentType });
}

const catalog = async (id: string) => (await owner.query(
  `SELECT c.catalog_status, c.extraction_method, c.extraction_error, c.page_count, c.chunk_status, d.extracted_text,
          (SELECT count(*)::int FROM vault.document_chunks k WHERE k.document_id = d.id) AS chunks
     FROM vault.documents d LEFT JOIN vault.document_catalog c ON c.document_id = d.id WHERE d.id = $1`, [id])).rows[0];
const extractedRows = async (id: string) => (await owner.query(
  `SELECT new_values FROM audit_logs WHERE action = 'vault.document.extracted' AND record_id = $1`, [id])).rows;
const sweep = async () => (await import('../../server/jobs/vaultProcessingSweep')).runVaultProcessingOnce();

beforeAll(async () => {
  owner = new Pool({ connectionString: databaseUrl, max: 4 });
  await assertVaultFixtureDatabase(owner);
  const user = await owner.query(
    `INSERT INTO users (email, name, password_hash, status) VALUES ($1, 'Sam Sweeper', 'x', 'active') RETURNING id`,
    [`dbtest-vsweep-${RUN}@example.test`],
  );
  userId = Number(user.rows[0].id);
  const org = await owner.query(`INSERT INTO organizations (name, slug, status) VALUES ($1, $2, 'active') RETURNING id, uuid`,
    [`${PROBE}org`, `dbtest-vsweep-${RUN}`]);
  const prog = await owner.query(
    `INSERT INTO regulatory_programs (name, code, organization_id, program_type, product_type, primary_agency, product_name)
     VALUES ($1, $2, $3, 'ind', 'drug', 'FDA', 'Sweepia 5mg') RETURNING id`,
    [`${PROBE}program`, CODE, org.rows[0].id],
  );
  mine = { orgId: Number(org.rows[0].id), orgUuid: String(org.rows[0].uuid), programId: String(prog.rows[0].id) };
  await seedVaultFixtureParent(owner, mine, { userId, namespace: `${PROBE}parent` });
  await assertVaultFixtureRuntime(mine);
  // The sweep is estate-wide: read whatever earlier runs left pending, so the
  // counts below are this suite's own.
  await sweep();
});

afterAll(async () => {
  try { await closeVaultFixtureRuntime(); }
  finally { await owner?.end(); }
});

let scannedId = '';
let scannedBytes: Buffer;
let scannedCode = '';

describe('the upload request reads a text layer only', () => {
  it('returns a scanned PDF without running OCR, and records it as still being read', async () => {
    ocr.calls = 0;
    ocr.delayMs = 30_000; // were OCR still in the request, this upload would not return in time
    const bytes = await scannedPdf('scanned stability protocol');
    await ingest(Buffer.from('warm the routes before the clock starts', 'utf8'), 'warm-up.txt', 'text/plain');
    const started = Date.now();
    scannedBytes = bytes;
    scannedCode = `${CODE}-scan`;
    const res = await ingest(bytes, 'stability-protocol-scan.pdf', 'application/pdf', scannedCode);
    ocr.delayMs = 0;
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(ocr.calls).toBe(0);
    expect(res.body.document.extraction).toBe('pending');
    scannedId = String(res.body.document.id);
    expect(await catalog(scannedId)).toMatchObject({ catalog_status: 'extraction_pending', extracted_text: null, chunks: 0 });
  }, 60_000);

  it('still reads a born-digital file in the request', async () => {
    const res = await ingest(Buffer.from('A clinical overview of the program, read in the request. '.repeat(10), 'utf8'), 'clinical-overview.txt', 'text/plain');
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.document.extraction).toBe('extracted');
    expect(await catalog(String(res.body.document.id))).toMatchObject({ catalog_status: 'extracted' });
  });

  it('search says how many versions are not searched yet', async () => {
    const res = await request(await app()).get(`/api/c2c/project-vault/${mine.programId}/search`).query({ q: 'stability' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.pendingCount).toBe(1);
  });
});

describe('the processing sweep', () => {
  it('reads the pending version through the verified reader with OCR, records it, audits it once and indexes it', async () => {
    ocr.calls = 0;
    const report = await sweep();
    expect(report.extracted).toBeGreaterThanOrEqual(1);
    expect(ocr.calls).toBe(1);
    const row = await catalog(scannedId);
    expect(row).toMatchObject({ catalog_status: 'extracted', extraction_method: 'pdf-ocr' });
    expect(row.extracted_text).toMatch(/Scanned stability protocol/);
    expect(row.chunks).toBeGreaterThan(0);
    const audit = await extractedRows(scannedId);
    expect(audit).toHaveLength(1);
    expect(audit[0].new_values).toMatchObject({ outcome: 'extracted', method: 'pdf-ocr' });
    const searched = await request(await app()).get(`/api/c2c/project-vault/${mine.programId}/search`).query({ q: 'stability' });
    expect(searched.body.data.pendingCount).toBe(0);
  });

  it('does nothing more on the next run', async () => {
    ocr.calls = 0;
    await sweep();
    expect(ocr.calls).toBe(0);
    expect(await extractedRows(scannedId)).toHaveLength(1);
  });

  it('a same-bytes re-upload of a version already read keeps its text, and is not read again', async () => {
    const res = await ingest(scannedBytes, 'stability-protocol-scan.pdf', 'application/pdf', scannedCode);
    expect(res.status, JSON.stringify(res.body)).toBeLessThan(300);
    expect(String(res.body.document.id)).toBe(scannedId);
    expect(res.body.document.extraction).toBe('extracted');
    const row = await catalog(scannedId);
    expect(row).toMatchObject({ catalog_status: 'extracted', extraction_method: 'pdf-ocr' });
    expect(row.extracted_text).toMatch(/Scanned stability protocol/);
    ocr.calls = 0;
    await sweep();
    expect(ocr.calls).toBe(0);
    expect(await extractedRows(scannedId)).toHaveLength(1);
  });

  it('two sweeps at once read a pending version once', async () => {
    const res = await ingest(await scannedPdf('scanned batch record'), 'batch-record-scan.pdf', 'application/pdf');
    expect(res.body.document.extraction).toBe('pending');
    const id = String(res.body.document.id);
    ocr.calls = 0;
    ocr.delayMs = 300;
    await Promise.all([sweep(), sweep()]);
    ocr.delayMs = 0;
    expect(ocr.calls).toBe(1);
    expect(await extractedRows(id)).toHaveLength(1);
    expect((await catalog(id)).catalog_status).toBe('extracted');
  });

  it('records a pending version whose stored file cannot be read as failed, with the reason', async () => {
    const res = await ingest(await scannedPdf('scanned certificate'), 'certificate-scan.pdf', 'application/pdf');
    const id = String(res.body.document.id);
    const { getStorageProvider } = await import('../../server/services/storage/index');
    const stored = (await owner.query('SELECT storage_version_id FROM vault.documents WHERE id = $1', [id])).rows[0].storage_version_id;
    await (getStorageProvider() as unknown as { delete: (v: string, o: number) => Promise<unknown> }).delete(stored, mine.orgId);
    ocr.calls = 0;
    await sweep();
    expect(ocr.calls).toBe(0);
    const row = await catalog(id);
    expect(row.catalog_status).toBe('extraction_failed');
    expect(row.extraction_error).toMatch(/stored file could not be read/i);
    expect((await extractedRows(id))[0].new_values).toMatchObject({ outcome: 'extraction_failed' });
  });
});
