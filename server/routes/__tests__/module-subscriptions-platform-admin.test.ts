/**
 * GET /api/module-subscriptions/navigation — `platformAdmin` is the Master
 * Administration guard's own answer, not a second opinion.
 *
 * The account menu offers "Licensing" (the platform operator's master console)
 * only when this field is true. It used to offer it to every customer org
 * admin, because the client had no platform-admin signal, and
 * `requirePlatformAdmin` refused every one of them on every tab. The field is
 * computed by `resolvePlatformAdmin`, the function that guard admits with, so
 * the invariant pinned here is: for the same identity, the nav payload says
 * `platformAdmin: true` exactly when the guard calls next().
 *
 * It is also pinned that `platformAdmin` is NOT `masterAdmin`: the commercial
 * unlock and console access are different sets (a `support` designation opens
 * the console without unlocking modules), so a client reading one for the
 * other would offer or hide the console wrongly.
 *
 * Services and the database are mocked; the guard, the master-admin resolver
 * and the route are real.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';

const grants = vi.hoisted(() => ({ byUser: new Map<number, string>(), fail: false }));
const query = vi.hoisted(() =>
  vi.fn(async (sql: string, params: unknown[] = []) => {
    if (!/platform_role_grants/.test(sql)) return { rows: [] };
    if (grants.fail) throw new Error('connection refused');
    const role = grants.byUser.get(Number(params[0]));
    const wanted = (params[1] as string[]) ?? [];
    return { rows: role && wanted.includes(role) ? [{ '?column?': 1 }] : [] };
  }),
);
vi.mock('../../db.js', () => ({ pool: { query }, query }));
vi.mock('../../db', () => ({ pool: { query }, query }));

vi.mock('../../services/license-manager.js', () => ({
  getLicenseInfo: vi.fn(),
  getModuleCatalog: vi.fn(),
  canAccessModule: vi.fn(),
  checkProjectQuota: vi.fn(),
  checkUserQuota: vi.fn(),
}));
vi.mock('../../services/user-intelligence.js', () => ({
  loadUserIntelligence: vi.fn(),
  touchWorkSession: vi.fn(),
  generateWorkRecommendations: vi.fn(),
  addToWorkQueue: vi.fn(),
}));
/* The verdict computation has its own suite; this file is about the identity
   fields the route adds, so the resolver echoes what it was handed. */
vi.mock('../../services/entitlements/navigation-entitlements.js', () => ({
  resolveNavEntitlements: vi.fn(async (organizationId: number, opts: { masterAdmin: boolean }) => ({
    organizationId,
    tier: 'enterprise',
    industryMode: 'biotech',
    masterAdmin: opts.masterAdmin,
    resolved: true,
    surfaces: [],
    launchScope: { enforced: true },
  })),
}));
/* Authentication is upstream of both routes under test; the identity is set
   by the harness below exactly as the auth middleware would leave it. */
vi.mock('../../middleware/auth.js', () => ({
  authenticateToken: (_req: Request, _res: Response, next: NextFunction) => next(),
}));

import moduleSubscriptionsRouter from '../module-subscriptions';
import { requirePlatformAdmin } from '../../middleware/requirePlatformAdmin';
import { clearMasterAdminGrantCache } from '../../services/entitlements/master-admin';

interface Identity {
  userId: number;
  email: string;
  role: string;
}

function appFor(who: Identity) {
  const app = express();
  app.use((req: Request, _res: Response, next: NextFunction) => {
    req.userId = who.userId as never;
    req.userRole = who.role as never;
    req.userEmail = who.email as never;
    (req as unknown as { user: Record<string, unknown> }).user = {
      id: who.userId,
      email: who.email,
      role: who.role,
      organizationId: 1,
    };
    next();
  });
  app.use('/api/module-subscriptions', moduleSubscriptionsRouter);
  // The master console's own gate, mounted on the same identity.
  app.get('/api/admin/master/licensing', requirePlatformAdmin, (_req, res) => res.json({ ok: true }));
  return app;
}

async function bothAnswers(who: Identity) {
  const app = appFor(who);
  const nav = await request(app).get('/api/module-subscriptions/navigation');
  const guarded = await request(app).get('/api/admin/master/licensing');
  return { nav, consoleStatus: guarded.status };
}

