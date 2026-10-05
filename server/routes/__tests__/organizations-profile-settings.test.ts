/**
 * Governed org-profile + org-settings writes (organizations-routes.ts).
 *
 * These endpoints back the ui-v2 Setup / Onboarding surfaces:
 *   PATCH /api/organizations/:id/profile   — name/clientType/industryMode,
 *         org-admin gated, reason-for-change required, audited
 *   PATCH /api/organizations/:id/settings  — governed { settings, reason }
 *         form (legacy bare-partial body still accepted), org-admin gated,
 *         audited with section keys only (never setting values)
 *
 * The DB layer, audit service, and auth middleware are mocked so the tests
 * exercise the REAL router: tenant scoping (validateOrgOwnership), the
 * org-admin gate (requireOrgAdmin), request validation, and audit calls.
 */

import express from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeAll, beforeEach } from 'vitest';
import { runWithTenantScope } from '../../db/tenantStore';

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
const grantLookupsFor = (userId: number) =>
  queryMock.mock.calls.filter(([sql, params]) => /FROM platform_role_grants/.test(String(sql)) && Number((params as unknown[])?.[0]) === userId).length;

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

describe('PATCH /api/organizations/:id/profile', () => {
  const body = { name: 'Bright Bio', clientType: 'biotech', reason: 'Onboarding setup' };

  it('403s an admin of a DIFFERENT organization (tenant scoping)', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG9_ADMIN)
      .send(body);
    expect(res.status).toBe(403);
  });

  it('403s a non-admin member of the target org', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_MEMBER)
      .send(body);
    expect(res.status).toBe(403);
    expect(logActionMock).not.toHaveBeenCalled();
  });

  it('400s when the reason is missing', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send({ name: 'Bright Bio' });
    expect(res.status).toBe(400);
  });

  it('400s when no profile field is provided', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send({ reason: 'just because' });
    expect(res.status).toBe(400);
  });

  it('updates and audits for an org admin (reason recorded)', async () => {
    nextSelectRows = [{ name: 'Old Name', clientType: 'pharma', industryMode: null }];
    nextUpdateRows = [
      {
        id: 7,
        name: 'Bright Bio',
        clientType: 'biotech',
        industryMode: 'virtual_biotech',
        updatedAt: new Date(),
      },
    ];
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send({ ...body, industryMode: 'virtual_biotech' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.organization.name).toBe('Bright Bio');
    expect(logActionMock).toHaveBeenCalledTimes(1);
    const entry = logActionMock.mock.calls[0][0];
    expect(entry.tenantId).toBe(7);
    expect(entry.resourceType).toBe('organization');
    expect(entry.details.reason).toBe('Onboarding setup');
    expect(entry.details.before.name).toBe('Old Name');
  });

  it('allows platform staff into any org', async () => {
    nextSelectRows = [{ name: 'Old', clientType: 'pharma', industryMode: null }];
    nextUpdateRows = [
      {
        id: 7,
        name: 'Bright Bio',
        clientType: 'biotech',
        industryMode: null,
        updatedAt: new Date(),
      },
    ];
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', PLATFORM)
      .send(body);
    expect(res.status).toBe(200);
    // Staff (org 1) acting on org 7: the write must run in the system scope.
    expect(systemScopeMock).toHaveBeenCalledTimes(1);
  });

  it('404s when the organization does not exist', async () => {
    nextSelectRows = [];
    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send(body);
    expect(res.status).toBe(404);
  });
});

describe('platform staff acting on another organization', () => {
  const body = { name: 'Bright Bio', clientType: 'biotech', reason: 'Onboarding setup' };

  it('opens the system scope only for staff acting on ANOTHER org', async () => {
    nextSelectRows = [{ name: 'Old', clientType: 'pharma', industryMode: null }];
    nextUpdateRows = [
      {
        id: 1,
        name: 'Bright Bio',
        clientType: 'biotech',
        industryMode: null,
        updatedAt: new Date(),
      },
    ];
    await request(makeApp())
      .patch('/api/organizations/1/profile')
      .set('x-test-user', PLATFORM)
      .send(body);
    nextUpdateRows = [
      {
        id: 7,
        name: 'Bright Bio',
        clientType: 'biotech',
        industryMode: null,
        updatedAt: new Date(),
      },
    ];
    await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send(body);
    expect(
      systemScopeMock,
      'staff on their own org, or an org admin on theirs'
    ).not.toHaveBeenCalled();
  });
});

