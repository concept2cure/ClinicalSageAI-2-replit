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

const { queryMock, state } = vi.hoisted(() => ({
  queryMock: vi.fn(),
  state: { role: 'super_admin' as string },
}));

vi.mock('../../db', () => ({ query: queryMock }));
vi.mock('../../auth', () => ({
  authMiddleware: (req: { user?: unknown }, _res: unknown, next: () => void) => {
    (req as { user?: unknown }).user = { id: 1, role: state.role, roles: [state.role], organizationId: 1 };
    next();
  },
}));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  state.role = 'super_admin';
  const router = (await import('../../routes/admin/scim-ip-allowlist')).default;
  app = express();
  app.use(express.json());
  app.use('/api/admin/scim-ip-allowlist', router);
});

describe('admin SCIM IP-allowlist API', () => {
  it('forbids non-admins (403)', async () => {
    state.role = 'member';
    const res = await request(app).get('/api/admin/scim-ip-allowlist');
    expect(res.status).toBe(403);
  });

  it('creates a rule with a valid CIDR (201)', async () => {
    queryMock.mockResolvedValue({
      rows: [{ id: 3, organization_id: 7, cidr: '203.0.113.0/24', label: 'Okta egress', enabled: true }],
    });
    const res = await request(app)
      .post('/api/admin/scim-ip-allowlist')
      .send({ organizationId: 7, cidr: '203.0.113.0/24', label: 'Okta egress' });
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
    const res = await request(app).patch('/api/admin/scim-ip-allowlist/3').send({ enabled: false });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
  });

  it('deletes a rule (204), 404 when missing', async () => {
    queryMock.mockResolvedValueOnce({ rows: [{ id: 3 }] });
    const ok = await request(app).delete('/api/admin/scim-ip-allowlist/3');
    expect(ok.status).toBe(204);

    queryMock.mockResolvedValueOnce({ rows: [] });
    const missing = await request(app).delete('/api/admin/scim-ip-allowlist/999');
    expect(missing.status).toBe(404);
  });
});
