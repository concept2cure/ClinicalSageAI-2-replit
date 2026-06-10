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

const { ORG_A, TARGET_ORG, queries, authState } = vi.hoisted(() => ({
  ORG_A: 7,
  TARGET_ORG: 999,
  queries: [] as Array<{ text: string; values: any[] }>,
  authState: { user: null as any },
}));

// Mock the postgres tagged-template client used by the router.
vi.mock('postgres', () => ({
  default: () => {
    const sql = (strings: TemplateStringsArray, ...values: any[]) => {
      queries.push({ text: strings.join(' ? '), values });
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
    authState.user = { id: 1, organizationId: ORG_A, role: 'admin', roles: ['admin'] };
    const res = await request(app).get('/api/tenants');
    expect(res.status).toBe(200);
    const q = dataQueries().find(q => /from organizations/i.test(q.text));
    expect(q!.text).not.toMatch(/organization_users/i);
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

describe('Tenants — auth', () => {
  it('401s without a token', async () => {
    authState.user = null;
    await request(app).get('/api/tenants').expect(401);
    await request(app).get(`/api/tenants/${ORG_A}/users`).expect(401);
    expect(dataQueries()).toHaveLength(0);
  });
});
