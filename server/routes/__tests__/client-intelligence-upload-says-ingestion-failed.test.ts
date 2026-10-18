/**
 * The client-intelligence upload routes answer a failed ingestion as a failure.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * Only a file nothing could be read from was answered as a failure (422). Any
 * other failed ingestion — a memory write or profile update that threw after
 * the file was read — was answered 200 `{ success: true }` with
 * `status: 'failed'` inside the result, so a caller that reads the status code
 * was told the document was taken in. It is a server fault: 500, with the cause
 * in the log and not in the body.
 *
 * The memory service is a double; the unreadable case is pinned by
 * client-intelligence-upload-says-unreadable.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const CAUSE = 'relation "client_memory_entries" does not exist';
const FAILED = {
  documentId: 12,
  fileName: 'notes.txt',
  extractedText: '',
  tokenCount: 0,
  memoryEntriesCreated: 0,
  memoryEntriesEmbedded: 0,
  status: 'failed' as const,
  unreadable: false,
  error: CAUSE,
};

const { ingestDocument, ingestProjectDocument } = vi.hoisted(() => ({
  ingestDocument: vi.fn(),
  ingestProjectDocument: vi.fn(),
}));

vi.mock('../../services/client-intelligence-memory', () => ({
  upsertClientProfile: vi.fn(),
  getClientProfile: vi.fn(),
  ingestDocument,
  getMemoryEntries: vi.fn(),
  searchMemoryEntriesSemantic: vi.fn(),
  getIngestedDocuments: vi.fn(),
  upsertProjectIntelligence: vi.fn(),
  getProjectIntelligence: vi.fn(async () => ({ id: 5 })),
  ingestProjectDocument,
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

const TEXT = Buffer.from('plain words the guard admits');

beforeEach(() => {
  ingestDocument.mockReset().mockResolvedValue(FAILED);
  ingestProjectDocument.mockReset().mockResolvedValue(FAILED);
});

describe('client-intelligence uploads: an ingestion that failed after the file was read', () => {
  it('client route answers a server error naming the file, not 200 success', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/documents/upload')
      .field('profileId', '1')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status, `a failed ingestion was answered as a success: ${JSON.stringify(r.body)}`).toBe(500);
    expect(r.body.success).not.toBe(true);
    expect(r.body.message).toContain('notes.txt');
    expect(JSON.stringify(r.body), 'the cause reached the response body').not.toContain('client_memory_entries');
  });

  it('project route answers a server error naming the file, not 200 success', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/project/3/documents/upload')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status, `a failed ingestion was answered as a success: ${JSON.stringify(r.body)}`).toBe(500);
    expect(r.body.success).not.toBe(true);
    expect(r.body.message).toContain('notes.txt');
    expect(JSON.stringify(r.body), 'the cause reached the response body').not.toContain('client_memory_entries');
  });

  it('control: an unreadable file is still a 422 naming it', async () => {
    ingestDocument.mockResolvedValue({ ...FAILED, unreadable: true, error: 'Could not read any text from notes.txt' });
    const r = await request(app())
      .post('/api/client-intelligence/documents/upload')
      .field('profileId', '1')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status).toBe(422);
  });

  it('control: a completed ingestion is still a 200 success', async () => {
    ingestProjectDocument.mockResolvedValue({ ...FAILED, status: 'completed', unreadable: undefined, error: undefined });
    const r = await request(app())
      .post('/api/client-intelligence/project/3/documents/upload')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, result: { status: 'completed' } });
  });
});
