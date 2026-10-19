/** Route boundary proof: a schedule's creator permission is not the managing
 * caller's permission. Canonical sharing SQL is covered independently. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  list: vi.fn(), toggle: vi.fn(), access: vi.fn(),
  userId: 5 as number | null, role: 'member', tokenRole: 'admin', allowed: ['11', '7'],
}));
vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: express.Request, _res: express.Response, next: () => void) => {
    req.user = { id: h.userId, organizationId: 7, role: h.tokenRole } as express.Request['user'];
    req.userRole = h.role;
    next();
  },
}));
vi.mock('../../utils/authedOrgId', () => ({ authedOrgId: () => 7 }));
vi.mock('../../services/report-os/scheduling/subscription-service', () => ({
  listSubscriptions: h.list, setEnabled: h.toggle, createSubscription: vi.fn(),
}));
vi.mock('../../services/report-os/project-access', () => ({ canAccessReportScope: h.access }));

import insightsRouter from '../report-os-insights';

const app = express();
app.use(express.json());
app.use('/api/insights', insightsRouter);
const row = (id: number, scopeType: string, scopeId: string, recipients: string[]) => ({
  id, organizationId: 7, createdBy: 99, scopeType, scopeId, recipients,
  reportTypeId: 'readiness.executive_digest', enabled: true,
});
const rows = [row(1, 'project', '11', ['shared@example.com']), row(2, 'project', '12', ['private-recipient@example.com']), row(3, 'account', '7', [])];

beforeEach(() => {
  h.userId = 5; h.role = 'member'; h.tokenRole = 'admin'; h.allowed = ['11', '7'];
  h.list.mockReset().mockResolvedValue(rows);
  h.toggle.mockReset().mockImplementation(async (id: number, _org: number, enabled: boolean) => ({ ...rows.find(r => r.id === id), enabled }));
  h.access.mockReset().mockImplementation(async (_org: number, _actor: unknown, scope: { scopeId: string }) => h.allowed.includes(scope.scopeId));
});

describe('subscription management follows the current caller project access', () => {
  it('omits private scope and recipient details from the organization register', async () => {
    const result = await request(app).get('/api/insights/subscriptions?organizationId=8').set('x-user-id', '99').set('x-roles', 'ADMIN');
    expect(result.status).toBe(200);
    expect(result.body.data.map((r: { id: number }) => r.id)).toEqual([1, 3]);
    expect(JSON.stringify(result.body)).not.toContain('private-recipient@example.com');
    expect(h.list).toHaveBeenCalledWith(7);
    expect(h.access).toHaveBeenCalledWith(7, { userId: 5, role: 'member' }, expect.objectContaining({ scopeType: 'project', scopeId: '12' }));
  });

  it('retains an authorized viewer read without trusting a stale token admin role', async () => {
    h.role = 'viewer';
    const result = await request(app).get('/api/insights/subscriptions');
    expect(result.status).toBe(200);
    expect(result.body.data.map((r: { id: number }) => r.id)).toEqual([1, 3]);
    expect(h.access).toHaveBeenCalledWith(7, { userId: 5, role: 'viewer' }, expect.objectContaining({ scopeId: '11' }));
  });

  it.each([true, false])('refuses an inaccessible schedule before enablement=%s or audit effects', async enabled => {
    const result = await request(app).patch('/api/insights/subscriptions/2').send({ enabled });
    expect(result.status).toBe(404);
    expect(result.body).toEqual({ error: 'Subscription not found' });
    expect(h.toggle).not.toHaveBeenCalled();
    expect(h.access).toHaveBeenCalledWith(7, { userId: 5, role: 'member' }, expect.objectContaining({ scopeId: '12', createdBy: 99 }));
  });

  it.each([true, false])('retains authorized schedule enablement=%s with the current actor id', async enabled => {
    const result = await request(app).patch('/api/insights/subscriptions/1').send({ enabled });
    expect(result.status).toBe(200);
    expect(result.body.data.enabled).toBe(enabled);
    expect(h.toggle).toHaveBeenCalledWith(1, 7, enabled, 5);
  });

  it('honors a project-access revocation on the next management request', async () => {
    expect((await request(app).get('/api/insights/subscriptions')).body.data.map((r: { id: number }) => r.id)).toContain(1);
    h.allowed = ['7'];
    const result = await request(app).patch('/api/insights/subscriptions/1').send({ enabled: false });
    expect(result.status).toBe(404);
    expect(h.toggle).not.toHaveBeenCalled();
  });

  it('does not turn a failed sharing read into a successful empty register', async () => {
    h.access.mockRejectedValue(new Error('sharing read unavailable'));
    const result = await request(app).get('/api/insights/subscriptions');
    expect(result.status).toBe(500);
    expect(result.body.data).toBeUndefined();
  });

  it('refuses a missing numeric principal before reading or toggling schedules', async () => {
    h.userId = null;
    const result = await request(app).get('/api/insights/subscriptions');
    expect(result.status).toBe(403);
    expect(h.list).not.toHaveBeenCalled();
    expect(h.toggle).not.toHaveBeenCalled();
  });

  it('does not call the enablement service for an unknown subscription', async () => {
    const result = await request(app).patch('/api/insights/subscriptions/999').send({ enabled: false });
    expect(result.status).toBe(404);
    expect(h.toggle).not.toHaveBeenCalled();
  });
});
