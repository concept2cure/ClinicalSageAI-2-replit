/** The billing API reports administrative allocations and refuses unsupported charging. */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
const h = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../middleware/auth.js', async (original) => ({
  ...(await original<typeof import('../../middleware/auth')>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).user = { id: 3, organizationId: 7, role: req.get('x-test-role') ?? 'admin' };
    next();
  },
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn() }));
vi.mock('../../services/audit/auditLogger.js', () => ({ logAuditEvent: vi.fn().mockResolvedValue({ persisted: true, chained: true }) }));
import billing from '../billing-dashboard';
const app = express();
app.use(express.json());
app.use('/api/billing', billing);
beforeEach(() => {
  h.query.mockReset();
  let saved = false;
  h.query.mockImplementation(async (sql: string) => {
    if (/INSERT INTO credit_autoreload_settings/.test(sql)) { saved = true; return { rows: [] }; }
    if (/SUM\(amount_cents\)/.test(sql)) return { rows: [{ balance: '2500' }] };
    if (/FROM credit_autoreload_settings/.test(sql)) return { rows: [{ organization_id: 7, enabled: !saved, threshold_cents: 1000, topup_cents: 2500 }] };
    return { rows: [] };
  });
});

describe('credit capabilities on the API', () => {
  it('reports the legacy request separately from unavailable payment and usage capabilities', async () => {
    const res = await request(app).get('/api/billing/credits');
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ balanceCents: 2500, autoReload: { enabled: false, requestedEnabled: true, available: false }, capabilities: { balanceMode: 'administrative_allocation', purchase: { available: false }, autoReload: { available: false }, usageDebit: { available: false } } });
    expect(h.query.mock.calls.filter(([sql]) => /FROM credit_ledger/.test(sql)).every(([, params]) => params[0] === 7)).toBe(true);
  });
  it('returns an explicit 409 and saves no request when an admin asks to enable reload', async () => {
    const res = await request(app).put('/api/billing/credits/auto-reload').send({ enabled: true, reason: 'Recharge the balance' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'CREDIT_CAPABILITY_UNAVAILABLE', capability: 'autoReload' });
    expect(h.query.mock.calls.some(([sql]) => /INSERT|UPDATE/.test(sql))).toBe(false);
  });
  it('rejects an enabled string rather than turning a false string into true', async () => {
    const res = await request(app).put('/api/billing/credits/auto-reload').send({ enabled: 'false', reason: 'Disable the saved request' });
    expect(res.status).toBe(400);
    expect(h.query).not.toHaveBeenCalled();
  });
  it('retains the real organization role guard when clearing a saved request', async () => {
    const res = await request(app).put('/api/billing/credits/auto-reload').set('x-test-role', 'member').send({ enabled: false, reason: 'Clear the saved request' });
    expect(res.status).toBe(403);
    expect(h.query).not.toHaveBeenCalled();
  });
  it('clears an old request with the supplied reason without moving money', async () => {
    const res = await request(app).put('/api/billing/credits/auto-reload').send({ enabled: false, reason: 'Clear the saved request' });
    expect(res.status).toBe(200);
    expect(res.body.autoReload).toMatchObject({ enabled: false, requestedEnabled: false, available: false });
    const write = h.query.mock.calls.find(([sql]) => /INSERT INTO credit_autoreload_settings/.test(sql));
    expect(write?.[1]).toEqual([7, false, 1000, 2500, 3, 'Clear the saved request']);
    expect(h.query.mock.calls.some(([sql]) => /INSERT INTO credit_ledger/.test(sql))).toBe(false);
  });
});
