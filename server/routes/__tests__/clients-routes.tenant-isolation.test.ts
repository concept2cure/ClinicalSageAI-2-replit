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
    // server/auth.ts also sets req.userRole: the TENANT membership role.
    req.userRole = role || 'user';
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

// Predicates the select double can read. Added 2026-10-05 (D6,
// docs/evidence/D6/2026-10-05-cross-tenant-staff/): the double used to return the
// staged rows whatever the WHERE said, so "may this caller read a foreign
// workspace" passed whether or not the tenant guard put the org filter in. `eq`
// and `and` now build inspectable predicates and a select keeps only the staged
// rows its WHERE admits (a predicate it does not model, such as a column-to-column
// join, admits every row).
type Pred = { op: 'eq'; col: { name?: string; table?: string }; value: unknown } | { op: 'and'; preds: Pred[] };
vi.mock('drizzle-orm', async (importOriginal) => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  eq: (col: unknown, value: unknown) => ({ op: 'eq', col, value }),
  and: (...preds: unknown[]) => ({ op: 'and', preds: preds.filter(Boolean) }),
}));
function admits(row: Record<string, unknown>, pred: unknown): boolean {
  const p = pred as Pred | undefined;
  if (!p || typeof p !== 'object' || !('op' in p)) return true;
  if (p.op === 'and') return p.preds.every((q) => admits(row, q));
  const isColumn = (v: unknown) => !!v && typeof v === 'object' && 'table' in (v as object);
  if (!isColumn(p.col) || isColumn(p.value) || !p.col.name) return true;
  return row[p.col.name] === p.value;
}

// Platform standing (requirePlatformAdmin.ts holdsPlatformRole) is an active
// platform_role_grants row read through `query` from server/db; never the request
// role. Added 2026-10-05 (D6). `grants` maps a user id to the platform role its
// grant row names; nobody holds one by default.
const grants = new Map<number, string>();
const grantQuery = vi.fn(async (sql: string, params: unknown[] = []) => {
  const granted = grants.get(Number(params[0]));
  const asked = Array.isArray(params[1]) ? (params[1] as string[]) : [];
  return { rows: /FROM platform_role_grants/.test(sql) && granted && asked.includes(granted) ? [{ '?column?': 1 }] : [] };
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
  let where: unknown;
  const rows = () => nextSelectRows.filter((row) => admits(row, where));
  ret.from = () => ret;
  ret.leftJoin = () => ret;
  ret.where = (pred: unknown) => {
    where = pred;
    return ret;
  };
  ret.limit = () => ret;
  ret.then = (resolve: (v: Row[]) => unknown) => resolve(rows());
  ret[Symbol.iterator] = function* () {
    yield* rows();
  };
  // Top-level await on the chain returns the rows array.
  Object.setPrototypeOf(ret, {
    then: (r: any) => r(rows()),
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

vi.mock('../../db', () => ({ db: dbMock, query: grantQuery }));

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
  grants.clear();
  grantQuery.mockClear();
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
    // A writing role: DELETE is role-gated first (PF-08), and this case is the tenant guard's.
    const token = tokenFor(1, 7, 'admin');
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
  const foreign = () => [{ id: 42, name: 'Foreign workspace', organizationId: 999 }];

  it('the double honours the guard: a member of the owning org reads its own workspace (200)', async () => {
    nextSelectRows = [{ id: 42, name: 'Own workspace', organizationId: 7 }];
    const res = await request(app).get('/api/clients/42').set('Authorization', tokenFor(1, 7));
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({ id: '42', organizationId: '7' });
  });

  // Inverted 2026-10-05 (D6): the request role is the tenant membership role; standing is a platform grant — docs/evidence/D6/2026-10-05-cross-tenant-staff/
  it('super_admin as a request role alone, with no platform grant, cannot fetch a workspace of another org (404)', async () => {
    nextSelectRows = foreign();
    const token = tokenFor(1, 7, 'super_admin');
    const res = await request(app).get('/api/clients/42').set('Authorization', token);
    expect(res.status).toBe(404);
  });

  it('a membership role of super_admin with no platform grant cannot load another org\'s workspace on any /:id route (404, nothing written)', async () => {
    const token = tokenFor(1, 7, 'super_admin');
    for (const url of ['/api/clients/42', '/api/clients/42/security-settings', '/api/clients/42/settings']) {
      nextSelectRows = foreign();
      const res = await request(app).get(url).set('Authorization', token);
      expect(res.status, url).toBe(404);
      expect(res.body).toEqual({ success: false, error: 'Client workspace not found' });
    }
    nextSelectRows = foreign();
    const patch = await request(app).patch('/api/clients/42').set('Authorization', token).send({ name: 'Hijacked' });
    expect(patch.status).toBe(404);
    expect(lastUpdateCall.values).toBeUndefined();
    // The decision was the platform grant lookup, for this user, for super_admin.
    expect(grantQuery).toHaveBeenCalledWith(expect.stringMatching(/FROM platform_role_grants/), [1, ['super_admin']]);
  });

  it('a super_admin platform grant holder (membership role user) loads another org\'s workspace (200)', async () => {
    grants.set(5, 'super_admin');
    nextSelectRows = foreign();
    const res = await request(app).get('/api/clients/42').set('Authorization', tokenFor(5, 7, 'user'));
    expect(res.status).toBe(200);
    expect(res.body.client).toMatchObject({ id: '42', organizationId: '999' });
  });

  it('a super_admin platform grant holder needs no tenant context of their own (200)', async () => {
    grants.set(5, 'super_admin');
    nextSelectRows = foreign();
    const res = await request(app).get('/api/clients/42').set('Authorization', tokenFor(5));
    expect(res.status).toBe(200);
  });

  it.each(['platform_admin', 'support'])('a %s platform grant is not super_admin standing for workspaces (404)', async (granted) => {
    grants.set(6, granted);
    nextSelectRows = foreign();
    const res = await request(app).get('/api/clients/42').set('Authorization', tokenFor(6, 7, 'user'));
    expect(res.status).toBe(404);
  });
});
