import express from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Pool } from 'pg';
import { LazyRequestDbClient } from '../../middleware/lazyRequestDbClient';

const h = vi.hoisted(() => ({ generate: vi.fn(), revoke: vi.fn(), audit: vi.fn(), chain: vi.fn(), sharedTransaction: vi.fn(), admin: true, auditFails: false, hasRequestContext: true, requestClient: null as unknown, transactionOpen: false, log: [] as string[], client: { query: vi.fn(), release: vi.fn() } }));
vi.mock('../../auth.js', () => ({
  authMiddleware: (req: any, _res: any, next: () => void) => { req.tenantId = 7; req.userId = 42; if (h.hasRequestContext) req.dbClient = h.requestClient ?? h.client; next(); },
  requireAdminRole: (_req: any, res: any, next: () => void) => h.admin ? next() : res.status(403).json({ error: 'Admin role required' }),
}));
vi.mock('../../services/api-key-service.js', async original => ({
  ...await original<typeof import('../../services/api-key-service.js')>(),
  generateApiKey: h.generate,
  validateApiKey: vi.fn(), revokeApiKey: h.revoke, listApiKeys: vi.fn(), getApiKeyUsage: vi.fn(),
}));
vi.mock('../../services/auditService', () => ({ default: { logAction: h.audit }, writeChainedAuditRow: h.chain }));
vi.mock('../../db/runtime', () => ({
  transaction: h.sharedTransaction,
}));
import router from '../api-keys';

const app = express(); app.use(express.json()); app.use('/api/api-keys', router);
beforeEach(() => {
  h.admin = true; h.auditFails = false; h.hasRequestContext = true; h.log = [];
  h.requestClient = null; h.transactionOpen = false;
  h.sharedTransaction.mockReset().mockImplementation(() => { throw new Error('A pooled transaction must never replace request context'); });
  h.client.query.mockReset().mockImplementation(async (sql: string) => {
    h.log.push(sql);
    if (sql === 'BEGIN') {
      if (h.transactionOpen) throw new Error('Nested BEGIN is unsafe');
      h.transactionOpen = true;
    }
    if (sql === 'COMMIT' || sql === 'ROLLBACK') h.transactionOpen = false;
    return { rows: [] };
  });
  h.generate.mockReset().mockImplementation(async (input, client) => { h.log.push('CREATE KEY'); await h.chain(client,{tenantId:input.organizationId,userId:input.createdBy,reason:input.auditContext?.reason,details:{reason:input.auditContext?.reason,scopes:input.scopes}}); return { rawKey: 'c2c_unit_secret', keyId: 9, keyPrefix: 'c2c_unit' }; });
  h.revoke.mockReset().mockImplementation(async (_keyId, organizationId, client, actor) => { h.log.push('REVOKE KEY'); await h.chain(client,{tenantId:organizationId,userId:actor.userId}); return true; });
  h.audit.mockReset().mockResolvedValue({ persisted: true });
  h.chain.mockReset().mockImplementation(async () => { h.log.push('AUDIT KEY'); if (h.auditFails) throw new Error('audit unavailable'); });
});

