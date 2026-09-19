/**
 * GET /api/c2c/project-vault/:id/documents/:documentId/download — the vault's
 * download, which did not exist.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * Vault.tsx:582 — `onClick={() => onAsk('Download ' + sel.title)}`. On a
 * document management system, on the control labelled Download, beside a
 * download icon. It typed a sentence into the assistant rail; no file ever left
 * the vault through this surface. The bytes had been on disk the whole time —
 * vault-ingest writes them to `s3_key` and treats a write failure as FATAL
 * precisely so a content hash never describes bytes nobody holds.
 *
 * ── What this pins ───────────────────────────────────────────────────────────
 * Serving files out of a governed store has three ways to go badly wrong, and
 * all three are refusals here rather than a download:
 *
 *   TENANT. The programme is re-checked against the caller's organization and
 *   the document against the programme. A document id alone reaches nothing.
 *
 *   INTEGRITY. The bytes on disk are hashed and compared to the hash the record
 *   carries. A store that serves a file it cannot prove is the file it recorded
 *   is not a governed store, and a silent mismatch is how a tampered or
 *   superseded copy leaves the building.
 *
 *   PATH. A storage key that escapes the uploads root is refused. `s3_key` is
 *   written by this codebase today; a path-traversal read is not a risk worth
 *   carrying on the assumption that it always will be.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { createHash } from 'node:crypto';

const { query, readFile } = vi.hoisted(() => ({ query: vi.fn(), readFile: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query, connect: vi.fn() } }));
vi.mock('node:fs', async (io) => {
  const actual = await io<typeof import('node:fs')>();
  return { ...actual, promises: { ...actual.promises, readFile } };
});

/* The canonical storage seam. The vault writes bytes through it now, so a row
   carrying a storage_version_id must be served from HERE and never from disk. */
const { storageGet } = vi.hoisted(() => ({ storageGet: vi.fn() }));
vi.mock('../../services/storage/index.js', () => ({
  getStorageProvider: () => ({ name: 'local', get: storageGet, put: vi.fn(), delete: vi.fn() }),
}));

import createProjectVaultRoutes from '../c2c/project-vault';

const PROGRAM = '11111111-1111-4111-8111-111111111111';
const DOCUMENT = '22222222-2222-4222-8222-222222222222';
const BYTES = Buffer.from('%PDF-1.7 the real stored document');
const HASH = createHash('sha256').update(BYTES).digest('hex');

function app(org: number | null = 7) {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org, id: 3 };
    next();
  });
  a.use('/api/c2c/project-vault', createProjectVaultRoutes());
  return a;
}

/**
 * Program row found, then the document row (or not).
 *
 * Dispatch on what each query actually SELECTS, not merely which tables it
 * mentions: the document lookup embeds an EXISTS (SELECT 1 FROM
 * regulatory_programs rp …) tenant re-check, so it names BOTH tables. Only the
 * document lookup reads `FROM vault.documents`, and only the standalone
 * program check selects the program's own id (`SELECT id FROM
 * regulatory_programs`); the embedded re-check selects `1` and aliases `rp`.
 * The two patterns are mutually exclusive, so neither can shadow the other
 * whatever order they are tested in.
 */
function store(doc: Record<string, unknown> | null, programFound = true) {
  query.mockImplementation(async (sql: string) => {
    if (/FROM vault\.documents/.test(sql)) return { rows: doc ? [doc] : [] };
    if (/SELECT\s+id\s+FROM\s+regulatory_programs/.test(sql)) {
      return { rows: programFound ? [{ id: PROGRAM }] : [] };
    }
    return { rows: [] };
  });
}

const DOC = (over: Record<string, unknown> = {}) => ({
  id: DOCUMENT, file_name: 'CSR-201 final.pdf', document_title: 'CSR-201',
  mime_type: 'application/pdf', file_size: BYTES.length,
  s3_key: `uploads/vault/${PROGRAM}/${HASH}.pdf`, content_hash: HASH, ...over,
});

const url = (p = PROGRAM, d = DOCUMENT) => `/api/c2c/project-vault/${p}/documents/${d}/download`;

beforeEach(() => {
  query.mockReset();
  readFile.mockReset();
  readFile.mockResolvedValue(BYTES);
  storageGet.mockReset();
});

