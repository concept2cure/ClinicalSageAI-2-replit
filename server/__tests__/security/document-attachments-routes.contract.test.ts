/**
 * Route contract test — document attachment upload and download.
 *
 * The service is already proven to record and audit honestly (see the sibling
 * audit-honesty test). This file is about the ROUTES: the order of operations
 * on upload, the compensation when the record fails after the bytes were
 * stored, the two independent tenant boundaries on download, and the headers
 * a download carries.
 *
 * DocumentAttachmentService, the storage provider, the upload-safety gate and
 * the tenant scope runner are all mocked, so every assertion is about what the
 * route did and in what order — not about what those collaborators do
 * internally.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const ORG_A = 7;
const DOC_A = 100;
const ATTACHMENT_ID = 900;
const VERSION_ID = '7d5a2c1e-4f6b-4a8d-9c3e-1b2a3c4d5e6f';
const PDF_BYTES = Buffer.from('%PDF-1.7\n%fake-but-shaped-like-a-pdf\n');
const PDF_SHA = 'a'.repeat(64);

const { service, storage, safety, calls, state } = vi.hoisted(() => ({
  calls: [] as string[],
  state: {
    assertOwnedThrows: null as Error | null,
    addThrows: null as Error | null,
    safetyThrows: null as Error | null,
    getAttachmentThrows: null as Error | null,
    providerGetResult: undefined as any,
  },
  service: {
    assertDocumentOwned: vi.fn(),
    addDocumentAttachment: vi.fn(),
    getDocumentAttachment: vi.fn(),
  },
  storage: {
    put: vi.fn(),
    get: vi.fn(),
    delete: vi.fn(),
  },
  safety: {
    assertUploadSafe: vi.fn(),
  },
}));

vi.mock('../../db', () => ({ db: {} }));
vi.mock('../../db/tenantStore', () => ({
  runWithTenantScope: (_scope: unknown, fn: () => unknown) => {
    calls.push('scope');
    return fn();
  },
}));
vi.mock('../../services/WorkflowService', () => ({
  WorkflowService: class {},
}));
vi.mock('../../services/module-integration/attachment-service', () => ({
  DocumentAttachmentService: class {
    assertDocumentOwned = (...args: unknown[]) => {
      calls.push('assertOwned');
      service.assertDocumentOwned(...args);
      if (state.assertOwnedThrows) throw state.assertOwnedThrows;
      return Promise.resolve();
    };
    add = (...args: unknown[]) => {
      calls.push('addRecord');
      service.addDocumentAttachment(...args);
      if (state.addThrows) throw state.addThrows;
      const input = args[1] as Record<string, unknown>;
      return Promise.resolve({ id: ATTACHMENT_ID, documentId: DOC_A, ...input });
    };
    get = (...args: unknown[]) => {
      calls.push('getRecord');
      service.getDocumentAttachment(...args);
      if (state.getAttachmentThrows) throw state.getAttachmentThrows;
      return Promise.resolve({
        id: ATTACHMENT_ID,
        documentId: DOC_A,
        fileName: 'stability "summary" é.pdf',
        fileType: 'application/pdf',
        fileSize: PDF_BYTES.length,
        filePath: VERSION_ID,
        metadata: { sha256: PDF_SHA },
      });
    };
    list = () => Promise.resolve([]);
  },
}));
vi.mock('../../services/storage', () => ({
  getStorageProvider: () => ({
    put: async (opts: unknown) => {
      calls.push('put');
      storage.put(opts);
      return {
        vaultFileId: `vault://${ORG_A}/document-${DOC_A}/x.pdf`,
        vaultVersionId: VERSION_ID,
        sizeBytes: PDF_BYTES.length,
        sha256: PDF_SHA,
        provider: 'local',
      };
    },
    get: async (id: string, orgId: number) => {
      calls.push('get');
      storage.get(id, orgId);
      return state.providerGetResult;
    },
    delete: async (id: string, orgId: number) => {
      calls.push('delete');
      storage.delete(id, orgId);
      return true;
    },
  }),
}));
vi.mock('../../middleware/uploadSafety', async importOriginal => {
  const actual = await importOriginal<typeof import('../../middleware/uploadSafety')>();
  return {
    ...actual,
    assertUploadSafe: async (...args: unknown[]) => {
      calls.push('safety');
      safety.assertUploadSafe(...args);
      if (state.safetyThrows) throw state.safetyThrows;
    },
  };
});

let app: express.Express;
let DocumentNotFoundException: any;
let AttachmentNotFoundException: any;
let AttachmentRejectedException: any;
let UploadSafetyError: any;

beforeEach(async () => {
  vi.clearAllMocks();
  calls.length = 0;
  state.assertOwnedThrows = null;
  state.addThrows = null;
  state.safetyThrows = null;
  state.getAttachmentThrows = null;
  state.providerGetResult = {
    bytes: PDF_BYTES,
    sizeBytes: PDF_BYTES.length,
    sha256: PDF_SHA,
    mime: 'application/pdf',
    filename: 'x.pdf',
  };

  const errs = await import('../../services/module-integration/errors');
  DocumentNotFoundException = errs.DocumentNotFoundException;
  AttachmentNotFoundException = errs.AttachmentNotFoundException;
  AttachmentRejectedException = errs.AttachmentRejectedException;
  UploadSafetyError = (await import('../../middleware/uploadSafety')).UploadSafetyError;

  const router = (await import('../../routes/moduleIntegrationRoutes')).default;
  app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    // What the global /api auth gate writes from the verified JWT.
    (req as any).user = { id: 1, organizationId: ORG_A, role: 'member' };
    (req as any).userId = 1;
    (req as any).tenantId = ORG_A;
    next();
  });
  app.use('/api/module-integration', router);
});

const upload = (name = 'stability-summary.pdf', bytes: Buffer = PDF_BYTES, type = 'application/pdf') =>
  request(app)
    .post(`/api/module-integration/documents/${DOC_A}/attachments`)
    .attach('file', bytes, { filename: name, contentType: type });

describe('POST /documents/:id/attachments — order of operations', () => {
  it('proves ownership, then safety, then stores bytes, then records — in that order', async () => {
    const res = await upload();

    expect(res.status).toBe(201);
    expect(calls).toEqual(['scope', 'assertOwned', 'safety', 'put', 'scope', 'addRecord']);

    // The bytes went to the provider under the caller's organization and a
    // per-document bucket.
    const putOpts = storage.put.mock.calls[0][0];
    expect(putOpts.orgId).toBe(ORG_A);
    expect(putOpts.projectId).toBe(`document-${DOC_A}`);
    expect(Buffer.compare(putOpts.bytes, PDF_BYTES)).toBe(0);

    // The record references the provider's version id, not a path, and
    // carries the digest the provider computed.
    const [docId, input, userId, orgId] = service.addDocumentAttachment.mock.calls[0];
    expect(docId).toBe(DOC_A);
    expect(input.filePath).toBe(VERSION_ID);
    expect(input.fileSize).toBe(PDF_BYTES.length);
    expect(input.metadata.sha256).toBe(PDF_SHA);
    expect(userId).toBe('1');
    expect(String(orgId)).toBe(String(ORG_A));

    expect(res.body.filePath).toBe(VERSION_ID);
  });

  it('never stores bytes for a document the caller does not own', async () => {
    state.assertOwnedThrows = new DocumentNotFoundException(DOC_A);

    const res = await upload();

    expect(res.status).toBe(404);
    expect(calls).not.toContain('put');
    expect(calls).not.toContain('safety');
    expect(calls).not.toContain('addRecord');
  });

  it('never stores bytes that fail the safety gate', async () => {
    state.safetyThrows = new UploadSafetyError(400, 'FILE_SIGNATURE_MISMATCH', 'File content does not match declared type');

    const res = await upload();

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('FILE_SIGNATURE_MISMATCH');
    expect(calls).not.toContain('put');
    expect(calls).not.toContain('addRecord');
  });

  it('removes the stored bytes again when the record cannot be written', async () => {
    state.addThrows = new AttachmentRejectedException('fileName must be a file name, not a path');

    const res = await upload();

    expect(res.status).toBe(400);
    // put happened, the record failed, and the compensation ran against the
    // same version id under the same organization.
    expect(calls).toEqual(['scope', 'assertOwned', 'safety', 'put', 'scope', 'addRecord', 'delete']);
    expect(storage.delete).toHaveBeenCalledWith(VERSION_ID, ORG_A);
  });

  it('rejects a disallowed file type before buffering, touching nothing', async () => {
    const res = await upload('payload.exe', Buffer.from('MZ...'), 'application/octet-stream');

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rejects a request with no file', async () => {
    const res = await request(app)
      .post(`/api/module-integration/documents/${DOC_A}/attachments`)
      .field('note', 'no file here');

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('rejects a non-integer document id', async () => {
    const res = await request(app)
      .post('/api/module-integration/documents/abc/attachments')
      .attach('file', PDF_BYTES, { filename: 'x.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});

describe('GET /documents/:id/attachments/:attachmentId — two boundaries, honest headers', () => {
  const download = () =>
    request(app)
      .get(`/api/module-integration/documents/${DOC_A}/attachments/${ATTACHMENT_ID}`)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      });

  it('serves the bytes with the recorded type, a safe disposition, and no-sniff', async () => {
    const res = await download();

    expect(res.status).toBe(200);
    expect(Buffer.compare(res.body as Buffer, PDF_BYTES)).toBe(0);
    expect(res.headers['content-type']).toMatch(/^application\/pdf/);
    expect(res.headers['content-length']).toBe(String(PDF_BYTES.length));
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toBe('private, no-store');

    // Quotes and non-ASCII cannot break the header; the real name travels in
    // the RFC 5987 form.
    const disposition = res.headers['content-disposition'];
    expect(disposition).toMatch(/^attachment; filename="stability _summary_ .pdf"; filename\*=UTF-8''/);
    expect(disposition).toContain('%C3%A9');
    expect(disposition).toContain('%22');

    // The provider was asked under the caller's organization.
    expect(storage.get).toHaveBeenCalledWith(VERSION_ID, ORG_A);
  });

  it('does not consult the provider when the record is not the caller\'s', async () => {
    state.getAttachmentThrows = new AttachmentNotFoundException(ATTACHMENT_ID);

    const res = await download();

    expect(res.status).toBe(404);
    expect(res.body.toString()).toContain('Attachment not found');
    expect(calls).not.toContain('get');
  });

  it('reports a record whose bytes the provider will not return as not found', async () => {
    state.providerGetResult = null;

    const res = await download();

    expect(res.status).toBe(404);
  });

  it('refuses to serve bytes that no longer match the recorded digest', async () => {
    state.providerGetResult = { ...state.providerGetResult, sha256: 'b'.repeat(64) };

    const res = await download();

    expect(res.status).toBe(500);
    expect(res.body.toString()).toContain('ATTACHMENT_INTEGRITY_FAILED');
  });

  it('rejects non-integer ids', async () => {
    const res = await request(app).get(`/api/module-integration/documents/${DOC_A}/attachments/x`);

    expect(res.status).toBe(400);
    expect(calls).toEqual([]);
  });
});
