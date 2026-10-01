/**
 * Route-level tests for the Access Management API (designate personnel).
 *
 * DB / audit / auth are mocked so these exercise the real router + the real
 * requirePlatformAdmin guard plus the business-tier escalation check:
 *   - only platform admins reach the router at all
 *   - granting a business-tier role additionally requires the CALLER to be a
 *     business admin
 *   - grants/revokes are governed (reason-for-change) and audited
 *
 * The db mock returns rows[] for the platform_role_grants fallback lookup the
 * guard performs when the sync role check fails — here every authorized caller
 * passes via their role, so that lookup just resolves to "no grant".
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

const queryMock = vi.fn();
const logActionMock = vi.fn(async (..._a: any[]) => ({ persisted: true, chained: true, tamperProof: true }));
/** The chained row written on the grant's own transaction (DP-75). */
const chainedRowMock = vi.fn(async (..._a: any[]) => undefined);
/** Every statement and step of a transaction, in order. */
const steps: string[] = [];

vi.mock('../../../db', () => ({
  query: (...args: unknown[]) => queryMock(...args),
  transaction: async (cb: (client: unknown) => Promise<unknown>) => {
    steps.push('BEGIN');
    const client = {
      query: (sql: string, params?: unknown[]) => {
        steps.push(sql.replace(/\s+/g, ' ').trim().slice(0, 40));
        return queryMock(sql, params);
      },
    };
    try {
      const out = await cb(client);
      steps.push('COMMIT');
      return out;
    } catch (err) {
      steps.push('ROLLBACK');
      throw err;
    }
  },
}));
vi.mock('../../../services/auditService', () => ({
  default: { logAction: (...args: unknown[]) => logActionMock(...args) },
  writeChainedAuditRow: async (...args: unknown[]) => {
    steps.push('<chained row>');
    return chainedRowMock(...args);
  },
}));
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

import router from '../access-management';

function makeApp() {
  const app = express();
  app.use(express.json());
  app.use('/api/admin/access', router);
  return app;
}

const SUPER = JSON.stringify({ id: 1, role: 'super_admin', email: 'owner@x.io' });
const SUPPORT = JSON.stringify({ id: 2, role: 'support', email: 's@x.io' });
const PLATFORM = JSON.stringify({ id: 3, role: 'platform_admin', email: 'p@x.io' });
const BIZ = JSON.stringify({ id: 4, role: 'business_admin', email: 'finance@x.io' });
const MEMBER = JSON.stringify({ id: 5, role: 'member', email: 'm@x.io' });

beforeEach(() => {
  queryMock.mockReset();
  logActionMock.mockReset();
  logActionMock.mockResolvedValue({ persisted: true, chained: true, tamperProof: true });
  chainedRowMock.mockReset();
  steps.length = 0;
  queryMock.mockImplementation((sql: string) => {
    // Guard fallback lookup: no grant → guard relies on the sync role check.
    if (/FROM platform_role_grants\s+WHERE user_id/.test(sql)) return Promise.resolve({ rows: [] });
    if (/FROM users WHERE email/.test(sql)) return Promise.resolve({ rows: [{ id: 42 }] });
    if (/SELECT g\.id/.test(sql)) return Promise.resolve({ rows: [] });
    if (/INSERT INTO platform_role_grants/.test(sql))
      return Promise.resolve({
        rows: [{ id: 9, user_id: 42, role: 'support', granted_by: 'owner@x.io', granted_at: 'now', reason: 'r' }],
      });
    if (/UPDATE platform_role_grants/.test(sql))
      return Promise.resolve({ rows: [{ id: 9, user_id: 42, role: 'support', revoked_at: 'now', revoked_by: 'owner@x.io' }] });
    return Promise.resolve({ rows: [{}] });
  });
});

