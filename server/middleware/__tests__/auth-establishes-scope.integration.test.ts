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
 *
 * ── Why the middleware is invoked directly, not mounted on an Express route ────
 * Both are plain `(req, res, next)` functions; `next` IS the downstream handler,
 * so calling them directly and reading `getTenantScope()` inside `next` is a
 * faithful test of their contract. Mounting the REAL authMiddleware (which runs
 * a DB authorization lookup) on `app.get(...)` additionally trips CodeQL
 * `js/missing-rate-limiting` — it reads the test fixture as a real, unthrottled
 * authorization endpoint. Global-gate ROUTING (which paths reach authMiddleware)
 * is covered separately by api-auth-gate.test.ts; this file only pins the
 * scope-establishment contract, for which the route mount adds nothing.
 */

import type { NextFunction, Request, Response } from 'express';
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

type Middleware = (req: Request, res: Response, next: NextFunction) => unknown;

interface DriveResult {
  /** HTTP status the middleware set, or 200 if it fell through to next(). */
  status: number;
  /** True when the downstream handler ran inside an active tenant scope. */
  scoped: boolean;
  /** tenantId the downstream handler observed, or null when unscoped. */
  tenantId: string | null;
  /** True when next() (the downstream handler) was reached at all. */
  reachedHandler: boolean;
}

/**
 * Drive a middleware exactly as Express would: build a request, hand it a
 * response double and a `next` that stands in for the downstream handler, and
 * resolve once the middleware either answers on the response OR calls next.
 * The scope is read inside `next`, which is where a real handler would see it.
 */
function drive(mw: Middleware, authorization?: string): Promise<DriveResult> {
  return new Promise((resolve) => {
    let status = 200;
    let settled = false;
    let reachedHandler = false;
    let scoped = false;
    let tenantId: string | null = null;

    const settle = () => {
      if (settled) return;
      settled = true;
      resolve({ status, scoped, tenantId, reachedHandler });
    };

    const res = {
      status(code: number) { status = code; return res; },
      json() { settle(); return res; },
      send() { settle(); return res; },
      // establishRequestTenantScope registers release on finish/close; never
      // emitted here, and the lazy client never acquired, so it is a no-op.
      on() { return res; },
      set() { return res; },
    } as unknown as Response;

    const req = {
      method: 'GET',
      path: '/probe',
      headers: authorization ? { authorization } : {},
    } as unknown as Request;

    const next: NextFunction = () => {
      reachedHandler = true;
      const scope = getTenantScope();
      scoped = !!scope;
      tenantId = scope?.tenantId ?? null;
      settle();
    };

    mw(req, res, next);
  });
}

beforeEach(() => {
  membershipRows = [{ role: 'editor', orgUuid: null }];
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  // orgMembership keeps a module-level TTL cache; clear it so a member decision
  // from one test cannot satisfy the next (e.g. the revoked case).
  invalidateOrgMembershipCache();
});

describe('authenticateToken opens a tenant scope on the member path', () => {
  it('a valid token yields an active scope for the downstream handler', async () => {
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x');

    expect(r.status).toBe(200);
    expect(r.reachedHandler).toBe(true);
    expect(r.scoped).toBe(true);
    expect(r.tenantId).toBe('2');
  });

  it('no token → 401 and the handler never runs (no scope)', async () => {
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken);

    expect(r.status).toBe(401);
    expect(r.reachedHandler).toBe(false);
    expect(r.scoped).toBe(false);
  });

  it('a revoked member → 403 and the handler never runs (no scope)', async () => {
    membershipRows = []; // organization_users row gone → revoked
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x');

    expect(r.status).toBe(403);
    expect(r.reachedHandler).toBe(false);
    expect(r.scoped).toBe(false);
  });
});

describe('authMiddleware (global /api gate) opens a tenant scope', () => {
  it('a valid token yields an active scope for the downstream handler', async () => {
    const { authMiddleware } = await import('../../auth');

    const r = await drive(authMiddleware as unknown as Middleware, 'Bearer x');

    expect(r.status).toBe(200);
    expect(r.reachedHandler).toBe(true);
    expect(r.scoped).toBe(true);
    expect(r.tenantId).toBe('2');
  });

  it('no token → 401 and the handler never runs (no scope)', async () => {
    const { authMiddleware } = await import('../../auth');

    const r = await drive(authMiddleware as unknown as Middleware);

    expect(r.status).toBe(401);
    expect(r.reachedHandler).toBe(false);
    expect(r.scoped).toBe(false);
  });
});
