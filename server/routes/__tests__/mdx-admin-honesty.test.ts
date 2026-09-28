/**
 * GET /api/mdx/admin — the admin console has to tell an organisation the truth
 * (launch row D2, 2026-09-23 empty-org sweep of `admin-console`).
 *
 *  1. The second-factor row states what sign-in enforces. It used to read
 *     `settings.security.mfaEnabled !== false` — a flag nothing at sign-in
 *     reads — and said "Yes (all roles)" on a server whose audit trail recorded
 *     every sign-in as "second factor skipped".
 *  2. A facet whose read FAILED is named in `meta.unavailable`. It used to come
 *     back as [] for any error, which the surface rendered as "0 API keys" and
 *     "No admin audit entries yet".
 *  3. Audit and API-key rows name people and events, not `u-1`, `user_login`,
 *     `user · 1` or 12 characters of a UUID.
 */

import express from 'express';
import request from 'supertest';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const queryMock = vi.fn();
vi.mock('../../db', () => ({ pool: { query: (...a: unknown[]) => queryMock(...a) } }));

let app: express.Express;
beforeAll(async () => {
  const router = (await import('../mdx-admin')).default;
  app = express();
  app.use((req: any, _res, next) => {
    req.user = { organizationId: 1, role: 'admin' };
    next();
  });
  app.use('/api/mdx', router);
});

type Handler = () => { rows: unknown[] };
const fault = (code?: string): Handler => () => {
  const e: any = new Error('permission denied for table');
  if (code) e.code = code;
  throw e;
};

const base: Record<'members' | 'apiKeys' | 'audit' | 'org' | 'scim', Handler> = {
  members: () => ({
    rows: [
      // mfa_enabled with a non-totp method is not an enrolled authenticator
      // (services/mfa-enrolment.ts) — sign-in still asks this account for an emailed code.
      { user_id: 1, name: 'JM Smith', email: 'jm.smith@concept2cure.pro', role: 'admin', status: 'active', mfa_enabled: true, mfa_method: 'email', last_login: '2026-09-23T14:28:37.818Z', permissions: null },
      { user_id: 2, name: 'Riley Reg', email: 'riley@c2c.io', role: 'admin', status: 'active', mfa_enabled: true, mfa_method: 'totp', last_login: null, permissions: null },
    ],
  }),
  apiKeys: () => ({ rows: [] }),
  audit: () => ({
    rows: [
      {
        id: '322439ff-0b2a-4ad5-9d6e-1f0c2b7e9a11', user_id: 1, action: 'user_login', table_name: 'user', record_id: '1',
        created_at: '2026-09-23T14:28:37.830Z', sha256_chain: 'ea14aaaaaaaac436',
        description: 'Signed in on a development server: second factor skipped',
        actor_name: 'JM Smith', actor_email: 'jm.smith@concept2cure.pro', target_name: 'JM Smith', target_email: 'jm.smith@concept2cure.pro',
      },
    ],
  }),
  // An org that stored mfaEnabled:false. Sign-in never reads it, so the
  // console must not report "Optional" either.
  org: () => ({ rows: [{ name: 'Concept2Cure Therapeutics', domain: null, settings: { security: { mfaEnabled: false } } }] }),
  scim: () => ({ rows: [] }),
};

function dispatch(over: Partial<typeof base> = {}) {
  const h = { ...base, ...over };
  queryMock.mockImplementation(async (sql: string) => {
    if (/FROM organization_users/.test(sql)) return h.members();
    if (/FROM api_keys/.test(sql)) return h.apiKeys();
    if (/FROM audit_logs/.test(sql)) return h.audit();
    if (/FROM organizations/.test(sql)) return h.org();
    if (/FROM scim_tenants/.test(sql)) return h.scim();
    return { rows: [] };
  });
}

const settingsById = (body: any) =>
  Object.fromEntries((body.data.settings as any[]).map((s) => [s.id, s]));

