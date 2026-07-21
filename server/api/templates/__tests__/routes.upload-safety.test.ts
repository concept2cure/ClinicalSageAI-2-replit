/**
 * Upload content-validation contract for POST /api/templates/upload (L1).
 *
 * Pre-fix, the route trusted path.extname alone: any bytes named *.pdf/*.docx
 * were persisted under uploads/templates/ and registered as a template. These
 * tests pin the fixed behavior: after multer stores the file, the leading
 * bytes are verified against the type the extension claims (pdf = '%PDF',
 * docx = ZIP 'PK\x03\x04', legacy doc = OLE compound, txt/rtf = text-shaped);
 * on mismatch the stored file is deleted and the request fails with 400
 * FILE_SIGNATURE_MISMATCH.
 *
 * Also pins the /catalog fix: the org id comes from the tenant context, not
 * from a `?organizationId=` query param (previously defaulted to org 6).
 */

import express from 'express';
import request from 'supertest';
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const createTemplate = vi.fn();

vi.mock('../../../services/templateService', () => ({
  templateService: {
    createTemplate: (...args: unknown[]) => createTemplate(...args),
  },
}));

vi.mock('../../../db', () => ({ db: {} }));

import router from '../routes';

const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'templates');

function makeApp(withTenant = true, withUser = withTenant) {
  const app = express();
  app.use((req: any, _res, next) => {
    if (withTenant) {
      req.tenantId = 7;
      req.tenantContext = { organizationId: 7 };
    }
    if (withUser) {
      // Production mounts this router behind authenticateToken, which populates
      // req.user. Mirror that here: template creation records the authenticated
      // uploader as createdBy (no longer a hardcoded user), so an authenticated
      // identity must be present for the write to succeed.
      req.user = { userId: 42, id: 42, organizationId: 7 };
    }
    next();
  });
  app.use('/api/templates', router);
  return app;
}

function listUploads(): Set<string> {
  return new Set(fs.readdirSync(UPLOAD_DIR));
}

/** Files present before the suite ran — everything else is ours to clean. */
let preexisting: Set<string>;

beforeAll(() => {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  preexisting = listUploads();
});

afterAll(() => {
  for (const name of listUploads()) {
    if (!preexisting.has(name)) {
      try {
        fs.unlinkSync(path.join(UPLOAD_DIR, name));
      } catch {
        /* best-effort cleanup */
      }
    }
  }
});

beforeEach(() => {
  createTemplate.mockReset();
  createTemplate.mockImplementation(async (data: Record<string, unknown>) => ({
    id: 123,
    ...data,
  }));
});

function uploadFile(buffer: Buffer, filename: string) {
  return request(makeApp())
    .post('/api/templates/upload')
    .field('name', 'Test Template')
    .field('category', 'General')
    .attach('file', buffer, filename);
}

// Signature-bearing payloads.
const PDF_BYTES = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n');
const ZIP_BYTES = Buffer.concat([
  Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  Buffer.from('word/document.xml payload'),
]);
const OLE_BYTES = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.alloc(64, 0x20),
]);
const EXE_BYTES = Buffer.concat([Buffer.from('MZ'), Buffer.from([0x90, 0x00, 0x03, 0x00])]);
const BINARY_BYTES = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0x00, 0x7f, 0x00]);

describe('POST /api/templates/upload — magic-byte validation', () => {
  it('accepts a real PDF uploaded as .pdf', async () => {
    const res = await uploadFile(PDF_BYTES, 'protocol.pdf');
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(createTemplate).toHaveBeenCalledTimes(1);
    expect(createTemplate.mock.calls[0][0]).toMatchObject({
      organizationId: 7,
      fileType: 'pdf',
      // Attribution is the authenticated uploader, never a hardcoded user.
      createdBy: 42,
    });
  });

  it('accepts a ZIP-container payload uploaded as .docx', async () => {
    const res = await uploadFile(ZIP_BYTES, 'template.docx');
    expect(res.status).toBe(201);
    expect(createTemplate).toHaveBeenCalledTimes(1);
  });

  it('accepts an OLE compound document uploaded as legacy .doc', async () => {
    const res = await uploadFile(OLE_BYTES, 'legacy.doc');
    expect(res.status).toBe(201);
  });

  it('accepts plain text uploaded as .txt', async () => {
    const res = await uploadFile(Buffer.from('hello template world\n'), 'notes.txt');
    expect(res.status).toBe(201);
  });

  it('rejects executable bytes disguised as .pdf and deletes the stored file', async () => {
    const before = listUploads();
    const res = await uploadFile(EXE_BYTES, 'evil.pdf');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
    expect(createTemplate).not.toHaveBeenCalled();
    // The multer-persisted file must not survive rejection.
    expect(listUploads()).toEqual(before);
  });

  it('rejects PDF bytes disguised as .docx (claimed type must match content)', async () => {
    const before = listUploads();
    const res = await uploadFile(PDF_BYTES, 'fake.docx');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
    expect(listUploads()).toEqual(before);
  });

  it('rejects ZIP bytes disguised as legacy .doc', async () => {
    const res = await uploadFile(ZIP_BYTES, 'fake.doc');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
  });

  it('rejects binary content disguised as .txt', async () => {
    const before = listUploads();
    const res = await uploadFile(BINARY_BYTES, 'fake.txt');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
    expect(createTemplate).not.toHaveBeenCalled();
    expect(listUploads()).toEqual(before);
  });

  it('rejects empty files', async () => {
    const res = await uploadFile(Buffer.alloc(0), 'empty.pdf');
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('FILE_SIGNATURE_MISMATCH');
  });

  it('still requires tenant context before touching the upload', async () => {
    const res = await request(makeApp(false))
      .post('/api/templates/upload')
      .field('name', 'Test Template')
      .field('category', 'General')
      .attach('file', PDF_BYTES, 'protocol.pdf');
    expect(res.status).toBe(401);
    expect(createTemplate).not.toHaveBeenCalled();
  });

  it('fails closed with 401 when no authenticated user is present (Part 11 attribution)', async () => {
    // Tenant context is present but the request carries no authenticated
    // identity: the upload must not be persisted under a fabricated creator.
    const res = await request(makeApp(true, false))
      .post('/api/templates/upload')
      .field('name', 'Test Template')
      .field('category', 'General')
      .attach('file', PDF_BYTES, 'protocol.pdf');
    expect(res.status).toBe(401);
    expect(createTemplate).not.toHaveBeenCalled();
  });
});

describe('GET /api/templates/catalog — org context', () => {
  it('no longer trusts ?organizationId and requires tenant context', async () => {
    const res = await request(makeApp(false)).get('/api/templates/catalog?organizationId=6');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Organization context required');
  });
});
