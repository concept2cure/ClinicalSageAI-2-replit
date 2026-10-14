/** W1 / D2: reviewed discovery uses the existing governed organization settings writer. */
import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { runWithTenantScope } from '../../db/tenantStore';
import { emptyDiscovery } from '../../../shared/types/onboarding-discovery';

const logActionMock = vi.fn(async (..._a: any[]) => ({
  persisted: true,
  chained: true,
  tamperProof: true,
}));

// Minimal Drizzle-shaped chainables — model only what these handlers call.
type Row = Record<string, unknown>;
let nextSelectRows: Row[] = [];
let nextUpdateRows: Row[] = [];
const lastUpdate: { values?: Row } = {};

/** What one select asked for: its projection, its table, whether it was filtered. */
type SelectCtx = { fields: Record<string, unknown> | undefined; table: string | undefined; filtered: boolean };
// D6 (2026-10-05): GET /api/organizations reads three different selects
// (every org / the caller's memberships / the member counts). A test that must
// tell the all-organizations list from the caller's own may route each select
// by its shape; null (the default) keeps every other test's one-answer
// behaviour (nextSelectRows).
let selectImpl: ((ctx: SelectCtx) => Row[]) | null = null;

function chainableSelect(fields?: Record<string, unknown>) {
  const ctx: SelectCtx = { fields, table: undefined, filtered: false };
  const ret: any = {};
  ret.from = (table: any) => {
    ctx.table = table?._?.name;
    return ret;
  };
  ret.leftJoin = () => ret;
  ret.where = () => {
    ctx.filtered = true;
    return ret;
  };
  ret.limit = () => ret;
  ret.then = (resolve: (v: Row[]) => unknown) =>
    Promise.resolve(resolve(selectImpl ? selectImpl(ctx) : nextSelectRows));
  return ret;
}

function chainableUpdate() {
  const ret: any = {};
  ret.set = (v: Row) => {
    lastUpdate.values = v;
    return ret;
  };
  ret.where = () => ret;
  ret.returning = () => Promise.resolve(nextUpdateRows);
  ret.then = (resolve: (v: Row[]) => unknown) => Promise.resolve(resolve(nextUpdateRows));
  return ret;
}

const dbMock = {
  select: (fields?: Record<string, unknown>) => chainableSelect(fields),
  update: () => chainableUpdate(),
};

// D6, 2026-10-05 (docs/evidence/D6/2026-10-05-cross-tenant-staff/): platform
// staff is decided by holdsPlatformRole, which reads platform_role_grants
// through ../db's `query`, never by the request (membership) role. The REAL
// decision runs; only the table is faked: a row is answered when params[0] is
// a user in `grants` holding one of the roles asked (params[1]).
const grants = new Map<number, string[]>();
const queryMock = vi.fn(async (sql: string, params?: unknown[]) => {
  if (/FROM platform_role_grants/.test(sql) && Array.isArray(params)) {
    const held = grants.get(Number(params[0])) ?? [];
    const asked = Array.isArray(params[1]) ? (params[1] as string[]) : [];
    return { rows: held.some(role => asked.includes(role)) ? [{ '?column?': 1 }] : [] };
  }
  return { rows: [] };
});

vi.mock('../../db', () => ({ db: dbMock, query: (sql: string, params?: unknown[]) => queryMock(sql, params) }));

// Keep the schema import light — the chainables never inspect the tables.
vi.mock('@shared/schema', () => {
  const fakeTable = (name: string) => ({ _: { name } });
  return {
    organizations: Object.assign(fakeTable('organizations'), {
      id: 'id',
      name: 'name',
      clientType: 'client_type',
      industryMode: 'industry_mode',
      updatedAt: 'updated_at',
    }),
    organizationUsers: fakeTable('organization_users'),
    clientWorkspaces: fakeTable('client_workspaces'),
  };
});

