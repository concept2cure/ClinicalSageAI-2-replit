/**
 * GET /api/lifecycle/renewals — read-side projection of the governed recurring
 * obligation store into the Lifecycle surface "Renewal cycles" shape.
 *
 * Locks: 401 without org; the { data: RenewalView[] } contract (region→authority,
 * recurrence→interval, urgency, recurring types only, soonest-due first); and
 * fail-closed to an empty list (never 500) with pendingStore on a missing store.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const listObligations = vi.fn();
vi.mock('../../services/lifecycle-obligations/lifecycle-service', () => ({
  listObligations: (...a: unknown[]) => listObligations(...a),
  listCalendar: vi.fn(),
  listEvents: vi.fn(),
  createObligationTx: vi.fn(),
  setObligationStatusTx: vi.fn(),
  setEventStatusTx: vi.fn(),
}));
// Keep the route's DB / governance imports inert — GET /renewals never touches them.
vi.mock('../../db', () => ({ pool: { connect: vi.fn(), query: vi.fn() } }));
vi.mock('../c2c/actions', () => ({ recordGovernedAction: vi.fn() }));
vi.mock('../../services/tenant/governed-tenant-context', () => ({ setTenantContextTx: vi.fn() }));
vi.mock('../../services/lifecycle-metrics', () => ({ recordLifecycleObligation: vi.fn(), recordLifecycleSubmission: vi.fn() }));

import lifecycleRouter from '../lifecycle';

function appWith(org: number | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (org !== null) (req as unknown as { user: unknown }).user = { organizationId: org };
    next();
  });
  app.use('/api/lifecycle', lifecycleRouter);
  return app;
}

function row(over: Record<string, unknown> = {}) {
  return {
    obligation_type: 'annual_report',
    region: 'fda',
    title: 'BX-099',
    classification: 'PADER',
    status: 'planned',
    due_date: '2026-09-30',
    recurrence_months: 12,
    ...over,
  };
}

beforeEach(() => listObligations.mockReset());

describe('GET /api/lifecycle/renewals', () => {
  it('401 without org context', async () => {
    const res = await request(appWith(null)).get('/api/lifecycle/renewals');
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('AUTH_REQUIRED');
  });

  it('projects recurring obligations into the renewal-cycle shape', async () => {
    listObligations.mockResolvedValueOnce([
      row({ region: 'eu', obligation_type: 'renewal', classification: 'Renewal', due_date: '2030-02-14', recurrence_months: 60 }),
      row(), // FDA PADER, soonest due
      row({ obligation_type: 'variation', classification: 'II', due_date: '2026-07-01', recurrence_months: null }), // excluded
    ]);
    const res = await request(appWith(7)).get('/api/lifecycle/renewals');
    expect(res.status).toBe(200);
    expect(listObligations.mock.calls[0][0]).toBe(7);
    expect(res.body.data).toHaveLength(2); // one-off variation excluded
    expect(res.body.data[0]).toMatchObject({ authority: 'FDA', next: 'PADER', interval: 'Annual', due: '2026-09-30' });
    expect(res.body.data[1]).toMatchObject({ authority: 'EMA', interval: '5-year' });
    expect(res.body.meta.count).toBe(2);
  });

  it('fails closed to an empty list when the store is missing (42P01)', async () => {
    listObligations.mockRejectedValueOnce(Object.assign(new Error('relation missing'), { code: '42P01' }));
    const res = await request(appWith(7)).get('/api/lifecycle/renewals');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(true);
  });

  it('fails closed to an empty list on any store error (never 500)', async () => {
    listObligations.mockRejectedValueOnce(new Error('connection reset'));
    const res = await request(appWith(7)).get('/api/lifecycle/renewals');
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.meta.pendingStore).toBe(false);
  });
});