describe('PATCH /api/organizations/:id/settings', () => {
  const orgRow = { id: 7, settings: { security: { mfaEnabled: true } } };

  it('403s a non-admin member', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_MEMBER)
      .send({ settings: { security: { mfaEnabled: false } }, reason: 'test' });
    expect(res.status).toBe(403);
  });

  it('400s the governed form without a reason', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { security: { mfaEnabled: false } } });
    expect(res.status).toBe(400);
  });

  it('writes through the one settings writer: laid over the stored settings, its sections and reason (DP-73)', async () => {
    writerMock.mockImplementation(async (_req: unknown, _id: number, change: any) => change.next(orgRow.settings, 'standard'));
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({
        settings: {
          security: { mfaEnabled: false, ssoEnabled: true },
          translation: { enabled: true, targets: ['ja-JP'] },
        },
        reason: 'Enable SSO rollout',
      });
    expect(res.status).toBe(200);
    expect(writerMock).toHaveBeenCalledTimes(1);
    const [, orgId, change] = writerMock.mock.calls[0];
    expect(orgId).toBe(7);
    expect(change).toMatchObject({ action: 'tenant_settings_changed', reason: 'Enable SSO rollout' });
    // Laid over, not section-replaced (DP-62's rule, now at this door too):
    // keys the body does not name survive, among them server-enforced ones.
    const stored = { security: { mfaEnabled: true, maxConcurrentSessions: 3 }, anaToolPolicy: { deny: ['x'] } };
    const next = change.next(stored, 'standard');
    expect(next.security).toEqual({ mfaEnabled: false, ssoEnabled: true, maxConcurrentSessions: 3 });
    expect(next.anaToolPolicy).toEqual({ deny: ['x'] });
    expect(next.translation).toEqual({ enabled: true, targets: ['ja-JP'] });
    expect(change.sections(stored, next).sort()).toEqual(['security', 'translation']);
    // The record is the writer's chained row, in the change's transaction:
    // no second, best-effort row.
    expect(logActionMock).not.toHaveBeenCalled();
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('still accepts the legacy bare-partial body (recorded with no reason)', async () => {
    writerMock.mockImplementation(async (_req: unknown, _id: number, change: any) => change.next({}, 'standard'));
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ notifications: { emailEnabled: false } });
    expect(res.status).toBe(200);
    const change = writerMock.mock.calls[0][2];
    expect(change.reason ?? null).toBeNull();
    expect(change.sections({}, {})).toEqual(['notifications']);
  });

  it('404s when there is no such organization, and claims nothing', async () => {
    writerMock.mockResolvedValue(null);
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { branding: { primaryColor: '#000' } }, reason: 'rebrand' });
    expect(res.status).toBe(404);
    expect(res.body.auditTrail).toBeUndefined();
  });

  it('a change that would move the connector is refused by the writer: 403, nothing written', async () => {
    const { ConnectorSettingRefusedError } = await import('../../mcp/auth/connector-enablement');
    writerMock.mockRejectedValue(new ConnectorSettingRefusedError());
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { integrations: { note: 'x' } }, reason: 'integration note' });
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
  });

  it('a change whose record is refused is not made: 500, nothing claimed saved, no store text', async () => {
    writerMock.mockRejectedValue(new Error('audit_logs refused the row: secret-detail'));
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { translation: { enabled: true } }, reason: 'Enable translation' });
    expect(res.status).toBe(500);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toMatch(/Nothing was changed/);
    expect(JSON.stringify(res.body)).not.toContain('secret-detail');
  });

  it('400s an empty settings object', async () => {
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: {}, reason: 'nothing to change' });
    expect(res.status).toBe(400);
  });
});

