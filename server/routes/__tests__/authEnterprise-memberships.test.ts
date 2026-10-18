import { beforeEach, describe, expect, it, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
const state = vi.hoisted(() => ({ actorId: 41 as number | null, where: vi.fn(), select: vi.fn() }));
vi.mock('../../db', () => {
  const chain = { from: () => chain, innerJoin: () => chain, where: state.where };
  state.select.mockImplementation(() => chain);
  const pool = { query: vi.fn().mockResolvedValue({ rows: [] }) };
  return { db: { select: state.select }, pool, getPool: () => pool, getDb: () => ({}) };
});
vi.mock('../../auth', () => ({ authMiddleware: (req: { userId?: number }, _res: unknown, next: () => void) => { req.userId = state.actorId ?? undefined; next(); } }));
vi.mock('../../services/auth-security-service', () => ({ validatePasswordPolicy: vi.fn(), isAccountLocked: vi.fn(), recordFailedLogin: vi.fn(), resetFailedLogins: vi.fn(), isPasswordExpired: vi.fn(), verifySignatureIntegrity: vi.fn() }));
import enterpriseRoutes from '../authEnterprise';
const app = express(); app.use(express.json()); app.use('/api/auth/enterprise', enterpriseRoutes);
beforeEach(() => { state.actorId = 41; state.select.mockClear(); state.where.mockReset(); state.where.mockResolvedValue([{ id: 7, name: 'Member workspace', role: 'viewer', status: 'active' }]); });
describe('organization selection is the authenticated account\'s memberships', () => {
  it('reads memberships for the authenticated actor, ignoring a requested user', async () => {
    const response = await request(app).get('/api/auth/enterprise/organizations?userId=999');
    expect(response.status).toBe(200);
    expect(response.body).toEqual([{ id: 7, name: 'Member workspace', role: 'viewer', status: 'active' }]);
    const predicate = state.where.mock.calls[0][0];
    const values = predicate.queryChunks.filter((chunk: { constructor?: { name?: string } }) => chunk.constructor?.name === 'Param').map((chunk: { value: unknown }) => chunk.value);
    expect(values).toEqual([41]);
  });
  it('does not query the directory without an authenticated account ID', async () => {
    state.actorId = null;
    expect((await request(app).get('/api/auth/enterprise/organizations')).status).toBe(401);
    expect(state.select).not.toHaveBeenCalled();
  });
});
