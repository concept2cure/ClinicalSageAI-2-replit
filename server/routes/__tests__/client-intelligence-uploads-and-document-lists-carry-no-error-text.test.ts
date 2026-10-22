/**
 * The client-intelligence upload routes and document lists send no failure text
 * to the client.
 *
 * ── What the code used to do (until 2026-10-15) ─────────────────────────────
 * Both upload routes answered an exception with `500 { error: err.message }` —
 * a relation name, a driver message, a host and port — and both document lists
 * did the same when their read failed. And the lists returned each document's
 * processing_error column as stored: the ingestion's err.message, written there
 * when the ingestion failed, so a later GET delivered the driver text anyway.
 *
 * The memory service is a double.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const CAUSE = 'relation "client_memory_entries" does not exist';
const DRIVER = 'connect ECONNREFUSED 10.0.0.5:5432';

const svc = vi.hoisted(() => ({
  ingestDocument: vi.fn(),
  ingestProjectDocument: vi.fn(),
  getIngestedDocuments: vi.fn(),
  getProjectIngestedDocuments: vi.fn(),
}));

vi.mock('../../services/client-intelligence-memory', () => ({
  upsertClientProfile: vi.fn(),
  getClientProfile: vi.fn(),
  ingestDocument: svc.ingestDocument,
  getMemoryEntries: vi.fn(),
  searchMemoryEntriesSemantic: vi.fn(),
  getIngestedDocuments: svc.getIngestedDocuments,
  upsertProjectIntelligence: vi.fn(),
  getProjectIntelligence: vi.fn(async () => ({ id: 5 })),
  ingestProjectDocument: svc.ingestProjectDocument,
  getProjectMemoryEntries: vi.fn(),
  searchProjectMemoryEntriesSemantic: vi.fn(),
  getProjectIngestedDocuments: svc.getProjectIngestedDocuments,
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
const DOCS = [
  { id: 1, fileName: 'protocol.pdf', processingStatus: 'failed', processingError: DRIVER },
  { id: 2, fileName: 'ib.docx', processingStatus: 'completed', processingError: null },
];

beforeEach(() => {
  svc.ingestDocument.mockReset().mockRejectedValue(new Error(CAUSE));
  svc.ingestProjectDocument.mockReset().mockRejectedValue(new Error(CAUSE));
  svc.getIngestedDocuments.mockReset().mockResolvedValue(DOCS);
  svc.getProjectIngestedDocuments.mockReset().mockResolvedValue(DOCS);
});

describe('an upload that throws', () => {
  it('client route: a 500 with no failure text in the body', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/documents/upload')
      .field('profileId', '1')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body), 'the caught error reached the response body').not.toContain('client_memory_entries');
  });

  it('project route: a 500 with no failure text in the body', async () => {
    const r = await request(app())
      .post('/api/client-intelligence/project/3/documents/upload')
      .attach('file', TEXT, { filename: 'notes.txt', contentType: 'text/plain' });
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body), 'the caught error reached the response body').not.toContain('client_memory_entries');
  });
});

describe.each([
  ['client', '/api/client-intelligence/documents?profileId=1', svc.getIngestedDocuments],
  ['project', '/api/client-intelligence/project/3/documents', svc.getProjectIngestedDocuments],
])('the %s document list', (_label, url, read) => {
  it("says a document's ingestion failed without the stored failure text", async () => {
    const r = await request(app()).get(url);
    expect(r.status).toBe(200);
    expect(JSON.stringify(r.body), 'the stored processing_error (driver text) was sent').not.toContain('ECONNREFUSED');
    expect(r.body.documents.map((d: { processingError: string | null }) => d.processingError)).toEqual([
      'Ingestion failed. The failure detail is withheld from this listing.',
      null,
    ]);
    expect(r.body.documents[0]).toMatchObject({ id: 1, fileName: 'protocol.pdf', processingStatus: 'failed' });
  });

  it('answers a failed read with a 500 that carries no failure text', async () => {
    read.mockRejectedValue(new Error(CAUSE));
    const r = await request(app()).get(url);
    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body), 'the caught error reached the response body').not.toContain('client_memory_entries');
  });
});
