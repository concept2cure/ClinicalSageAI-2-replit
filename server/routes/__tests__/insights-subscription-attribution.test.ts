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
/* The entitlement the create route gates on (coverage review C-26a). It is the
   SAME predicate the sweep uses, so these cases are also the sweep's contract.
   `scheduled_reports` needs the professional plan, and an unreadable tier fails
   closed to 'standard' — so every case here must say which tier it is. */
const caps = vi.hoisted(() => ({ resolve: vi.fn() }));
vi.mock('../../services/entitlements/resolver', () => ({
  resolveCapabilities: (...a: unknown[]) => caps.resolve(...a),
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
  caps.resolve.mockReset().mockResolvedValue({ tier: 'professional' });
});

describe('POST /api/insights/subscriptions — entitlement (C-26a)', () => {
  /* The sweep re-checked `scheduled_reports` at FIRE time and skipped a
     downgraded org (scheduling/worker.ts planSweep). Nothing checked it at
     CREATE time, so a standard-plan org could create a schedule the screen
     showed as Active and the sweep skipped on every tick, for ever, silently. */
  it('refuses a standard-plan org and stores nothing', async () => {
    caps.resolve.mockResolvedValue({ tier: 'standard' });
    const res = await request(app).post('/api/insights/subscriptions').send(BODY);
    expect(res.status).toBe(403);
    expect(res.body.feature).toBe('scheduled_reports');
    expect(res.body.requiredTier).toBe('professional');
    expect(res.body.tier).toBe('standard');
    expect(subs.create).not.toHaveBeenCalled();
  });

  it('allows a professional-plan org', async () => {
    caps.resolve.mockResolvedValue({ tier: 'professional' });
    expect((await request(app).post('/api/insights/subscriptions').send(BODY)).status).toBe(201);
  });

  it('fails CLOSED when the plan cannot be read, and says so rather than naming a plan', async () => {
    // An entitlement store that does not answer is not an enterprise licence.
    caps.resolve.mockRejectedValue(new Error('entitlement store unreachable'));
    const res = await request(app).post('/api/insights/subscriptions').send(BODY);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/plan could not be read/);
    expect(subs.create).not.toHaveBeenCalled();
  });

  it('refuses before it writes — the entitlement gate runs ahead of createSubscription', async () => {
    caps.resolve.mockResolvedValue({ tier: 'free' });
    await request(app).post('/api/insights/subscriptions').send(BODY);
    expect(subs.create).not.toHaveBeenCalled();
  });
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