/**
 * WO-16C — the §11.10(e) outcome reaches the caller.
 *
 * Both handlers awaited `auditService.logAction` at statement position and threw
 * its outcome away, so a profile or settings change whose audit row was lost
 * answered exactly like one whose row was written. The change stands either way
 * (an audit outage must not undo an org admin's edit), and the response now says
 * which happened: `auditTrail` is `{ persisted: true, chained }` or
 * `{ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message }` — the shape
 * the client's `findUnpersistedAuditRow` turns into the "The request completed, but the audit trail did not record it" notice.
 */
describe('organization writes carry the audit-row outcome', () => {
  const LOST = {
    persisted: false,
    chained: false,
    tamperProof: false,
    error: 'relation "audit_logs" does not exist',
  };

  it('profile: a lost row still answers 200 with the change, and says the row is missing', async () => {
    nextSelectRows = [{ name: 'Old', clientType: null, industryMode: null }];
    nextUpdateRows = [
      {
        id: 7,
        name: 'Bright Bio',
        clientType: 'biotech',
        industryMode: null,
        updatedAt: new Date(),
      },
    ];
    logActionMock.mockResolvedValueOnce(LOST as any);

    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send({ name: 'Bright Bio', reason: 'Onboarding setup' });

    expect(res.status).toBe(200);
    expect(res.body.organization.name).toBe('Bright Bio');
    expect(res.body.auditTrail).toEqual({
      persisted: false,
      code: 'AUDIT_ROW_NOT_PERSISTED',
      message: expect.any(String),
    });
    // The store's own text is logged, never forwarded to the tenant.
    expect(JSON.stringify(res.body)).not.toContain('audit_logs');
  });

  it('profile: a written row says so', async () => {
    nextSelectRows = [{ name: 'Old', clientType: null, industryMode: null }];
    nextUpdateRows = [
      { id: 7, name: 'Bright Bio', clientType: null, industryMode: null, updatedAt: new Date() },
    ];
    logActionMock.mockResolvedValueOnce({ persisted: true, chained: true, tamperProof: true });

    const res = await request(makeApp())
      .patch('/api/organizations/7/profile')
      .set('x-test-user', ORG7_ADMIN)
      .send({ name: 'Bright Bio', reason: 'Onboarding setup' });

    expect(res.status).toBe(200);
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
  });

  // Settings: superseded by DP-73 (2026-10-01). The settings door writes
  // through the one settings writer, so a change and its record commit
  // together and there is no lost-row answer; see the settings describe above.
});

/**
 * D6, 2026-10-05 (docs/evidence/D6/2026-10-05-cross-tenant-staff/): this
 * router decided platform staff from the request role, which behind
 * server/auth.ts IS the tenant membership role (organization_users.role, no
 * CHECK). So a membership row naming platform_admin or super_admin listed
 * every organization and read and wrote any of them, while real platform
 * staff (platform_role_grants) were treated as members. Standing is now
 * holdsPlatformRole(req, ['platform_admin', 'super_admin']).
 */
