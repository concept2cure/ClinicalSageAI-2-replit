/**
 * The knowledge-base uploads are bounded, filtered and byte-checked
 * (security audit 2026-09-24, IAM-14; plan P1-5, D6 upload sweep).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * The router's one multer instance, shared by /upload, /extract-pdf, /ocr and
 * /ind-autodraft/upload, was `multer({ storage: memoryStorage(), limits:
 * { fileSize: 100 MB } })`: a size limit and nothing else. Any declared type was
 * buffered whole and handed to the ingestion proxy, the extractors and the OCR
 * path on its declared type alone — `payload.exe` declared as text/plain was
 * admitted — and no malware scan ran.
 *
 * Auth is a pass-through double and fetch is stubbed, so the control can show
 * the file reaching the proxy while every other case stops at the guard.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const { fetchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ ingested: 1, text: 'hello', strategy_used: 'stub' }) })),
}));

vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: 7, role: 'editor' };
    next();
  },
}));
vi.stubGlobal('fetch', fetchMock);
process.env.REVIEW_ADMIN_TOKEN = 'test-admin-token';

import router from '../knowledge-base';

function app() {
  const a = express();
  a.use('/api/knowledge-base', router);
  return a;
}

const UPLOAD = '/api/knowledge-base/upload';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

beforeEach(() => fetchMock.mockClear());

describe('POST /api/knowledge-base/upload: the upload guard', () => {
  it('refuses a body over the size limit with 413 instead of buffering it', async () => {
    const oversize = Buffer.alloc(100 * 1024 * 1024 + 1, 0x41); // 100 MB + 1 byte of "A"
    const r = await request(app())
      .post(UPLOAD)
      .field('project_id', 'p1')
      .attach('files', oversize, { filename: 'big.txt', contentType: 'text/plain' });
    expect(r.status, 'an oversize upload was buffered into the heap').toBe(413);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses an executable named file whatever type it declares (415)', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('project_id', 'p1')
      .attach('files', Buffer.from('plain text'), { filename: 'payload.exe', contentType: 'text/plain' });
    expect(r.status, 'a .exe declared as text/plain was admitted').toBe(415);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('refuses a declared type the byte check cannot verify (415)', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('project_id', 'p1')
      .attach('files', Buffer.from('{\\rtf1 hello}'), { filename: 'notes.rtf', contentType: 'application/rtf' });
    expect(r.status).toBe(415);
  });

  it('refuses bytes that are not what the declared type says (the shared byte check)', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('project_id', 'p1')
      .attach('files', Buffer.from('this is not a pdf'), { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('checks every file of a multi-file body, not only the first', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('project_id', 'p1')
      .attach('files', Buffer.from('a,b\n1,2\n'), { filename: 'ok.csv', contentType: 'text/csv' })
      .attach('files', Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x00, 0x10]), { filename: 'bad.csv', contentType: 'text/csv' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('leaves a request with no file to the handler (its own 422, unchanged)', async () => {
    const r = await request(app()).post(UPLOAD).field('project_id', 'p1');
    expect(r.status).toBe(422);
    expect(r.body.error).toMatch(/At least one file/);
  });

  it('control: a real text file passes the guard and reaches the ingestion proxy', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('project_id', 'p1')
      .attach('files', Buffer.from('Study protocol summary.\n'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status, `the guard refused a plain text file: ${JSON.stringify(r.body)}`).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toContain('/knowledge/ingest-files');
  });
});

describe('the same guard fronts the other three multipart routes', () => {
  it('/ocr: an image is read, but only when the bytes are that image', async () => {
    const bad = await request(app())
      .post('/api/knowledge-base/ocr')
      .attach('file', Buffer.from('not a png'), { filename: 'scan.png', contentType: 'image/png' });
    expect(bad.status).toBe(400);
    expect(bad.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });

    const exe = await request(app())
      .post('/api/knowledge-base/ocr')
      .attach('file', PNG, { filename: 'scan.exe', contentType: 'image/png' });
    expect(exe.status).toBe(415);

    const ok = await request(app())
      .post('/api/knowledge-base/ocr')
      .attach('file', PNG, { filename: 'scan.png', contentType: 'image/png' });
    expect(ok.status, `the guard refused a real PNG: ${JSON.stringify(ok.body)}`).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('/extract-pdf: a binary declared as PDF is refused before any extractor sees it', async () => {
    const r = await request(app())
      .post('/api/knowledge-base/extract-pdf')
      .attach('file', Buffer.from([0x00, 0x01, 0x02, 0xff]), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('/ind-autodraft/upload: an executable is refused whatever type it declares', async () => {
    const r = await request(app())
      .post('/api/knowledge-base/ind-autodraft/upload')
      .attach('files', Buffer.from('%PDF-1.4'), { filename: 'protocol.exe', contentType: 'application/pdf' });
    expect(r.status).toBe(415);
  });
});
