/**
 * Contract test for the admin SCIM IP-allowlist API
 * (server/routes/admin/scim-ip-allowlist.ts). Verifies super-admin gating,
 * CIDR validation, and CRUD. Data layer is mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-padded-to-at-least-32-chars-long';
});

import express from 'express';
import request from 'supertest';

// Platform standing is an active platform_role_grants row, as in production —
// never the request role, which behind server/auth.ts is the TENANT membership
// role (D6, 2026-10-05, docs/evidence/D6/2026-10-05-platform-standing/).
// `state.role` is that membership role; `state.platformGrant` is the role on
// user 1's grant row (null: no grant). The guard's grant lookup is answered
// apart from queryMock so it never consumes a test's queued results.
const { queryMock, auditMock, transactionMock, grantLookup, state } = vi.hoisted(() => {
  const state = { role: 'admin' as string, platformGrant: 'super_admin' as string | null };
  return {
    queryMock: vi.fn(),
    auditMock: vi.fn(),
    transactionMock: vi.fn(),
    state,
    grantLookup: (params?: unknown[]) => {
      const asked = Array.isArray(params?.[1]) ? (params![1] as string[]) : [];
      const holds = params?.[0] === 1 && state.platformGrant !== null && asked.includes(state.platformGrant);
      return Promise.resolve({ rows: holds ? [{ '?column?': 1 }] : [] });
    },
  };
});

vi.mock('../../db', () => ({
  pool: { connect: async () => ({ query: (sql: string, params?: unknown[]) =>
    /FROM platform_role_grants/.test(sql) ? grantLookup(params) : queryMock(sql, params), release: vi.fn() }) },
  query: (sql: string, params?: unknown[]) =>
    /FROM platform_role_grants/.test(sql) ? grantLookup(params) : queryMock(sql, params),
}));
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: auditMock }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: { user?: unknown; userId?: number }, _res: unknown, next: () => void) => {
    (req as { user?: unknown }).user = { id: 1, role: state.role, roles: [state.role], organizationId: 1 };
    req.userId = 1; // as server/auth.ts sets it; the grant lookup is keyed on it
    next();
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  // A platform super_admin grant holder whose tenant membership role is admin.
  state.role = 'admin';
  state.platformGrant = 'super_admin';
  auditMock.mockResolvedValue(undefined);
  transactionMock.mockImplementation(async (callback) => callback({ query: queryMock }));
  const router = (await import('../../routes/admin/scim-ip-allowlist')).default;
  app = express();
  app.use(express.json());
  app.use('/api/admin/scim-ip-allowlist', router);
});

describe('admin SCIM IP-allowlist API', () => {
  it('forbids non-admins (403)', async () => {
    state.role = 'member';
    state.platformGrant = null;
    const res = await request(app).get('/api/admin/scim-ip-allowlist');
    expect(res.status).toBe(403);
  });

  it('forbids a tenant membership role of super_admin with no platform grant (403)', async () => {
    state.role = 'super_admin';
    state.platformGrant = null;
    const res = await request(app).get('/api/admin/scim-ip-allowlist');
    expect(res.status).toBe(403);
  });

  it('creates a rule with a valid CIDR (201)', async () => {
    queryMock.mockImplementation(async (sql: string) => /SELECT id FROM organizations/.test(sql) ? { rows: [{ id: 7 }] } : { rows: [{ id: 3, organization_id: 7, cidr: '203.0.113.0/24', label: 'Okta egress', enabled: true }] });
    const res = await request(app)
      .post('/api/admin/scim-ip-allowlist')
      .send({ organizationId: 7, cidr: '203.0.113.0/24', label: 'Okta egress', reason: 'Approved IdP egress' });
    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(7);
    expect(res.body.cidr).toBe('203.0.113.0/24');
    const insert = queryMock.mock.calls.find(c => /INSERT INTO scim_ip_allowlist/i.test(String(c[0])));
    expect(insert).toBeTruthy();
  });

  it('rejects an invalid CIDR (400)', async () => {
    const res = await request(app)
      .post('/api/admin/scim-ip-allowlist')
      .send({ organizationId: 7, cidr: '300.1.1.1/33' });
    expect(res.status).toBe(400);
    // must not hit the DB on a validation failure
    expect(queryMock.mock.calls.some(c => /INSERT/i.test(String(c[0])))).toBe(false);
  });

  it('400 when organizationId is missing', async () => {
    const res = await request(app)
      .post('/api/admin/scim-ip-allowlist')
      .send({ cidr: '10.0.0.0/8' });
    expect(res.status).toBe(400);
  });

  it('lists rules (never org-filtered from query)', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 3, organization_id: 7, cidr: '10.0.0.0/8', label: null, enabled: true }],
    });
    const res = await request(app).get('/api/admin/scim-ip-allowlist');
    expect(res.status).toBe(200);
    expect(res.body.rules).toHaveLength(1);
    expect(res.body.rules[0].cidr).toBe('10.0.0.0/8');
  });

  it('disables a rule via PATCH', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 3, organization_id: 7, cidr: '10.0.0.0/8', label: null, enabled: false }],
    });
    const res = await request(app).patch('/api/admin/scim-ip-allowlist/3').send({ enabled: false, reason: 'Address retired' });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('deletes a rule (204), 404 when missing', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 3, organization_id: 7, cidr: '10.0.0.0/8', enabled: true }] });
    const ok = await request(app).delete('/api/admin/scim-ip-allowlist/3').send({ reason: 'Address retired' });
    expect(ok.status).toBe(204);

    queryMock.mockResolvedValue({ rows: [] });
    const missing = await request(app).delete('/api/admin/scim-ip-allowlist/999').send({ reason: 'Address retired' });
    expect(missing.status).toBe(404);
  });

  it('requires a reason for every security-policy mutation before writing anything', async () => {
    for (const method of ['post', 'patch', 'delete'] as const) {
      const path = method === 'post' ? '/api/admin/scim-ip-allowlist' : '/api/admin/scim-ip-allowlist/3';
      queryMock.mockResolvedValue({ rows: [{ id: 3, organization_id: 7 }] });
      const result = await request(app)[method](path).send({ organizationId: 7, cidr: '10.0.0.0/8', enabled: false });
      expect(result.status).toBe(400);
    }
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it('records the target organization, actor and reason in the mutation transaction', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 3, organization_id: 7, cidr: '10.0.0.0/8', enabled: false }] });
    const result = await request(app).patch('/api/admin/scim-ip-allowlist/3').send({ enabled: false, reason: 'Retired provider' });
    expect(result.status).toBe(200);
    expect(queryMock).toHaveBeenCalledWith('BEGIN', undefined);
    expect(auditMock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      tenantId: 7, userId: 1, action: 'scim_ip_rule_updated', reason: 'Retired provider', resourceId: '3',
    }));
  });

  it('refuses the mutation when its chained record cannot commit', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 3, organization_id: 7, cidr: '10.0.0.0/8', enabled: true }] });
    auditMock.mockRejectedValueOnce(new Error('audit unavailable'));
    const result = await request(app).delete('/api/admin/scim-ip-allowlist/3').send({ reason: 'Retired provider' });
    expect(result.status).toBe(503);
    expect(queryMock).toHaveBeenCalledWith('BEGIN', undefined);
    expect(auditMock).toHaveBeenCalledOnce();
  });
});
