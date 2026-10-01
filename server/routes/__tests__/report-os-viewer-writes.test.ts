/**
 * A read-only 'viewer' can read reporting, and can change none of it.
 *
 * Reporting review 2026-10-01 (Part 11 lens): only POST /runs/:id/finalize
 * asked for a role, so a viewer could create report runs, program groups,
 * snapshots, bundles and deliveries under /api/report-os, and run live
 * predictions and create or toggle the org's report subscriptions under
 * /api/insights. Both routers now mount requireEditorAccessForWrites.
 *
 * Each write route is listed by method and path. A viewer must be refused with
 * the gate's 403 before any handler runs; a member must get past the gate
 * (whatever the handler then answers over the mocked database); and the
 * viewer's reads must still answer.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import express from 'express';
import request from 'supertest';

vi.mock('../../db', () => ({ db: {}, pool: {}, getPool: () => ({}), getDb: () => ({}), query: vi.fn(), transaction: vi.fn() }));
const session = vi.hoisted(() => ({ role: 'viewer' }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: unknown, next: () => void) => {
    req.user = { id: 1, role: session.role, organizationId: 7 };
    next();
  },
}));
vi.mock('../../utils/authedOrgId', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../utils/authedOrgId')>()),
  authedOrgId: () => 7,
}));
vi.mock('../../services/report-os/entitlement-map', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/entitlement-map')>()),
  requireReportEntitlement: vi.fn().mockResolvedValue({ entitled: true }),
}));
vi.mock('../../services/report-os/portfolio/fetch', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/report-os/portfolio/fetch')>()),
  fetchOrgPortfolioSummary: vi.fn().mockResolvedValue(null),
}));
const subs = vi.hoisted(() => ({ list: vi.fn(), create: vi.fn(), setEnabled: vi.fn() }));
vi.mock('../../services/report-os/scheduling/subscription-service', () => ({
  listSubscriptions: subs.list,
  createSubscription: subs.create,
  setEnabled: subs.setEnabled,
}));

import reportOsRouter from '../report-os';
import insightsRouter from '../report-os-insights';

const app = express();
app.use(express.json());
app.use('/api/report-os', reportOsRouter);
app.use('/api/insights', insightsRouter);

const WRITES: Array<['post' | 'patch', string]> = [
  ['post', '/api/report-os/program-groups'],
  ['patch', '/api/report-os/program-groups/1'],
  ['post', '/api/report-os/program-groups/1/snapshots'],
  ['post', '/api/report-os/runs'],
  ['post', '/api/report-os/runs/1/finalize'],
  ['post', '/api/report-os/bundles'],
  ['post', '/api/report-os/deliveries'],
  ['post', '/api/insights/predictions'],
  ['post', '/api/insights/predictions/run'],
  ['post', '/api/insights/subscriptions'],
  ['patch', '/api/insights/subscriptions/1'],
];

const GATE_REFUSAL = { error: 'Insufficient permissions' };

beforeEach(() => {
  session.role = 'viewer';
  subs.list.mockReset().mockResolvedValue([]);
  subs.create.mockReset().mockResolvedValue({ id: 1 });
  subs.setEnabled.mockReset().mockResolvedValue({ id: 1, enabled: false });
});

describe('a viewer cannot write to reporting', () => {
  it.each(WRITES)('%s %s is refused by the write gate', async (method, path) => {
    const res = await request(app)[method](path).send({});
    expect(res.status).toBe(403);
    expect(res.body).toEqual(GATE_REFUSAL);
  });

  it('never reaches the subscription service', async () => {
    await request(app).post('/api/insights/subscriptions').send({ reportTypeId: 'x', cadence: 'weekly' });
    await request(app).patch('/api/insights/subscriptions/1').send({ enabled: false });
    expect(subs.create).not.toHaveBeenCalled();
    expect(subs.setEnabled).not.toHaveBeenCalled();
  });
});

describe('a member gets past the write gate', () => {
  it.each(WRITES.filter(([, p]) => !p.endsWith('/finalize')))('%s %s', async (method, path) => {
    session.role = 'member';
    const res = await request(app)[method](path).send({});
    expect(res.body).not.toEqual(GATE_REFUSAL);
  });
});

describe('a viewer can still read reporting', () => {
  it('GET /api/report-os/portfolio/org answers', async () => {
    const res = await request(app).get('/api/report-os/portfolio/org');
    expect(res.status).toBe(200);
  });

  it('GET /api/insights/subscriptions answers', async () => {
    const res = await request(app).get('/api/insights/subscriptions');
    expect(res.status).toBe(200);
    expect(subs.list).toHaveBeenCalled();
  });
});
