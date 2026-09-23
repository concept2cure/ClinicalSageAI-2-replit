/**
 * Tenant-isolation contract test — Tenants (simple) management family.
 *
 * server/routes/tenants-simple.ts mounts /api/tenants with authentication but
 * originally no authorization: any authenticated user could list every
 * organization, read any tenant's user directory, and create/delete tenants or
 * rotate API keys. Reads are now membership-scoped (admins see all), and
 * mutations require a platform-admin role.
 *
 * Uses the real requireRole; authMiddleware and the postgres client are mocked.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://u:p@localhost:5432/test';
});

import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';

const { ORG_A, TARGET_ORG, CREATED_ORG, queries, authState, provisionLaunchModules } = vi.hoisted(() => ({
  ORG_A: 7,
  TARGET_ORG: 999,
  CREATED_ORG: 4242,
  provisionLaunchModules: vi.fn(async () => ({ granted: [], failed: [] })),
  queries: [] as Array<{ text: string; values: any[] }>,
  authState: { user: null as any },
}));

// Mock the postgres tagged-template client used by the router.
vi.mock('postgres', () => ({
  default: () => {
    const sql = (strings: TemplateStringsArray, ...values: any[]) => {
      const text = strings.join(' ? ');
      queries.push({ text, values });
      // A created tenant comes back from INSERT ... RETURNING, so the
      // provisioning step below has an id to act on.
      if (/INSERT INTO organizations/i.test(text)) {
        return Promise.resolve([{ id: CREATED_ORG, name: values[0], slug: values[1] }] as any[]);
      }
      return Promise.resolve([] as any[]);
    };
    return sql;
  },
}));

// Mock authentication only — the real requireRole runs against req.user.
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, res: Response, next: NextFunction) => {
    if (!authState.user) return res.status(401).json({ error: 'unauthorized' });
    (req as any).user = authState.user;
    next();
  },
}));

// The launch catalog is provisioned for every new tenant (D2). Its real SQL runs
// under this route's system scope in tests/db/signup-launch-catalog.dbtest.ts;
// here the contract is only that the route asks for it, for the right tenant.
vi.mock('../../services/entitlements/launch-scope.js', () => ({ provisionLaunchModules }));
// Admission refuses multi-tenancy while RLS is not filtering; that posture is
// its own test's concern, not this one's.
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: async () => undefined }));

let app: express.Express;

beforeEach(async () => {
  vi.clearAllMocks();
  queries.length = 0;
  authState.user = { id: 1, organizationId: ORG_A, role: 'user', roles: ['user'] };
  const router = (await import('../../routes/tenants-simple')).default;
  app = express();
  app.use(express.json());
  app.use('/api/tenants', router);
});

const dataQueries = () => queries.filter(q => /select|insert|update|delete/i.test(q.text));

describe('Tenant list — membership scoping', () => {
  it('a non-admin only gets their own orgs (query joins organization_users)', async () => {
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(200);
    const q = dataQueries().find(q => /from organizations/i.test(q.text));
    expect(q, 'a list query should run').toBeTruthy();
    expect(q!.text).toMatch(/organization_users/i);
    expect(q!.values).toContain(1); // bound to the caller's user id (req.user.id = 1)
  });

  it('a platform admin gets the full list (no membership join)', async () => {
    authState.user = { id: 1, organizationId: ORG_A, role: 'super_admin', roles: ['super_admin'] };
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(200);
    const q = dataQueries().find(q => /from organizations/i.test(q.text));
    expect(q!.text).not.toMatch(/organization_users/i);
  });

  it('an ORG admin does NOT get the cross-tenant list — only their own orgs', async () => {
    // Regression guard: an org-scoped `admin` is NOT a platform operator. The
    // read path must use the strict isPlatformAdmin (super_admin/platform_admin/
    // support only), so a tenant admin is membership-scoped exactly like a member
    // — never handed the full customer directory (GET /api/tenants leak).
    authState.user = { id: 1, organizationId: ORG_A, role: 'admin', roles: ['admin'] };
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(200);
    const q = dataQueries().find(q => /from organizations/i.test(q.text));
    expect(q, 'a list query should run').toBeTruthy();
    expect(q!.text).toMatch(/organization_users/i); // membership-scoped, not the full list
    expect(q!.values).toContain(1); // bound to the caller's own user id
  });
});

describe('Tenant users — scoping', () => {
  it('a non-admin cannot read another tenant directory (no query runs)', async () => {
    const res = await request(app).get(`/api/tenants/${TARGET_ORG}/users`);
    expect(res.status).toBe(403);
    expect(dataQueries()).toHaveLength(0);
  });

  it('a non-admin can read their own tenant directory', async () => {
    const res = await request(app).get(`/api/tenants/${ORG_A}/users`);
    expect(res.status).toBe(200);
    expect(dataQueries().some(q => /organization_users/i.test(q.text))).toBe(true);
  });

  it('a platform admin can read any tenant directory', async () => {
    authState.user = { id: 1, organizationId: ORG_A, role: 'super_admin', roles: ['super_admin'] };
    const res = await request(app).get(`/api/tenants/${TARGET_ORG}/users`);
    expect(res.status).toBe(200);
  });
});

describe('Tenant mutations — admin only', () => {
  it('a non-admin cannot create a tenant', async () => {
    const res = await request(app)
      .post('/api/tenants')
      .send({ name: 'Acme Corp', slug: 'acme' });
    expect(res.status).toBe(403);
    expect(dataQueries()).toHaveLength(0);
  });

  it('a non-admin cannot delete a tenant or rotate an API key', async () => {
    await request(app).delete('/api/tenants/5').expect(403);
    await request(app).post('/api/tenants/5/api-key').expect(403);
    expect(dataQueries()).toHaveLength(0);
  });
});

describe('Tenant creation — the launch catalog comes with it (D2)', () => {
  it('a platform admin creating a tenant provisions the launch catalog for THAT tenant', async () => {
    authState.user = { id: 1, organizationId: ORG_A, role: 'super_admin', roles: ['super_admin'] };
    const res = await request(app).post('/api/tenants').send({ name: 'Acme Corp', slug: 'acme' });
    expect(res.status).toBe(201);
    // Until 2026-09-22 this path created a tenant with no launch grants at all.
    expect(provisionLaunchModules).toHaveBeenCalledTimes(1);
    expect(provisionLaunchModules).toHaveBeenCalledWith(CREATED_ORG, { actorEmail: null });
  });

  it('a refused creation provisions nothing', async () => {
    await request(app).post('/api/tenants').send({ name: 'Acme Corp', slug: 'acme' }).expect(403);
    expect(provisionLaunchModules).not.toHaveBeenCalled();
  });
});

describe('Tenants — auth', () => {
  it('401s without a token', async () => {
    authState.user = null;
    await request(app).get('/api/tenants').expect(401);
    await request(app).get(`/api/tenants/${ORG_A}/users`).expect(401);
    expect(dataQueries()).toHaveLength(0);
  });
});
