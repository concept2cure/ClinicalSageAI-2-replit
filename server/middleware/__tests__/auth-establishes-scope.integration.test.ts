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
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// --- Mocks shared by both middlewares -----------------------------------------
// JWT verification: return a valid access token for a fixed identity.
const decoded = { userId: '7', organizationId: '2', type: 'access', role: 'editor', email: 'u@x.io' };
vi.mock('../../utils/jwtVerify', () => ({
  verifyJwtWithRotation: vi.fn(() => decoded),
}));

// TWO decisions are read through this chainable `db`, and the fixture has to
// model both or one silently answers for the other:
//
//   • MEMBERSHIP — organization_users. Read by authMiddleware (inline) and by
//     orgMembership (behind authenticateToken). Projection: { role[, orgUuid] }.
//   • LIFECYCLE POSTURE — organizations. Read by the tenant lifecycle guard,
//     which now runs at the tail of both chains. Projection: { status,
//     paymentStatus }.
//
// They are told apart by the projection passed to `select()`, which is the only
// thing distinguishing them here (the real drizzle tables are not mocked).
// `getPool` backs the lazy request client, which never acquires here (no query).
let membershipRows: Array<Record<string, unknown>> = [{ role: 'editor', orgUuid: null }];
let organizationRows: Array<Record<string, unknown>> = [
  { status: 'active', paymentStatus: 'active' },
];
function chain(rows: () => Array<Record<string, unknown>>): any {
  const c: any = {};
  c.from = () => c;
  c.leftJoin = () => c;
  c.where = () => c;
  c.limit = () => Promise.resolve(rows());
  return c;
}
// `max_storage`, read by the storage quota guard through the raw pool rather
// than through drizzle. Kept separate from `organizationRows` above because the
// two reads answer different questions about the same table and a single fixture
// would let one silently stand in for the other.
let maxStorageGb: number | null = 5;

vi.mock('../../db', () => ({
  db: {
    select: (projection?: Record<string, unknown>) =>
      projection && 'status' in projection
        ? chain(() => organizationRows)
        : chain(() => membershipRows),
  },
  getPool: () => ({
    connect: async () => ({ query: async () => ({ rows: [] }), release: () => undefined }),
    query: async () => ({ rows: [{ max_storage: maxStorageGb }] }),
  }),
}));

// Only the ACCOUNTING is stubbed. `evaluateStorageQuota` and the guard's own
// branching stay real, because what this file exists to prove is that the guards
// COMPOSE and ORDER correctly on a live chain — not that the quota arithmetic is
// right (server/services/tenant/__tests__/tenant-storage.test.ts) nor that the
// table discovery finds anything (tests/schema-contract/tenant-storage-
// accounting.contract.test.ts, against the real drizzle lineage).
const { getTenantStorage } = vi.hoisted(() => ({ getTenantStorage: vi.fn() }));
vi.mock('../../services/tenant/tenant-storage', async importOriginal => {
  const actual = await importOriginal<typeof import('../../services/tenant/tenant-storage')>();
  return { ...actual, getTenantStorage };
});

import { getTenantScope } from '../../db/tenantStore';
import { invalidateOrgMembershipCache } from '../orgMembership';
import { invalidateTenantPosture } from '../../services/tenant/tenant-lifecycle';
import { invalidateTenantStorage } from '../../services/tenant/tenant-storage';

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
  /** The JSON body the middleware answered with, if it answered. */
  body?: any;
}

/**
 * Drive a middleware exactly as Express would: build a request, hand it a
 * response double and a `next` that stands in for the downstream handler, and
 * resolve once the middleware either answers on the response OR calls next.
 * The scope is read inside `next`, which is where a real handler would see it.
 */
