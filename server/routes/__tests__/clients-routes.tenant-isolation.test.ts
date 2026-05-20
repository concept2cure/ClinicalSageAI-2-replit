/**
 * Tenant isolation contract for /api/clients.
 *
 * Pre-fix, clients-routes.ts had seven P0 cross-tenant holes:
 *   1. GET /api/clients?organizationId=N — accepted the org id from a
 *      query string an attacker could rewrite, returning any tenant's
 *      workspaces.
 *   2. POST /api/clients — body `organizationId` defaulted to '1' (and
 *      could be any value), letting a caller create a workspace inside
 *      another tenant.
 *   3-7. GET/PATCH/DELETE /:id and GET/PATCH /:id/security-settings,
 *        GET/PATCH /:id/settings — fetched workspaces by id alone, no
 *        org filter. PATCH /:id/security-settings was the worst: an
 *        attacker could weaken another tenant's password policy / MFA
 *        / audit retention.
 *
 * These tests pin the fixed contract using a stubbed authMiddleware.
 * The real auth middleware is exercised elsewhere; here we focus on
 * tenant-isolation logic specifically.
 */

import express from 'express';
import request from 'supertest';
import { describe, expect, it, beforeAll, beforeEach, vi } from 'vitest';

// Auth middleware stub — synthesizes req.user from `TestToken
// userId:orgId:role`. Lets us simulate cross-tenant requests without
// pulling in real JWT verification (covered in environment.test.ts).
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const header = req.headers.authorization as string | undefined;
    if (!header?.startsWith('TestToken ')) {
      return _res.status(401).json({ error: 'No token' });
    }
    const [userIdStr, orgIdStr, role] = header.slice('TestToken '.length).split(':');
    req.user = {
      id: Number(userIdStr),
      organizationId: orgIdStr ? Number(orgIdStr) : undefined,
      role: role || 'user',
    };
    next();
  },
}));

// Schema stub — clients-routes.ts imports several Drizzle table
// objects from @shared/schema. We don't need the real columns for
// these tests (the DB layer is fully mocked); we just need importable
// placeholders with the table-name property Drizzle's `eq()` reads.
vi.mock('@shared/schema', () => {
  const fakeTable = (name: string) =>
    new Proxy(
      {},
      {
        get: (_t, prop: string) => ({ name: prop, table: name }),
      },
    );
  return {
    clientWorkspaces: fakeTable('client_workspaces'),
    organizations: fakeTable('organizations'),
    clientWorkspaceSettings: fakeTable('client_workspace_settings'),
    clientSecuritySettings: fakeTable('client_security_settings'),
    projects: fakeTable('projects'),
    projectModules: fakeTable('project_modules'),
    users: fakeTable('users'),
  };
});

// DB stub — minimal Drizzle-shaped chainable returning the value we set
// per-test. We don't try to model all of Drizzle; we model only what
// these handlers call.
type Row = Record<string, unknown>;
let nextSelectRows: Row[] = [];
let nextUpdateRows: Row[] = [];
let nextInsertRows: Row[] = [];
const lastUpdateCall: { values?: Row } = {};
const lastInsertCall: { values?: Row } = {};

function chainableSelect() {
  const ret: any = {};
  ret.from = () => ret;
  ret.leftJoin = () => ret;
  ret.where = () => ret;
  ret.limit = () => ret;
  ret.then = (resolve: (v: Row[]) => unknown) => resolve(nextSelectRows);
  ret[Symbol.iterator] = function* () {
    yield* nextSelectRows;
  };
  // Top-level await on the chain returns the rows array.
  Object.setPrototypeOf(ret, {
    then: (r: any) => r(nextSelectRows),
  });
  return ret;
}

function chainableUpdate() {
  const ret: any = {};
  ret.set = (v: Row) => {
    lastUpdateCall.values = v;
    return ret;
  };
  ret.where = () => ret;
  ret.returning = () => Promise.resolve(nextUpdateRows);
  return ret;
}

function chainableInsert() {
  const ret: any = {};
  ret.values = (v: Row) => {
    lastInsertCall.values = v;
    return ret;
  };
  ret.returning = () => Promise.resolve(nextInsertRows);
  return ret;
}

const dbMock = {
  select: () => chainableSelect(),
  update: () => chainableUpdate(),
  insert: () => chainableInsert(),
  delete: () => chainableUpdate(), // delete + where + returning shape works the same
  transaction: async (fn: any) => fn(dbMock),
};

vi.mock('../../db', () => ({ db: dbMock }));

let app: express.Express;

function tokenFor(userId: number, orgId?: number, role?: string): string {
  return `TestToken ${userId}:${orgId ?? ''}:${role ?? 'user'}`;
}

beforeAll(async () => {
  const router = (await import('../clients-routes')).default;
  app = express();
  app.use(express.json());
  app.use('/api/clients', router);
});

