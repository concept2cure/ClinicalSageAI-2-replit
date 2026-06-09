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

const { queryMock, state } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  state: { role: 'super_admin' as string },
}));

vi.mock('../../db', () => ({ query: queryMock }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user?: unknown }).user = {
      id: 1,
      role: state.role,
      roles: [state.role],
      organizationId: 1,
    };
    next();
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.role = 'super_admin';
  const router = (await import('../../routes/admin/scim-tenants')).default;
  app = express();
  app.use(express.json());
  app.use('/api/admin/scim-tenants', router);
});

describe('admin SCIM-tenants API', () => {
  it('forbids non-admins (403)', async () => {
    state.role = 'member';
    const res = await request(app).get('/api/admin/scim-tenants');
    expect(res.status).toBe(403);
  });

  it('creates a tenant, returns the token ONCE, stores only a SHA-256 hash', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 5, organization_id: 7, label: 'Okta', enabled: true }],
    });
    const res = await request(app)
      .post('/api/admin/scim-tenants')
      .send({ organizationId: 7, label: 'Okta' });

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
    const res = await request(app).post('/api/admin/scim-tenants/5/rotate').send();
    expect(res.status).toBe(200);
    expect(res.body.token).toMatch(/^scim_/);
  });

  it('disables a tenant via PATCH', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 5, organization_id: 7, label: 'Okta', enabled: false }],
    });
    const res = await request(app).patch('/api/admin/scim-tenants/5').send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('deletes a tenant (204), 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 5 }] });
    const ok = await request(app).delete('/api/admin/scim-tenants/5');
    expect(ok.status).toBe(204);

    queryMock.mockResolvedValueOnce({ rows: [] });
    const missing = await request(app).delete('/api/admin/scim-tenants/999');
    expect(missing.status).toBe(404);
  });
});
