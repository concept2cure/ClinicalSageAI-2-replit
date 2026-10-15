/**
 * D6, 2026-10-05 (docs/evidence/D6/2026-10-05-cross-tenant-staff/): who may
 * read and write ANOTHER tenant's settings through tenant-config.ts.
 *
 * The router decided its cross-tenant power from `req.userRole === 'super_admin'`.
 * Behind server/auth.ts the request role IS the tenant membership role
 * (organization_users.role, a column with no CHECK), so a membership row naming
 * super_admin read and wrote every tenant's settings, and the staffCrossOrgScope
 * gate opened the system scope for it. Real platform staff, who hold
 * platform_role_grants rows, were treated as members. Standing is now
 * holdsPlatformRole(req, ['super_admin']): the owner's own sign-in on
 * PLATFORM_ADMIN_EMAILS, or an active super_admin grant row. An organization's
 * `admin` still writes its own tenant, and only its own.
 *
 * Harness: tenant-config-claude-connector.test.ts's recorders (the request's
 * connection and its Drizzle handle share one ordered log), plus
 *   - the REAL holdsPlatformRole, over a faked platform_role_grants table
 *     (../db `query`: a row when params[0] is a user in `grants` holding one of
 *     the roles asked in params[1]);
 *   - the REAL staffCrossOrgScope, run inside the caller's own tenant scope as
 *     the real auth gate opens it, with only establishRequestSystemScope faked
 *     (it needs a real pool; proven in tests/db/organizations-writes.dbtest.ts),
 *     so WHEN the system scope is opened is observed.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import request from 'supertest';
import { runWithTenantScope } from '../../db/tenantStore';

const h = vi.hoisted(() => ({
  log: [] as string[],
  tenant: null as null | { id: number; tier: string; settings: Record<string, unknown> | null },
  auditCalls: [] as Array<{ client: unknown; entry: Record<string, unknown> }>,
  caller: { userId: 5, role: 'admin', tenantId: 900 } as { userId: number; role: string; tenantId: number; email?: string },
  /** user id -> platform roles that user holds an ACTIVE platform_role_grants row for. */
  grants: new Map<number, string[]>(),
  query: vi.fn(),
  systemScope: vi.fn((_req: unknown, _res: unknown, next: () => void) => next()),
}));

