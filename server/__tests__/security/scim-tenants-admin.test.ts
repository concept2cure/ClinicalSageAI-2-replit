/**
 * Contract test for the admin SCIM-tenants API (server/routes/admin/scim-tenants.ts).
 * Verifies super-admin gating and that created/rotated tokens are returned ONCE
 * and stored only as SHA-256 hashes (never plaintext). Data layer is mocked.
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
const { queryMock, grantLookup, state } = vi.hoisted(() => {
  const state = { role: 'admin' as string, platformGrant: 'super_admin' as string | null };
  return {
    queryMock: vi.fn(),
    state,
    grantLookup: (params?: unknown[]) => {
      const asked = Array.isArray(params?.[1]) ? (params![1] as string[]) : [];
      const holds = params?.[0] === 1 && state.platformGrant !== null && asked.includes(state.platformGrant);
      return Promise.resolve({ rows: holds ? [{ '?column?': 1 }] : [] });
    },
  };
});

const runQuery = (sql: string, params?: unknown[]) => /^(BEGIN|COMMIT|ROLLBACK)$/.test(sql) ? Promise.resolve({ rows: [] }) : /FROM platform_role_grants/.test(sql) ? grantLookup(params)
  : /SELECT id FROM organizations/.test(sql) ? Promise.resolve({ rows: [{ id: params?.[0] }] }) : queryMock(sql, params);
vi.mock('../../services/auditService', () => ({ writeChainedAuditRow: vi.fn(async () => undefined) }));
vi.mock('../../db', () => ({
  pool: { connect: async () => ({ query: runQuery, release: vi.fn() }) },
  query: (sql: string, params?: unknown[]) =>
    /FROM platform_role_grants/.test(sql) ? grantLookup(params) : queryMock(sql, params),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: { user?: unknown; userId?: number }, _res: unknown, next: () => void) => {
    (req as { user?: unknown }).user = {
      id: 1,
      role: state.role,
      roles: [state.role],
      organizationId: 1,
    };
    req.userId = 1; // as server/auth.ts sets it; the grant lookup is keyed on it
    next();
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  queryMock.mockReset();
  queryMock.mockResolvedValue({ rows: [] });
  // A platform super_admin grant holder whose tenant membership role is admin.
  state.role = 'admin';
  state.platformGrant = 'super_admin';
  const router = (await import('../../routes/admin/scim-tenants')).default;
  app = express();
  app.use(express.json());
  app.use('/api/admin/scim-tenants', router);
});

describe('admin SCIM-tenants API', () => {
  it('forbids non-admins (403)', async () => {
    state.role = 'member';
    state.platformGrant = null;
    const res = await request(app).get('/api/admin/scim-tenants');
    expect(res.status).toBe(403);
  });

  it('forbids a tenant membership role of super_admin with no platform grant (403)', async () => {
    state.role = 'super_admin';
    state.platformGrant = null;
    const res = await request(app).get('/api/admin/scim-tenants');
    expect(res.status).toBe(403);
  });

  it('creates a tenant, returns the token ONCE, stores only a SHA-256 hash', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 5, organization_id: 7, label: 'Okta', enabled: true }],
    });
    const res = await request(app)
      .post('/api/admin/scim-tenants')
      .send({ organizationId: 7, label: 'Okta', reason: 'Configure approved directory.' });

    expect(res.status).toBe(201);
    expect(res.body.organizationId).toBe(7);
    expect(res.body.token).toMatch(/^scim_/);

    const insert = queryMock.mock.calls.find(c => /INSERT INTO scim_tenants/i.test(String(c[0])));
    expect(insert).toBeTruthy();
    const storedHash = String((insert as unknown[])[1] && (insert![1] as unknown[])[1]);
    expect(storedHash).toMatch(/^[a-f0-9]{64}$/); // sha256 hex
    expect(storedHash).not.toBe(res.body.token); // never store plaintext
  });

  it('400 when organizationId is missing', async () => {
    const res = await request(app).post('/api/admin/scim-tenants').send({ label: 'x' });
    expect(res.status).toBe(400);
  });

  it('rotate issues a fresh token (200)', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 5, organization_id: 7, label: 'Okta', enabled: true }],
    });
    const res = await request(app).post('/api/admin/scim-tenants/5/rotate').send({ reason: 'Rotate approved directory credential.' });
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^scim_/);
  });

  it('disables a tenant via PATCH', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 5, organization_id: 7, label: 'Okta', enabled: false }],
    });
    const res = await request(app).patch('/api/admin/scim-tenants/5').send({ enabled: false, reason: 'Retire directory access.' });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('deletes a tenant (204), 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5, organization_id: 7, enabled: true }] }).mockResolvedValueOnce({ rows: [{ id: 5, organization_id: 7, enabled: true }] });
    const ok = await request(app).delete('/api/admin/scim-tenants/5').send({ reason: 'Revoke retired directory.' });
    expect(ok.status).toBe(204);

    queryMock.mockResolvedValueOnce({ rows: [] });
    const missing = await request(app).delete('/api/admin/scim-tenants/999').send({ reason: 'Revoke retired directory.' });
    expect(missing.status).toBe(404);
  });
});

describe('SCIM token change validation', () => {
  it.each(['create', 'rotate', 'update', 'delete'])('requires a reason before %s changes a credential', async kind => {
    queryMock.mockResolvedValue({ rows: [{ id: 5, organization_id: 7, enabled: true }] });
    const endpoint = request(app);
    const res = kind === 'create' ? await endpoint.post('/api/admin/scim-tenants').send({ organizationId: 7 })
      : kind === 'rotate' ? await endpoint.post('/api/admin/scim-tenants/5/rotate').send({})
        : kind === 'update' ? await endpoint.patch('/api/admin/scim-tenants/5').send({ enabled: false })
          : await endpoint.delete('/api/admin/scim-tenants/5').send({});
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });

  it('refuses fractional organization ids before generating a credential', async () => {
    queryMock.mockResolvedValue({ rows: [{ id: 5, organization_id: 7.5, enabled: true }] });
    const res = await request(app).post('/api/admin/scim-tenants').send({ organizationId: 7.5, reason: 'Configure approved directory.' });
    expect(res.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});

describe('SCIM credential target validation', () => {
  it.each(['0', '-1', '1.5', '9007199254740992'])('refuses invalid credential id %s without a mutation', async id => {
    const response = await request(app).post(`/api/admin/scim-tenants/${id}/rotate`).send({ reason: 'Approved token rotation.' });
    expect(response.status).toBe(404);
    expect(queryMock).not.toHaveBeenCalled();
  });
  it('refuses request fields that attempt to redirect an existing token to another organization', async () => {
    const response = await request(app).patch('/api/admin/scim-tenants/5').send({ enabled: false, organizationId: 999, reason: 'Approved directory change.' });
    expect(response.status).toBe(400);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
