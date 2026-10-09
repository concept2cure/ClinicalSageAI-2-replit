/**
 * receiveUpload answers multer's outcomes as the 4xx they are (P1-5, 2026-09-25).
 *
 * Every router that noticed multer's errors becoming 500s wrote its own
 * mapping (chat, vault-ingest, stability). This is the one shared one; the
 * cases pin its three answers and its pass-through, with a real multer
 * instance behind a real express app.
 */
import { describe, expect, it } from 'vitest';
import express from 'express';
import multer from 'multer';
import request from 'supertest';
import { makeUploadFileFilter, receiveUpload } from '../uploadAllowlist';

const MAX = 1024;

function app() {
  const a = express();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX, files: 1 },
    fileFilter: makeUploadFileFilter({ extensions: ['txt'], mimeTypes: ['text/plain'], allowMimePrefixes: [] }),
  });
  a.post('/up', receiveUpload(upload.single('file'), { maxBytes: MAX }), (req, res) => {
    res.json({ received: (req as any).file?.size ?? 0 });
  });
  return a;
}

describe('receiveUpload', () => {
  it('a body over the limit is 413 FILE_TOO_LARGE, naming the limit', async () => {
    const r = await request(app()).post('/up').attach('file', Buffer.alloc(MAX + 1, 0x61), { filename: 'a.txt', contentType: 'text/plain' });
    expect(r.status).toBe(413);
    expect(r.body).toMatchObject({ code: 'FILE_TOO_LARGE' });
    expect(r.body.error).toContain('MB');
  });

  it('a type the filter refuses is 415 UNSUPPORTED_FILE_TYPE', async () => {
    const r = await request(app()).post('/up').attach('file', Buffer.from('MZ'), { filename: 'a.exe', contentType: 'text/plain' });
    expect(r.status).toBe(415);
    expect(r.body).toMatchObject({ code: 'UNSUPPORTED_FILE_TYPE' });
  });

  it('a second file where one is allowed is 400 UPLOAD_INVALID', async () => {
    const r = await request(app())
      .post('/up')
      .attach('file', Buffer.from('a'), { filename: 'a.txt', contentType: 'text/plain' })
      .attach('file', Buffer.from('b'), { filename: 'b.txt', contentType: 'text/plain' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'UPLOAD_INVALID' });
  });

  it('an admitted file reaches the handler', async () => {
    const r = await request(app()).post('/up').attach('file', Buffer.from('hello'), { filename: 'a.txt', contentType: 'text/plain' });
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ received: 5 });
  });
});
