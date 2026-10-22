/**
 * Every client-intelligence route answers a failure with a 500 whose body is
 * the fixed server-error envelope (the cause goes to the log), never the caught
 * error's text.
 *
 * What the routes used to do (until 2026-10-15): 29 handlers ended
 * `sendError(res, 500, err.message)` — a relation name, a driver message, a
 * host and port in the response body. The server-error-leak gate could not see
 * them because the status was a parameter. (The upload routes and document
 * lists were fixed earlier: client-intelligence-uploads-and-document-lists-
 * carry-no-error-text.test.ts.)
 *
 * Every service a route calls is a double that throws the sentinel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const SENTINEL = 'SENTINEL relation "client_memory_entries" does not exist at 10.0.0.5:5432';

const H = vi.hoisted(() => ({
  fail: () => {
    throw new Error('SENTINEL relation "client_memory_entries" does not exist at 10.0.0.5:5432');
  },
  reject: async () => {
    throw new Error('SENTINEL relation "client_memory_entries" does not exist at 10.0.0.5:5432');
  },
}));

vi.mock('../../services/client-intelligence-memory', () => ({
  upsertClientProfile: H.reject,
  getClientProfile: H.reject,
  ingestDocument: H.reject,
  getMemoryEntries: H.reject,
  searchMemoryEntriesSemantic: H.reject,
  getIngestedDocuments: H.reject,
  upsertProjectIntelligence: H.reject,
  getProjectIntelligence: H.reject,
  ingestProjectDocument: H.reject,
  getProjectMemoryEntries: H.reject,
  searchProjectMemoryEntriesSemantic: H.reject,
  getProjectIngestedDocuments: H.reject,
  buildProjectIntelligenceContext: H.reject,
  getDocumentChecklist: H.reject,
  archiveMemoryEntry: H.reject,
  verifyMemoryEntry: H.reject,
  buildClientIntelligenceContext: H.reject,
  supersedeClientMemoryEntry: H.reject,
  supersedeProjectMemoryEntry: H.reject,
  getSharedMemoryPool: H.reject,
  isOwnProject: async () => true,
}));
vi.mock('../../services/memory-context-assembler.js', () => ({ buildMemoryContextForChat: H.reject }));
vi.mock('../../services/ana-context-router', () => ({
  buildUserContext: H.reject,
  upsertUserProfile: H.reject,
  buildMergedContext: H.reject,
}));
vi.mock('../../services/industry-context-templates', () => ({
  getCompanyTypes: H.fail,
  getProjectTypes: H.fail,
  getCompanyTemplate: H.fail,
  getProjectTemplate: H.fail,
}));
vi.mock('../../db', () => ({ db: { select: H.fail, insert: H.fail, update: H.fail } }));

import router from '../client-intelligence';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 1, organizationId: 7, role: 'editor' };
    next();
  });
  a.use('/api/client-intelligence', router);
  return a;
}

const BASE = '/api/client-intelligence';
const ROUTES: Array<[string, string, Record<string, unknown>?]> = [
  ['get', '/profile'],
  ['post', '/profile', { companyName: 'Acme Bio' }],
  ['get', '/checklist?profileId=1'],
  ['get', '/memory?profileId=1'],
  ['get', '/memory/semantic-search?query=stability'],
  ['get', '/memory/context-assemble?threadId=t-1&query=stability'],
  ['post', '/memory/1/verify'],
  ['post', '/memory/1/supersede'],
  ['delete', '/memory/1'],
  ['get', '/context'],
  ['get', '/project/3/profile'],
  ['post', '/project/3/profile', {}],
  ['get', '/project/3/memory'],
  ['get', '/project/3/memory/semantic-search?query=stability'],
  ['post', '/project/3/memory/1/supersede'],
  ['get', '/memory/shared-pool'],
  ['get', '/project/3/context'],
  ['get', '/ana/user-profile'],
  ['post', '/ana/user-profile', {}],
  ['get', '/ana/merged-context'],
  ['get', '/ana/capabilities'],
  ['post', '/ana/log-outcome', { capabilityKey: 'k', outcome: 'success' }],
  ['get', '/ana/wisdom'],
  ['get', '/ana/objectives'],
  ['post', '/ana/objectives', { objective: 'File the IND', category: 'regulatory' }],
  ['get', '/ana/templates/company-types'],
  ['get', '/ana/templates/project-types'],
  ['get', '/ana/templates/company/biotech'],
  ['get', '/ana/templates/project/ind'],
];

beforeEach(() => vi.clearAllMocks());

describe('client-intelligence 500s carry the envelope, never the cause', () => {
  it.each(ROUTES)('%s %s', async (method, path, body) => {
    const agent = request(app());
    const call = (agent as unknown as Record<string, (url: string) => request.Test>)[method](`${BASE}${path}`);
    const res = await (body ? call.send(body) : call);

    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body), 'the caught error reached the response body').not.toContain('SENTINEL');
    expect(JSON.stringify(res.body)).not.toContain(SENTINEL.slice(9));
    expect(res.body.error).toBe('INTERNAL_ERROR');
  });
});
