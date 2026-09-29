/**
 * The academic-resource upload is bounded, filtered and byte-checked
 * (security audit 2026-09-24, IAM-14; plan P1-5, D6 upload sweep).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * server/academic-resource-upload.ts built a disk-storage multer with a 50 MB
 * limit and a filter on the declared MIME type alone. The declared type is
 * chosen by the client, so `payload.exe` declared as application/pdf was
 * written under uploads/academic with its `.exe` extension kept, the bytes were
 * never compared against the declared type, and no malware scan ran. The module
 * now exports the receiver a route mounts (`receiveAcademicResource`), which
 * answers multer's outcomes as 413/415, runs the byte check and scan, and
 * removes a refused file.
 *
 * The knowledge tracker is a double; process.cwd is pointed at a temp dir so
 * the disk store writes there.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../academic-knowledge-tracker', () => ({
  academicKnowledgeTracker: { addResource: vi.fn(async () => ({ id: 1 })) },
}));

import { receiveAcademicResource } from '../academic-resource-upload';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'academic-upload-'));
const storeDir = path.join(tmp, 'uploads', 'academic');
beforeAll(() => {
  vi.spyOn(process, 'cwd').mockReturnValue(tmp);
});
afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function app() {
  const a = express();
  a.post('/upload', receiveAcademicResource('file'), (req: Request, res: Response) => {
    res.json({ ok: true, path: req.file?.path });
  });
  return a;
}

const stored = () => (fs.existsSync(storeDir) ? fs.readdirSync(storeDir) : []);

describe('receiveAcademicResource: the upload guard', () => {
  it('refuses a body over the size limit with 413 and leaves nothing on disk', async () => {
    const oversize = Buffer.alloc(51 * 1024 * 1024, 0x41); // 51 MB of "A"
    const r = await request(app()).post('/upload').attach('file', oversize, { filename: 'big.pdf', contentType: 'application/pdf' });
    expect(r.status, 'an oversize upload was accepted').toBe(413);
    expect(stored()).toEqual([]);
  });

  it('refuses an executable named file whatever type it declares (415)', async () => {
    const r = await request(app())
      .post('/upload')
      .attach('file', Buffer.from('%PDF-1.4 fake'), { filename: 'payload.exe', contentType: 'application/pdf' });
    expect(r.status, 'a .exe declared as application/pdf was admitted').toBe(415);
    expect(stored()).toEqual([]);
  });

  it('refuses a declared type this uploader does not accept (415)', async () => {
    const r = await request(app())
      .post('/upload')
      .attach('file', Buffer.from('GIF89a'), { filename: 'figure.gif', contentType: 'image/gif' });
    expect(r.status).toBe(415);
  });

  it('refuses bytes that are not what the declared type says and removes the stored file', async () => {
    const r = await request(app())
      .post('/upload')
      .attach('file', Buffer.from('this is not a pdf'), { filename: 'paper.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
    expect(stored(), 'the refused file was left on disk').toEqual([]);
  });

  it('leaves a request with no file to the handler', async () => {
    const r = await request(app()).post('/upload').field('title', 'no file');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it('control: a real PDF passes the guard, is stored, and reaches the handler', async () => {
    const r = await request(app())
      .post('/upload')
      .attach('file', Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n'), { filename: 'paper.pdf', contentType: 'application/pdf' });
    expect(r.status, `the guard refused a plain PDF: ${JSON.stringify(r.body)}`).toBe(200);
    expect(r.body.path).toBeTruthy();
    expect(fs.existsSync(r.body.path)).toBe(true);
    expect(stored()).toHaveLength(1);
  });
});
