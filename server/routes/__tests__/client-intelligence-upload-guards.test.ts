/**
 * The client-intelligence document uploads are bounded, filtered and
 * byte-checked (security audit 2026-09-24, IAM-14; plan P1-5, D6 upload sweep).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * Both ingest routes (/documents/upload and /project/:id/documents/upload)
 * admitted a file on its declared MIME type alone. The type is chosen by the
 * client, so `payload.exe` declared as text/plain was admitted, and a binary
 * named `report.pdf` went straight to the document parsers; no malware scan
 * ran. The 50 MB limit was already there, but a refused type became a 500 at
 * the generic error handler.
 *
 * The memory service is a double: every case but the control stops at the
 * upload guard, before ingestDocument.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const { ingestDocument } = vi.hoisted(() => ({
  ingestDocument: vi.fn(async () => ({ documentId: 1, entriesCreated: 0 })),
}));

vi.mock('../../services/client-intelligence-memory', () => ({
  upsertClientProfile: vi.fn(),
  getClientProfile: vi.fn(),
  ingestDocument,
  getMemoryEntries: vi.fn(),
  searchMemoryEntriesSemantic: vi.fn(),
  getIngestedDocuments: vi.fn(),
  upsertProjectIntelligence: vi.fn(),
  getProjectIntelligence: vi.fn(),
  ingestProjectDocument: vi.fn(),
  getProjectMemoryEntries: vi.fn(),
  searchProjectMemoryEntriesSemantic: vi.fn(),
  getProjectIngestedDocuments: vi.fn(),
  buildProjectIntelligenceContext: vi.fn(),
  getDocumentChecklist: vi.fn(),
  archiveMemoryEntry: vi.fn(),
  verifyMemoryEntry: vi.fn(),
  buildClientIntelligenceContext: vi.fn(),
  supersedeClientMemoryEntry: vi.fn(),
  supersedeProjectMemoryEntry: vi.fn(),
  getSharedMemoryPool: vi.fn(),
  isOwnProject: vi.fn(async () => true),
}));
vi.mock('../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: vi.fn() }));

import router from '../client-intelligence';

function app() {
  const a = express();
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7, role: 'editor' };
    next();
  });
  a.use('/api/client-intelligence', router);
  return a;
}

const UPLOAD = '/api/client-intelligence/documents/upload';

beforeEach(() => ingestDocument.mockClear());

describe('POST /api/client-intelligence/documents/upload: the upload guard', () => {
  it('refuses a body over the size limit with 413 instead of buffering it', async () => {
    const oversize = Buffer.alloc(51 * 1024 * 1024, 0x41); // 51 MB of "A"
    const r = await request(app())
      .post(UPLOAD)
      .field('profileId', '1')
      .attach('file', oversize, { filename: 'big.txt', contentType: 'text/plain' });
    expect(r.status, 'an oversize upload was buffered into the heap').toBe(413);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it('refuses an executable named file whatever type it declares (415)', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('profileId', '1')
      .attach('file', Buffer.from('plain text'), { filename: 'payload.exe', contentType: 'text/plain' });
    expect(r.status, 'a .exe declared as text/plain was admitted').toBe(415);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it('refuses a declared type these routes do not read (415, not a 500)', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('profileId', '1')
      .attach('file', Buffer.from('GIF89a'), { filename: 'x.gif', contentType: 'image/gif' });
    expect(r.status).toBe(415);
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it('refuses bytes that are not what the declared type says (the shared byte check)', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('profileId', '1')
      .attach('file', Buffer.from('this is not a pdf'), { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, code: 'FILE_SIGNATURE_MISMATCH' });
    expect(ingestDocument).not.toHaveBeenCalled();
  });

  it('leaves a request with no file to the handler (its own 400, unchanged)', async () => {
    const r = await request(app()).post(UPLOAD).field('profileId', '1');
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ success: false, error: 'No file provided' });
  });

  it('control: a real text document passes the guard and reaches ingestDocument', async () => {
    const r = await request(app())
      .post(UPLOAD)
      .field('profileId', '1')
      .attach('file', Buffer.from('Company: Acme Pharma\nTherapeutic area: oncology\n'), { filename: 'profile.txt', contentType: 'text/plain' });
    expect(r.status, `the guard refused a plain text file: ${JSON.stringify(r.body)}`).toBe(200);
    expect(ingestDocument).toHaveBeenCalledTimes(1);
  });

  it('control: the project route runs the same guard', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/project/3/documents/upload')
      .attach('file', Buffer.from('this is not a pdf'), { filename: 'report.pdf', contentType: 'application/pdf' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'FILE_SIGNATURE_MISMATCH' });
  });
});