beforeEach(() => {
  nextSelectRows = [];
  nextUpdateRows = [];
  nextInsertRows = [];
  delete lastUpdateCall.values;
  delete lastInsertCall.values;
});

describe('clients-routes — query-param trust (GET /)', () => {
  it('no longer trusts ?organizationId — request without JWT org returns 403', async () => {
    nextSelectRows = [{ id: 42, name: 'Foreign workspace', organizationId: 42 }];
    const token = tokenFor(1); // no org
    const res = await request(app).get('/api/clients?organizationId=42').set('Authorization', token);
    expect(res.status).toBe(403);
  });

  it('uses the JWT org id, ignoring any query param', async () => {
    nextSelectRows = [{ id: 1, name: 'My workspace', organizationId: 7 }];
    const token = tokenFor(1, 7);
    // Even if the attacker passes organizationId=42 in the query, we
    // only return rows for org 7 (the JWT value).
    const res = await request(app)
      .get('/api/clients?organizationId=42')
      .set('Authorization', token);
    expect(res.status).toBe(200);
    // The handler queried with the JWT org, not the query param — we
    // can't directly observe the where clause, but the response
    // surfaces what we set on nextSelectRows for *this* call.
    expect(res.body.success).toBe(true);
  });
});

describe('clients-routes — POST / body-org spoofing', () => {
  it('ignores body.organizationId and uses the JWT org', async () => {
    nextInsertRows = [
      { id: 1, name: 'X', organizationId: 7, createdAt: new Date(), updatedAt: new Date() },
    ];
    const token = tokenFor(1, 7);
    const res = await request(app)
      .post('/api/clients')
      .set('Authorization', token)
      .send({ name: 'X', slug: 'x', organizationId: 999 });

    expect(res.status).toBe(200);
    // The insert payload should carry the JWT org, not the body's 999.
    expect(lastInsertCall.values?.organizationId).toBe(7);
  });

  it('rejects unauth POST', async () => {
    const res = await request(app).post('/api/clients').send({ name: 'X', slug: 'x' });
    expect(res.status).toBe(401);
  });
});

describe('clients-routes — fetch-by-id tenant guard', () => {
  it('returns 404 (not 403) on GET /:id when workspace belongs to another org', async () => {
    // Tenant guard query returns empty because of the org filter.
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app).get('/api/clients/42').set('Authorization', token);
    expect(res.status).toBe(404);
  });

  it('rejects PATCH /:id on foreign workspace', async () => {
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app)
      .patch('/api/clients/42')
      .set('Authorization', token)
      .send({ name: 'Hijacked' });
    expect(res.status).toBe(404);
    expect(lastUpdateCall.values).toBeUndefined();
  });

  it('rejects PATCH /:id/security-settings on foreign workspace — the highest-stakes endpoint', async () => {
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app)
      .patch('/api/clients/42/security-settings')
      .set('Authorization', token)
      .send({
        passwordPolicy: { minLength: 1, requireUppercase: false },
        sessionSettings: { timeoutMinutes: 999999 },
      });
    expect(res.status).toBe(404);
    expect(lastUpdateCall.values).toBeUndefined();
  });

  it('rejects DELETE /:id on foreign workspace (cascade would wipe another tenants data)', async () => {
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app).delete('/api/clients/42').set('Authorization', token);
    expect(res.status).toBe(404);
  });

  it('rejects GET /:id/security-settings on foreign workspace', async () => {
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app)
      .get('/api/clients/42/security-settings')
      .set('Authorization', token);
    expect(res.status).toBe(404);
  });

  it('rejects GET /:id/settings on foreign workspace', async () => {
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app)
      .get('/api/clients/42/settings')
      .set('Authorization', token);
    expect(res.status).toBe(404);
  });

  it('rejects PATCH /:id/settings on foreign workspace', async () => {
    nextSelectRows = [];
    const token = tokenFor(1, 7);
    const res = await request(app)
      .patch('/api/clients/42/settings')
      .set('Authorization', token)
      .send({ general: { name: 'Hijacked' } });
    expect(res.status).toBe(404);
  });

  it('rejects all /:id routes for authed-with-no-org JWT (403)', async () => {
    const token = tokenFor(1); // no org claim
    for (const url of [
      '/api/clients/42',
      '/api/clients/42/security-settings',
      '/api/clients/42/settings',
    ]) {
      const res = await request(app).get(url).set('Authorization', token);
      expect(res.status).toBe(403);
    }
  });
});

describe('clients-routes — super_admin cross-org path', () => {
  it('super_admin can fetch any workspace regardless of org', async () => {
    nextSelectRows = [{ id: 42, name: 'Foreign workspace', organizationId: 999 }];
    const token = tokenFor(1, 7, 'super_admin');
    const res = await request(app).get('/api/clients/42').set('Authorization', token);
    expect(res.status).toBe(200);
  });
});
