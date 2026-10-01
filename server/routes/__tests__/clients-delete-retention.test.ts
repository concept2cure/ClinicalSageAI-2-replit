/**
 * DELETE /api/clients/:id deletes every project of the workspace, and their
 * artifacts cascade. A program's anchor row, or a project holding documents
 * past draft, is never deleted this way (PF-08; PF-13 founder decision
 * 2026-09-26).
 *
 * What the delete would destroy is read by projectDeletionHolds, proven on real
 * SQL in services/c2c/__tests__/project-retention.pglite.test.ts. Here it is
 * mocked, and the refusal rule is the real one. The case pinned is that a
 * refusal rolls back before ANY delete runs: modules, projects, settings and
 * the workspace alike.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  holds: vi.fn(),
  audit: vi.fn(async () => ({ persisted: true, chained: true })),
  deletes: [] as string[],
  role: 'admin',
  workspace: { id: 5, organizationId: 7, name: 'Main' } as Record<string, unknown>,
}));

vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: 7, role: h.role };
    next();
  },
}));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow: h.audit }));
vi.mock('@shared/schema', () => {
  const table = (name: string) => new Proxy({ __name: name }, { get: (t: any, prop: string) => (prop === '__name' ? t.__name : { name: prop, table: name }) });
  return {
    clientWorkspaces: table('client_workspaces'),
    organizations: table('organizations'),
    clientWorkspaceSettings: table('client_workspace_settings'),
    clientSecuritySettings: table('client_security_settings'),
    projects: table('projects'),
    projectModules: table('project_modules'),
    users: table('users'),
  };
});

function selectChain() {
  const rows = [h.workspace];
  const c: any = { from: () => c, where: () => c, limit: () => Promise.resolve(rows), leftJoin: () => c };
  c.then = (resolve: (v: unknown) => unknown) => resolve(rows);
  return c;
}
function deleteChain(t: { __name: string }) {
  const c: any = {
    where: () => c,
    returning: () => {
      h.deletes.push(t.__name);
      return Promise.resolve(t.__name === 'client_workspaces' ? [h.workspace] : []);
    },
    then: (resolve: (v: unknown) => unknown) => {
      h.deletes.push(t.__name);
      return resolve([]);
    },
  };
  return c;
}
const dbMock: any = {
  select: () => selectChain(),
  delete: (t: { __name: string }) => deleteChain(t),
  transaction: async (fn: (tx: unknown) => unknown) => fn(dbMock),
};
vi.mock('../../db', () => ({ db: dbMock }));
vi.mock('../../db/drizzle-queryable', () => ({ queryableFromDrizzle: () => ({ query: vi.fn() }) }));
vi.mock('../../services/c2c/project-retention', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/c2c/project-retention')>()),
  projectDeletionHolds: h.holds,
}));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../clients-routes')).default;
  app = express();
  app.use(express.json());
  app.use('/api/clients', router);
});
beforeEach(() => {
  h.deletes.length = 0;
  h.holds.mockReset();
  h.audit.mockClear();
  h.role = 'admin';
});

describe('DELETE /api/clients/:id — the workspace’s projects', () => {
  it('a workspace holding a program’s anchor row is refused 409, naming the program, and nothing is deleted', async () => {
    h.holds.mockResolvedValue({ anchoredPrograms: ['11111111-1111-4111-8111-111111111111'], governedArtifacts: 0 });
    const res = await request(app).delete('/api/clients/5');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ success: false, error: 'PROJECT_IS_PROGRAM_ANCHOR', programIds: ['11111111-1111-4111-8111-111111111111'] });
    expect(h.holds).toHaveBeenCalledWith(expect.anything(), { workspaceId: 5 });
    expect(h.deletes).toEqual([]);
  });

  it('a workspace whose projects hold documents past draft is refused 409 with the count, and nothing is deleted', async () => {
    h.holds.mockResolvedValue({ anchoredPrograms: [], governedArtifacts: 3 });
    const res = await request(app).delete('/api/clients/5');
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ error: 'PROJECT_HOLDS_RECORDS', holds: { governedArtifacts: 3 } });
    expect(h.deletes).toEqual([]);
  });

  it('a workspace holding only drafts is deleted, and the delete is audited', async () => {
    h.holds.mockResolvedValue({ anchoredPrograms: [], governedArtifacts: 0 });
    const res = await request(app).delete('/api/clients/5');
    expect(res.status).toBe(200);
    expect(h.deletes).toContain('projects');
    expect(h.deletes).toContain('client_workspaces');
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({
      organizationId: 7, userId: 1, action: 'CLIENT_WORKSPACE_DELETED', resourceType: 'client_workspace', resourceId: '5',
    }));
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('a viewer is refused 403, and nothing is read or deleted', async () => {
    h.role = 'viewer';
    const res = await request(app).delete('/api/clients/5');
    expect(res.status).toBe(403);
    expect(h.holds).not.toHaveBeenCalled();
    expect(h.deletes).toEqual([]);
  });

  it('a holds read that cannot complete deletes nothing and is a 500', async () => {
    h.holds.mockRejectedValue(new Error('connection reset'));
    const res = await request(app).delete('/api/clients/5');
    expect(res.status).toBe(500);
    expect(h.deletes).toEqual([]);
  });
});
