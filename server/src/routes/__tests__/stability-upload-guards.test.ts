/**
 * The stability router's uploads are bounded, filtered and byte-checked
 * (security audit 2026-09-24, IAM-14; plan P1-5).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * The router's multer instance was `multer({ storage: multer.memoryStorage() })`:
 * no size limit, so a client could buffer any number of bytes into this
 * process's heap before anything looked at the request; no filter, so a file
 * named `payload.exe` declared as text/csv was admitted on its declared type;
 * and its own private copy of the signature logic instead of the platform's
 * guard (which also runs the malware scan, fail-closed in production).
 *
 * The db is a double, as in stability-router-honesty.test.ts: these cases stop
 * at the upload guard, before any query, except the control that must pass it.
 */
import { describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { connect } = vi.hoisted(() => {
  const client = { query: async () => ({ rows: [], rowCount: 0 }), release: () => {} };
  return { connect: vi.fn(async () => client) };
});
// The router (server/src/routes) imports '../../db' = server/db; from this test that is '../../../db'.
vi.mock('../../../db', () => ({ getPool: () => ({ connect, query: vi.fn() }), pool: { connect, query: vi.fn() } }));
// The router's tenantConnect reads the active scope's tenantId (fail-closed).
vi.mock('../../../db/tenantStore', () => ({ getTenantScope: () => ({ tenantId: 7, orgUuid: 'org-7', role: 'editor' }) }));

import router from '../stability.router';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7, role: 'editor' };
    next();
  });
  a.use('/api/stability', router);
  return a;
}

const IMPORT = '/api/stability/studies/1/results/import';

describe('POST …/results/import: the upload guard', () => {
  it('refuses a body over the size limit with 413 instead of buffering it', async () => {
    const oversize = Buffer.alloc(26 * 1024 * 1024, 0x41); // 26 MB of "A"
    const r = await request(app()).post(IMPORT).attach('file', oversize, { filename: 'big.csv', contentType: 'text/csv' });
    expect(r.status, 'an unbounded upload was buffered into the heap').toBe(413);
  });

  it('refuses an executable named file whatever type it declares (415)', async () => {
    const r = await request(app())
      .post(IMPORT)
      .attach('file', Buffer.from('a,b\n1,2\n'), { filename: 'payload.exe', contentType: 'text/csv' });
    expect(r.status, 'a .exe declared as text/csv was admitted').toBe(415);
  });

  it('refuses a declared type this router does not read (415)', async () => {
    const r = await request(app())
      .post(IMPORT)
      .attach('file', Buffer.from('GIF89a'), { filename: 'x.gif', contentType: 'image/gif' });
    expect(r.status).toBe(415);
  });

  it('refuses bytes that are not what the declared type says (the shared byte check)', async () => {
    const binary = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x00, 0x10]);
    const r = await request(app()).post(IMPORT).attach('file', binary, { filename: 'data.csv', contentType: 'text/csv' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
  });

  it('control: a real CSV passes the guard and reaches the handler', async () => {
    const r = await request(app())
      .post(IMPORT)
      .attach('file', Buffer.from('timepoint,parameter,value\n0,assay,99.1\n'), { filename: 'results.csv', contentType: 'text/csv' });
    expect([413, 415].includes(r.status) || r.body?.code, `the guard refused a plain CSV: ${r.status} ${JSON.stringify(r.body)}`).toBeFalsy();
    expect(connect, 'the handler was never reached').toHaveBeenCalled();
  });
});