describe('access boundary', () => {
  it('401s an unauthenticated request', async () => {
    const res = await request(makeApp()).get('/api/admin/access/grants');
    expect(res.status).toBe(401);
  });

  it('403s a non-platform user', async () => {
    const res = await request(makeApp())
      .get('/api/admin/access/grants')
      .set('x-test-user', MEMBER);
    expect(res.status).toBe(403);
  });

  it('lists grants for a platform admin', async () => {
    const res = await request(makeApp())
      .get('/api/admin/access/grants')
      .set('x-test-user', SUPPORT);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.grants)).toBe(true);
  });
});

describe('granting platform/support roles', () => {
  it('lets a super_admin grant support (and audits it)', async () => {
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', SUPER)
      .send({ email: 'newhire@x.io', role: 'support', reason: 'onboard support staff' });
    expect(res.status).toBe(200);
    expect(chainedRowMock).toHaveBeenCalledOnce();
    expect(chainedRowMock.mock.calls[0][1]).toMatchObject({
      tenantId: 0,
      resourceType: 'platform_role_grant',
      resourceId: '42:support',
      details: { accessAction: 'role.grant', role: 'support', reason: 'onboard support staff' },
    });
    expect(logActionMock, 'no second, best-effort row').not.toHaveBeenCalled();
  });

  it('400s a grant without a reason', async () => {
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', SUPER)
      .send({ email: 'newhire@x.io', role: 'support' });
    expect(res.status).toBe(400);
    expect(chainedRowMock).not.toHaveBeenCalled();
  });

  it('404s an unknown email', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM platform_role_grants\s+WHERE user_id/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM users WHERE email/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', SUPER)
      .send({ email: 'ghost@x.io', role: 'support', reason: 'should 404' });
    expect(res.status).toBe(404);
  });
});

