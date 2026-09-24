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
 *     must not quietly reintroduce that;
 *   - the converse: a refusal AFTER the bytes were stored does not keep them.
 *     Every such refusal told the user "Nothing was changed / Nothing was
 *     saved" while the file sat in the tenant's storage under no record — a
 *     copy nobody can find, list or delete, which outlives the customer's own
 *     deletion of everything they can see. When the copy cannot be removed,
 *     or a record turns out to refer to it, the message says so instead.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { query, connect } = vi.hoisted(() => ({ query: vi.fn(), connect: vi.fn() }));
vi.mock('../../../db.js', () => ({ pool: { query, connect } }));

/* The role the tenant scope carries — what the Vault write check reads. A
   member by default; the role cases below set it. */
const { scope } = vi.hoisted(() => ({ scope: { role: 'member' as string | null } }));
vi.mock('../../../db/tenantStore.js', () => ({ getTenantScope: () => scope }));

const { put, del } = vi.hoisted(() => ({ put: vi.fn(), del: vi.fn() }));
vi.mock('../../storage/index.js', () => ({
  getStorageProvider: () => ({ name: 'local', put, get: vi.fn(), delete: del }),
}));

vi.mock('../../../middleware/uploadSafety.js', () => ({
  assertUploadSafe: vi.fn(),
  UploadSafetyError: class UploadSafetyError extends Error {},
}));
const { writeChainedAuditRow } = vi.hoisted(() => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../../auditService.js', () => ({ writeChainedAuditRow }));
const { isFolderInView } = vi.hoisted(() => ({ isFolderInView: vi.fn() }));
vi.mock('../vault-filing.service.js', () => ({
  classifyForFiling: () => ({
    folderId: null, evidenceKind: null, ctdSection: null,
    status: 'unfiled', confidence: null, rationale: null, placedBy: null,
  }),
  resolveVaultView: async () => 'pharma',
  isFolderInView,
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
function txClient(
  insertReturns: Array<Record<string, unknown>> = [{ id: 'doc-1', processing_status: 'PENDING' }],
  fail: { on: RegExp; err: unknown } | null = null,
) {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const client = {
    query: vi.fn(async (sql: string, params?: unknown[]) => {
      calls.push({ sql: String(sql), params: (params ?? []) as unknown[] });
      if (fail && fail.on.test(String(sql))) throw fail.err;
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

/** Whether a vault record refers to the stored version — what the discard asks before deleting. */
let recordRefersToStoredBytes = false;

beforeEach(() => {
  vi.clearAllMocks();
  recordRefersToStoredBytes = false;
  scope.role = 'member';
  isFolderInView.mockReturnValue(true);
  del.mockResolvedValue(true);
  // Program ownership check passes; the reference check answers per test.
  query.mockImplementation(async (sql: string) => {
    if (/FROM vault\.documents/.test(String(sql))) {
      return recordRefersToStoredBytes ? { rows: [{ '?column?': 1 }], rowCount: 1 } : { rows: [], rowCount: 0 };
    }
    return { rows: [{ '?column?': 1 }], rowCount: 1 };
  });
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

describe('a role that may not write the Vault is refused before anything is stored', () => {
  /* AnA's file_chat_upload_to_vault, authoring's file-to-vault and eSTAR
     retention reach this function with no route middleware in front of it.
     The real-database proof is tests/db/vault-ingest.dbtest.ts. */
  it('a viewer: 403, nothing stored, nothing written', async () => {
    const { client, calls } = txClient();
    connect.mockResolvedValue(client);
    scope.role = 'viewer';
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 403, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(put).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });

  it('no role at all: refused the same way', async () => {
    scope.role = null;
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 403, code: 'VAULT_WRITE_ROLE_REQUIRED' });
    expect(put).not.toHaveBeenCalled();
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

describe('a refusal after the bytes were stored does not keep them', () => {
  /* Each of these refusals comes AFTER put(): the bytes are already in the
     tenant's storage when the upload is turned away. The user is told nothing
     was changed or saved, so the stored copy has to go — it is referenced by no
     record, so no surface can list it and no deletion can reach it. The version
     id is a fresh randomUUID per put, so removing it cannot touch the bytes of
     any record that already exists. */
  it('different bytes at an occupied (program, code, version): 409, and the copy is removed', async () => {
    const { client } = txClient([]);
    connect.mockResolvedValue(client);
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 409, code: 'VERSION_CONTENT_CONFLICT' });
    expect(del).toHaveBeenCalledWith('ver-abc', ORG);
  });

  it('the same bytes under a second code: 409, and the copy is removed', async () => {
    const { client } = txClient(undefined, {
      on: /INSERT INTO vault\.documents/,
      err: Object.assign(new Error('duplicate key'), { code: '23505' }),
    });
    connect.mockResolvedValue(client);
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 409, code: 'DUPLICATE_CONTENT' });
    expect(del).toHaveBeenCalledWith('ver-abc', ORG);
  });

  it('a folder outside the program taxonomy: 400, and the copy is removed', async () => {
    isFolderInView.mockReturnValue(false);
    const res = await ingestVaultDocument(args({ folderId: 'no-such-folder' }));
    expect(res).toMatchObject({ ok: false, status: 400, code: 'INVALID_FOLDER' });
    expect(del).toHaveBeenCalledWith('ver-abc', ORG);
  });

  it('a failed audit write rolls the record back, and the copy with it', async () => {
    const { client } = txClient();
    connect.mockResolvedValue(client);
    writeChainedAuditRow.mockRejectedValueOnce(new Error('chain tip locked'));
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 500, code: 'INGEST_FAILED' });
    expect((res as { message: string }).message).toMatch(/Nothing was saved\./);
    expect(del).toHaveBeenCalledWith('ver-abc', ORG);
  });

  it('an error thrown before the transaction still removes the copy, and still propagates', async () => {
    connect.mockRejectedValue(new Error('pool exhausted'));
    await expect(ingestVaultDocument(args())).rejects.toThrow('pool exhausted');
    expect(del).toHaveBeenCalledWith('ver-abc', ORG);
  });

  it('an admitted upload keeps its bytes', async () => {
    const { client } = txClient();
    connect.mockResolvedValue(client);
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: true });
    expect(del).not.toHaveBeenCalled();
  });
});

describe('when the copy cannot be removed, the refusal says so', () => {
  it('a failed delete: the message no longer claims nothing was saved', async () => {
    const { client } = txClient();
    connect.mockResolvedValue(client);
    writeChainedAuditRow.mockRejectedValueOnce(new Error('chain tip locked'));
    del.mockResolvedValue(false);
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, code: 'INGEST_FAILED' });
    const message = (res as { message: string }).message;
    expect(message).not.toMatch(/Nothing was saved/);
    expect(message).toMatch(/could not be removed from storage/);
  });

  it('a delete that throws is reported the same way, not raised over the refusal', async () => {
    const { client } = txClient([]);
    connect.mockResolvedValue(client);
    del.mockRejectedValue(new Error('bucket unreachable'));
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, status: 409, code: 'VERSION_CONTENT_CONFLICT' });
    expect((res as { message: string }).message).toMatch(/could not be removed from storage/);
  });

  it('a record that refers to the stored version keeps it — bytes a record points at are never deleted', async () => {
    /* A COMMIT whose acknowledgement is lost can leave the row committed while
       the caller sees an error. Deleting then would produce the one state worse
       than a leak: a governed record whose bytes are gone. */
    const { client } = txClient(undefined, { on: /^COMMIT$/, err: new Error('connection reset') });
    connect.mockResolvedValue(client);
    recordRefersToStoredBytes = true;
    const res = await ingestVaultDocument(args());
    expect(res).toMatchObject({ ok: false, code: 'INGEST_FAILED' });
    expect(del).not.toHaveBeenCalled();
    const message = (res as { message: string }).message;
    expect(message).not.toMatch(/Nothing was saved/);
    expect(message).toMatch(/check the Vault/);
  });
});
