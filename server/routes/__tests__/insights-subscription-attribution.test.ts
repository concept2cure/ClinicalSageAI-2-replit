/**
 * A report subscription is attributed to the session's user and stores only
 * this organisation's workspace (reporting review 2026-10-01, SECURITY-7 /
 * DP-59).
 *
 * POST /api/insights/subscriptions took `createdBy` from the body, so a member
 * could put any user's name on a scheduled report, and stored the body's
 * `clientWorkspaceId` unchecked, another organisation's included (and a
 * foreign-key success or failure then said whether that id exists).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
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
const subs = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('../../services/report-os/scheduling/subscription-service', () => ({
  listSubscriptions: vi.fn(),
  createSubscription: subs.create,
  setEnabled: vi.fn(),
}));
const ws = vi.hoisted(() => ({ inOrg: vi.fn() }));
vi.mock('../../services/featureToggleService', () => ({
  FeatureToggleService: { workspaceInOrganization: ws.inOrg },
}));

import insightsRouter from '../report-os-insights';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);

const BODY = { reportTypeId: 'readiness.executive_digest', scopeType: 'project', scopeId: '12', schedule: { cadence: 'weekly', hour: 9 } };

beforeEach(() => {
  subs.create.mockReset().mockImplementation(async (input: unknown) => ({ id: 1, ...(input as object) }));
  ws.inOrg.mockReset().mockImplementation(async (id: number, org: number) => id === 30 && org === 7);
});

describe('POST /api/insights/subscriptions', () => {
  it('records the session user as the creator, whatever the body names', async () => {
    const res = await request(app).post('/api/insights/subscriptions').send({ ...BODY, createdBy: 999 });
    expect(res.status).toBe(201);
    expect(subs.create).toHaveBeenCalledWith(expect.objectContaining({ organizationId: 7, createdBy: 5 }));
  });

  it('refuses another organisation\'s workspace and stores nothing', async () => {
    const res = await request(app).post('/api/insights/subscriptions').send({ ...BODY, clientWorkspaceId: 31 });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('WORKSPACE_NOT_IN_ORGANIZATION');
    expect(ws.inOrg).toHaveBeenCalledWith(31, 7);
    expect(subs.create).not.toHaveBeenCalled();
  });

  it('stores this organisation\'s workspace, and asks nothing when there is none', async () => {
    expect((await request(app).post('/api/insights/subscriptions').send({ ...BODY, clientWorkspaceId: 30 })).status).toBe(201);
    expect(subs.create).toHaveBeenLastCalledWith(expect.objectContaining({ clientWorkspaceId: 30 }));
    ws.inOrg.mockClear();
    expect((await request(app).post('/api/insights/subscriptions').send(BODY)).status).toBe(201);
    expect(ws.inOrg).not.toHaveBeenCalled();
  });
});