describe('scope', () => {
  it('403 without org context', async () => {
    store(DOC());
    const res = await request(app(null)).get(url());
    expect(res.status).toBe(403);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('404 when the programme is not this org’s — the document is never looked up', async () => {
    store(DOC(), false);
    const res = await request(app()).get(url());
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('404 when the document does not belong to the programme', async () => {
    store(null);
    const res = await request(app()).get(url());
    expect(res.status).toBe(404);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('404 on a non-uuid id rather than a 500 from the uuid cast', async () => {
    store(DOC());
    expect((await request(app()).get(url('not-a-uuid'))).status).toBe(404);
    expect((await request(app()).get(url(PROGRAM, 'nope'))).status).toBe(404);
  });
});

describe('integrity', () => {
  it('serves the bytes when they match the recorded hash', async () => {
    store(DOC());
    const res = await request(app()).get(url());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/pdf');
    expect(res.headers['content-disposition']).toContain('CSR-201_final.pdf');
    // The recorded hash travels with the file, so a caller can check the copy
    // it received without a second request.
    expect(res.headers['x-content-sha256']).toBe(HASH);
    expect(Buffer.from(res.body).equals(BYTES)).toBe(true);
    const documentLookup = query.mock.calls.find(([sql]) => /FROM vault\.documents/.test(sql));
    expect(documentLookup?.[0]).toMatch(/rp\.organization_id = \$3/);
    expect(documentLookup?.[1]).toEqual([DOCUMENT, PROGRAM, 7]);
  });

  it('REFUSES bytes that do not match the recorded hash', async () => {
    // The whole point: a governed store must not serve a file it cannot prove
    // is the file it recorded.
    store(DOC({ content_hash: 'f'.repeat(64) }));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONTENT_HASH_MISMATCH');
    expect(res.body.message).toMatch(/may have been altered/);
  });

  it('says the record has no stored file rather than 404ing the record itself', async () => {
    store(DOC({ s3_key: null }));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_STORED_FILE');
  });

  it('says the stored file is missing when the bytes are gone from disk', async () => {
    store(DOC());
    readFile.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STORED_FILE_MISSING');
  });
});

describe('path safety', () => {
  it('refuses a storage key that escapes the uploads root', async () => {
    store(DOC({ s3_key: '../../etc/passwd' }));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('refuses an absolute key outside the uploads root', async () => {
    store(DOC({ s3_key: '/etc/passwd' }));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(readFile).not.toHaveBeenCalled();
  });
});

/**
 * AUDIT — 21 CFR 11.10(e).
 *
 * This handler served a governed document with no audit row of any kind, so
 * nothing recorded who read what, or when. The sibling filing route in the same
 * file already writes a hash-chained row for a MOVE — placement changes were
 * attributable and disclosures were not.
 *
 * The refusal case is the one worth pinning: an audit trail that drops writes
 * under load is not an audit trail, so a read that cannot be recorded is refused
 * rather than served unrecorded.
 */
describe('audit', () => {
  /** The audit INSERT the chained writer issues, if any. */
  const auditInsert = () =>
    query.mock.calls.find(c => /INSERT INTO audit_logs/i.test(String(c[0])));

  it('records the download before any byte is sent', async () => {
    store(DOC());
    readFile.mockResolvedValue(BYTES);
    const res = await request(app()).get(url());

    expect(res.status).toBe(200);
    expect(auditInsert()).toBeDefined();
  });

  it('records the served content hash, so the trail names which edition left', async () => {
    store(DOC());
    readFile.mockResolvedValue(BYTES);
    await request(app()).get(url());

    // The hash travels in the row's details payload.
    expect(JSON.stringify(auditInsert())).toContain(HASH);
  });

  it('REFUSES the download when the audit write fails, and sends nothing', async () => {
    store(DOC());
    readFile.mockResolvedValue(BYTES);
    const base = query.getMockImplementation()!;
    query.mockImplementation(async (sql: string, params?: unknown[]) => {
      if (/INSERT INTO audit_logs/i.test(String(sql))) throw new Error('audit store unavailable');
      return base(sql, params);
    });

    const res = await request(app()).get(url());

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('AUDIT_WRITE_FAILED');
    // Not a truncated body or a partial send — the bytes never entered the response.
    expect(res.body.message).toMatch(/Nothing was sent/);
    expect(res.text).not.toContain('%PDF');
  });

  it('does not audit a refused read', async () => {
    // A 404 discloses nothing, so there is nothing to record. Auditing refusals
    // as disclosures would make the trail unreadable for the question it exists
    // to answer: who has actually had this document.
    store(null);
    const res = await request(app()).get(url());
    expect(res.status).toBe(404);
    expect(auditInsert()).toBeUndefined();
  });
});

/**
 * The dual read: provider-backed rows and legacy path-backed rows.
 *
 * ── Why there are two ────────────────────────────────────────────────────────
 * The vault used to write bytes straight to uploads/vault/{programId}/{hash}
 * and keep that relative path in s3_key, bypassing server/services/storage/ —
 * the seam every other part of the platform stores through. That is why a vault
 * document cannot be filed as a submission leaf: the eCTD packager fetches
 * bytes through getStorageProvider().get(versionId, orgId), which resolves a
 * provider-minted version uuid in a different root and a different key space,
 * so it could never find one.
 *
 * Ingest now writes through the provider and records storage_version_id. No
 * bytes were moved, so every row written before that keeps its s3_key and must
 * keep working — a dual read, not a cutover. These pin both halves, and that
 * the version id WINS when both are present.
 */
describe('download — where the bytes come from', () => {
  const VERSION = 'fa9c1e40-0000-4000-8000-0000000000aa';

  it('serves a provider-backed row from the provider, never from disk', async () => {
    store(DOC({ storage_version_id: VERSION, s3_key: `vault://7/${PROGRAM}/CSR-201 final.pdf` }));
    storageGet.mockResolvedValue({
      bytes: BYTES, sizeBytes: BYTES.length, sha256: HASH,
      mime: 'application/pdf', filename: 'CSR-201 final.pdf',
    });
    const res = await request(app()).get(url());
    expect(res.status).toBe(200);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('passes the caller organization to the provider — the only tenant gate on bytes', async () => {
    // Object storage sits outside Postgres RLS, so this argument IS the
    // boundary. A read that forgot it would be a cross-tenant read.
    store(DOC({ storage_version_id: VERSION }));
    storageGet.mockResolvedValue({
      bytes: BYTES, sizeBytes: BYTES.length, sha256: HASH,
      mime: 'application/pdf', filename: 'CSR-201 final.pdf',
    });
    await request(app(7)).get(url());
    expect(storageGet).toHaveBeenCalledWith(VERSION, 7);
  });

  it('prefers the version id when the row carries both addresses', async () => {
    store(DOC({ storage_version_id: VERSION }));  // DOC() also sets a legacy s3_key
    storageGet.mockResolvedValue({
      bytes: BYTES, sizeBytes: BYTES.length, sha256: HASH,
      mime: 'application/pdf', filename: 'CSR-201 final.pdf',
    });
    const res = await request(app()).get(url());
    expect(res.status).toBe(200);
    expect(storageGet).toHaveBeenCalled();
    expect(readFile).not.toHaveBeenCalled();
  });

  it('still serves a legacy row from disk, untouched by the move', async () => {
    store(DOC());  // no storage_version_id
    const res = await request(app()).get(url());
    expect(res.status).toBe(200);
    expect(readFile).toHaveBeenCalled();
    expect(storageGet).not.toHaveBeenCalled();
  });

  it('refuses when the provider has no such version for this organization', async () => {
    // get() returns null both for "no such version" and "another tenant's" —
    // the interface refuses to distinguish them, because a 403 on a foreign id
    // confirms the id exists. Either way there are no bytes to serve.
    store(DOC({ storage_version_id: VERSION }));
    storageGet.mockResolvedValue(null);
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('STORED_FILE_MISSING');
    expect(readFile).not.toHaveBeenCalled();
  });

  it('does not fall back to disk when the provider read fails', async () => {
    // Falling back would serve whatever happens to sit at the legacy path —
    // for a row whose authoritative bytes are elsewhere. That is the wrong
    // document under a governed document's identity.
    store(DOC({ storage_version_id: VERSION }));
    storageGet.mockRejectedValue(new Error('bucket unreachable'));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(readFile).not.toHaveBeenCalled();
  });

  it('hash-verifies provider bytes against the record, same as disk bytes', async () => {
    // content_hash in the database is authoritative. Checking the bytes against
    // the RECORD catches a store that returned the WRONG OBJECT, which a
    // provider-reported hash never would.
    store(DOC({ storage_version_id: VERSION }));
    const other = Buffer.from('%PDF-1.7 a different document entirely');
    storageGet.mockResolvedValue({
      bytes: other, sizeBytes: other.length,
      sha256: createHash('sha256').update(other).digest('hex'),
      mime: 'application/pdf', filename: 'CSR-201 final.pdf',
    });
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('CONTENT_HASH_MISMATCH');
  });

  it('refuses a row carrying neither address', async () => {
    store(DOC({ storage_version_id: null, s3_key: null }));
    const res = await request(app()).get(url());
    expect(res.status).toBe(409);
    expect(res.body.error).toBe('NO_STORED_FILE');
  });
});