vi.mock('../../services/auditService', () => ({
  default: { logAction: (...args: unknown[]) => logActionMock(...args) },
}));

// The one settings writer (DP-73): its transaction and chained row are proven
// on PostgreSQL in tests/db/organizations-writes.dbtest.ts. Here: what the
// route asks of it, and how the route answers what it returns.
const writerMock = vi.fn();
vi.mock('../../services/tenant/tenant-settings-writer', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/tenant/tenant-settings-writer')>()),
  writeTenantSettings: (...a: unknown[]) => writerMock(...a),
}));

// authMiddleware stub — reads a JSON user from the x-test-user header.
vi.mock('../../auth', () => ({
  authMiddleware: (req: any, _res: any, next: any) => {
    const hdr = req.headers['x-test-user'];
    if (hdr) {
      const u = JSON.parse(hdr);
      req.user = u;
      req.userRole = u.role;
      req.userId = u.id;
      // As the real authMiddleware does: the request runs in the caller's own
      // tenant scope, which staffCrossOrgScope compares the target with.
      return runWithTenantScope(
        { tenantId: String(u.organizationId), role: u.role, source: 'request', caller: 'test' },
        () => next()
      );
    }
    next();
  },
}));

// The system scope itself needs a real pool; it is proven end to end in
// tests/db/organizations-writes.dbtest.ts. Here: WHEN the router asks for it.
const systemScopeMock = vi.fn((_req: any, _res: any, next: any) => next());
vi.mock('../../middleware/establishRequestTenantScope', () => ({
  establishRequestSystemScope: (...a: any[]) => (systemScopeMock as any)(...a),
}));

// Imported dynamically after module scope initializes — a static import would
// hoist above the mock factories' captured locals (dbMock) and crash.
let app: express.Express;
beforeAll(async () => {
  const router = (await import('../organizations-routes')).default;
  app = express();
  app.use(express.json());
  app.use('/api/organizations', router);
});

function makeApp() {
  return app;
}

const ORG7_ADMIN = JSON.stringify({ id: 1, role: 'admin', organizationId: 7 });
const ORG7_MEMBER = JSON.stringify({ id: 2, role: 'member', organizationId: 7 });
const ORG9_ADMIN = JSON.stringify({ id: 3, role: 'admin', organizationId: 9 });
// Platform staff: user 4 holds an active super_admin platform_role_grants row
// (beforeEach), which is what makes it staff (D6, 2026-10-05). Its membership
// role is left as it was and decides nothing; the D6 describe below proves a
// membership role alone opens nothing.
const PLATFORM = JSON.stringify({ id: 4, role: 'super_admin', organizationId: 1 });

beforeEach(() => {
  logActionMock.mockReset();
  systemScopeMock.mockClear();
  writerMock.mockReset();
  queryMock.mockClear();
  grants.clear();
  grants.set(4, ['super_admin']);
  selectImpl = null;
  nextSelectRows = [];
  nextUpdateRows = [];
  lastUpdate.values = undefined;
});

