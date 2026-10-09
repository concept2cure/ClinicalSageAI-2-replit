/**
 * The document data center upload is bounded, filtered and byte-checked
 * (security audit 2026-09-24, IAM-14; plan P1-5, D6 upload sweep).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * DocumentDataCenterService built a disk-storage multer with a 100 MB limit and
 * no filter: any declared type was written under uploads/device-data-center
 * with its original name, and the service's private signature check ran only
 * later, inside uploadDocument, after the file was already stored; no malware
 * scan ran. getUploadMiddleware now returns one handler that runs the receiver
 * (multer's outcomes as 413/415) and then the shared byte check and scan, so
 * the route mounts it exactly as before; a refused file is removed.
 *
 * The db, audit and model clients are doubles as in
 * document-data-center-tagging-provenance.test.ts; process.cwd is pointed at a
 * temp dir before the singleton is built so the disk store writes there.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type RequestHandler, type Response } from 'express';
import request from 'supertest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../db', () => ({ db: { insert: () => ({ values: () => ({ returning: async () => [{ id: 1 }] }) }) } }));
vi.mock('../auditService.js', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: vi.fn() } }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ddc-upload-'));
const storeDir = path.join(tmp, 'uploads', 'device-data-center', '7');
let getUploadMiddleware: () => RequestHandler;

beforeAll(async () => {
  vi.spyOn(process, 'cwd').mockReturnValue(tmp);
  // The singleton reads process.cwd() when it is built, so the import must follow the spy.
  const mod = await import('../DocumentDataCenterService');
  getUploadMiddleware = () => mod.documentDataCenterService.getUploadMiddleware();
});
afterAll(() => {
  vi.restoreAllMocks();
  fs.rmSync(tmp, { recursive: true, force: true });
});

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7 };
    next();
  });
  // Mounted as one handler, exactly as server/routes/document-data-center.ts mounts it.
  a.post('/upload', getUploadMiddleware(), (req: Request, res: Response) => {
    res.json({ ok: true, path: req.file?.path });
  });
  return a;
}

const stored = () => (fs.existsSync(storeDir) ? fs.readdirSync(storeDir) : []);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52]);

describe('DocumentDataCenterService.getUploadMiddleware: the upload guard', () => {
  it('refuses a body over the size limit with 413 and leaves nothing on disk', async () => {
    const oversize = Buffer.alloc(100 * 1024 * 1024 + 1, 0x41); // 100 MB + 1 byte of "A"
    const r = await request(app()).post('/upload').attach('file', oversize, { filename: 'big.txt', contentType: 'text/plain' });
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

  it('refuses a declared type the service does not accept (415)', async () => {
    const r = await request(app())
      .post('/upload')
      .attach('file', Buffer.from('GIF89a'), { filename: 'x.gif', contentType: 'image/gif' });
    expect(r.status).toBe(415);
  });

  it('refuses bytes that are not what the declared type says and removes the stored file', async () => {
    const r = await request(app())
      .post('/upload')
      .attach('file', Buffer.from('this is not a pdf'), { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
    expect(stored(), 'the refused file was left on disk').toEqual([]);
  });

  it('leaves a request with no file to the route', async () => {
    const r = await request(app()).post('/upload').field('deviceName', 'x');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ ok: true });
  });

  it('control: a real PNG passes the guard, is stored, and reaches the route', async () => {
    const r = await request(app()).post('/upload').attach('file', PNG, { filename: 'label.png', contentType: 'image/png' });
    expect(r.status, `the guard refused a real PNG: ${JSON.stringify(r.body)}`).toBe(200);
    expect(r.body.path).toBeTruthy();
    expect(fs.existsSync(r.body.path)).toBe(true);
    expect(stored()).toHaveLength(1);
  });
});
