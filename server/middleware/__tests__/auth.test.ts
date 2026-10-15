/**
 * authenticateToken / optionalAuth — subject-claim enforcement.
 *
 * Ported from PR #495 (May 2026) and adapted to the current authenticator:
 * tokens must now carry `type: 'access'` (requireAccessTokenReason), the
 * secret comes from process.env.JWT_SECRET via verifyJwtWithRotation, and a
 * subject-bearing token is admitted asynchronously only after the revocation /
 * account-standing / membership reads. Those reads are answered by the same
 * pool + drizzle doubles auth-role-from-database.test.ts uses.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const poolDouble = vi.hoisted(() => {
  const chain: any = {};
  for (const m of ['select', 'from', 'leftJoin', 'where']) chain[m] = () => chain;
  chain.limit = async () => [{ role: 'member', orgUuid: null }];
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
    db: chain,
    query: vi.fn(async () => ({ rows: [] })),
  };
});
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);

const passThrough = vi.hoisted(() => (_req: unknown, _res: unknown, next: () => void) => next());
vi.mock('../establishRequestTenantScope', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../establishRequestTenantScope')>()),
  establishRequestTenantScope: passThrough,
}));
vi.mock('../tenantLifecycleGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../tenantLifecycleGuard')>()),
  enforceTenantLifecycle: passThrough,
}));
vi.mock('../storageQuotaGuard', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../storageQuotaGuard')>()),
  enforceStorageQuota: passThrough,
}));

import { authenticateToken, optionalAuth } from '../auth';
import { invalidateOrgMembershipCache } from '../orgMembership';

const SECRET = process.env.JWT_SECRET as string;
const sign = (claims: Record<string, unknown>) =>
  jwt.sign({ type: 'access', ...claims }, SECRET, { algorithm: 'HS256', expiresIn: '1h' });

interface Outcome {
  req: any;
  status: number;
  body: any;
  nextCalled: boolean;
}

/** Run a middleware to completion (it answers, or it calls next). */
function run(mw: (req: Request, res: Response, next: NextFunction) => unknown, token?: string): Promise<Outcome> {
  return new Promise((resolve, reject) => {
    const req: any = {
      headers: token ? { authorization: `Bearer ${token}` } : {},
      method: 'GET',
      path: '/probe',
      baseUrl: '/api',
      originalUrl: '/api/probe',
    };
    const res: any = { statusCode: 200 };
    res.status = vi.fn((c: number) => {
      res.statusCode = c;
      return res;
    });
    res.json = vi.fn((body: unknown) => {
      resolve({ req, status: res.statusCode, body, nextCalled: false });
      return res;
    });
    const next = (err?: unknown) => (err ? reject(err) : resolve({ req, status: 200, body: null, nextCalled: true }));
    mw(req as Request, res as Response, next as NextFunction);
  });
}

beforeEach(() => invalidateOrgMembershipCache());

describe('authenticateToken — subject claim enforcement', () => {
  it('rejects a token with no subject claim (no fallback to id=0)', async () => {
    const r = await run(authenticateToken, sign({ email: 'x@example.com' }));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_007');
    expect(r.nextCalled).toBe(false);
    expect(r.req.user).toBeUndefined();
  });

  it('rejects a token with sub=0', async () => {
    const r = await run(authenticateToken, sign({ sub: 0, email: 'x@example.com' }));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_007');
    expect(r.nextCalled).toBe(false);
  });

  it('accepts a token with a valid userId claim', async () => {
    const r = await run(authenticateToken, sign({ userId: 42, email: 'x@example.com', organizationId: 7 }));
    expect(r.nextCalled).toBe(true);
    expect(r.req.user.id).toBe(42);
    expect(r.req.user.userId).toBe(42);
  });

  it('returns 401 AUTH_001 when token is missing', async () => {
    const r = await run(authenticateToken);
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_001');
    expect(r.nextCalled).toBe(false);
  });

  it('rejects a subject-bearing token that is not an access token', async () => {
    const r = await run(authenticateToken, sign({ userId: 42, type: 'refresh' }));
    expect(r.status).toBe(401);
    expect(r.body.error.code).toBe('AUTH_008');
  });
});

describe('optionalAuth — subject claim handling', () => {
  it('continues unauthenticated when token has no subject claim', async () => {
    const r = await run(optionalAuth, sign({ email: 'x@example.com' }));
    expect(r.nextCalled).toBe(true);
    expect(r.req.user).toBeUndefined();
  });

  it('attaches user when token has a valid subject', async () => {
    const r = await run(optionalAuth, sign({ sub: 'user-abc' }));
    expect(r.nextCalled).toBe(true);
    expect(r.req.user.id).toBe('user-abc');
  });
});
