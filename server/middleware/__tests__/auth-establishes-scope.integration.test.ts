/**
 * The wiring proof for the RLS route-layer fix.
 *
 * The helper (establishRequestTenantScope) is unit-tested elsewhere. Here we
 * prove the two auth middlewares that actually run on the request path now
 * OPEN that scope on their success path instead of the historical bare next():
 *
 *   - authenticateToken (server/middleware/auth.ts) — used by mountAll groups —
 *     opens the scope only AFTER enforceOrgMembership confirms membership.
 *   - authMiddleware (server/auth.ts) — the global /api gate — opens it after
 *     its own inline membership check.
 *
 * A downstream handler therefore observes an active tenant scope; an
 * unauthenticated request is rejected before any handler runs; and a revoked
 * member is rejected without a scope ever opening.
 */

import express, { type NextFunction, type Request, type Response } from 'express';
import request from 'supertest';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// --- Mocks shared by both middlewares -----------------------------------------
// JWT verification: return a valid access token for a fixed identity.
const decoded = { userId: '7', organizationId: '2', type: 'access', role: 'editor', email: 'u@x.io' };
vi.mock('../../utils/jwtVerify', () => ({
  verifyJwtWithRotation: vi.fn(() => decoded),
}));

// The membership decision. Both authMiddleware (inline) and orgMembership
// (behind authenticateToken) read organization_users via this chainable `db`.
// `getPool` backs the lazy request client, which never acquires here (no query).
let membershipRows: Array<Record<string, unknown>> = [{ role: 'editor', orgUuid: null }];
function chain(): any {
  const c: any = {};
  c.from = () => c;
  c.leftJoin = () => c;
  c.where = () => c;
  c.limit = () => Promise.resolve(membershipRows);
  return c;
}
vi.mock('../../db', () => ({
  db: { select: () => chain() },
  getPool: () => ({
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }),
  }),
}));

import { getTenantScope } from '../../db/tenantStore';
import { invalidateOrgMembershipCache } from '../orgMembership';

// The REAL authenticateToken lives in auth.ts, but a stale auth.js legacy twin
// shadows it under vitest's .js-first resolution (documented in orgMembership.ts).
// esbuild/tsx resolve the .ts in dev/prod, so the shipped middleware IS auth.ts —
// load it explicitly here via a non-literal specifier so we test what ships. A
// bare `import('../auth.ts')` literal would trip TS5097 (allowImportingTsExtensions
// is off); a variable specifier is a dynamic import that tsc leaves untyped.
const AUTH_TS_MODULE = '../auth.ts';
const importRealMiddlewareAuth = (): Promise<any> =>
  import(/* @vite-ignore */ AUTH_TS_MODULE);

// Records the scope the handler sees, so each test can assert on it.
let observedScope: ReturnType<typeof getTenantScope> = undefined;
const probe = (_req: Request, res: Response) => {
  observedScope = getTenantScope();
  res.json({ scoped: !!observedScope, tenantId: observedScope?.tenantId ?? null });
};

beforeEach(() => {
  observedScope = undefined;
  membershipRows = [{ role: 'editor', orgUuid: null }];
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  // orgMembership keeps a module-level TTL cache; clear it so a member decision
  // from one test cannot satisfy the next (e.g. the revoked case).
  invalidateOrgMembershipCache();
});

describe('authenticateToken opens a tenant scope on the member path', () => {
  it('a valid token yields an active scope for the downstream handler', async () => {
    const { authenticateToken } = await importRealMiddlewareAuth();
    const app = express();
    app.get('/probe', authenticateToken, probe);

    const res = await request(app).get('/probe').set('Authorization', 'Bearer x');

    expect(res.status).toBe(200);
    expect(res.body.scoped).toBe(true);
    expect(res.body.tenantId).toBe('2');
  });

  it('no token → 401 and the handler never runs (no scope)', async () => {
    const { authenticateToken } = await importRealMiddlewareAuth();
    const app = express();
    app.get('/probe', authenticateToken, probe);

    const res = await request(app).get('/probe');

    expect(res.status).toBe(401);
    expect(observedScope).toBeUndefined();
  });

  it('a revoked member → 403 and the handler never runs (no scope)', async () => {
    membershipRows = []; // organization_users row gone → revoked
    const { authenticateToken } = await importRealMiddlewareAuth();
    const app = express();
    app.get('/probe', authenticateToken, probe);

    const res = await request(app).get('/probe').set('Authorization', 'Bearer x');

    expect(res.status).toBe(403);
    expect(observedScope).toBeUndefined();
  });
});

describe('authMiddleware (global /api gate) opens a tenant scope', () => {
  it('a valid token yields an active scope for the downstream handler', async () => {
    const { authMiddleware } = await import('../../auth');
    const app = express();
    app.get('/probe', authMiddleware as any, probe);

    const res = await request(app).get('/probe').set('Authorization', 'Bearer x');

    expect(res.status).toBe(200);
    expect(res.body.scoped).toBe(true);
    expect(res.body.tenantId).toBe('2');
  });

  it('no token → 401 and the handler never runs (no scope)', async () => {
    const { authMiddleware } = await import('../../auth');
    const app = express();
    app.get('/probe', authMiddleware as any, probe);

    const res = await request(app).get('/probe');

    expect(res.status).toBe(401);
    expect(observedScope).toBeUndefined();
  });
});