describe('API-key create contract used by the admin drawer', () => {
  it('uses the authenticated tenant and actor, and records reason and scopes without the secret', async () => {
    const reason = 'Read-only reporting service';
    const res = await request(app).post('/api/api-keys').send({
      organizationId: 999, userId: 999, name: ' Reporting ', scopes: ['documents:read'],
      expiresAt: '2099-01-01T00:00:00.000Z', rateLimit: 120, reason,
    });
    expect(res.status).toBe(201);
    expect(h.generate).toHaveBeenCalledWith({ organizationId: 7, name: 'Reporting', scopes: ['documents:read'], createdBy: 42, expiresAt: new Date('2099-01-01T00:00:00.000Z'), rateLimit: 120, metadata: undefined, auditContext: expect.objectContaining({reason}) }, h.client);
    expect(h.chain).toHaveBeenCalledWith(h.client, expect.objectContaining({ tenantId: 7, userId: 42, reason, details: expect.objectContaining({ reason, scopes: ['documents:read'] }) }));
    expect(JSON.stringify(h.chain.mock.calls)).not.toContain('c2c_unit_secret');
    expect(h.log).toEqual(['BEGIN', 'CREATE KEY', 'AUDIT KEY', 'COMMIT']);
    expect(h.sharedTransaction).not.toHaveBeenCalled();
    expect(res.body.apiKey).toBe('c2c_unit_secret');
  });

  it.each([
    { scopes: [] }, { scopes: ['documents:write'] }, { rateLimit: 0 },
    { expiresAt: '2020-01-01' }, { reason: '   ' },
  ])('refuses invalid create fields before minting: %j', async patch => {
    const res = await request(app).post('/api/api-keys').send({ name: 'Reporting', scopes: ['documents:read'], ...patch });
    expect(res.status).toBe(400);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('keeps existing API callers compatible when no reason is supplied', async () => {
    expect((await request(app).post('/api/api-keys').send({ name: 'Existing caller', scopes: ['documents:read'] })).status).toBe(201);
  });

  it('requires admin access before minting', async () => {
    h.admin = false;
    expect((await request(app).post('/api/api-keys').send({ name: 'Reporting', scopes: ['documents:read'] })).status).toBe(403);
    expect(h.generate).not.toHaveBeenCalled();
  });

  it('fails closed and returns no credential when the chained audit write fails', async () => {
    h.auditFails = true;
    const res = await request(app).post('/api/api-keys').send({ name: 'Reporting', scopes: ['documents:read'], reason: 'Connect reporting' });
    expect(res.status).toBe(503);
    expect(res.body.apiKey).toBeUndefined();
    expect(h.log).toEqual(['BEGIN', 'CREATE KEY', 'AUDIT KEY', 'ROLLBACK']);
  });

  it('rolls revocation back when its chained audit cannot be written', async () => {
    h.auditFails = true;
    const res = await request(app).delete('/api/api-keys/9');
    expect(res.status).toBe(503);
    expect(h.revoke).toHaveBeenCalledWith(9, 7, h.client, expect.objectContaining({userId:42}));
    expect(h.log).toEqual(['BEGIN', 'REVOKE KEY', 'AUDIT KEY', 'ROLLBACK']);
  });

  it('refuses creation and revocation without a tenant-pinned request client, with no pooled fallback', async () => {
    h.hasRequestContext = false;
    const created = await request(app).post('/api/api-keys').send({ name: 'Reporting', scopes: ['documents:read'] });
    expect(created.status).toBe(500);
    expect(created.body.apiKey).toBeUndefined();
    const revoked = await request(app).delete('/api/api-keys/9');
    expect(revoked.status).toBe(500);
    expect(h.generate).not.toHaveBeenCalled();
    expect(h.revoke).not.toHaveBeenCalled();
    expect(h.chain).not.toHaveBeenCalled();
    expect(h.sharedTransaction).not.toHaveBeenCalled();
    expect(h.log).toEqual([]);
  });

  it('opens exactly one transaction after the real lazy wrapper establishes tenant session scope', async () => {
    const connect = vi.fn(async () => h.client);
    const lazy = new LazyRequestDbClient({ connect } as unknown as Pool, async client => {
      expect(h.transactionOpen).toBe(false);
      await client.query("SELECT set_config('app.current_tenant_id', $1, false)", ['7']);
    });
    h.requestClient = lazy;
    try {
      const res = await request(app).post('/api/api-keys').send({ name: 'Reporting', scopes: ['documents:read'] });
      expect(res.status).toBe(201);
      expect(connect).toHaveBeenCalledTimes(1);
      expect(h.log).toEqual(["SELECT set_config('app.current_tenant_id', $1, false)", 'BEGIN', 'CREATE KEY', 'AUDIT KEY', 'COMMIT']);
      expect(h.transactionOpen).toBe(false);
      expect(h.sharedTransaction).not.toHaveBeenCalled();
    } finally { await lazy.release(); }
  });
});
