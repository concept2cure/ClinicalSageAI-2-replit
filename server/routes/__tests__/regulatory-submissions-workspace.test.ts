/**
 * /api/regulatory-submissions verifies the workspace the request names against
 * the session's organisation before it filters a read or lands in a write.
 *
 * Security audit 2026-09-24, IAM-15 (plan P1-7, second half). getTenantContext
 * in server/routes/regulatorySubmissions.ts took the workspace id from
 * tenantContext, the x-client-workspace-id header or a query parameter, and
 * POST /projects wrote it into regulatory_submissions.client_workspace_id
 * unverified. The organisation is the session's (getSecureOrgId); the
 * workspace is a claim, and a claim outside the organisation is refused (403)
 * without saying whether the id exists anywhere.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const inserted = vi.hoisted(() => [] as Array<Record<string, unknown>>);
const dbMock = vi.hoisted(() => ({
  insert: vi.fn(() => ({
    values: (v: Record<string, unknown>) => {
      inserted.push(v);
      return { returning: async () => [{ id: 1, ...v }] };
    },
  })),
  select: vi.fn(() => {
    const c: any = {};
    for (const m of ['from', 'where', 'limit']) c[m] = () => c;
    c.then = (onOk: (v: unknown) => unknown, onErr?: (e: unknown) => unknown) =>
      Promise.resolve([]).then(onOk, onErr);
    return c;
  }),
}));
vi.mock('../../db', () => ({ db: dbMock }));
// Workspace 5 belongs to organisation 7; nothing else does. The feature itself
// is on: this file is about the workspace, not the toggle.
vi.mock('../../services/featureToggleService', () => ({
  FeatureToggleService: {
    isFeatureEnabled: vi.fn(async () => true),
    workspaceInOrganization: vi.fn(async (w: number, o: number) => w === 5 && o === 7),
  },
}));

import router from '../regulatorySubmissions';

function app() {
  const a = express();
  a.use(express.json());
  a.use((req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 42, organizationId: 7 };
    (req as any).userId = 42;
    next();
  });
  a.use('/api/regulatory-submissions', router);
  return a;
}

const submission = { drugName: 'Drug', indication: 'Indication', sponsor: 'Sponsor' };

beforeEach(() => {
  inserted.length = 0;
  dbMock.select.mockClear();
});

describe('regulatory submissions and the workspace the request names', () => {
  it("POST /projects records the organisation's own workspace", async () => {
    const res = await request(app())
      .post('/api/regulatory-submissions/projects')
      .set({ 'x-client-workspace-id': '5' })
      .send(submission);
    expect(res.status).toBe(201);
    expect(inserted[0]).toMatchObject({ organizationId: 7, clientWorkspaceId: 5 });
  });

  it('POST /projects refuses a workspace of another organisation and writes nothing', async () => {
    const res = await request(app())
      .post('/api/regulatory-submissions/projects')
      .set({ 'x-client-workspace-id': '9' })
      .send(submission);
    expect(res.status).toBe(403);
    expect(JSON.stringify(res.body)).not.toContain('9');
    expect(inserted).toEqual([]);
  });

  it('GET /projects with a foreign workspace is refused, not answered with an empty list', async () => {
    const res = await request(app())
      .get('/api/regulatory-submissions/projects')
      .query({ clientWorkspaceId: 9 });
    expect(res.status).toBe(403);
    expect(dbMock.select).not.toHaveBeenCalled();
  });

  it('with no workspace named, the write is at organisation level as before', async () => {
    const res = await request(app()).post('/api/regulatory-submissions/projects').send(submission);
    expect(res.status).toBe(201);
    expect(inserted[0]).toMatchObject({ organizationId: 7, clientWorkspaceId: null });
  });
});
