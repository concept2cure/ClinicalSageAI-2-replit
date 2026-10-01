/**
 * A report-os write stores a client workspace id only when it is the session
 * organisation's (reporting review 2026-10-01, SECURITY-7, report-os half).
 *
 * POST /api/report-os/program-groups and POST /api/report-os/runs stored the
 * body's clientWorkspaceId unchecked, another organisation's included (and a
 * foreign-key success or failure then said whether that id exists). Both now
 * ask services/report-os/ownership.ts workspaceIsOrganisations, as the
 * insights subscription does, before anything is read or written.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const db = vi.hoisted(() => ({ select: vi.fn(), insert: vi.fn() }));
vi.mock('../../db', () => ({ db, pool: {}, getPool: () => ({}), getDb: () => db, query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 5, role: 'member', organizationId: 7 };
    next();
  },
}));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
const ws = vi.hoisted(() => ({ inOrg: vi.fn() }));
vi.mock('../../services/featureToggleService', () => ({ FeatureToggleService: { workspaceInOrganization: ws.inOrg } }));

import reportOsRouter from '../report-os';

const app = express();
app.use(express.json());
app.use('/api/report-os', reportOsRouter);

const WRITES = [
  ['/api/report-os/program-groups', { name: 'Oncology', projectIds: [12] }],
  ['/api/report-os/runs', { scopeType: 'project', scopeId: '12', reportTypeId: 'readiness.executive_digest' }],
] as const;

beforeEach(() => {
  ws.inOrg.mockReset().mockImplementation(async (id: number, org: number) => id === 30 && org === 7);
  db.select.mockReset().mockImplementation(() => {
    throw new Error('read past the workspace check');
  });
  db.insert.mockReset();
});

describe('report-os writes and the client workspace they name', () => {
  it.each(WRITES)("POST %s refuses another organisation's workspace before reading or writing anything", async (path, body) => {
    const res = await request(app).post(path).send({ ...body, clientWorkspaceId: 31 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WORKSPACE_NOT_IN_ORGANIZATION');
    expect(ws.inOrg).toHaveBeenCalledWith(31, 7);
    expect(db.select).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it.each(WRITES)("POST %s goes on past the check with the organisation's own workspace, or none", async (path, body) => {
    for (const claim of [{ clientWorkspaceId: 30 }, {}]) {
      db.select.mockClear();
      const res = await request(app).post(path).send({ ...body, ...claim });
      expect(res.body.code, JSON.stringify(claim)).not.toBe('WORKSPACE_NOT_IN_ORGANIZATION');
      expect(db.select, 'the handler read on after the check').toHaveBeenCalled();
    }
  });
});
