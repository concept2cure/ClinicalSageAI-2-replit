/**
 * Module 3 acts only in a project of the caller's organization (PF-15).
 *
 * Every /api/cmc/module3-os route that names a project took :projectId from the
 * URL and wrote and read under it unchecked. One router.param guard now asks
 * projectBelongsToTenant first. Its SQL is proven in
 * services/cmc/__tests__/project-membership.pglite.test.ts; here it is mocked
 * so that 'foreign-proj' is another organization's project, and the routes are
 * shown to refuse it before any query runs.
 */
import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockQuery = vi.fn();
const mockProjectOwned = vi.fn();

vi.mock('../../../db', () => ({
  getPool: () => ({
    query: mockQuery,
    connect: async () => ({ query: mockQuery, release: vi.fn() }),
  }),
}));
vi.mock('../../../services/cmc/project-membership', () => ({
  projectBelongsToTenant: (params: unknown) => mockProjectOwned(params),
}));
vi.mock('../../../routes/c2c/actions', () => ({
  verifyReauth: vi.fn(async () => ({ ok: true })),
  recordGovernedAction: vi.fn(),
}));

import router from '../module3OperatingSystemRoutes';

function appFor(org: number | null): express.Express {
  const a = express();
  a.use(express.json());
  a.use((req, _res, next) => {
    if (org !== null) (req as unknown as { tenantId: number }).tenantId = org;
    next();
  });
  a.use('/api/cmc/module3-os', router);
  return a;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [] });
  mockProjectOwned.mockReset();
  mockProjectOwned.mockImplementation(async (p: { projectId: string }) => p.projectId !== 'foreign-proj');
});

describe("module3-os — another organization's project", () => {
  it.each([
    ['post', '/source-objects/foreign-proj', { sourceType: 'batch_record', sourceKey: 'k', sourcePayload: { a: 1 } }],
    ['post', '/compile/foreign-proj', {}],
    ['post', '/source-changed/foreign-proj', {}],
    ['get', '/sections/foreign-proj', undefined],
    ['get', '/sections/foreign-proj/3.2.P.5', undefined],
    ['get', '/provenance/foreign-proj/3.2.P.5', undefined],
    ['get', '/readiness/foreign-proj', undefined],
    ['post', '/sections/foreign-proj/3.2.P.5/approve', { meaning: 'approval' }],
    ['post', '/sections/foreign-proj/3.2.P.5/refresh', {}],
    ['post', '/guard/final-export/foreign-proj', {}],
    ['post', '/place-into-submission/foreign-proj', {}],
  ] as const)('%s %s is not found, and nothing is read or written', async (method, path, body) => {
    const r = request(appFor(1))[method](`/api/cmc/module3-os${path}`);
    const res = await (body ? r.send(body) : r);
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PROJECT_NOT_FOUND');
    expect(mockProjectOwned).toHaveBeenCalledWith({ organizationId: 1, projectId: 'foreign-proj' });
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('the organization asked about is the caller\'s own', async () => {
    await request(appFor(7)).get('/api/cmc/module3-os/readiness/proj-1');
    expect(mockProjectOwned).toHaveBeenCalledWith({ organizationId: 7, projectId: 'proj-1' });
  });

  it('a project lookup that cannot complete is a 500, never a "not found"', async () => {
    mockProjectOwned.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appFor(1)).get('/api/cmc/module3-os/sections/proj-1');
    expect(res.status).toBe(500);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('with no organization in context, the handler\'s own refusal stands and no project is looked up', async () => {
    const res = await request(appFor(null)).get('/api/cmc/module3-os/sections/proj-1');
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(404);
    expect(mockProjectOwned).not.toHaveBeenCalled();
  });
});