const client = {
  query: vi.fn(async (sql: string) => {
    h.log.push(sql.trim().split(/\s+/)[0].toUpperCase());
    return { rows: [] };
  }),
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function selectChain() {
  const rows = async (lock: string) => {
    h.log.push(`SELECT${lock}`);
    return h.tenant ? [clone(h.tenant)] : [];
  };
  const limited = {
    for: (strength: string) => rows(` FOR ${strength.toUpperCase()}`),
    then: (ok: (v: unknown) => unknown, ko?: (e: unknown) => unknown) => rows('').then(ok, ko),
  };
  return { from: () => ({ where: () => ({ limit: () => limited }) }) };
}
const fakeDb = {
  select: () => selectChain(),
  update: () => ({
    set: (values: { settings: Record<string, unknown> }) => ({
      where: () => ({
        returning: async () => {
          h.log.push('UPDATE');
          if (!h.tenant) return [];
          h.tenant.settings = clone(values.settings);
          return [clone(h.tenant)];
        },
      }),
    }),
  }),
};

vi.mock('../../db/requestDb', () => ({
  requestDb: () => fakeDb,
  requestPgClient: () => client,
}));
// Only the grant table is faked; everything else in ../db stays real.
vi.mock('../../db', async importOriginal => ({
  ...(await importOriginal<typeof import('../../db')>()),
  query: (...a: unknown[]) => h.query(...a),
}));
vi.mock('../../auth', () => ({
  authMiddleware: (req: Request, _res: Response, next: NextFunction) => {
    (req as any).userId = h.caller.userId;
    (req as any).user = { id: h.caller.userId };
    (req as any).userRole = h.caller.role;
    (req as any).tenantId = h.caller.tenantId;
    if (h.caller.email) (req as any).userEmail = h.caller.email;
    // As the real gate does: the request runs in the caller's OWN tenant scope,
    // which staffCrossOrgScope compares the URL's tenant with.
    runWithTenantScope(
      { tenantId: String(h.caller.tenantId), role: h.caller.role, source: 'request', caller: 'test' },
      () => next()
    );
  },
}));
vi.mock('../../middleware/tenantContext', () => ({
  requireOrganizationContext: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/establishRequestTenantScope', () => ({
  establishRequestSystemScope: (req: unknown, res: unknown, next: () => void) => h.systemScope(req, res, next),
}));
vi.mock('../../services/auditService', () => ({
  default: { logAction: vi.fn(async () => ({ persisted: true })) },
  writeChainedAuditRow: vi.fn(async (c: unknown, entry: Record<string, unknown>) => {
    h.log.push('AUDIT');
    h.auditCalls.push({ client: c, entry });
  }),
}));

const OWN = 900;
const OTHER = 901;
let app: express.Express;

function answerGrantsFromTable() {
  h.query.mockImplementation(async (sql: string, params?: unknown[]) => {
    if (/FROM platform_role_grants/.test(sql) && Array.isArray(params)) {
      const held = h.grants.get(Number(params[0])) ?? [];
      const asked = Array.isArray(params[1]) ? (params[1] as string[]) : [];
      return { rows: held.some(role => asked.includes(role)) ? [{ '?column?': 1 }] : [] };
    }
    return { rows: [] };
  });
}
const grantLookups = () =>
  h.query.mock.calls.filter(([sql]) => /FROM platform_role_grants/.test(String(sql))).length;

beforeEach(async () => {
  h.log = [];
  h.auditCalls = [];
  h.caller = { userId: 5, role: 'admin', tenantId: OWN };
  h.grants.clear();
  h.query.mockReset();
  answerGrantsFromTable();
  h.systemScope.mockClear();
  delete process.env.PLATFORM_ADMIN_EMAILS;
  h.tenant = {
    id: OTHER,
    tier: 'enterprise',
    settings: { security: { mfaRequired: true, sessionTimeoutMinutes: 60 }, branding: { primaryColor: '#123456' } },
  };
  const mod = await import('../tenant-config');
  app = express();
  app.use(express.json());
  app.use('/api/tenant-config', mod.default);
});

/** Everything but plain reads: the write transaction and its record. */
const writes = () => h.log.filter(s => s !== 'SELECT');
const as = (userId: number, role: string, tenantId = OWN) => {
  h.caller = { userId, role, tenantId };
};

/** The three doors that write a tenant's settings, aimed at `tenantId`. */
const WRITE_DOORS: Array<[string, (tenantId: number) => request.Test]> = [
  ['PATCH /settings', t => request(app).patch(`/api/tenant-config/${t}/settings`).send({ security: { mfaRequired: false } })],
  ['PATCH /settings/security', t => request(app).patch(`/api/tenant-config/${t}/settings/security`).send({ mfaRequired: false })],
  ['POST /settings/reset', t => request(app).post(`/api/tenant-config/${t}/settings/reset`).send({})],
];

describe('a membership role of super_admin, with no platform grant', () => {
  beforeEach(() => as(6, 'super_admin'));

  it("cannot GET another tenant's settings: 403, nothing read", async () => {
    const res = await request(app).get(`/api/tenant-config/${OTHER}/settings`);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'You can only view settings for your own organization' });
    expect(h.log).toEqual([]);
    // Refused because the grant table said no, not because nobody asked it.
    expect(h.query).toHaveBeenCalledWith(expect.stringMatching(/FROM platform_role_grants/), [6, ['super_admin']]);
  });

  it.each(WRITE_DOORS)("cannot %s another tenant's settings: 403, nothing written or recorded, no system scope", async (_label, send) => {
    const before = clone(h.tenant);
    const res = await send(OTHER);
    expect(res.status).toBe(403);
    expect(writes()).toEqual([]);
    expect(h.auditCalls).toHaveLength(0);
    expect(h.tenant).toEqual(before);
    expect(h.systemScope).not.toHaveBeenCalled();
  });

  it("a grant lookup that errors refuses the read: fail closed", async () => {
    h.query.mockRejectedValue(new Error('platform_role_grants unreachable'));
    const res = await request(app).get(`/api/tenant-config/${OTHER}/settings`);
    expect(res.status).toBe(403);
    expect(h.log).toEqual([]);
  });
});

