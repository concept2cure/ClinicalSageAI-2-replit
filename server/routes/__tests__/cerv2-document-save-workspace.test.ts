/**
 * POST /api/cerv2/documents/:documentId/save writes the workspace the request
 * names only when it is one of the session's organisation's own.
 *
 * Security audit 2026-09-24, IAM-15 (plan P1-7, second half). The route read
 * X-Client-ID (or one of its two aliases, or a query parameter), parsed it and
 * wrote it into documents.client_workspace_id with no check that the workspace
 * belongs to the caller's organisation — another organisation's workspace key
 * on the tenant's own document row. The organisation is the session's; the
 * workspace is a claim, verified against it, and a foreign one is refused
 * without saying whether the id exists anywhere (403). A request that names no
 * workspace at all is a 400, not an unhandled throw.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const inserted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const dbMock = vi.hoisted(() => {
  // A thenable drizzle builder: every chained call returns itself, awaiting it
  // yields `rows`.
  const chain = (rows: unknown) => {
    const c: any = {};
    for (const m of ['from', 'where', 'limit', 'orderBy', 'set', 'returning']) c[m] = () => c;
    c.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve(rows).then(onOk, onErr);
    return c;
  };
  return {
    execute: vi.fn(async () => ({ rows: [{ exists: true }] })),
    select: vi.fn(() => chain([{ count: 0 }])),
    insert: vi.fn(() => ({
      values: (v: Record<string, unknown>) => {
        inserted.push(v);
        return chain([{ id: 100 + inserted.length }]);
      },
    })),
    update: vi.fn(() => chain([])),
  };
});
vi.mock('../../db', () => ({ db: dbMock }));
vi.mock('../../db/requestDb', () => ({ requestDb: vi.fn(), requestPgClient: vi.fn() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 42, organizationId: 7 };
    req.userId = 42;
    req.tenantId = 7;
    next();
  },
}));
// Workspace 5 belongs to organisation 7; nothing else does.
const ownership = vi.hoisted(() => ({
  workspaceInOrganization: vi.fn(async (w: number, o: number) => w === 5 && o === 7),
}));
vi.mock('../../services/featureToggleService', () => ({
  FeatureToggleService: { ...ownership, isFeatureEnabled: vi.fn(async () => true) },
}));

import router from '../cerv2-document-routes';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/cerv2', router);
  return a;
}

const save = (headers: Record<string, string>, path = '/api/cerv2/documents/new/save') =>
  request(app()).post(path).set(headers).send({ title: 'CER', documentType: 'cerv2_510k' });

beforeEach(() => {
  inserted.length = 0;
  dbMock.execute.mockClear();
  ownership.workspaceInOrganization.mockClear();
});

describe('POST /documents/:id/save and the workspace the request names', () => {
  it("writes the document into the organisation's own workspace", async () => {
    const res = await save({ 'x-client-id': '5' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(inserted[0]).toMatchObject({ organizationId: 7, clientWorkspaceId: 5 });
  });

  it("refuses a workspace of another organisation before anything is read or written", async () => {
    const res = await save({ 'x-client-id': '9' });
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('9');
    expect(inserted).toEqual([]);
    expect(dbMock.execute).not.toHaveBeenCalled();
  });

  it('the header aliases and the query parameter are the same claim', async () => {
    for (const headers of [{ 'x-client-workspace-id': '9' }, { 'x-client-workspace': '9' }]) {
      const res = await save(headers);
      expect(res.status, JSON.stringify(headers)).toBe(403);
    }
    const viaQuery = await save({}, '/api/cerv2/documents/new/save?client_workspace_id=9');
    expect(viaQuery.status).toBe(403);
    expect(inserted).toEqual([]);
  });

  it('verifies the claim against the session organisation, not against itself', async () => {
    await save({ 'x-client-id': '5' });
    expect(ownership.workspaceInOrganization).toHaveBeenCalledWith(5, 7);
  });

  it('a request that names no workspace is a 400, not an unhandled error', async () => {
    const res = await save({});
    expect(res.status).toBe(400);
    expect(inserted).toEqual([]);
  });
});
