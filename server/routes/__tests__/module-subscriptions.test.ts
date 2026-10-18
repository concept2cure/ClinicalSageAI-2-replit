/**
 * Contract test for /api/module-subscriptions (routes/module-subscriptions.ts,
 * mounted by register-inline-routes litIntConfig) — the endpoints the v2 Apps
 * surface adopts (client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx):
 *
 *   GET /catalog          → { modules: [...] } — rows must carry the display
 *                           contract keys the client mapping consumes
 *                           (moduleId, name, isEnabled, isAvailable,
 *                           requiredTier, category, description, sortOrder)
 *   GET /license          → { tier, industryMode, usage: { projects|users:
 *                           { currentCount, maxAllowed } } }
 *   PUT /:moduleId/toggle → admin-gated upsert; 403 MODULE_NOT_AVAILABLE with
 *                           a reason when the org's tier excludes the module
 *
 * Services and the pg pool are mocked — this locks the route's response
 * shapes and gates, not the DB.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import express, { type Request, type Response, type NextFunction } from 'express';
import request from 'supertest';

const lm = vi.hoisted(() => ({
  getLicenseInfo: vi.fn(),
  getModuleCatalog: vi.fn(),
  canAccessModule: vi.fn(),
  checkProjectQuota: vi.fn(),
  checkUserQuota: vi.fn(),
}));
const query = vi.hoisted(() => vi.fn());
const recordAuditRow = vi.hoisted(() => vi.fn());

vi.mock('../../services/license-manager.js', () => lm);
vi.mock('../../services/user-intelligence.js', () => ({
  loadUserIntelligence: vi.fn(),
  touchWorkSession: vi.fn(),
  generateWorkRecommendations: vi.fn(),
  addToWorkQueue: vi.fn(),
}));
/* Both exports. The route reads through `pool` and the canonical grant writer
   (services/entitlements/module-grants.ts) reads through `query`; mocking only
   the first let the real database module load inside the writer and turned
   every toggle into a 500. */
vi.mock('../../db.js', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  query: (...a: unknown[]) => query(...a),
}));
vi.mock('../../db', () => ({
  pool: { query: (...a: unknown[]) => query(...a) },
  query: (...a: unknown[]) => query(...a),
}));

/* The canonical §11.10(e) writer (services/audit/audit-write-outcome.ts) —
   mocked so the test can read the row a toggle asks it to write. */
vi.mock('../../services/audit/audit-write-outcome.js', () => ({ recordAuditRow }));
vi.mock('../../services/audit/audit-write-outcome', () => ({ recordAuditRow }));

import moduleSubscriptionsRouter from '../module-subscriptions';

interface TestUser {
  organizationId?: number;
  role?: string;
  roles?: string[];
  id?: number;
}

function appWith(user: TestUser | null) {
  const app = express();
  app.use(express.json());
  app.use((req: Request, _res: Response, next: NextFunction) => {
    if (user) (req as unknown as { user: TestUser }).user = user;
    next();
  });
  app.use('/api/module-subscriptions', moduleSubscriptionsRouter);
  return app;
}

const ADMIN: TestUser = { organizationId: 7, role: 'admin', id: 42 };
const MEMBER: TestUser = { organizationId: 7, role: 'member', id: 43 };

const CATALOG_ROW = {
  moduleId: 'cmc-wizard',
  name: 'CMC Wizard',
  description: 'ICH Q-series authoring',
  category: 'authoring',
  icon: 'FlaskConical',
  path: '/cmc-wizard',
  isEnabled: true,
  isAvailable: true,
  requiredTier: 'professional',
  sortOrder: 20,
};

const LICENSE = {
  organizationId: 7,
  tier: 'professional',
  industryMode: 'biotech',
  enabledModules: ['cmc-wizard'],
  maxUsers: 50,
  maxProjects: 25,
  maxStorageGB: 5,
};

beforeEach(() => {
  query.mockReset();
  recordAuditRow.mockReset();
  recordAuditRow.mockResolvedValue({ persisted: true, chained: true });
  for (const fn of Object.values(lm)) fn.mockReset();
});

describe('GET /api/module-subscriptions/catalog', () => {
  it('401 without org context', async () => {
    const res = await request(appWith(null)).get('/api/module-subscriptions/catalog');
    expect(res.status).toBe(401);
    expect(lm.getModuleCatalog).not.toHaveBeenCalled();
  });

  it('returns { modules } rows carrying the Apps display contract keys', async () => {
    lm.getModuleCatalog.mockResolvedValueOnce([CATALOG_ROW]);
    const res = await request(appWith(ADMIN)).get('/api/module-subscriptions/catalog');
    expect(res.status).toBe(200);
    expect(res.body.modules).toHaveLength(1);
    for (const k of [
      'moduleId',
      'name',
      'description',
      'category',
      'isEnabled',
      'isAvailable',
      'requiredTier',
      'sortOrder',
    ]) {
      expect(res.body.modules[0]).toHaveProperty(k);
    }
    expect(lm.getModuleCatalog).toHaveBeenCalledWith(7); // org-scoped
  });
});