describe('an active super_admin platform grant holder (membership role: member)', () => {
  beforeEach(() => {
    as(7, 'member');
    h.grants.set(7, ['super_admin']);
  });

  it("can GET another tenant's settings", async () => {
    const res = await request(app).get(`/api/tenant-config/${OTHER}/settings`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body).toEqual(h.tenant!.settings);
  });

  it.each(WRITE_DOORS)("can %s another tenant's settings, in the system scope, recorded against that tenant", async (_label, send) => {
    const res = await send(OTHER);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(h.systemScope).toHaveBeenCalledTimes(1);
    expect(writes()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(h.auditCalls).toHaveLength(1);
    expect(h.auditCalls[0].entry).toMatchObject({ tenantId: OTHER, userId: 7 });
  });
});

describe("the owner's own (password) sign-in on PLATFORM_ADMIN_EMAILS", () => {
  it("reads another tenant's settings with no grant lookup", async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'owner@concept2cure.ai';
    h.caller = { userId: 8, role: 'member', tenantId: OWN, email: 'owner@concept2cure.ai' };
    const res = await request(app).get(`/api/tenant-config/${OTHER}/settings`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(grantLookups()).toBe(0);
  });
});

describe('platform grants this router does not accept', () => {
  it.each(['platform_admin', 'support'])("a %s grant is not standing to read or write another tenant's settings", async role => {
    as(9, role);
    h.grants.set(9, [role]);
    const read = await request(app).get(`/api/tenant-config/${OTHER}/settings`);
    expect(read.status).toBe(403);
    const write = await request(app).patch(`/api/tenant-config/${OTHER}/settings`).send({ security: { mfaRequired: false } });
    expect(write.status).toBe(403);
    expect(writes()).toEqual([]);
    expect(h.systemScope).not.toHaveBeenCalled();
  });
});

describe("an organization's admin", () => {
  beforeEach(() => {
    as(5, 'admin');
    h.tenant!.id = OWN;
  });

  it('still reads and updates its OWN tenant, in its own scope, with no grant lookup', async () => {
    const read = await request(app).get(`/api/tenant-config/${OWN}/settings`);
    expect(read.status, JSON.stringify(read.body)).toBe(200);
    const write = await request(app).patch(`/api/tenant-config/${OWN}/settings`).send({ security: { mfaRequired: false } });
    expect(write.status, JSON.stringify(write.body)).toBe(200);
    expect(writes()).toEqual(['BEGIN', 'SELECT FOR UPDATE', 'UPDATE', 'AUDIT', 'COMMIT']);
    expect(h.auditCalls[0].entry).toMatchObject({ tenantId: OWN, userId: 5 });
    expect(h.systemScope).not.toHaveBeenCalled();
    expect(grantLookups()).toBe(0);
  });

  it.each(WRITE_DOORS)("is refused on ANOTHER tenant: %s is 403, nothing written", async (_label, send) => {
    h.tenant!.id = OTHER;
    const res = await send(OTHER);
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/only (update|reset) settings for your own organization/);
    expect(writes()).toEqual([]);
    expect(h.auditCalls).toHaveLength(0);
    expect(h.systemScope).not.toHaveBeenCalled();
  });

  it("is refused a read of ANOTHER tenant's settings", async () => {
    const res = await request(app).get(`/api/tenant-config/${OTHER}/settings`);
    expect(res.status).toBe(403);
    expect(h.log).toEqual([]);
  });
});
