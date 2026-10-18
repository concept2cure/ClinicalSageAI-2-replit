/**
 * The client-intelligence upload routes say when a file could not be read.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * Both upload handlers answered every ingestion with 200 `{ success: true }`.
 * The service behind them stored a placeholder as the text of a file it could
 * not read and reported it 'completed'; now it fails such a file
 * (`status: 'failed', unreadable: true`), and a 200 success would still tell
 * the caller the document was taken in. The routes answer 422 naming the file.
 *
 * The memory service is a double; the service's own behaviour is pinned by
 * services/__tests__/client-intelligence-ingest-reads-or-fails.pglite.test.ts.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const UNREADABLE = {
  documentId: 12,
  fileName: 'notes.txt',
  extractedText: '',
  tokenCount: 0,
  memoryEntriesCreated: 0,
  status: 'failed' as const,
  unreadable: true,
  error: 'Could not read any text from notes.txt: the text extractor returned no text',
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
  ingestDocument.mockReset().mockResolvedValue(UNREADABLE);
  ingestProjectDocument.mockReset().mockResolvedValue(UNREADABLE);
});

describe('client-intelligence uploads: a file that could not be read', () => {
  it('client route answers 422 naming the file, not 200 success', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/documents/upload')
      .field('profileId', '1')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status, `an unread file was answered as a success: ${JSON.stringify(r.body)}`).toBe(422);
    expect(r.body).toMatchObject({ success: false, error: UNREADABLE.error, result: { documentId: 12, status: 'failed' } });
  });

  it('project route answers 422 naming the file, not 200 success', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/project/3/documents/upload')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status, `an unread file was answered as a success: ${JSON.stringify(r.body)}`).toBe(422);
    expect(r.body).toMatchObject({ success: false, error: UNREADABLE.error });
  });

  it('control: a document that was read is still a 200 success', async () => {
    ingestDocument.mockResolvedValue({ ...UNREADABLE, status: 'completed', unreadable: undefined, error: undefined });
    const r = await request(app())
      .post('/api/client-intelligence/documents/upload')
      .field('profileId', '1')
      .attach('file', Buffer.from('Company: Acme'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, result: { status: 'completed' } });
  });
});
