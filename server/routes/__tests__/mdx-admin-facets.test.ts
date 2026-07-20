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
  // Stand in for authMiddleware (applied at mount in the real app): set the org.
  app.use((req: any, _res, next) => {
    req.user = { organizationId: 2 };
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
      { id: 7, name: 'prod key', scopes: ['documents:read'], created_at: '2026-06-01T00:00:00Z', last_used_at: '2026-07-19T00:00:00Z', created_by: 1, status: 'active' },
      { id: 8, name: 'revoked key', scopes: ['documents:read'], created_at: '2026-05-01T00:00:00Z', last_used_at: null, created_by: 1, status: 'revoked' },
    ],
  }),
  audit: () => ({
    rows: [
      { id: 'abcd1234ef', user_id: 1, action: 'data_modify', table_name: 'organizations', record_id: '2', created_at: '2026-07-20T00:00:00Z', sha256_chain: 'deadbeefcafebabe' },
      { id: 'sys0001', user_id: null, action: 'sso.sync', table_name: null, record_id: null, created_at: '2026-07-19T00:00:00Z', sha256_chain: null },
    ],
  }),
  org: () => ({ rows: [{ name: 'Bright Biosciences', domain: 'brightbio.io', settings: { security: { mfaEnabled: true, ssoEnabled: false, sessionTimeout: 30 } } }] }),
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
    expect(keys[0]).toMatchObject({ id: 'key-7', name: 'prod key', owner: 'u-1', scopes: ['documents:read'] });
    expect(keys[0].rotateIn).toBe(''); // never fabricated
  });

  it('returns audit from audit_logs with a real chained sha and system actor', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const audit = res.body.data.audit;
    expect(audit).toHaveLength(2);
    expect(audit[0]).toMatchObject({ actor: 'u-1', action: 'data_modify', target: 'organizations · 2' });
    expect(audit[0].sha).toBe('dead…babe');
    expect(audit[1].actor).toBe('system'); // null user_id
    expect(audit[1].sha).toBe(''); // null chain → honest empty
  });

  it('derives settings only from real org values', async () => {
    dispatch(baseHandlers);
    const res = await request(app).get('/api/mdx/admin');
    const byId = Object.fromEntries(res.body.data.settings.map((s: any) => [s.id, s.value]));
    expect(byId['mfa-required']).toBe('Yes (all roles)');
    expect(byId['session-ttl']).toBe('30 minutes');
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
});