function drive(
  mw: Middleware,
  authorization?: string,
  // Defaults reproduce the original GET /probe with no body, so every test
  // written before the storage guard existed keeps driving exactly the same
  // request. Overriding these is how a content-bearing upload is simulated.
  opts: { method?: string; headers?: Record<string, string>; path?: string } = {}
): Promise<DriveResult> {
  return new Promise((resolve) => {
    let status = 200;
    let settled = false;
    let reachedHandler = false;
    let scoped = false;
    let tenantId: string | null = null;
    let body: any;

    const settle = () => {
      if (settled) return;
      settled = true;
      resolve({ status, scoped, tenantId, reachedHandler, body });
    };

    const res = {
      status(code: number) { status = code; return res; },
      json(payload?: unknown) { body = payload; settle(); return res; },
      send() { settle(); return res; },
      // establishRequestTenantScope registers release on finish/close; never
      // emitted here, and the lazy client never acquired, so it is a no-op.
      on() { return res; },
      set() { return res; },
    } as unknown as Response;

    const headers: Record<string, string> = {
      ...(authorization ? { authorization } : {}),
      ...(opts.headers ?? {}),
    };

    const req = {
      method: opts.method ?? 'GET',
      path: opts.path ?? '/probe',
      headers,
      // The storage guard reads Content-Length and Content-Type through
      // Express's `req.get`, before any body parser runs. Without this the guard
      // sees no headers at all and silently passes everything through — which is
      // how a composition test can pass while proving nothing.
      get: (name: string) => headers[name.toLowerCase()],
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
  organizationRows = [{ status: 'active', paymentStatus: 'active' }];
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
  // Both controls keep a module-level TTL cache; clear them so a decision from
  // one test cannot satisfy the next (e.g. the revoked and suspended cases).
  invalidateOrgMembershipCache();
  invalidateTenantPosture();
  invalidateTenantStorage();

  // Enforce explicitly. NODE_ENV is not 'production' under vitest, so the real
  // isStorageEnforcementOn() would return report-mode and every quota assertion
  // below would pass whether the guard worked or not.
  process.env.STORAGE_LIMIT_ENFORCEMENT = 'enforce';
  maxStorageGb = 5;
  getTenantStorage.mockResolvedValue({
    organizationId: 1,
    bytes: 0,
    measured: 'partial',
    tablesCounted: 11,
    tablesFailed: [],
  });
});

afterEach(() => {
  delete process.env.STORAGE_LIMIT_ENFORCEMENT;
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

/**
 * The tenant lifecycle guard runs at the tail of BOTH auth chains. Its policy is
 * unit-tested in services/tenant/__tests__/tenant-lifecycle.test.ts and its own
 * behaviour in tenantLifecycleGuard.test.ts; what is proven here is the wiring —
 * that a valid token belonging to a live member of a SUSPENDED organization is
 * refused, on both entry points, rather than reaching the handler.
 *
 * Before this guard existed, every assertion below passed with status 200: an
 * organization suspended for non-payment, for a terminated contract, or in
 * response to a security incident kept full read and write access to the
 * platform.
 */
describe('the tenant lifecycle guard runs on both auth chains', () => {
  it('authenticateToken refuses a live member of a suspended organization', async () => {
    organizationRows = [{ status: 'suspended', paymentStatus: 'active' }];
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x');

    expect(r.status).toBe(403);
    expect(r.reachedHandler).toBe(false);
  });

  it('authMiddleware refuses a live member of a suspended organization', async () => {
    organizationRows = [{ status: 'suspended', paymentStatus: 'active' }];
    const { authMiddleware } = await import('../../auth');

    const r = await drive(authMiddleware as unknown as Middleware, 'Bearer x');

    expect(r.status).toBe(403);
    expect(r.reachedHandler).toBe(false);
  });

  it('a past-due organization still reaches the handler on a safe verb', async () => {
    // read_only, not deny: the customer keeps sight of their own regulatory
    // record and can export it. Only mutations are blocked.
    organizationRows = [{ status: 'active', paymentStatus: 'past_due' }];
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x');

    expect(r.status).toBe(200);
    expect(r.reachedHandler).toBe(true);
    expect(r.scoped).toBe(true);
  });

  it('refuses fail-closed when the organization row cannot be read', async () => {
    organizationRows = [];
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x');

    expect(r.status).toBe(403); // TENANT_NOT_FOUND
    expect(r.reachedHandler).toBe(false);
  });
});

/**
 * The storage quota guard runs LAST on both chains, after the lifecycle guard.
 *
 * ── What is proven here that nowhere else proves ──────────────────────────────
 * Each guard is tested in isolation with its neighbours mocked, and each one
 * passes. That says nothing about whether they COMPOSE: a guard mounted in the
 * wrong order, or reading a request field that an earlier middleware has not yet
 * populated, fails only on a live chain. Two specific claims were written as
 * comments in `middleware/auth.ts` and `auth.ts` and never asserted anywhere —
 * both are asserted below.
 *
 * The GB constant matters: the guard evaluates Content-Length, so the fixture
 * has to declare a body large enough to be treated as content-bearing.
 */
const MB = 1024 * 1024;
const UPLOAD = {
  method: 'POST',
  headers: {
    'content-type': 'multipart/form-data; boundary=x',
    'content-length': String(10 * MB),
  },
};

describe('the storage quota guard composes with the rest of the chain', () => {
  it('refuses an over-quota upload on authenticateToken', async () => {
    getTenantStorage.mockResolvedValue({
      organizationId: 2, bytes: 5 * 1024 ** 3, measured: 'partial', tablesCounted: 11, tablesFailed: [],
    });
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x', UPLOAD);

    expect(r.status).toBe(413);
    expect(r.body?.error?.code).toBe('TENANT_STORAGE_QUOTA_EXCEEDED');
    expect(r.reachedHandler).toBe(false);
  });

  it('refuses an over-quota upload on authMiddleware (the global /api gate)', async () => {
    // Both chains or neither. A control mounted on one of two entry points is
    // the exact shape of the four transport bypasses this workstream closed.
    getTenantStorage.mockResolvedValue({
      organizationId: 2, bytes: 5 * 1024 ** 3, measured: 'partial', tablesCounted: 11, tablesFailed: [],
    });
    const { authMiddleware } = await import('../../auth');

    const r = await drive(authMiddleware as unknown as Middleware, 'Bearer x', UPLOAD);

    expect(r.status).toBe(413);
    expect(r.body?.error?.code).toBe('TENANT_STORAGE_QUOTA_EXCEEDED');
    expect(r.reachedHandler).toBe(false);
  });

  it('admits an upload that fits, with the scope still open for the handler', async () => {
    // The negative control. Without this, a guard that refused EVERY upload
    // would satisfy both assertions above.
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x', UPLOAD);

    expect(r.status).toBe(200);
    expect(r.reachedHandler).toBe(true);
    // And the guard has not closed the tenant scope on its way past — a handler
    // that receives the request must still be inside a real RLS boundary.
    expect(r.scoped).toBe(true);
    expect(r.tenantId).toBe('2');
  });

  it('does not evaluate storage on a small JSON write', async () => {
    // A storage limit must block STORAGE, not every mutation. If this ever
    // starts refusing, a tenant near its disk quota can no longer rename a
    // project — which reads to the customer as an unannounced suspension.
    getTenantStorage.mockResolvedValue({
      organizationId: 2, bytes: 500 * 1024 ** 3, measured: 'partial', tablesCounted: 11, tablesFailed: [],
    });
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', 'content-length': '412' },
    });

    expect(r.status).toBe(200);
    expect(r.reachedHandler).toBe(true);
    expect(getTenantStorage).not.toHaveBeenCalled();
  });

  it('tells a SUSPENDED tenant it is suspended, not that it is out of disk', async () => {
    // THE ORDERING CLAIM. Both `middleware/auth.ts` and `auth.ts` carry a comment
    // saying the lifecycle guard must run first because "a suspended tenant must
    // be told it is suspended, not that it is out of disk". Nothing asserted it.
    //
    // It matters commercially: 413 tells a customer to delete files or buy more
    // storage, and neither restores access.
    //
    // Verified by mutation: swapping the two mounts in `middleware/auth.ts`
    // fails this test and the past-due one below, and nothing else in this file
    // — the other thirteen assertions pass under either order, which is exactly
    // why the ordering needed its own assertion.
    organizationRows = [{ status: 'suspended', paymentStatus: 'active' }];
    getTenantStorage.mockResolvedValue({
      organizationId: 2, bytes: 5 * 1024 ** 3, measured: 'partial', tablesCounted: 11, tablesFailed: [],
    });
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x', UPLOAD);

    expect(r.status).toBe(403);
    expect(r.body?.error?.code).toBe('TENANT_SUSPENDED');
    expect(r.reachedHandler).toBe(false);
    // And the quota was never even measured — the request was answered before
    // an eleven-table aggregate ran for a tenant that cannot upload anyway.
    expect(getTenantStorage).not.toHaveBeenCalled();
  });

  it('refuses a past-due tenant on an upload, having allowed it a safe verb', async () => {
    // read_only is not "no restriction". The same posture that lets a past-due
    // customer READ their regulatory record must still block a write, and an
    // upload is a write — answered by the lifecycle guard, not the quota.
    organizationRows = [{ status: 'active', paymentStatus: 'past_due' }];
    const { authenticateToken } = await importRealMiddlewareAuth();

    const r = await drive(authenticateToken, 'Bearer x', UPLOAD);

    expect(r.status).toBe(403);
    expect(r.reachedHandler).toBe(false);
    expect(getTenantStorage).not.toHaveBeenCalled();
  });
});