describe('business-tier grants require a business-admin caller', () => {
  it('403s when a support user tries to grant business_admin', async () => {
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', SUPPORT)
      .send({ email: 'finance2@x.io', role: 'business_admin', reason: 'designate finance' });
    expect(res.status).toBe(403);
    expect(chainedRowMock).not.toHaveBeenCalled();
  });

  it('403s when a platform_admin (not business) tries to grant business_admin', async () => {
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', PLATFORM)
      .send({ email: 'finance2@x.io', role: 'business_admin', reason: 'designate finance' });
    expect(res.status).toBe(403);
  });

  it('200s when a super_admin (platform + business) grants business_admin', async () => {
    // super_admin is BOTH a platform role (passes the router guard) and a
    // business role (passes the business-tier escalation check).
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', SUPER)
      .send({ email: 'finance2@x.io', role: 'business_admin', reason: 'designate finance' });
    expect(res.status).toBe(200);
    expect(chainedRowMock).toHaveBeenCalledOnce();
    expect(chainedRowMock.mock.calls[0][1].details).toMatchObject({ role: 'business_admin' });
  });

  it('200s when a business_admin holding an active platform grant grants business_admin', async () => {
    // A pure business_admin role does NOT pass the platform router guard on its
    // own, but a designated business_admin who ALSO holds an active platform
    // grant does (via the DB fallback), and then clears the business-tier check.
    queryMock.mockImplementation((sql: string) => {
      if (/FROM platform_role_grants\s+WHERE user_id/.test(sql))
        return Promise.resolve({ rows: [{ '?column?': 1 }] }); // active platform grant → router passes
      if (/FROM users WHERE email/.test(sql)) return Promise.resolve({ rows: [{ id: 42 }] });
      if (/INSERT INTO platform_role_grants/.test(sql))
        return Promise.resolve({ rows: [{ id: 9, user_id: 42, role: 'business_admin', granted_by: 'finance@x.io', granted_at: 'now', reason: 'r' }] });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', BIZ)
      .send({ email: 'finance2@x.io', role: 'business_admin', reason: 'designate finance' });
    expect(res.status).toBe(200);
    expect(chainedRowMock).toHaveBeenCalledOnce();
    expect(chainedRowMock.mock.calls[0][1].details).toMatchObject({ role: 'business_admin' });
  });
});

/*
 * DP-75 (2026-10-01): a platform role grant (owner and super_admin among the
 * roles) was written first and recorded after, best-effort: logAction's
 * failure was logged and the grant stood unrecorded. A grant and its chained
 * row now commit together or not at all. A revocation stands without its row,
 * as a suspension does (master-admin.ts), and its answer says whether the row
 * was written.
 */
describe('a grant is recorded in its transaction (DP-75)', () => {
  const grant = () =>
    request(makeApp())
      .post('/api/admin/access/grants')
      .set('x-test-user', SUPER)
      .send({ email: 'newhire@x.io', role: 'support', reason: 'onboard support staff' });

  it('writes the grant and its chained row on one transaction, row after the grant, then commits', async () => {
    const res = await grant();
    expect(res.status).toBe(200);
    expect(steps[0]).toBe('BEGIN');
    expect(steps.findIndex((x) => /^INSERT INTO platform_role_grants/.test(x))).toBeGreaterThan(0);
    expect(steps.indexOf('<chained row>')).toBeGreaterThan(steps.findIndex((x) => /^INSERT INTO platform_role_grants/.test(x)));
    expect(steps.at(-1)).toBe('COMMIT');
  });

  it('when the row cannot be written nothing is granted: 503 GRANT_NOT_RECORDED, rolled back', async () => {
    chainedRowMock.mockRejectedValue(new Error('audit_logs refused the row: secret-detail'));
    const res = await grant();
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: 'GRANT_NOT_RECORDED' });
    expect(res.body.error).toMatch(/not granted/);
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
    expect(steps).not.toContain('COMMIT');
    expect(steps.at(-1)).toBe('ROLLBACK');
  });

  it('a failed grant write is a 500, and no row claims it', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM platform_role_grants\s+WHERE user_id/.test(sql)) return Promise.resolve({ rows: [] });
      if (/FROM users WHERE email/.test(sql)) return Promise.resolve({ rows: [{ id: 42 }] });
      if (/INSERT INTO platform_role_grants/.test(sql)) return Promise.reject(new Error('insert refused'));
      return Promise.resolve({ rows: [{}] });
    });
    const res = await grant();
    expect(res.status).toBe(500);
    expect(chainedRowMock).not.toHaveBeenCalled();
  });
});

describe('revoke', () => {
  it('revokes a grant and audits it, and says the row was written', async () => {
    const res = await request(makeApp())
      .delete('/api/admin/access/grants/9')
      .set('x-test-user', SUPER)
      .send({ reason: 'offboarding' });
    expect(res.status).toBe(200);
    expect(logActionMock).toHaveBeenCalledOnce();
    expect(logActionMock.mock.calls[0][0].details).toMatchObject({ accessAction: 'role.revoke' });
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('a revocation stands when its row is lost, and says so (DP-75)', async () => {
    logActionMock.mockResolvedValue({ persisted: false, chained: false, tamperProof: false, error: 'store down' } as never);
    const res = await request(makeApp())
      .delete('/api/admin/access/grants/9')
      .set('x-test-user', SUPER)
      .send({ reason: 'offboarding' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id: 9, auditTrail: { persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' } });
    expect(JSON.stringify(res.body)).not.toContain('store down');
  });

  it('404s revoking a non-existent / already-revoked grant', async () => {
    queryMock.mockImplementation((sql: string) => {
      if (/FROM platform_role_grants\s+WHERE user_id/.test(sql)) return Promise.resolve({ rows: [] });
      if (/UPDATE platform_role_grants/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [{}] });
    });
    const res = await request(makeApp())
      .delete('/api/admin/access/grants/999')
      .set('x-test-user', SUPER)
      .send({ reason: 'offboarding' });
    expect(res.status).toBe(404);
  });
});
