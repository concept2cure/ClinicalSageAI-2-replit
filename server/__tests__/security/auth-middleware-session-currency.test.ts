/**
 * authMiddleware (server/auth.ts, the global /api gate's authenticator) refuses
 * a bearer minted before the account's password changed (security audit
 * 2026-09-24, IAM-04; follow-up to P0-4).
 *
 * P0-4 applied the rule to verifyLiveToken and to middleware/auth.ts
 * authenticateToken and named this authenticator as the remaining gap: it read
 * the standing through isAccountActiveBeforeTenant, which discards the
 * password_changed_at column the same statement returns. A password reset or
 * change stamps `users.password_changed_at`; a token issued before that stamp
 * is a session the holder meant to end, and this gate must answer it exactly
 * like a revoked one — 401 SESSION_ENDED, in this file's flat `{ error, code }`
 * shape — before the tenant membership is even read.
 *
 * The pool is a double keyed on the statements the gate issues (revocation,
 * standing); drizzle's membership lookup is a chain that answers one row and
 * counts how often it was asked. The scope, membership, lifecycle and quota
 * guards behind the gate are pass-throughs, since none is under test here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const state = vi.hoisted(() => ({
  status: 'active' as string,
  passwordChangedAtSeconds: null as string | number | null,
  standingReadFails: false,
  membershipReads: 0,
}));

const dbDouble = vi.hoisted(() => {
  const membership: any = {};
  membership.from = () => membership;
  membership.where = () => membership;
  membership.limit = () => {
    state.membershipReads += 1;
    return Promise.resolve([{ role: 'editor' }]);
  };
  return {
    pool: {
      query: async (sql: string) => {
        if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
        if (/SELECT status FROM users/i.test(sql)) {
          if (state.standingReadFails) throw new Error('standing unreadable');
          return {
            rows: [{ status: state.status, password_changed_at_seconds: state.passwordChangedAtSeconds }],
            rowCount: 1,
          };
        }
        throw new Error(`unmodelled pool query: ${sql}`);
      },
    },
    db: { select: () => membership },
    query: vi.fn(async () => ({ rows: [] })),
  };
});
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../db', () => dbDouble);

// Hoisted with the mocks: the static import of ../../auth below is evaluated
// before this module's own top-level bindings, so a plain const would be read
// by the factories before it is initialised.
const { passThrough } = vi.hoisted(() => ({
  passThrough: (_req: Request, _res: Response, next: NextFunction) => next(),
}));
vi.mock('../../middleware/orgMembership', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/orgMembership')>()),
  enforceOrgMembership: passThrough,
}));
vi.mock('../../middleware/establishRequestTenantScope', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/establishRequestTenantScope')>()),
  establishRequestTenantScope: passThrough,
}));
vi.mock('../../middleware/tenantLifecycleGuard', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/tenantLifecycleGuard')>()),
  enforceTenantLifecycle: passThrough,
}));
vi.mock('../../middleware/storageQuotaGuard', async importOriginal => ({
  ...(await importOriginal<typeof import('../../middleware/storageQuotaGuard')>()),
  enforceStorageQuota: passThrough,
}));

import { authMiddleware } from '../../auth';

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
function drive(token: string): Promise<Outcome> {
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
    authMiddleware(req, res as Response, next as NextFunction);
  });
}

beforeEach(() => {
  state.status = 'active';
  state.passwordChangedAtSeconds = null;
  state.standingReadFails = false;
  state.membershipReads = 0;
});

describe('authMiddleware — a session the password change ended', () => {
  it('answers 401 SESSION_ENDED for a bearer issued before password_changed_at; the handler never runs and the membership is never read', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAtSeconds = String(changed); // bigint arrives as text

    const r = await drive(accessTokenIssuedAt(changed - 3600));

    expect(r.reachedHandler).toBe(false);
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ error: 'This session has ended. Sign in again.', code: 'SESSION_ENDED' });
    expect(state.membershipReads).toBe(0);
  });

  it('admits a bearer issued after the change', async () => {
    const changed = nowSeconds() - 3600;
    state.passwordChangedAtSeconds = changed;

    const r = await drive(accessTokenIssuedAt(changed + 5));

    expect(r.reachedHandler).toBe(true);
    expect(state.membershipReads).toBe(1);
  });

  it('admits a bearer issued in the same second as the change (whole-second rule: the sign-in that follows a change is current)', async () => {
    const changed = nowSeconds() - 3600;
    state.passwordChangedAtSeconds = changed;

    const r = await drive(accessTokenIssuedAt(changed));

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

  it('still answers 401 ACCOUNT_INACTIVE for an account out of use, before the password rule (F-29 unchanged)', async () => {
    state.status = 'suspended';
    state.passwordChangedAtSeconds = nowSeconds() + 60; // would also refuse; standing is answered first
    const r = await drive(accessTokenIssuedAt(nowSeconds()));
    expect(r.status).toBe(401);
    expect(r.body?.code).toBe('ACCOUNT_INACTIVE');
    expect(state.membershipReads).toBe(0);
  });

  it('still answers 503 SESSION_UNCHECKED when the standing cannot be read (never a pass)', async () => {
    state.standingReadFails = true;
    const r = await drive(accessTokenIssuedAt(nowSeconds()));
    expect(r.reachedHandler).toBe(false);
    expect(r.status).toBe(503);
    expect(r.body?.code).toBe('SESSION_UNCHECKED');
    expect(state.membershipReads).toBe(0);
  });
});
