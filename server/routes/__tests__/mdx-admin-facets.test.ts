/**
 * MDX Admin & Access read-model (server/routes/mdx-admin.ts).
 *
 * Backs the Claude Design MDX AdminSurface (client useAdmin → /api/mdx/admin).
 * These tests lock the facets wired from real stores — apiKeys (api_keys),
 * audit (audit_logs), settings (organizations.settings) and a TRUTHFUL sso
 * object (organizations.settings.security + scim_tenants) — and the honesty
 * rules: no fabricated fields, per-facet fail-closed on a missing table.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';

// pool.query is dispatched by SQL substring so each facet gets its own rows.
const queryMock = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../mdx-admin')).default;
  app = express();
  app.use(express.json());
  // Stand in for authMiddleware (applied at mount in the real app): set the org
  // and an admin role (the route is org-admin gated).
  app.use((req: any, _res, next) => {
    req.user = { organizationId: 2, role: 'admin' };
    next();
  });
  app.use('/api/mdx', router);
});

function dispatch(handlers: Record<string, () => { rows: unknown[] }>) {
  queryMock.mockImplementation((sql: string) => {
    if (/FROM organization_users/.test(sql)) return Promise.resolve(handlers.members());
    if (/FROM api_keys/.test(sql)) return Promise.resolve(handlers.apiKeys());
    if (/FROM audit_logs/.test(sql)) return Promise.resolve(handlers.audit());
    if (/FROM organizations/.test(sql)) return Promise.resolve(handlers.org());
    if (/FROM scim_tenants/.test(sql)) return Promise.resolve(handlers.scim());
    return Promise.resolve({ rows: [] });
  });
}

const baseHandlers = {
  members: () => ({
    rows: [
      { user_id: 1, name: 'JM Smith', email: 'jm@c2c.io', role: 'admin', status: 'active', mfa_enabled: true, last_login: '2026-07-20T00:00:00Z', permissions: null },
      { user_id: 4, name: 'Riley Reg', email: 'riley@c2c.io', role: 'manager', status: 'active', mfa_enabled: false, last_login: null, permissions: null },
    ],
  }),
  apiKeys: () => ({
    rows: [
      { id: 7, name: 'prod key', key_prefix: 'c2c_ab12', scopes: ['documents:read'], created_at: '2026-06-01T00:00:00Z', last_used_at: '2026-07-19T00:00:00Z', created_by: 1, status: 'active', owner_name: 'JM Smith', owner_email: 'jm@c2c.io' },
      { id: 8, name: 'revoked key', key_prefix: 'c2c_cd34', scopes: ['documents:read'], created_at: '2026-05-01T00:00:00Z', last_used_at: null, created_by: 1, status: 'revoked', owner_name: 'JM Smith', owner_email: 'jm@c2c.io' },
    ],
  }),
  audit: () => ({
    rows: [
      { id: 'abcd1234ef', user_id: 1, action: 'data_modify', table_name: 'organizations', record_id: '2', created_at: '2026-07-20T00:00:00Z', sha256_chain: 'deadbeefcafebabe', description: null, actor_name: 'JM Smith', actor_email: 'jm@c2c.io', target_name: null, target_email: null },
      { id: 'sys0001', user_id: null, action: 'sso.sync', table_name: null, record_id: null, created_at: '2026-07-19T00:00:00Z', sha256_chain: null, description: null, actor_name: null, actor_email: null, target_name: null, target_email: null },
    ],
  }),
  org: () => ({ rows: [{ name: 'Bright Biosciences', domain: 'brightbio.io', settings: { security: { mfaEnabled: true, ssoEnabled: false, sessionTimeoutMinutes: 30, sessionTimeout: 960 } } }] }),
  scim: () => ({ rows: [] }),
};

beforeEach(() => queryMock.mockReset());

describe('GET /api/mdx/admin — real facets', () => {
  it('returns apiKeys from api_keys (revoked filtered, prefix owner, no invented rotation)', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    expect(res.status).toBe(200);
    const keys = res.body.data.apiKeys;
    expect(keys).toHaveLength(1); // revoked one dropped
    // Owner by name and the key by its public prefix — never `u-1` / a row id.
    expect(keys[0]).toMatchObject({ id: 'key-7', keyId: 7, prefix: 'c2c_ab12', name: 'prod key', owner: 'JM Smith', scopes: ['documents:read'] });
    expect(keys[0].rotateIn).toBe(''); // never fabricated
  });

  it('returns audit from audit_logs with a real chained sha and system actor', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const audit = res.body.data.audit;
    expect(audit).toHaveLength(2);
    // Named the way the Audit trail surface names the same rows: the account,
    // the humanized action, and this organization by its name.
    expect(audit[0]).toMatchObject({ actor: 'JM Smith', action: 'Data Modify', target: 'Bright Biosciences' });
    expect(audit[0].sha).toBe('dead…babe');
    expect(audit[1].actor).toBe('system'); // null user_id
    expect(audit[1].sha).toBe(''); // null chain → honest empty
  });

  it('derives settings only from real org values', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const byId = Object.fromEntries(res.body.data.settings.map((s: any) => [s.id, s.value]));
    // What sign-in enforces (routes/auth.ts), not settings.security.mfaEnabled.
    expect(byId['mfa-required']).toBe('Required for every member');
    expect(byId['sso']).toBe('Disabled');
    expect(byId['branding']).toBe('Bright Biosciences');
  });
  it('builds a TRUTHFUL sso object (disabled + no SCIM) — not the mock topology', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const sso = res.body.data.sso;
    expect(sso.primary.status).toBe('disabled');
    expect(sso.primary.provider).toBe('Not configured');
    expect(sso.fallback.users).toBe(2); // SSO off → all members on local
    expect(sso.scim.enabled).toBe(false);
    expect(sso.scim.provider).toBe('Not configured');
    expect(sso.mfaRequired).toBe(true);
  });

  it('reflects SSO enabled + active SCIM when the org config says so', async () => {
    dispatch({
      ...baseHandlers,
      org: () => ({ rows: [{ name: 'Bright Biosciences', domain: 'brightbio.io', settings: { security: { mfaEnabled: true, ssoEnabled: true } } }] }),
      scim: () => ({ rows: [{ enabled: true, updated_at: '2026-07-20T00:00:00Z' }] }),
    });
    const res = await request(app).get('/api/mdx/admin');
    const sso = res.body.data.sso;
    expect(sso.primary.status).toBe('connected');
    expect(sso.primary.users).toBe(2); // SSO on → members on primary
    expect(sso.fallback.users).toBe(0);
    expect(sso.scim.enabled).toBe(true);
  });

  it('fails a single facet closed — a missing api_keys table does not sink the payload', async () => {
    dispatch({
      ...baseHandlers,
      apiKeys: () => { const e: any = new Error('relation "api_keys" does not exist'); e.code = '42P01'; throw e; },
    });
    // Route awaits the query, so the rejection must be caught inside facet(); simulate by rejecting.
    queryMock.mockImplementation((sql: string) => {
      if (/FROM organization_users/.test(sql)) return Promise.resolve(baseHandlers.members());
      if (/FROM api_keys/.test(sql)) { const e: any = new Error('undef'); e.code = '42P01'; return Promise.reject(e); }
      if (/FROM audit_logs/.test(sql)) return Promise.resolve(baseHandlers.audit());
      if (/FROM organizations/.test(sql)) return Promise.resolve(baseHandlers.org());
      if (/FROM scim_tenants/.test(sql)) return Promise.resolve({ rows: [] });
      return Promise.resolve({ rows: [] });
    });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.status).toBe(200);
    expect(res.body.data.apiKeys).toEqual([]); // facet degraded
    expect(res.body.data.members).toHaveLength(2); // rest intact
    expect(res.body.data.audit).toHaveLength(2);
  });

  it('403s without an org context (no tenant leak)', async () => {
    const bare = express();
    bare.use(express.json());
    const router = (await import('../mdx-admin')).default;
    bare.use('/api/mdx', router);
    const res = await request(bare).get('/api/mdx/admin');
    expect(res.status).toBe(403);
  });

  it('403s an authenticated NON-admin member (fail-closed authorization)', async () => {
    // A real org member with a valid org context but a non-admin role must not
    // reach the admin estate — the UI hiding the nav item is not authorization.
    const member = express();
    member.use(express.json());
    member.use((req: any, _res, next) => {
      req.user = { organizationId: 2, role: 'manager' };
      next();
    });
    const router = (await import('../mdx-admin')).default;
    member.use('/api/mdx', router);
    const res = await request(member).get('/api/mdx/admin');
    expect(res.status).toBe(403);
    // No estate data leaks in the denial.
    expect(res.body.data).toBeUndefined();
  });
});

describe('GET /api/mdx/admin — the settings Setup folded into', () => {
  /* Setup folded into Admin and access (D2, 2026-10-29): the Settings tab mounts
     SessionPolicySetting, which reads and sets the idle window under a reason, so
     the read-only "Session timeout" row it replaces is no longer served beside it. */
  it('serves no session-timeout row: the governed session-policy card replaces it', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const ids = res.body.data.settings.map((s: { id: string }) => s.id);
    expect(ids).not.toContain('session-ttl');
    expect(res.body.data.settings.some((s: { label: string }) => /session timeout/i.test(s.label))).toBe(false);
  });

  /* Setup's Multi-factor row said where each person enrols an authenticator app
     (QA 2026-10-08 j9, P-25); the second-factor row says it now. */
  it('says where each person sets up an authenticator app', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const row = res.body.data.settings.find((s: { id: string }) => s.id === 'mfa-required');
    expect(row.desc).toMatch(/emailed code/);
    expect(row.desc).toMatch(/Account in the account menu/);
    expect(row.desc).not.toMatch(/enrolled by each member/);
  });
});

describe('session policy follows the enforced sign-in policy', () => {
  it.each([
    [{ sessionTimeout: 120 }, '15 minutes'],
    [{ sessionTimeoutMinutes: 99999 }, '1440 minutes'],
    [{ sessionTimeoutMinutes: 0 }, '1 minute'],
    [{ sessionTimeoutMinutes: '90' }, '15 minutes'],
    [{ sessionTimeoutMinutes: 22.9 }, '22 minutes'],
  ])('shows the idle interval sign-in actually enforces for %j', async (security, expected) => {
    dispatch({ ...baseHandlers, org: () => ({ rows: [{ name: 'Bright Biosciences', domain: null, settings: { security } }] }) });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.status).toBe(200);
    // The idle window is still served, on the SSO object, as sign-in enforces it.
    expect(res.body.data.sso.sessionTtl).toBe(expected.replace(/ minutes?$/, 'm'));
  });

});
