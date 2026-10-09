/**
 * A guarded request's role is the membership row's role, read now — not the
 * role minted into the token at login (security audit 2026-09-24 IAM-10, plan
 * P1-4).
 *
 * Drives the real authenticateToken: a real signed token, the real
 * enforceOrgMembership over a drizzle-shaped double that answers the membership
 * query with a chosen role, and the real requireRole / requirePlatformAdmin
 * behind them. Until 2026-09-25 admitLiveSession copied `role`/`roles` from the
 * token and nothing overwrote them, so a demoted administrator kept `admin` on
 * every requireRole route for the token's day, and a promotion needed a new
 * sign-in.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const membershipRows = vi.hoisted(() => ({ current: [{ role: 'member', orgUuid: null }] as Array<Record<string, unknown>> }));
const poolDouble = vi.hoisted(() => {
  const chain: any = {};
  for (const m of ['select', 'from', 'leftJoin', 'where']) chain[m] = () => chain;
  chain.limit = async () => membershipRows.current;
  return {
    pool: {
      query: async (sql: string) => {
        if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT status FROM users/i.test(sql)) {
          return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
        }
        throw new Error(`unmodelled pool query: ${sql}`);
      },
    },
    // The drizzle handle enforceOrgMembership reads the membership row through.
    db: chain,
    // requirePlatformAdmin's grants lookup; set per test.
    query: vi.fn(async (): Promise<{ rows: Array<Record<string, unknown>> }> => ({ rows: [] })),
  };
});
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);

const passThrough = (_req: Request, _res: Response, next: NextFunction) => next();
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

import { invalidateOrgMembershipCache } from '../orgMembership';
import { requirePlatformAdmin } from '../requirePlatformAdmin';

const AUTH_TS_MODULE = '../auth.ts';
const importRealMiddlewareAuth = (): Promise<any> => import(/* @vite-ignore */ AUTH_TS_MODULE);

const secret = process.env.JWT_SECRET as string;
const base = { userId: '7', email: 'person@tenant.example', organizationId: '42', type: 'access' };
const tokenWithRole = (role: string, extra: Record<string, unknown> = {}) =>
  jwt.sign({ ...base, role, ...extra }, secret, { expiresIn: '1h' });

interface Admitted {
  req: Request;
  status: number;
  body: any;
  reachedHandler: boolean;
}

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

async function guard(req: Request, ...roles: string[]) {
  const { requireRole } = await importRealMiddlewareAuth();
  const res = mkRes();
  const next = vi.fn();
  requireRole(...roles)(req, res, next);
  return { res, next };
}

beforeEach(() => {
  invalidateOrgMembershipCache();
  membershipRows.current = [{ role: 'member', orgUuid: null }];
  poolDouble.query.mockReset();
  poolDouble.query.mockResolvedValue({ rows: [] });
  delete process.env.PLATFORM_ADMIN_EMAILS;
});
afterEach(() => {
  invalidateOrgMembershipCache();
});

describe('the role a guard reads is the membership row, not the token', () => {
  it('a token still claiming admin for a user the row now says is member: requireRole(admin) refuses', async () => {
    membershipRows.current = [{ role: 'member', orgUuid: null }];
    const r = await admit(tokenWithRole('admin'));
    expect(r.reachedHandler).toBe(true);
    expect(r.req.user?.role).toBe('member');
    const { res, next } = await guard(r.req, 'admin');
    expect(res.statusCode).toBe(403);
    expect(next).not.toHaveBeenCalled();
  });

  it('a token minted as member for a user the row now says is admin: requireRole(admin) admits without a new sign-in', async () => {
    membershipRows.current = [{ role: 'admin', orgUuid: null }];
    const r = await admit(tokenWithRole('member'));
    expect(r.reachedHandler).toBe(true);
    expect(r.req.user?.role).toBe('admin');
    const { next } = await guard(r.req, 'admin');
    expect(next).toHaveBeenCalledOnce();
  });

  it('req.user.roles is expanded from the database role, so a functional grant of that role is honoured', async () => {
    membershipRows.current = [{ role: 'manager', orgUuid: null }];
    const r = await admit(tokenWithRole('viewer', { roles: ['viewer'] }));
    expect(r.reachedHandler).toBe(true);
    expect(r.req.user?.roles).toContain('manager');
    expect(r.req.user?.roles).not.toContain('viewer');
  });

  it('a revoked membership is still refused before any role is read', async () => {
    membershipRows.current = [];
    const r = await admit(tokenWithRole('admin'));
    expect(r.reachedHandler).toBe(false);
    expect(r.status).toBe(403);
    expect(r.body?.error?.code).toBe('AUTH_009');
  });

  it('a platform administrator granted through platform_role_grants still passes requirePlatformAdmin with an org role of member', async () => {
    membershipRows.current = [{ role: 'member', orgUuid: null }];
    poolDouble.query.mockResolvedValue({ rows: [{ role: 'platform_admin' }] });
    const r = await admit(tokenWithRole('member'));
    expect(r.reachedHandler).toBe(true);
    // The grants fallback is keyed by req.userId, which this authenticator did
    // not set before 2026-09-25 (server/auth.ts always did).
    expect((r.req as { userId?: number }).userId).toBe(7);
    const res = mkRes();
    const next = vi.fn();
    await requirePlatformAdmin(r.req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });
});
