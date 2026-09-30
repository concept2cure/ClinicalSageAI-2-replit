/**
 * POST /api/vault/ingest — a file's name binds the type it may be declared as.
 *
 * ── The defect (periodic review 2026-09-28, editor family, SEC-A-3) ──────────
 * The multer filter checks the extension. The signature check checks the bytes
 * against the DECLARED type, which is the multipart part's own Content-Type —
 * the uploader writes it. So a part named `report.pdf`, declared `text/html`
 * and carrying HTML passed both: `.pdf` is an allowed extension, and HTML is
 * text-shaped bytes for a text type. The vault stored `text/html`, the download
 * route served it back under that type, and the editor's Project files viewer
 * framed it, so the HTML ran in the app's origin as whoever opened it.
 *
 * These drive the real route into the real ingest service and the real upload
 * gate. Only the database, the storage provider and the stages after admission
 * are stubbed. The storage mock is the proof that nothing was kept, and the
 * happy path proves the harness admits a real PDF — so a refusal here is the
 * gate, not a broken stub.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

const { query, connect } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect } }));
vi.mock('../../db/tenantStore.js', () => ({
  runWithTenantScope: (_scope: unknown, fn: () => unknown) => fn(),
  getTenantScope: () => ({ role: 'member' }),
}));
vi.mock('../../middleware/orgMembership.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../middleware/orgMembership')>()),
  requireEditorAccess: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const { put, del } = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock('../../services/storage/index.js', () => ({
  getStorageProvider: () => ({ name: 'local', put, get: vi.fn(), delete: del }),
}));

/* After admission: audit, filing, catalog, chunking and text extraction are
   not under test, and each would otherwise need a database or a real parse. */
vi.mock('../../services/auditService.js', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../../services/vault/vault-filing.service.js', async (importOriginal) => ({
  // The real vocabulary check (VR-04); the classifier and view are this suite's to fix.
  filingVocabularyRefusal: (await importOriginal<typeof import('../../services/vault/vault-filing.service.js')>()).filingVocabularyRefusal,
  classifyForFiling: () => ({
    folderId: null, evidenceKind: null, ctdSection: null,
    status: 'unfiled', confidence: null, rationale: null, placedBy: null,
  }),
  resolveVaultView: async () => 'pharma',
  isFolderInView: () => true,
  folderLabel: () => 'Unfiled',
}));
vi.mock('../../services/vault/document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: async () => false,
  recordExtractionOutcome: vi.fn(),
  buildExtractionOutcome: () => ({ status: 'none' }),
}));
vi.mock('../../services/vault/document-chunking.service.js', () => ({
  isVaultChunkingEnabled: async () => false,
  chunkDocumentForIngest: vi.fn(),
}));
vi.mock('../../services/ocr/index.js', () => ({ extractDocumentText: async () => ({ text: '', method: 'none' }) }));
vi.mock('../../services/ocr/pdfInspector.js', () => ({ pdfPageCount: async () => null }));

import createVaultIngestRoutes from '../vault-ingest';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const HTML = Buffer.from('<!doctype html><html><body><script>fetch("/x?t="+localStorage.getItem("token"))</script></body></html>');
const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n');

function app() {
  const a = express();
  a.use((req, _res, next) => {
    (req as unknown as { user: unknown }).user = { id: 1, organizationId: 2, role: 'editor' };
    (req as unknown as { tenantId: number }).tenantId = 2;
    next();
  });
  a.use('/api/vault/ingest', createVaultIngestRoutes());
  return a;
}

const upload = (bytes: Buffer, filename: string, contentType: string) =>
  request(app())
    .post('/api/vault/ingest')
    .field('programId', PROGRAM)
    .field('documentCode', 'RPT-1')
    .field('documentTitle', 'Report')
    .field('documentType', 'OTHER')
    .attach('file', bytes, { filename, contentType });

/** The ingest transaction, answering the INSERT the way the table would. */
function txClient() {
  return {
    query: vi.fn(async (sql: string) =>
      /INSERT INTO vault\.documents/.test(String(sql))
        ? { rows: [{ id: 'doc-1', processing_status: 'PENDING' }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
    ),
    release: vi.fn(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.CLAMAV_HOST;
  // The caller owns the program; no vault row holds these bytes yet.
  query.mockImplementation(async (sql: string) =>
    /FROM vault\.documents/.test(String(sql)) ? { rows: [], rowCount: 0 } : { rows: [{ '?column?': 1 }], rowCount: 1 },
  );
  connect.mockResolvedValue(txClient());
  put.mockResolvedValue({
    vaultFileId: `vault://2/${PROGRAM}/report.pdf`, vaultVersionId: 'ver-1', provider: 'local', sizeBytes: 1, sha256: 'x',
  });
});

describe('POST /api/vault/ingest — the name binds the declared type', () => {
  it('refuses HTML declared text/html under a .pdf name: 400 FILE_TYPE_MISMATCH, and nothing is stored', async () => {
    const res = await upload(HTML, 'report.pdf', 'text/html');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_MISMATCH');
    expect(res.body.error.message).toMatch(/\.pdf file must be declared as application\/pdf/);
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses HTML declared text/html under a .txt name — a binding, not a .pdf special case', async () => {
    const res = await upload(HTML, 'notes.txt', 'text/html');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_TYPE_MISMATCH');
    expect(put).not.toHaveBeenCalled();
  });

  it('admits a real PDF declared application/pdf, through to storage and a 201', async () => {
    const res = await upload(PDF, 'report.pdf', 'application/pdf');
    expect(res.status).toBe(201);
    expect(put).toHaveBeenCalledTimes(1);
    expect(put.mock.calls[0][0]).toMatchObject({ filename: 'report.pdf', mime: 'application/pdf' });
  });
});
