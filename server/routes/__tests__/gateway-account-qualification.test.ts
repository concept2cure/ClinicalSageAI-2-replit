import { beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const h = vi.hoisted(() => ({
  list: vi.fn(), readiness: vi.fn(), client: { query: vi.fn(), release: vi.fn() },
  write: vi.fn(), audit: vi.fn(), reauth: vi.fn(),
  user: { id: 3, organizationId: 7, role: 'admin' },
}));
vi.mock('../../middleware/auth', () => ({
  authenticateToken: (req: Request, _res: Response, next: NextFunction) => { (req as any).user = h.user; next(); },
  requireRole: () => (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/rateLimiter', () => ({ createRateLimiter: () => (_req: Request, _res: Response, next: NextFunction) => next() }));
vi.mock('../../db/requestDb', () => ({ requestPgClient: () => h.client, requestConnectable: () => ({ connect: async () => h.client }) }));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: h.audit }));
vi.mock('../c2c/actions', () => ({ verifyReauth: h.reauth }));
vi.mock('../../services/submission-gateways', () => ({
  getGatewayUnguarded: () => ({ isConfigured: async () => true }), gatewayTransportReadiness: h.readiness,
}));
vi.mock('../../services/submission-gateways/gateway-accounts', () => ({
  GatewayAccountInputError: class extends Error {}, listGatewayAccounts: h.list, writeGatewayAccount: h.write,
}));

import accounts from '../gateway-accounts';
const app = express(); app.use(express.json()); app.use('/api/gateway-accounts', accounts);

beforeEach(() => {
  vi.clearAllMocks();
  h.user = { id: 3, organizationId: 7, role: 'admin' };
  h.client.query.mockResolvedValue({ rows: [{ role: 'member' }] });
  h.list.mockResolvedValue([]);
  h.audit.mockReset().mockResolvedValue(undefined);
  h.reauth.mockReset().mockResolvedValue({ ok: true });
  h.write.mockReset();
});

describe('gateway credential change audit handoff', () => {
  it('records only the writer-sanitized reason when the submitted reason contains credential material', async () => {
    const secret = 'CANARY-PRIVATE-GATEWAY-KEY';
    const rawReason = `Approved ESG rotation: ${secret}`;
    const safeReason = 'Approved ESG rotation: [redacted]';
    h.write.mockResolvedValue({
      spec: { region: 'fda', gateway: 'esg' }, environment: 'production', previousMode: 'platform', mode: 'client',
      senderIdentifier: 'sponsor-account', credentialFieldsHeld: ['clientKeyPem'], credentialsChanged: true, reason: safeReason,
    });
    const response = await request(app).put('/api/gateway-accounts/fda/esg/production').send({
      mode: 'client', senderIdentifier: 'sponsor-account', credentials: { clientKeyPem: secret },
      reason: rawReason, reauth: { password: 'fixture-password' },
    });
    expect(response.status, JSON.stringify(response.body)).toBe(200);
    expect(h.reauth).toHaveBeenCalledWith(3, { password: 'fixture-password' });
    expect(h.write).toHaveBeenCalledWith(h.client, expect.objectContaining({ organizationId: 7, userId: 3, reason: rawReason }));
    expect(h.audit).toHaveBeenCalledWith(h.client, expect.objectContaining({
      tenantId: 7, userId: 3, details: expect.objectContaining({ reason: safeReason, credentialFieldsChanged: ['clientKeyPem'] }),
    }));
    expect(JSON.stringify(h.audit.mock.calls)).not.toContain(secret);
    expect(JSON.stringify(response.body)).not.toContain(secret);
    expect(response.body).not.toHaveProperty('credentials');
    expect(response.body).not.toHaveProperty('reason');
    expect(h.client.query.mock.calls.map(([sql]) => sql)).toEqual(['BEGIN', 'COMMIT']);
    expect(h.client.release).toHaveBeenCalledTimes(1);
  });
});

describe('account settings disclose credential state and agency qualification separately', () => {
  it('serializes readiness for each environment without promoting configured accounts to qualified', async () => {
    h.list.mockResolvedValue([
      { region: 'fda', gateway: 'esg', environment: 'production', status: 'ready' },
      { region: 'fda', gateway: 'esg', environment: 'staging', status: 'platform_not_configured' },
    ]);
    h.readiness.mockResolvedValue({ transport: 'as2', implementation: 'implemented', qualification: 'not_verified', qualified: false, reason: 'UAT not verified', missingDependencies: ['agency UAT'] });
    const response = await request(app).get('/api/gateway-accounts');
    expect(response.status).toBe(200);
    expect(response.body.organizationId).toBe(7);
    expect(response.body.canManage).toBe(false);
    expect(response.body.accounts[0]).toMatchObject({ credentialsConfigured: true, transportReadiness: { qualified: false, qualification: 'not_verified' } });
    expect(response.body.accounts[1]).toMatchObject({ credentialsConfigured: false, transportReadiness: { qualified: false } });
    expect(h.list.mock.calls[0].slice(0, 2)).toEqual([h.client, 7]);
    expect(h.readiness.mock.calls).toEqual([['fda', 'esg', 'production'], ['fda', 'esg', 'staging']]);
  });

  it.each(['admin', 'owner'])('allows management display only for a current persisted %s membership', async role => {
    h.user.role = 'viewer'; // an old token cannot suppress current authority either
    h.client.query.mockResolvedValue({ rows: [{ role }] });
    const response = await request(app).get('/api/gateway-accounts');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ organizationId: 7, accounts: [], canManage: true });
    expect(h.client.query).toHaveBeenCalledWith(expect.stringContaining('FROM organization_users ou'), [3, 7, 'active', ['active']]);
  });

  it('refreshes a revoked admin role on each read and ignores spoofed tenant and token role claims', async () => {
    h.client.query.mockResolvedValueOnce({ rows: [{ role: 'admin' }] }).mockResolvedValueOnce({ rows: [{ role: 'viewer' }] });
    expect((await request(app).get('/api/gateway-accounts')).body.canManage).toBe(true);
    const response = await request(app).get('/api/gateway-accounts?organizationId=99&role=owner')
      .set('X-Organization-Id', '99');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ organizationId: 7, canManage: false });
    expect(h.client.query.mock.calls.map(([, params]) => params)).toEqual([
      [3, 7, 'active', ['active']], [3, 7, 'active', ['active']],
    ]);
    expect(h.list.mock.calls.every(([, orgId]) => orgId === 7)).toBe(true);
  });

  it('returns no management flag or metadata after membership is revoked', async () => {
    h.client.query.mockResolvedValue({ rows: [] });
    const response = await request(app).get('/api/gateway-accounts');
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('MEMBERSHIP_REQUIRED');
    expect(response.body.canManage).toBeUndefined();
    expect(response.body.accounts).toBeUndefined();
    expect(h.list).not.toHaveBeenCalled();
  });

  it('does not expose management authority or database details when the current membership cannot be read', async () => {
    h.client.query.mockRejectedValue(new Error('private connection details'));
    const response = await request(app).get('/api/gateway-accounts');
    expect(response.status).toBe(500);
    expect(response.body.canManage).toBeUndefined();
    expect(JSON.stringify(response.body)).not.toContain('private connection details');
    expect(h.list).not.toHaveBeenCalled();
  });

  it('uses live membership and active user/organization rows under PostgreSQL semantics', async () => {
    const { PGlite } = await import('@electric-sql/pglite');
    const database = new PGlite();
    try {
      await database.exec(`
        CREATE TABLE users (id integer PRIMARY KEY, status text);
        CREATE TABLE organizations (id integer PRIMARY KEY, status text);
        CREATE TABLE organization_users (user_id integer, organization_id integer, role text);
        INSERT INTO users VALUES (3,'active');
        INSERT INTO organizations VALUES (7,'active'),(99,'active');
        INSERT INTO organization_users VALUES (3,7,'admin'),(3,99,'owner');
      `);
      h.client.query.mockImplementation((sql, params) => database.query(sql, params));
      expect((await request(app).get('/api/gateway-accounts')).body.canManage).toBe(true);
      await database.exec("UPDATE organization_users SET role='viewer' WHERE organization_id=7");
      expect((await request(app).get('/api/gateway-accounts?organizationId=99')).body.canManage).toBe(false);
      await database.exec('DELETE FROM organization_users WHERE organization_id=7');
      expect((await request(app).get('/api/gateway-accounts')).status).toBe(403);
      await database.exec("INSERT INTO organization_users VALUES (3,7,'admin'); UPDATE users SET status='inactive'");
      expect((await request(app).get('/api/gateway-accounts')).status).toBe(403);
      await database.exec("UPDATE users SET status='active'; UPDATE organizations SET status='inactive' WHERE id=7");
      expect((await request(app).get('/api/gateway-accounts')).status).toBe(403);
    } finally {
      await database.close();
    }
  }, 60_000);
});