describe('D6: platform staff is a platform grant, never the membership role', () => {
  const body = { name: 'Bright Bio', clientType: 'biotech', reason: 'Support correction' };
  const ORGS: Row[] = [
    { id: 1, name: 'Staff Home' },
    { id: 7, name: 'Bright Bio' },
    { id: 9, name: 'Other Pharma' },
  ];
  /** Every organization, and a caller who is a member of org 1 only. */
  function directory() {
    selectImpl = ({ fields, table, filtered }) => {
      if (table === 'organizations') return filtered ? [ORGS[0]] : ORGS;
      if (table === 'organization_users') return fields && 'count' in fields ? [{ count: 2 }] : [{ organizationId: 1 }];
      return [];
    };
  }
  function profileRows() {
    nextSelectRows = [{ name: 'Old', clientType: 'pharma', industryMode: null }];
    nextUpdateRows = [{ id: 7, name: 'Bright Bio', clientType: 'biotech', industryMode: null, updatedAt: new Date() }];
  }

  describe.each(['platform_admin', 'super_admin'])('a membership role of %s with no grant', role => {
    const USER = JSON.stringify({ id: 21, role, organizationId: 1 });

    it('GET /api/organizations lists only its own memberships, not every organization', async () => {
      directory();
      const res = await request(makeApp()).get('/api/organizations').set('x-test-user', USER);
      expect(res.status).toBe(200);
      expect(res.body.organizations.map((o: { id: string }) => o.id)).toEqual(['1']);
      // Decided by the grant table answering no, not by nobody asking it.
      expect(grantLookupsFor(21)).toBeGreaterThan(0);
    });

    it('cannot read another organization: GET /api/organizations/7 is 403', async () => {
      nextSelectRows = [{ id: 7, name: 'Bright Bio' }];
      const res = await request(makeApp()).get('/api/organizations/7').set('x-test-user', USER);
      expect(res.status).toBe(403);
      expect(res.body.organization).toBeUndefined();
    });

    it("cannot patch another organization's profile: 403, nothing written, no system scope", async () => {
      profileRows();
      const res = await request(makeApp())
        .patch('/api/organizations/7/profile')
        .set('x-test-user', USER)
        .send(body);
      expect(res.status).toBe(403);
      expect(lastUpdate.values).toBeUndefined();
      expect(logActionMock).not.toHaveBeenCalled();
      expect(systemScopeMock).not.toHaveBeenCalled();
    });

    it("cannot patch another organization's settings: 403, the writer is never asked", async () => {
      writerMock.mockImplementation(async (_req: unknown, _id: number, change: any) => change.next({}, 'standard'));
      const res = await request(makeApp())
        .patch('/api/organizations/7/settings')
        .set('x-test-user', USER)
        .send({ settings: { branding: { primaryColor: '#000' } }, reason: 'rebrand' });
      expect(res.status).toBe(403);
      expect(writerMock).not.toHaveBeenCalled();
      expect(systemScopeMock).not.toHaveBeenCalled();
    });
  });

  describe.each(['platform_admin', 'super_admin'])('an active %s grant holder (membership role: member)', role => {
    const USER = JSON.stringify({ id: 22, role: 'member', organizationId: 1 });
    beforeEach(() => {
      grants.set(22, [role]);
    });

    it('GET /api/organizations lists every organization', async () => {
      directory();
      const res = await request(makeApp()).get('/api/organizations').set('x-test-user', USER);
      expect(res.status).toBe(200);
      expect(res.body.organizations.map((o: { id: string }) => o.id)).toEqual(['1', '7', '9']);
    });

    it('reads another organization: GET /api/organizations/7 is 200', async () => {
      nextSelectRows = [{ id: 7, name: 'Bright Bio' }];
      const res = await request(makeApp()).get('/api/organizations/7').set('x-test-user', USER);
      expect(res.status).toBe(200);
      expect(res.body.organization).toMatchObject({ id: '7', name: 'Bright Bio' });
    });

    it("patches another organization's profile, in the system scope, audited against that organization", async () => {
      profileRows();
      const res = await request(makeApp())
        .patch('/api/organizations/7/profile')
        .set('x-test-user', USER)
        .send(body);
      expect(res.status).toBe(200);
      expect(systemScopeMock).toHaveBeenCalledTimes(1);
      expect(logActionMock).toHaveBeenCalledTimes(1);
      expect(logActionMock.mock.calls[0][0].tenantId).toBe(7);
    });
  });

  it('a grant for a role this router does not accept (support) is not staff', async () => {
    grants.set(23, ['support']);
    const USER = JSON.stringify({ id: 23, role: 'member', organizationId: 1 });
    nextSelectRows = [{ id: 7, name: 'Bright Bio' }];
    const res = await request(makeApp()).get('/api/organizations/7').set('x-test-user', USER);
    expect(res.status).toBe(403);
  });

  it('an org admin reading their OWN organization costs no grant lookup', async () => {
    nextSelectRows = [{ id: 7, name: 'Bright Bio' }];
    const res = await request(makeApp()).get('/api/organizations/7').set('x-test-user', ORG7_ADMIN);
    expect(res.status).toBe(200);
    expect(grantLookupsFor(1)).toBe(0);
  });
});
