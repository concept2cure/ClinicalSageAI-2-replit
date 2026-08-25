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

/** Program row found, then the document row (or not). */
function store(doc: Record<string, unknown> | null, programFound = true) {
  query.mockImplementation(async (sql: string) => {
    if (/FROM regulatory_programs/.test(sql)) return { rows: programFound ? [{ id: PROGRAM }] : [] };
    if (/FROM vault\.documents/.test(sql)) return { rows: doc ? [doc] : [] };
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
