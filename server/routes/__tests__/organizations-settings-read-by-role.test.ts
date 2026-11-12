/**
 * GET /api/organizations/:id/settings: what each role reads (role walk, 2026-11-12).
 *
 * The read answered every member and viewer with the stored settings, so an integration's credential and the
 * network allowlist were readable by any role. What the view withholds, field by field, is proven in
 * server/services/tenant/__tests__/general-settings-view.test.ts; here, that the route asks the view as the
 * caller's role, and that a settings write does not echo a credential it stored.
 */
import express from 'express';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithTenantScope } from '../../db/tenantStore';

const stored = { security: { sessionTimeoutMinutes: 30, ipWhitelist: ['203.0.113.7'] }, integrations: { slack: { enabled: true, webhookUrl: 'https://hooks.slack.example/T0/secret' } } };
const rows = vi.hoisted(() => ({ org: [] as Array<Record<string, unknown>> }));
const writer = vi.hoisted(() => vi.fn());

vi.mock('../../db', () => {
  const select = () => {
    const chain: any = { from: () => chain, leftJoin: () => chain, where: () => chain, limit: () => chain };
    chain.then = (resolve: (v: unknown[]) => unknown) => Promise.resolve(resolve(rows.org));
    return chain;
  };
  // No platform_role_grants row for anyone here: nobody is platform staff.
  return { db: { select }, query: async () => ({ rows: [] }) };
});
vi.mock('@shared/schema', () => {
  const table = (name: string) => ({ _: { name }, id: 'id', name: 'name' });
  return { organizations: table('organizations'), organizationUsers: table('organization_users'), clientWorkspaces: table('client_workspaces') };
});
vi.mock('../../services/auditService', () => ({ default: { logAction: vi.fn() } }));
vi.mock('../../services/tenant/tenant-settings-writer', async (original) => ({
  ...(await original<typeof import('../../services/tenant/tenant-settings-writer')>()),
  writeTenantSettings: (...a: unknown[]) => writer(...a),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const u = JSON.parse(String(req.headers['x-test-user']));
    Object.assign(req, { user: u, userRole: u.role, userId: u.id });
    return runWithTenantScope({ tenantId: String(u.organizationId), role: u.role, source: 'request', caller: 'test' }, () => next());
  },
}));
vi.mock('../../middleware/establishRequestTenantScope', () => ({ establishRequestSystemScope: (_q: unknown, _s: unknown, next: () => void) => next() }));

let app: express.Express;
beforeAll(async () => {
  app = express(); app.use(express.json());
  app.use('/api/organizations', (await import('../organizations-routes')).default);
});
beforeEach(() => { rows.org = [{ id: 7, name: 'Bright Bio', settings: stored }]; writer.mockReset(); });

const as = (role: string, organizationId = 7) => JSON.stringify({ id: 2, role, organizationId });
const read = (user: string) => request(app).get('/api/organizations/7/settings').set('x-test-user', user);

describe('GET /api/organizations/:id/settings, by role', () => {
  it('an administrator reads the integrations with the credential withheld, and the allowlist', async () => {
    const res = await read(as('admin'));
    expect(res.status).toBe(200);
    expect(res.body.settings.integrations.slack).toEqual({ enabled: true, webhookUrl: '', webhookUrlConfigured: true });
    expect(res.body.settings.security.ipWhitelist).toEqual(['203.0.113.7']);
    expect(JSON.stringify(res.body)).not.toContain('hooks.slack.example');
  });

  it.each(['manager', 'member', 'viewer'])('a %s reads the session policy, and neither the integrations nor the allowlist', async (role) => {
    const res = await read(as(role));
    expect(res.status).toBe(200);
    expect(res.body.settings.security).toEqual({ sessionTimeoutMinutes: 30 });
    expect(res.body.settings).not.toHaveProperty('integrations');
    expect(JSON.stringify(res.body)).not.toMatch(/hooks\.slack\.example|203\.0\.113/);
  });

  it('another organization\'s administrator is refused', async () => {
    expect((await read(as('admin', 9))).status).toBe(403);
  });

  it('a settings write does not echo the credential it stored', async () => {
    writer.mockResolvedValue({ id: 7, settings: {} });
    const res = await request(app).patch('/api/organizations/7/settings').set('x-test-user', as('admin'))
      .send({ settings: { integrations: { slack: { enabled: true, webhookUrl: 'https://hooks.slack.example/T0/secret' } } }, reason: 'Connecting the release channel.' });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain('hooks.slack.example');
    expect(res.body.settings.integrations.slack).toEqual({ enabled: true, webhookUrl: '', webhookUrlConfigured: true });
  });
});
