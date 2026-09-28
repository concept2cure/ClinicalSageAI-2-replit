/**
 * authenticateToken refuses a session idle past its window, and one older than
 * the absolute lifetime (security audit 2026-09-24, IAM-06; plan P1-1).
 *
 * Until 2026-09-26 nothing measured a session's inactivity: a 24-hour access
 * token opened the API for its whole life whether or not anyone was at the
 * keyboard, and the rolling refresh renewed it for ever. The gate now records
 * each request as the session's activity and answers 401 SESSION_IDLE when the
 * last one is older than the session's idle window (the tenant's setting,
 * fixed at sign-in as the `idl` claim; 15 minutes by default), and 401
 * SESSION_LIFETIME when the session began more than 12 hours ago (`sst`).
 *
 * Same scaffold as auth-session-currency.test.ts: the middleware is loaded
 * from auth.ts by a non-literal specifier, the pool is a double keyed on the
 * statements the gate issues, the guards behind the gate are pass-throughs.
 * Redis is away, so the activity store is the in-memory tier and the clock is
 * Date.now, pinned per case.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';

const poolDouble = vi.hoisted(() => ({
  pool: {
    query: async (sql: string) => {
      if (/revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
      }
      throw new Error(`unmodelled pool query: ${sql}`);
    },
  },
  db: {},
}));
vi.mock('../../db.js', () => poolDouble);
vi.mock('../../db', () => poolDouble);
vi.mock('../../services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));

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

import { openSession, resetSessionActivityForTests } from '../../services/session-inactivity';

const AUTH_TS_MODULE = '../auth.ts';
const importRealMiddlewareAuth = (): Promise<any> => import(/* @vite-ignore */ AUTH_TS_MODULE);

const secret = process.env.JWT_SECRET as string;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = Date.parse('2026-09-26T09:00:00Z');
let clock = T0;
const seconds = (ms: number) => Math.floor(ms / 1000);

const baseClaims = { userId: '42', email: 'holder@example.com', organizationId: '7', role: 'user', type: 'access' };
/** An access token of a session: signed at `issuedAt`, session started at `startedAt` (default: the issue). */
const sessionToken = (issuedAt: number, extra: Record<string, unknown> = {}) =>
  jwt.sign({ ...baseClaims, sid: `sid-${issuedAt}-${Math.random()}`, sst: seconds(issuedAt), idl: 15 * 60, ...extra, iat: seconds(issuedAt) }, secret, { expiresIn: '30d' });

interface Outcome {
  status: number;
  body: any;
  reachedHandler: boolean;
}

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
  clock = T0;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  resetSessionActivityForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('authenticateToken — inactivity logoff', () => {
  it('answers 401 SESSION_IDLE for a session with no activity for longer than its idle window, and the handler never runs', async () => {
    const token = sessionToken(T0 - 16 * MINUTE);
    const r = await drive(token);
    expect(r.reachedHandler, 'an idle session opened the API').toBe(false);
    expect(r.status).toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_IDLE');
  });

  it('a request is activity: a session used every 14 minutes stays open, and one left alone for 16 is over', async () => {
    const token = sessionToken(T0 - 14 * MINUTE);
    expect((await drive(token)).reachedHandler).toBe(true); // 14 min after issue: within the window, recorded
    clock = T0 + 14 * MINUTE;
    expect((await drive(token)).reachedHandler).toBe(true); // 14 min after the last request
    clock = T0 + 14 * MINUTE + 16 * MINUTE;
    const r = await drive(token);
    expect(r.reachedHandler).toBe(false);
    expect(r.body?.error?.code).toBe('SESSION_IDLE');
  });

  it('honours the window the tenant set at sign-in (idl), not the default', async () => {
    const token = sessionToken(T0 - 45 * MINUTE, { idl: 60 * 60 });
    expect((await drive(token)).reachedHandler).toBe(true);
  });

  it('answers 401 SESSION_LIFETIME for a session that began more than 12 hours ago, however active', async () => {
    const token = sessionToken(T0 - 5 * MINUTE, { sst: seconds(T0 - 13 * HOUR) });
    const r = await drive(token);
    expect(r.reachedHandler, 'a 13-hour-old session opened the API').toBe(false);
    expect(r.status).toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_LIFETIME');
  });

  it('a token minted before sessions had ids is measured from its own issue', async () => {
    const legacy = jwt.sign({ ...baseClaims, iat: seconds(T0 - 20 * MINUTE) }, secret, { expiresIn: '30d' });
    const r = await drive(legacy);
    expect(r.reachedHandler).toBe(false);
    expect(r.body?.error?.code).toBe('SESSION_IDLE');
    const fresh = jwt.sign({ ...baseClaims, iat: seconds(T0 - 2 * MINUTE) }, secret, { expiresIn: '30d' });
    expect((await drive(fresh)).reachedHandler).toBe(true);
  });

  it('answers 401 SESSION_SUPERSEDED for a session ended by a later sign-in beyond the account\'s limit', async () => {
    const limitOne = { security: { maxConcurrentSessions: 1 } };
    const first = await openSession('42', limitOne, T0);
    const token = jwt.sign({ ...baseClaims, ...first, iat: seconds(T0) }, secret, { expiresIn: '30d' });
    clock = T0 + MINUTE;
    expect((await drive(token)).reachedHandler).toBe(true);
    await openSession('42', limitOne, T0 + 2 * MINUTE);
    clock = T0 + 3 * MINUTE;
    const r = await drive(token);
    expect(r.reachedHandler, 'a session the account signed past kept opening the gate').toBe(false);
    expect(r.status).toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_SUPERSEDED');
  });

  it('optionalAuth attaches no user from a session that is over, and the request continues anonymous', async () => {
    const { optionalAuth } = await importRealMiddlewareAuth();
    const attach = (token: string) =>
      new Promise<unknown>((resolve, reject) => {
        const req = { headers: { authorization: `Bearer ${token}` } } as unknown as Request & { user?: unknown };
        optionalAuth(req, {} as Response, (err?: unknown) => (err ? reject(err) : resolve(req.user)));
      });
    clock = T0;
    expect(await attach(sessionToken(T0 - 2 * MINUTE)), 'a live session attaches its user').toBeTruthy();
    expect(await attach(sessionToken(T0 - 20 * MINUTE)), 'an idle session attached a user').toBeUndefined();
    expect(await attach(sessionToken(T0 - 13 * HOUR, { sst: seconds(T0 - 13 * HOUR) })), 'a 13-hour session attached a user').toBeUndefined();
  });
});
