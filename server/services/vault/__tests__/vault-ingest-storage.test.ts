/**
 * Vault ingest writes bytes through the canonical storage provider.
 *
 * ── Why this test had to exist ───────────────────────────────────────────────
 * ingestVaultDocument is MOCKED in every test that touches it — the routes, the
 * AnA tools, the eSTAR paths. Nothing called the real function. So when its byte
 * write changed from `fs.writeFile` into an uploads/ path to
 * `getStorageProvider().put()`, the change had no coverage at all: a wrong
 * argument shape, or a provider failure no longer refusing the request, would
 * both have passed the entire suite.
 *
 * The sibling PGlite test proves the ON CONFLICT clause by extracting the real
 * SQL; it never invokes the function. This one invokes it.
 *
 * ── What it pins ─────────────────────────────────────────────────────────────
 *   - the provider gets the caller's org and the PROGRAM as the project, which
 *     is what makes the bytes retrievable later (get() takes an org, because
 *     object storage sits outside Postgres RLS);
 *   - the row records the provider's version id, its name, and its handle — the
 *     version id is what the eCTD packager resolves, and a row without it is
 *     addressed the legacy way forever;
 *   - a provider failure REFUSES the upload and writes nothing. This is the
 *     property with the worst failure mode: the original code caught a write
 *     failure, logged at warn, and inserted the row anyway, producing a record
 *     carrying a real content hash for bytes nobody has. Moving to the provider
 *     must not quietly reintroduce that.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query, connect } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query, connect } }));

const { put } = vi.hoisted(() => ({ put: vi.fn() }));
vi.mock('../../storage/index.js', () => ({
  getStorageProvider: () => ({ name: 'local', put, get: vi.fn(), delete: vi.fn() }),
}));

vi.mock('../../../middleware/uploadSafety.js', () => ({
  assertUploadSafe: vi.fn(),
  UploadSafetyError: class UploadSafetyError extends Error {},
}));
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../vault-filing.service.js', () => ({
  classifyForFiling: () => ({
    folderId: null, evidenceKind: null, ctdSection: null,
    status: 'unfiled', confidence: null, rationale: null, placedBy: null,
  }),
  resolveVaultView: async () => 'pharma',
  isFolderInView: () => true,
  folderLabel: () => 'Unfiled',
}));
vi.mock('../document-catalog.service.js', () => ({
  isDocumentCatalogEnabled: async () => false,
  recordExtractionOutcome: vi.fn(),
  buildExtractionOutcome: () => ({ status: 'none' }),
}));
vi.mock('../document-chunking.service.js', () => ({
  isVaultChunkingEnabled: async () => false,
  chunkDocumentForIngest: vi.fn(),
}));
/* Text extraction is best-effort and irrelevant here — stubbed so the run does
   not spend time on a real PDF parse, or fill the output with the structure
   errors a synthetic buffer legitimately produces. */
vi.mock('../../ocr/index.js', () => ({ extractDocumentText: async () => ({ text: '', method: 'none' }) }));
vi.mock('../../ocr/pdfInspector.js', () => ({ pdfPageCount: async () => null }));

import { ingestVaultDocument } from '../vault-ingest.service';

const ORG = 7;
const PROGRAM = '11111111-1111-4111-8111-111111111111';
const BYTES = Buffer.from('%PDF-1.7 a governed document');

/** A transaction client whose INSERT is captured for inspection. */
function txClient(insertReturns: Array<Record<string, unknown>> = [{ id: 'doc-1', processing_status: 'PENDING' }]) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql: String(sql), params: (params ?? []) as unknown[] });
      if (/INSERT INTO vault\.documents/.test(String(sql))) return { rows: insertReturns, rowCount: insertReturns.length };
      return { rows: [], rowCount: 0 };
    }),
    release: vi.fn(),
  };
  return { client, calls };
}

function args(over: Record<string, unknown> = {}) {
  return {
    organizationId: ORG,
    userId: 3,
    programId: PROGRAM,
    documentCode: 'CSR-201',
    documentTitle: 'CSR 201',
    documentType: 'report',
    fileName: 'csr-201.pdf',
    mimeType: 'application/pdf',
    fileBuffer: BYTES,
    origin: 'api' as never,
    ...over,
  } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  // Program ownership check passes.
  query.mockImplementation(async () => ({ rows: [{ '?column?': 1 }], rowCount: 1 }));
  put.mockResolvedValue({
    vaultFileId: `vault://${ORG}/${PROGRAM}/csr-201.pdf`,
    vaultVersionId: 'ver-abc',
    provider: 'local',
    sizeBytes: BYTES.length,
    sha256: 'x',
  });
});

describe('the bytes go to the storage provider', () => {
  it('hands it the caller organization and the programme as the project', async () => {
    const { client } = txClient();
    connect.mockResolvedValue(client);
    await ingestVaultDocument(args());

    expect(put).toHaveBeenCalledTimes(1);
    expect(put).toHaveBeenCalledWith(
      expect.objectContaining({
        orgId: ORG,
        projectId: PROGRAM,
        filename: 'csr-201.pdf',
        mime: 'application/pdf',
        bytes: BYTES,
      }),
    );
  });

  it('records the version id, the provider and the handle on the row', async () => {
    const { client, calls } = txClient();
    connect.mockResolvedValue(client);
    await ingestVaultDocument(args());

    const insert = calls.find(c => /INSERT INTO vault\.documents/.test(c.sql));
    expect(insert, 'no INSERT reached the database').toBeDefined();
    // The version id is what the eCTD packager resolves; without it the row is
    // addressed the legacy way forever.
    expect(insert!.params).toContain('ver-abc');
    expect(insert!.params).toContain('local');
    expect(insert!.params).toContain(`vault://${ORG}/${PROGRAM}/csr-201.pdf`);
    expect(insert!.sql).toMatch(/storage_version_id/);
    expect(insert!.sql).toMatch(/storage_provider/);
  });
});

describe('a storage failure refuses the upload', () => {
  it('returns STORAGE_WRITE_FAILED and writes NO row', async () => {
    // The original code caught the write failure, logged at warn, and inserted
    // anyway — a row carrying a real content hash for bytes nobody has, which
    // is indistinguishable from a good record until someone needs the file.
    const { client, calls } = txClient();
    connect.mockResolvedValue(client);
    put.mockRejectedValue(new Error('bucket unreachable'));

    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 500, code: 'STORAGE_WRITE_FAILED' });
    expect(calls.some(c => /INSERT INTO vault\.documents/.test(c.sql))).toBe(false);
  });
});

describe('the tenant guard still runs before any of this', () => {
  it('refuses a programme the caller does not own, without touching storage', async () => {
    query.mockImplementation(async () => ({ rows: [], rowCount: 0 }));
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 403, code: 'PROGRAM_FORBIDDEN' });
    expect(put).not.toHaveBeenCalled();
  });

  it('refuses with no organization context at all', async () => {
    const res = await ingestVaultDocument(args({ organizationId: null }));
    expect(res).toMatchObject({ ok: false, status: 403, code: 'NO_ORG_CONTEXT' });
    expect(put).not.toHaveBeenCalled();
  });
});