const ENV_KEYS = ['NODE_ENV', 'ALLOW_DEV_AUTH'] as const;
let savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  queryMock.mockReset();
  savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));
});
afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe('second factor — the row says what sign-in enforces', () => {
  it('reports the challenge as required, whatever settings.security.mfaEnabled holds', async () => {
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOW_DEV_AUTH;
    dispatch();
    const res = await request(app).get('/api/mdx/admin');
    expect(res.status).toBe(200);
    const row = settingsById(res.body)['mfa-required'];
    expect(row.value).toBe('Required for every member');
    expect(row.kind).toBe('policy'); // not offered as a toggle: no org setting changes it
    expect(res.body.data.sso.mfaRequired).toBe(true);
  });

  it('says the second factor is skipped on a development server with dev auth on', async () => {
    process.env.NODE_ENV = 'development';
    process.env.ALLOW_DEV_AUTH = '1';
    dispatch({ org: () => ({ rows: [{ name: 'Concept2Cure Therapeutics', domain: null, settings: {} }] }) });
    const res = await request(app).get('/api/mdx/admin');
    const row = settingsById(res.body)['mfa-required'];
    expect(row.value).toBe('Skipped on this development server');
    expect(JSON.stringify(res.body.data.settings)).not.toContain('Yes (all roles)');
    expect(res.body.data.sso.mfaRequired).toBe(false);
  });

  it('counts an authenticator only when sign-in would ask for one', async () => {
    dispatch();
    const res = await request(app).get('/api/mdx/admin');
    const members = res.body.data.members as any[];
    expect(members.find((m) => m.name === 'JM Smith').mfa).toBe(false); // mfa_method 'email'
    expect(members.find((m) => m.name === 'Riley Reg').mfa).toBe(true);
    const kpi = (res.body.data.kpis as any[]).find((k) => /authenticator/i.test(k.label));
    expect(kpi).toMatchObject({ metric: '1', meta: 'of 2 members enrolled' });
  });
});

describe('a failed facet read is reported, not rendered as empty', () => {
  it('names a failed api_keys read in meta.unavailable', async () => {
    dispatch({ apiKeys: fault('42501') });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.status).toBe(200);
    expect(res.body.meta.unavailable).toEqual(['apiKeys']);
    const kpi = (res.body.data.kpis as any[]).find((k) => k.label === 'API keys');
    expect(kpi).toMatchObject({ metric: '--', meta: 'could not be read' });
    expect(res.body.data.members).toHaveLength(2); // the rest still render
  });

  it('names a failed audit read', async () => {
    dispatch({ audit: fault() });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.body.meta.unavailable).toEqual(['audit']);
  });

  it('withholds settings and SSO derived from a failed organizations read', async () => {
    dispatch({ org: fault('57014') });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.body.meta.unavailable).toEqual(['settings', 'sso']);
    expect(res.body.data.sso).toBeNull();
    // No "Single sign-on: Disabled" reported for an org that was never read.
    expect(settingsById(res.body).sso).toBeUndefined();
  });

  it('withholds SSO when scim_tenants could not be read', async () => {
    dispatch({ scim: fault() });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.body.meta.unavailable).toEqual(['sso']);
    expect(res.body.data.sso).toBeNull();
  });

  it('keeps a missing table (42P01) an honest empty — nothing is unavailable', async () => {
    dispatch({ apiKeys: fault('42P01'), scim: fault('42P01') });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.body.meta.unavailable).toEqual([]);
    expect(res.body.data.apiKeys).toEqual([]);
    expect(res.body.data.sso).not.toBeNull();
  });
});

describe('audit rows name people and events, not ids', () => {
  it('uses the recorded description, the account name and the named target', async () => {
    dispatch();
    const res = await request(app).get('/api/mdx/admin');
    const [row] = res.body.data.audit as any[];
    expect(row).toMatchObject({
      actor: 'JM Smith',
      action: 'Signed in on a development server: second factor skipped',
      target: 'JM Smith',
    });
    // The full row id (the surface's key), not a 12-character cut of it.
    expect(row.id).toBe('322439ff-0b2a-4ad5-9d6e-1f0c2b7e9a11');
    expect(JSON.stringify(res.body.data.audit)).not.toMatch(/u-1|user_login|user · 1/);
  });

  it('humanizes an action with no recorded description', async () => {
    dispatch({
      audit: () => ({
        rows: [{ ...base.audit().rows[0] as object, description: null, action: 'user_logout' }],
      }),
    });
    const res = await request(app).get('/api/mdx/admin');
    expect(res.body.data.audit[0].action).toBe('User Logout');
  });
});
