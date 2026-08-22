/**
 * Route-level tests for the Master Administration API.
 *
 * The DB layer, audit service, and auth middleware are mocked so these tests
 * exercise the REAL router + the REAL requirePlatformAdmin guard: access
 * gating, request validation, status codes, and that governed mutations call
 * the audit service. (DB query results are stubbed — correctness of the SQL
 * itself is out of scope here.)
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const logActionMock = vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true }));

// db: query() + getPool() used by the router.
vi.mock('../../../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  getPool: () => ({ totalCount: 5, idleCount: 4, waitingCount: 0 }),
}));

// audit service default export.
vi.mock('../../../services/auditService', () => ({
  default: { logAction: (...args: unknown[]) => logActionMock(...args) },
}));

// authMiddleware stub — reads a JSON user from the x-test-user header so each
// test can pick the caller's identity. requirePlatformAdmin (real) runs after.
vi.mock('../../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const hdr = req.headers['x-test-user'];
    if (hdr) {
      const u = JSON.parse(hdr);
      req.user = u;
      req.userRole = u.role;
      req.userEmail = u.email;
      req.userId = u.id;
    }
    next();
  },
}));

// Imported after mocks (vi.mock is hoisted).
import router from '../master-admin';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/master', router);
  return app;
}

const ADMIN = JSON.stringify({ id: 1, role: 'super_admin', email: 'owner@x.io' });
const MEMBER = JSON.stringify({ id: 2, role: 'member', email: 'user@x.io' });

beforeEach(() => {
  queryMock.mockReset();
  logActionMock.mockReset();
  // The guard's async grant fallback queries platform_role_grants when the sync
  // role/email checks fail; return no grant so the 403 cases stay 403. Every
  // other query gets the generic single-row stub.
  queryMock.mockImplementation((sql: string) => {
    if (/platform_role_grants/.test(sql)) return Promise.resolve({ rows: [] });
    return Promise.resolve({ rows: [{}] });
  });
});

describe('access gating', () => {
  it('401s an unauthenticated request', async () => {
    const res = await request(makeApp()).get('/api/admin/master/overview');
    expect(res.status).toBe(401);
  });

  it('403s an org member', async () => {
    const res = await request(makeApp())
      .get('/api/admin/master/overview')
      .set('x-test-user', MEMBER);
    expect(res.status).toBe(403);
  });

  it('200s a platform admin', async () => {
    const res = await request(makeApp())
      .get('/api/admin/master/overview')
      .set('x-test-user', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('tenants');
    expect(res.body).toHaveProperty('users');
  });
});

describe('reads', () => {
  it('lists tenants', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 1, name: 'Acme' }] });
    const res = await request(makeApp())
      .get('/api/admin/master/tenants')
      .set('x-test-user', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.tenants).toEqual([{ id: 1, name: 'Acme' }]);
  });

  it('reports system health from the pool', async () => {
    const res = await request(makeApp())
      .get('/api/admin/master/system-health')
      .set('x-test-user', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body.database.pool.total).toBe(5);
    expect(res.body.process).toHaveProperty('uptimeSeconds');
  });

  it('paginates the audit explorer and accepts the client filter', async () => {
    queryMock.mockResolvedValue({ rows: [{ total: 0 }] });
    const res = await request(makeApp())
      .get('/api/admin/master/audit?client=3&action=data_modify')
      .set('x-test-user', ADMIN);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('events');
    expect(res.body).toHaveProperty('total');
  });
});

describe('governed mutations', () => {
  it('rejects a tenant status change without a reason', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/master/tenants/1/status')
      .set('x-test-user', ADMIN)
      .send({ status: 'suspended' });
    expect(res.status).toBe(400);
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid tenant status value', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/master/tenants/1/status')
      .set('x-test-user', ADMIN)
      .send({ status: 'banished', reason: 'a valid reason' });
    expect(res.status).toBe(400);
  });

  it('applies a tenant suspension and writes an audit entry', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] }) // before
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'Acme', status: 'suspended' }] }); // update
    const res = await request(makeApp())
      .patch('/api/admin/master/tenants/1/status')
      .set('x-test-user', ADMIN)
      .send({ status: 'suspended', reason: 'abuse investigation' });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('suspended');
    expect(logActionMock).toHaveBeenCalledOnce();
    const entry = logActionMock.mock.calls[0][0];
    expect(entry).toMatchObject({ resourceType: 'organization', action: 'data_modify' });
    expect(entry.details.masterAdminAction).toBe('tenant.status_change');
  });

  it('applies a user suspension and writes an audit entry', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ status: 'active' }] })
      .mockResolvedValueOnce({ rows: [{ id: 2, email: 'user@x.io', status: 'suspended' }] });
    const res = await request(makeApp())
      .patch('/api/admin/master/users/2/status')
      .set('x-test-user', ADMIN)
      .send({ status: 'suspended', reason: 'support request' });
    expect(res.status).toBe(200);
    expect(logActionMock).toHaveBeenCalledOnce();
  });

  it('rejects a module toggle without moduleId', async () => {
    const res = await request(makeApp())
      .patch('/api/admin/master/tenants/1/modules')
      .set('x-test-user', ADMIN)
      .send({ enabled: true, reason: 'enable for pilot' });
    expect(res.status).toBe(400);
  });

  it('toggles a module entitlement and audits it', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ id: 1 }] }) // org exists
      .mockResolvedValueOnce({ rows: [{ module_id: 'cer' }] }) // module exists
      .mockResolvedValueOnce({ rows: [{ organization_id: 1, module_id: 'cer', enabled: true }] }); // upsert
    const res = await request(makeApp())
      .patch('/api/admin/master/tenants/1/modules')
      .set('x-test-user', ADMIN)
      .send({ moduleId: 'cer', enabled: true, reason: 'pilot enablement' });
    expect(res.status).toBe(200);
    expect(logActionMock).toHaveBeenCalledOnce();
  });

  it('404s a feature flag toggle for an unknown key', async () => {
    queryMock.mockResolvedValueOnce({ rows: [] }); // before: not found
    const res = await request(makeApp())
      .patch('/api/admin/master/feature-flags/nope')
      .set('x-test-user', ADMIN)
      .send({ enabled: true, reason: 'turn it on' });
    expect(res.status).toBe(404);
  });

  it('toggles a known feature flag and audits it', async () => {
    queryMock
      .mockResolvedValueOnce({ rows: [{ enabled: false }] }) // before
      .mockResolvedValueOnce({ rows: [{ feature_key: 'beta', enabled: true }] }); // update
    const res = await request(makeApp())
      .patch('/api/admin/master/feature-flags/beta')
      .set('x-test-user', ADMIN)
      .send({ enabled: true, reason: 'GA rollout' });
    expect(res.status).toBe(200);
    expect(logActionMock).toHaveBeenCalledOnce();
  });
});