describe('reviewed discovery answers use the governed organization settings door', () => {
  const answers = () => {
    const discovery = emptyDiscovery();
    discovery.company.goals = 'Prepare the first regulated program';
    discovery.company.useCases = ['projects', 'authoring'];
    discovery.project.productType = 'drug';
    discovery.setup.needs = ['mfa', 'review_roles'];
    return discovery;
  };
  const body = () => ({ settings: { onboardingDiscovery: answers() }, reason: 'Reviewed discovery with the setup author' });

  it.each([ORG7_MEMBER, ORG9_ADMIN, JSON.stringify({ id: 21, role: 'super_admin', organizationId: 9 })])('keeps the membership and tenant boundaries for %s', async (user) => {
    const res = await request(makeApp()).patch('/api/organizations/7/settings').set('x-test-user', user).send(body());
    expect(res.status).toBe(403);
    expect(writerMock).not.toHaveBeenCalled();
    expect(systemScopeMock).not.toHaveBeenCalled();
  });

  it('allows verified platform staff through the existing system scope', async () => {
    writerMock.mockImplementation(async (_req: unknown, _id: number, change: any) => change.next({}, 'standard'));
    const res = await request(makeApp()).patch('/api/organizations/7/settings').set('x-test-user', PLATFORM).send(body());
    expect(res.status).toBe(200);
    expect(systemScopeMock).toHaveBeenCalledTimes(1);
    expect(writerMock.mock.calls[0][1]).toBe(7);
  });

  it.each([
    () => ({ onboardingDiscovery: answers() }),
    () => ({ settings: { onboardingDiscovery: answers() } }),
    () => ({ ...body(), reason: '  ' }),
    () => ({ ...body(), reason: 'x'.repeat(501) }),
  ])('requires a bounded human reason and the governed body %#', async (makeBody) => {
    const res = await request(makeApp()).patch('/api/organizations/7/settings').set('x-test-user', ORG7_ADMIN).send(makeBody());
    expect(res.status).toBe(400);
    expect(writerMock).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { schemaVersion: 1 },
    { ...answers(), schemaVersion: 2 },
    { ...answers(), user: { ...answers().user, role: 'admin' } },
    { ...answers(), company: { ...answers().company, goals: 'x'.repeat(1001) } },
    { ...answers(), company: { ...answers().company, markets: Array.from({ length: 13 }, (_, i) => `Market ${i}`) } },
    { ...answers(), project: { ...answers().project, targetDate: '2026-02-30' } },
    { ...answers(), project: { ...answers().project, predicateDevice: 'A device comparator' } },
  ])('refuses an invalid discovery snapshot and changes no other section %#', async (onboardingDiscovery) => {
    writerMock.mockImplementation(async (_req: unknown, _id: number, change: any) => change.next({}, 'standard'));
    const res = await request(makeApp()).patch('/api/organizations/7/settings').set('x-test-user', ORG7_ADMIN).send({
      settings: { onboardingDiscovery, branding: { primaryColor: '#123456' } }, reason: 'Reviewed client context',
    });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Invalid onboarding discovery/);
    expect(writerMock).not.toHaveBeenCalled();
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('stores reviewed answers, preserves other settings, and grants or enforces nothing', async () => {
    const before = {
      security: { maxConcurrentSessions: 3, sessionTimeoutMinutes: 45 },
      anaToolPolicy: { deny: ['example_tool'] },
      onboardingDiscovery: { schemaVersion: 0, obsolete: 'an unvalidated field' },
    };
    writerMock.mockImplementation(async (_req: unknown, _id: number, change: any) => change.next(before, 'standard'));
    const res = await request(makeApp()).patch('/api/organizations/7/settings').set('x-test-user', ORG7_ADMIN).send(body());
    expect(res.status).toBe(200);
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
    expect(res.body.settings.onboardingDiscovery).toEqual(answers());
    expect(writerMock).toHaveBeenCalledTimes(1);
    const [, orgId, change] = writerMock.mock.calls[0];
    expect(orgId).toBe(7);
    expect(change.action).toBe('tenant_settings_changed');
    expect(change.reason).toBe(body().reason);
    const after = change.next(before, 'standard');
    expect(after.onboardingDiscovery).toEqual(answers());
    expect(after.security).toEqual(before.security);
    expect(after.anaToolPolicy).toEqual(before.anaToolPolicy);
    expect(change.sections(before, after)).toEqual(['onboardingDiscovery']);
    expect(lastUpdate.values).toBeUndefined();
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('returns a refused audit transaction as failure without claiming discovery saved', async () => {
    writerMock.mockRejectedValue(new Error('chained audit unavailable'));
    const res = await request(makeApp()).patch('/api/organizations/7/settings').set('x-test-user', ORG7_ADMIN).send(body());
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Nothing was changed/);
    expect(res.body.auditTrail).toBeUndefined();
  });
});