const savedPlatform = process.env.PLATFORM_ADMIN_EMAILS;
const savedMaster = process.env.MASTER_ADMIN_EMAILS;
beforeEach(() => {
  delete process.env.PLATFORM_ADMIN_EMAILS;
  delete process.env.MASTER_ADMIN_EMAILS;
  grants.byUser.clear();
  grants.fail = false;
  clearMasterAdminGrantCache();
  query.mockClear();
});
afterEach(() => {
  if (savedPlatform === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = savedPlatform;
  if (savedMaster === undefined) delete process.env.MASTER_ADMIN_EMAILS;
  else process.env.MASTER_ADMIN_EMAILS = savedMaster;
});

describe('GET /navigation — platformAdmin agrees with requirePlatformAdmin', () => {
  it('a customer org admin: platformAdmin false, and the console refuses them', async () => {
    const { nav, consoleStatus } = await bothAnswers({
      userId: 1,
      email: 'jm.smith@concept2cure.pro',
      role: 'admin',
    });
    expect(nav.status).toBe(200);
    expect(nav.body.platformAdmin).toBe(false);
    expect(nav.body.masterAdmin).toBe(false);
    expect(consoleStatus).toBe(403);
  });

  it('a super_admin: platformAdmin true, and the console admits them', async () => {
    const { nav, consoleStatus } = await bothAnswers({
      userId: 2,
      email: 'owner@example.com',
      role: 'super_admin',
    });
    expect(nav.body.platformAdmin).toBe(true);
    expect(consoleStatus).toBe(200);
  });

  it('an email on PLATFORM_ADMIN_EMAILS: platformAdmin true, and the console admits them', async () => {
    process.env.PLATFORM_ADMIN_EMAILS = 'ops@example.com';
    const { nav, consoleStatus } = await bothAnswers({ userId: 3, email: 'OPS@example.com', role: 'admin' });
    expect(nav.body.platformAdmin).toBe(true);
    expect(consoleStatus).toBe(200);
  });

  it('an in-app support designation: console yes, commercial unlock no — the two fields differ', async () => {
    grants.byUser.set(4, 'support');
    const { nav, consoleStatus } = await bothAnswers({ userId: 4, email: 'helper@example.com', role: 'member' });
    expect(consoleStatus).toBe(200);
    expect(nav.body.platformAdmin).toBe(true);
    expect(nav.body.masterAdmin).toBe(false);
  });

  it('a grant lookup that fails: platformAdmin false, the same way the guard denies', async () => {
    grants.byUser.set(5, 'support');
    grants.fail = true;
    const { nav, consoleStatus } = await bothAnswers({ userId: 5, email: 'helper@example.com', role: 'member' });
    expect(nav.status).toBe(200);
    expect(nav.body.platformAdmin).toBe(false);
    expect(consoleStatus).toBe(403);
  });
});

/* Finding 43 (launch sweep 2026-09-23): the nav resolver answered
   `masterAdmin: true` — every module unlocked — for an account the licensing
   console refused with 403, because the owner grant was keyed on an e-mail
   allowlist beside the platform guard rather than inside it. */
describe('GET /navigation — the owner grant never exceeds platform administration (finding 43)', () => {
  it('an address on MASTER_ADMIN_EMAILS alone is not the owner: both answers say no', async () => {
    process.env.MASTER_ADMIN_EMAILS = 'owner@example.com';
    const { nav, consoleStatus } = await bothAnswers({ userId: 6, email: 'owner@example.com', role: 'admin' });
    expect(consoleStatus).toBe(403);
    expect(nav.body.platformAdmin).toBe(false);
    expect(nav.body.masterAdmin, 'an unlock the console refuses the same person').toBe(false);
  });

  it('the same address, admitted by the platform guard, is the owner: both answers say yes', async () => {
    process.env.MASTER_ADMIN_EMAILS = 'owner@example.com';
    process.env.PLATFORM_ADMIN_EMAILS = 'owner@example.com';
    const { nav, consoleStatus } = await bothAnswers({ userId: 7, email: 'owner@example.com', role: 'admin' });
    expect(consoleStatus).toBe(200);
    expect(nav.body.platformAdmin).toBe(true);
    expect(nav.body.masterAdmin).toBe(true);
  });

  it('an in-app super_admin designation: console yes, commercial unlock yes', async () => {
    grants.byUser.set(8, 'super_admin');
    const { nav, consoleStatus } = await bothAnswers({ userId: 8, email: 'designee@example.com', role: 'member' });
    expect(consoleStatus).toBe(200);
    expect(nav.body.platformAdmin).toBe(true);
    expect(nav.body.masterAdmin).toBe(true);
  });
});
