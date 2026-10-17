/** Real billing handlers carry service outcomes and retain their existing role/tenant boundary. */
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ query: vi.fn(), audit: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: h.query }, db: {} }));
vi.mock('../../services/audit/auditLogger.js', () => ({ logAuditEvent: h.audit }));
vi.mock('../../middleware/auth.js', async original => ({
  ...(await original<typeof import('../../middleware/auth')>()),
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => {
    if (req.get('x-test-user') !== 'none') (req as Request & { user: unknown }).user = { id: 3, organizationId: 7, role: req.get('x-test-role') ?? 'admin' };
    next();
  },
}));
import billing from '../billing-dashboard';
const app = express(); app.use(express.json()); app.use('/api/billing', billing);
const paths = ['/seats', '/weekly-limits/requests'];
beforeEach(() => {
  h.query.mockReset(); h.audit.mockReset();
  h.query.mockImplementation(async (sql: string, args?: unknown[]) => {
    if (/SELECT seats_purchased/.test(sql)) return { rows: [{ seats_purchased: 5 }] };
    if (/FROM organization_users|FROM organization_invitations/.test(sql)) return { rows: [{ cnt: '1' }] };
    if (/UPDATE organizations SET seats_purchased/.test(sql)) return { rows: [{ seats_purchased: args?.[0] }] };
    if (/FROM weekly_usage_limits/.test(sql)) return { rows: [] };
    if (/INSERT INTO weekly_usage_limits/.test(sql)) return { rows: [{ organization_id: 7, metric: 'requests', weekly_limit: 20, enabled: true }] };
    return { rows: [] };
  });
  h.audit.mockResolvedValue({ persisted: false, chained: false, tamperProof: false, error: 'private database detail' });
});
describe('billing configuration save outcomes', () => {
  it.each(paths)('%s returns actual saved configuration and warns about the failed audit', async path => {
    const res = await request(app).put(`/api/billing${path}`).send({ seats: 8, weeklyLimit: 20, reason: 'Approved change', organizationId: 999, userId: 888 });
    expect(res.status).toBe(200); expect(res.body.meta.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
    expect(res.body.seats?.seatsPurchased ?? res.body.limit?.weeklyLimit).toBe(path === '/seats' ? 8 : 20);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ userId: '3', organizationId: '7' }));
    expect(JSON.stringify(res.body)).not.toContain('private database detail');
    const writes = h.query.mock.calls.filter(([sql]) => /UPDATE organizations|INSERT INTO weekly_usage_limits/.test(sql));
    expect(writes).toHaveLength(1); expect(writes[0][1]).toContain(7); expect(writes[0][1]).not.toContain(999);
  });
  it.each(paths)('%s preserves the existing organization role refusal', async path => {
    const res = await request(app).put(`/api/billing${path}`).set('x-test-role', 'member').send({ seats: 8, weeklyLimit: 20, reason: 'Unauthorized change' });
    expect(res.status).toBe(403); expect(h.query).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
  it.each(paths)('%s requires the authenticated principal', async path => {
    const res = await request(app).put(`/api/billing${path}`).set('x-test-user', 'none').send({ seats: 8, weeklyLimit: 20, reason: 'Unsigned change' });
    expect(res.status).toBe(401); expect(h.query).not.toHaveBeenCalled();
  });
  it.each(paths)('%s refuses missing reason before writing', async path => {
    const res = await request(app).put(`/api/billing${path}`).send({ seats: 8, weeklyLimit: 20 });
    expect(res.status).toBe(400); expect(h.query).not.toHaveBeenCalled(); expect(h.audit).not.toHaveBeenCalled();
  });
});