describe('GET /api/module-subscriptions/license', () => {
  it('returns tier/industryMode + usage.{projects,users}.{currentCount,maxAllowed}', async () => {
    lm.getLicenseInfo.mockResolvedValueOnce(LICENSE);
    lm.checkProjectQuota.mockResolvedValueOnce({ withinQuota: true, currentCount: 14, maxAllowed: 25 });
    lm.checkUserQuota.mockResolvedValueOnce({ withinQuota: true, currentCount: 38, maxAllowed: 50 });
    const res = await request(appWith(ADMIN)).get('/api/module-subscriptions/license');
    expect(res.status).toBe(200);
    expect(res.body.tier).toBe('professional');
    expect(res.body.industryMode).toBe('biotech');
    expect(res.body.usage.projects).toEqual({ withinQuota: true, currentCount: 14, maxAllowed: 25 });
    expect(res.body.usage.users).toEqual({ withinQuota: true, currentCount: 38, maxAllowed: 50 });
  });

  it('404 when no license row exists', async () => {
    lm.getLicenseInfo.mockResolvedValueOnce(null);
    lm.checkProjectQuota.mockResolvedValueOnce({ withinQuota: true, currentCount: 0, maxAllowed: 10 });
    lm.checkUserQuota.mockResolvedValueOnce({ withinQuota: true, currentCount: 0, maxAllowed: 5 });
    const res = await request(appWith(ADMIN)).get('/api/module-subscriptions/license');
    expect(res.status).toBe(404);
  });
});

const REASON = 'Turning on for the Q4 IND programme';

describe('PUT /api/module-subscriptions/:moduleId/toggle', () => {
  it('403 for a non-admin — the client must surface this, not fake success', async () => {
    const res = await request(appWith(MEMBER))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: true });
    expect(res.status).toBe(403);
    expect(res.body.error).toBeTruthy();
    expect(query).not.toHaveBeenCalled();
  });

  it('403 MODULE_NOT_AVAILABLE with the reason when the tier excludes it', async () => {
    lm.canAccessModule.mockResolvedValueOnce({
      allowed: false,
      reason: "Module 'insight-synthesis' requires enterprise tier or higher (current: professional)",
    });
    const res = await request(appWith(ADMIN))
      .put('/api/module-subscriptions/insight-synthesis/toggle')
      .send({ enabled: true, reason: REASON });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('MODULE_NOT_AVAILABLE');
    expect(res.body.error).toMatch(/enterprise/);
    expect(query).not.toHaveBeenCalled();
  });

  it('admin enable → org-scoped upsert and { moduleId, enabled: true }', async () => {
    lm.canAccessModule.mockResolvedValueOnce({ allowed: true });
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(ADMIN))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: true, reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.moduleId).toBe('cmc-wizard');
    expect(res.body.enabled).toBe(true);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('module_subscriptions');
    /* Org 7 comes from the token, never the body — that is the org-scoping this
       case is named for. The trailing null is the expiry, and it is the point of
       routing this through the canonical writer: the row may already hold a
       lapsed trial's past date, and writing `enabled = true` beside it would
       produce an instantly-expired grant while this endpoint reported success.
       Stating null clears it. */
    expect(params).toEqual([7, 'cmc-wizard', true, '42', null]);
  });

  it('admin disable → { enabled: false }', async () => {
    lm.canAccessModule.mockResolvedValueOnce({ allowed: true });
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(ADMIN))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: false, reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false);
    const [, params] = query.mock.calls[0] as [string, unknown[]];
    expect(params).toEqual([7, 'cmc-wizard', false, '42', null]);
  });
});

/* Settings/integrity audit 2026-10-17, finding 2. The customer toggle took no
   reason and wrote no audit row: switching a governed module on or off for a
   whole organisation left nothing in the §11.10(e) trail but the grant row's
   enabled_by. And the role gate was a string compare on `role` alone. */
describe('PUT /:moduleId/toggle is a governed change', () => {
  it('400 without a reason of at least 8 characters, and writes nothing', async () => {
    for (const reason of [undefined, '', '  short ']) {
      const res = await request(appWith(ADMIN))
        .put('/api/module-subscriptions/cmc-wizard/toggle')
        .send({ enabled: true, reason });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/reason/i);
    }
    expect(query).not.toHaveBeenCalled();
    expect(recordAuditRow).not.toHaveBeenCalled();
  });

  it('writes one audit row carrying the module, the new state and the stated reason', async () => {
    lm.canAccessModule.mockResolvedValueOnce({ allowed: true });
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith(ADMIN))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: false, reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(recordAuditRow).toHaveBeenCalledTimes(1);
    const entry = recordAuditRow.mock.calls[0][0];
    expect(entry).toMatchObject({
      tenantId: 7,
      resourceType: 'module_subscription',
      resourceId: '7:cmc-wizard',
      details: expect.objectContaining({ moduleId: 'cmc-wizard', enabled: false, reason: REASON }),
    });
    expect(res.body.auditTrail).toEqual({ persisted: true, chained: true });
  });

  it('reports a lost audit row in the response instead of hiding it', async () => {
    lm.canAccessModule.mockResolvedValueOnce({ allowed: true });
    query.mockResolvedValueOnce({ rows: [] });
    recordAuditRow.mockResolvedValueOnce({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED', message: 'x' });
    const res = await request(appWith(ADMIN))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: true, reason: REASON });
    expect(res.status).toBe(200);
    expect(res.body.auditTrail).toMatchObject({ persisted: false, code: 'AUDIT_ROW_NOT_PERSISTED' });
  });

  it('uses the canonical role check: an admin named in `roles` passes', async () => {
    lm.canAccessModule.mockResolvedValueOnce({ allowed: true });
    query.mockResolvedValueOnce({ rows: [] });
    const res = await request(appWith({ organizationId: 7, role: 'member', roles: ['member', 'admin'], id: 44 }))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: true, reason: REASON });
    expect(res.status).toBe(200);
  });

  it('a platform-scoped role without the org admin role is refused', async () => {
    const res = await request(appWith({ organizationId: 7, role: 'support', id: 45 }))
      .put('/api/module-subscriptions/cmc-wizard/toggle')
      .send({ enabled: true, reason: REASON });
    expect(res.status).toBe(403);
  });
});
