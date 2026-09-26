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

function chainableSelect() {
  const ret: any = {};
  ret.from = () => ret;
  ret.leftJoin = () => ret;
  ret.where = () => ret;
  ret.limit = () => ret;
  ret.then = (resolve: (v: Row[]) => unknown) => Promise.resolve(resolve(nextSelectRows));
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
  select: () => chainableSelect(),
  update: () => chainableUpdate(),
};

vi.mock('../../db', () => ({ db: dbMock }));

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
const PLATFORM = JSON.stringify({ id: 4, role: 'super_admin', organizationId: 1 });

beforeEach(() => {
  logActionMock.mockReset();
  systemScopeMock.mockClear();
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

  it('applies the governed form and audits section keys + reason (never values)', async () => {
    nextSelectRows = [orgRow];
    nextUpdateRows = [{ id: 7 }];
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
    // Merge is shallow at the section level: new sections land on old settings.
    expect((lastUpdate.values?.settings as Record<string, unknown>).translation).toEqual({
      enabled: true,
      targets: ['ja-JP'],
    });
    expect(logActionMock).toHaveBeenCalledTimes(1);
    const entry = logActionMock.mock.calls[0][0];
    expect(entry.resourceType).toBe('organization_settings');
    expect(entry.details.reason).toBe('Enable SSO rollout');
    expect(entry.details.sections.sort()).toEqual(['security', 'translation']);
    // Setting VALUES must not be duplicated into the audit log.
    expect(JSON.stringify(entry.details)).not.toContain('ja-JP');
  });

  it('still accepts the legacy bare-partial body (audited with reason null)', async () => {
    nextSelectRows = [orgRow];
    nextUpdateRows = [{ id: 7 }];
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ notifications: { emailEnabled: false } });
    expect(res.status).toBe(200);
    const entry = logActionMock.mock.calls[0][0];
    expect(entry.details.reason).toBeNull();
    expect(entry.details.sections).toEqual(['notifications']);
  });

  it('404s an update that matched no row, and audits nothing (it used to answer success)', async () => {
    nextSelectRows = [orgRow];
    nextUpdateRows = [];
    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { branding: { primaryColor: '#000' } }, reason: 'rebrand' });
    expect(res.status).toBe(404);
    expect(logActionMock).not.toHaveBeenCalled();
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

  it('settings: a lost row still answers 200, and says the row is missing', async () => {
    nextSelectRows = [{ id: 7, settings: {} }];
    nextUpdateRows = [{ id: 7 }];
    logActionMock.mockResolvedValueOnce(LOST as any);

    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { translation: { enabled: true } }, reason: 'Enable translation' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.auditTrail).toMatchObject({
      persisted: false,
      code: 'AUDIT_ROW_NOT_PERSISTED',
    });
  });

  it('settings: a written row says so', async () => {
    nextSelectRows = [{ id: 7, settings: {} }];
    nextUpdateRows = [{ id: 7 }];
    logActionMock.mockResolvedValueOnce({ persisted: true, chained: false, tamperProof: true });

    const res = await request(makeApp())
      .patch('/api/organizations/7/settings')
      .set('x-test-user', ORG7_ADMIN)
      .send({ settings: { translation: { enabled: true } }, reason: 'Enable translation' });

    expect(res.body.auditTrail).toEqual({ persisted: true, chained: false });
  });
});
