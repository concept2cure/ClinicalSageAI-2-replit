/**
 * authenticateToken carries the token's `provider` claim onto req.user, so a
 * guard behind it can tell a federated (SAML) session from a password one
 * (security audit 2026-09-24, IAM-03; follow-up to P0-3).
 *
 * P0-3 made requirePlatformAdmin skip the PLATFORM_ADMIN_EMAILS allow-list when
 * the token provider is 'saml', reading `req.identity.provider` (set only by
 * server/auth.ts authMiddleware) or else `req.user.provider`. admitLiveSession
 * in middleware/auth.ts set neither, so on every route that uses
 * authenticateToken (billing-dashboard credits/adjust, clinical-regulatory-
 * evidence POST /crl) the allow-list still applied to an e-mail a tenant's IdP
 * asserted. The whole chain is driven here: a real signed token with
 * `provider: 'saml'` through the real authenticateToken, then the real guard.
 *
 * The middleware is loaded from auth.ts by a non-literal specifier for the
 * reason auth-establishes-scope.integration.test.ts documents (a .js twin
 * shadows it under vitest's resolution). The pool is a double keyed on the
 * statements the gate issues; the guards behind the gate are pass-throughs.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
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
  // requirePlatformAdmin's grant fallback: no platform_role_grants row.
  query: vi.fn(async () => ({ rows: [] })),
}));
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);

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

import { isPlatformAdmin, requirePlatformAdmin } from '../requirePlatformAdmin';

const AUTH_TS_MODULE = '../auth.ts';
const importRealMiddlewareAuth = (): Promise<any> => import(/* @vite-ignore */ AUTH_TS_MODULE);

const OWNER = 'owner@concept2cure.ai';
const secret = process.env.JWT_SECRET as string;
const base = { userId: '7', email: OWNER, organizationId: '42', role: 'member', type: 'access' };
const accessToken = (extra: Record<string, unknown> = {}) => jwt.sign({ ...base, ...extra }, secret, { expiresIn: '1h' });

interface Admitted {
  req: Request;
  status: number;
  body: any;
  reachedHandler: boolean;
}

/** Run authenticateToken and hand back the request as the downstream handler sees it. */
async function admit(token: string): Promise<Admitted> {
  const { authenticateToken } = await importRealMiddlewareAuth();
  return new Promise<Admitted>((resolve, reject) => {
    const req = {
      headers: { authorization: `Bearer ${token}` },
      method: 'GET',
      path: '/probe',
      baseUrl: '/api',
      originalUrl: '/api/probe',
    } as unknown as Request;
    const res: any = { statusCode: 200 };
    res.status = (code: number) => {
      res.statusCode = code;
      return res;
    };
    res.json = (body: unknown) => {
      resolve({ req, status: res.statusCode, body, reachedHandler: false });
      return res;
    };
    const next = (err?: unknown) => {
      if (err) reject(err);
      else resolve({ req, status: 200, body: null, reachedHandler: true });
    };
    authenticateToken(req, res as Response, next as NextFunction);
  });
}

function mkRes(): any {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

const savedEnv = process.env.PLATFORM_ADMIN_EMAILS;
beforeEach(() => {
  process.env.PLATFORM_ADMIN_EMAILS = OWNER;
});
afterEach(() => {
  if (savedEnv === undefined) delete process.env.PLATFORM_ADMIN_EMAILS;
  else process.env.PLATFORM_ADMIN_EMAILS = savedEnv;
});

describe('authenticateToken carries the token provider onto req.user', () => {
  it("a token with provider 'saml' yields req.user.provider === 'saml'", async () => {
    const r = await admit(accessToken({ provider: 'saml' }));
    expect(r.reachedHandler).toBe(true);
    expect((r.req.user as { provider?: unknown }).provider).toBe('saml');
  });

  it("a token with no provider claim yields req.user.provider === 'local-jwt' (a password session)", async () => {
    const r = await admit(accessToken());
    expect(r.reachedHandler).toBe(true);
    expect((r.req.user as { provider?: unknown }).provider).toBe('local-jwt');
  });

  it("a provider claim that is not a string is read as 'local-jwt', never as a value the guard could mistake", async () => {
    const r = await admit(accessToken({ provider: 7 }));
    expect(r.reachedHandler).toBe(true);
    expect((r.req.user as { provider?: unknown }).provider).toBe('local-jwt');
  });
});

describe('PLATFORM_ADMIN_EMAILS behind authenticateToken', () => {
  it('does not admit an allow-listed e-mail asserted by an IdP (provider saml): isPlatformAdmin false, requirePlatformAdmin 403', async () => {
    const r = await admit(accessToken({ provider: 'saml' }));
    expect(r.reachedHandler).toBe(true);

    expect(isPlatformAdmin(r.req)).toBe(false);

    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(r.req, res, next);
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('still admits the same e-mail on a password session (no provider claim)', async () => {
    const r = await admit(accessToken());
    expect(r.reachedHandler).toBe(true);

    expect(isPlatformAdmin(r.req)).toBe(true);

    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(r.req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });
});
