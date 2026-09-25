/**
 * authenticateToken refuses a bearer minted before the account's password
 * changed (security audit 2026-09-24, IAM-04).
 *
 * The /api gate already refuses a signed-out token (AUTH-03) and an account out
 * of use (VSR-001 F-29) before any user is attached. A password reset or change
 * stamps `users.password_changed_at`; a token issued before that stamp is a
 * session the account holder meant to end, and is answered exactly like a
 * revoked one: 401 SESSION_ENDED, and the handler never runs.
 *
 * The middleware is loaded from auth.ts by a non-literal specifier for the
 * reason auth-establishes-scope.integration.test.ts documents (a .js twin
 * shadows it under vitest's resolution). The pool is a double keyed on the
 * statements the gate issues; the membership, scope, lifecycle and quota
 * guards behind the gate are pass-throughs, since none is under test here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const state = vi.hoisted(() => ({
  status: 'active' as string,
  passwordChangedAtSeconds: null as string | number | null,
}));

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return {
          rows: [{ status: state.status, password_changed_at_seconds: state.passwordChangedAtSeconds }],
          rowCount: 1,
        };
      }
      throw new Error(`unmodelled pool query: ${sql}`);
    },
  },
  db: {},
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

const AUTH_TS_MODULE = '../auth.ts';
const importRealMiddlewareAuth = (): Promise<any> => import(/* @vite-ignore */ AUTH_TS_MODULE);

const secret = process.env.JWT_SECRET as string;
const nowSeconds = () => Math.floor(Date.now() / 1000);
const claims = { userId: '42', email: 'holder@example.com', organizationId: '7', role: 'user', type: 'access' };
// exp is measured from the iat given: a long life so a session issued long ago
// is still valid on signature, and only the rule under test can refuse it.
const accessTokenIssuedAt = (iat: number) => jwt.sign({ ...claims, iat }, secret, { expiresIn: '30d' });

interface Outcome {
  status: number;
  body: any;
  reachedHandler: boolean;
}

/** Run the middleware and settle on whichever comes first: an answer or next(). */
async function drive(token: string): Promise<Outcome> {
  const { authenticateToken } = await importRealMiddlewareAuth();
  return new Promise<Outcome>((resolve, reject) => {
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
      resolve({ status: res.statusCode, body, reachedHandler: false });
      return res;
    };
    const next = (err?: unknown) => {
      if (err) reject(err);
      else resolve({ status: 200, body: null, reachedHandler: true });
    };
    authenticateToken(req, res as Response, next as NextFunction);
  });
}

beforeEach(() => {
  state.status = 'active';
  state.passwordChangedAtSeconds = null;
});

describe('authenticateToken — a session the password change ended', () => {
  it('answers 401 SESSION_ENDED for a bearer issued before password_changed_at, and the handler never runs', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAtSeconds = String(changed); // bigint arrives as text

    const r = await drive(accessTokenIssuedAt(changed - 3600));

    expect(r.reachedHandler).toBe(false);
    expect(r.status).toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_ENDED');
  });

  it('admits a bearer issued after the change', async () => {
    const changed = nowSeconds() - 3600;
    state.passwordChangedAtSeconds = changed;

    const r = await drive(accessTokenIssuedAt(changed + 5));

    expect(r.reachedHandler).toBe(true);
  });

  it('admits a bearer for an account that never changed its password', async () => {
    const r = await drive(accessTokenIssuedAt(nowSeconds() - 86_000));
    expect(r.reachedHandler).toBe(true);
  });

  it('outside production, admits a bearer that carries no iat (fixtures build claims by hand); production refuses it — pinned on the rule in account-standing', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAtSeconds = changed;
    const noIat = jwt.sign(claims, secret, { expiresIn: '1h', noTimestamp: true });

    const r = await drive(noIat);

    expect(r.reachedHandler).toBe(true);
  });

  it('still answers 401 ACCOUNT_INACTIVE for an account out of use (F-29 unchanged)', async () => {
    state.status = 'suspended';
    const r = await drive(accessTokenIssuedAt(nowSeconds()));
    expect(r.status).toBe(401);
    expect(r.body?.error?.code).toBe('ACCOUNT_INACTIVE');
  });
});
