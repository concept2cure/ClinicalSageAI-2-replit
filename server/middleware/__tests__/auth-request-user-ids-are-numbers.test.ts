/**
 * The request user's ids are numbers under the per-route authenticator, as they
 * are under the global /api gate (GA-D6-05).
 *
 * Every sign-in mints the token's `userId` and `organizationId` as text ("7",
 * "42"). The global gate (server/auth.ts authMiddleware) parses them and puts
 * numbers on `req.user`. `authenticateToken` and `optionalAuth`
 * (middleware/auth.ts), which about sixty route files add per route, built
 * `req.user` again from the raw claims, so behind them a route saw
 * `organizationId: "42"`. A route that passes it to a function taking only a
 * positive integer refused the request: Biostatistics' "Save as a working
 * document" answered 503 on every project until 44f25b3fd patched that one
 * route. This closes the class at its source.
 *
 * A subject that is not an integer (an identity provider's opaque subject) is
 * kept as given: it names no account row, and turning it into NaN or null would
 * lose the identity.
 *
 * The harness is auth-carries-provider.test.ts's: a real signed token through
 * the real authenticator; the pool is a double keyed on the statements the gate
 * issues, and the guards behind the gate are pass-throughs.
 */
import { describe, it, expect, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
      }
      throw new Error(`unmodelled pool query: ${sql}`);
    },
  },
  db: {},
  query: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);
vi.mock('../../services/token-revocation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/token-revocation')>()),
  verifyLiveToken: vi.fn(async () => undefined),
}));

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next();
vi.mock('../orgMembership', async importOriginal => ({
  ...(await importOriginal<typeof import('../orgMembership')>()),
  enforceOrgMembership: passThrough,
}));
vi.mock('../establishRequestTenantScope', async importOriginal => ({
  ...(await importOriginal<typeof import('../establishRequestTenantScope')>()),
  establishRequestTenantScope: passThrough,
}));
vi.mock('../tenantLifecycleGuard', async importOriginal => ({
  ...(await importOriginal<typeof import('../tenantLifecycleGuard')>()),
  enforceTenantLifecycle: passThrough,
}));
vi.mock('../storageQuotaGuard', async importOriginal => ({
  ...(await importOriginal<typeof import('../storageQuotaGuard')>()),
  enforceStorageQuota: passThrough,
}));

const AUTH_TS_MODULE = '../auth.ts';
const importRealMiddlewareAuth = (): Promise<any> => import(/* @vite-ignore */ AUTH_TS_MODULE);

const secret = process.env.JWT_SECRET as string;
const token = (claims: Record<string, unknown>) =>
  jwt.sign({ email: 'member@example.test', role: 'member', type: 'access', ...claims }, secret, { expiresIn: '1h' });

/** Run one authenticator and hand back the request as the handler behind it sees it. */
async function through(which: 'authenticateToken' | 'optionalAuth', bearer: string): Promise<{ req: Request; reached: boolean; status: number }> {
  const mod = await importRealMiddlewareAuth();
  return new Promise((resolve, reject) => {
    const req = { headers: { authorization: `Bearer ${bearer}` }, method: 'GET', path: '/probe', baseUrl: '/api', originalUrl: '/api/probe' } as unknown as Request;
    const res: any = { statusCode: 200 };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = () => { resolve({ req, reached: false, status: res.statusCode }); return res; };
    mod[which](req, res as Response, ((err?: unknown) => (err ? reject(err) : resolve({ req, reached: true, status: 200 }))) as NextFunction);
  });
}

describe.each(['authenticateToken', 'optionalAuth'] as const)('%s builds the request user with numeric ids', (which) => {
  it('turns the text claims "7" and "42" into the numbers 7 and 42', async () => {
    const r = await through(which, token({ userId: '7', organizationId: '42' }));
    expect(r.reached).toBe(true);
    expect(r.req.user).toMatchObject({ id: 7, userId: 7, organizationId: 42 });
  });

  it('keeps numeric claims as they are', async () => {
    const r = await through(which, token({ userId: 7, organizationId: 42 }));
    expect(r.req.user).toMatchObject({ id: 7, userId: 7, organizationId: 42 });
  });

  it('reads the legacy orgId claim the same way', async () => {
    const r = await through(which, token({ userId: '7', orgId: '42' }));
    expect(r.req.user).toMatchObject({ organizationId: 42 });
  });

  it('keeps an opaque subject as given, rather than losing the identity', async () => {
    const r = await through(which, token({ sub: 'idp|a1b2c3', organizationId: '42' }));
    expect(r.req.user).toMatchObject({ id: 'idp|a1b2c3', userId: 'idp|a1b2c3', organizationId: 42 });
  });

  it('does not invent an organisation from a claim that is not a positive integer', async () => {
    for (const bad of ['0', '-3', '4.5', 'acme']) {
      const r = await through(which, token({ userId: '7', organizationId: bad }));
      const org = (r.req.user as { organizationId?: unknown } | undefined)?.organizationId;
      expect(typeof org === 'number' && org > 0, `claim ${bad} became ${String(org)}`).toBe(false);
    }
  });
});

describe('requireOrgAccess compares the requested organisation with the session\'s as text', () => {
  const run = async (where: 'params' | 'query' | 'body', value: unknown) => {
    const { requireOrgAccess } = await importRealMiddlewareAuth();
    const req = { user: { id: 7, userId: 7, organizationId: 42, role: 'member', roles: [] }, params: {}, query: {}, body: {} } as any;
    if (where === 'params') req.params.orgId = value; else if (where === 'query') req.query.organizationId = value; else req.body.organizationId = value;
    const res: any = { statusCode: 200 };
    res.status = (code: number) => { res.statusCode = code; return res; };
    res.json = () => res;
    let admitted = false;
    requireOrgAccess(req, res, () => { admitted = true; });
    return { admitted, status: res.statusCode };
  };

  it('admits the session\'s own organisation, whether the request names it as text or as a number', async () => {
    expect(await run('params', '42')).toEqual({ admitted: true, status: 200 });
    expect(await run('query', '42')).toEqual({ admitted: true, status: 200 });
    expect(await run('body', 42)).toEqual({ admitted: true, status: 200 });
  });

  it('refuses another organisation in either form', async () => {
    expect(await run('params', '43')).toEqual({ admitted: false, status: 403 });
    expect(await run('body', 43)).toEqual({ admitted: false, status: 403 });
  });
});
