/**
 * POST /api/auth/refresh is not activity, and mints nothing for a session that
 * is idle past its window or older than its lifetime (security audit
 * 2026-09-24, IAM-06; plan P1-1).
 *
 * Until 2026-09-26 the client's answer to a 401 was a refresh, which minted a
 * fresh 24-hour access token from any live refresh token, so an idle session
 * refused by the gate would have renewed itself on its next request. The
 * refresh reads the session's activity record (`sid`), refuses with the same
 * codes the gate uses, and carries `sid`, `sst` and `idl` into the tokens it
 * mints so the session keeps its start and its window.
 *
 * Scaffold as auth-mfa-challenge-factors.test.ts: the database is a chain
 * double answering the user and membership reads; Redis is away, so the
 * activity store is the in-memory tier.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-for-unit-tests-padded-to-32-chars';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: vi.fn(async (sql: string) =>
      /SELECT status FROM users/.test(sql) ? { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 } : { rows: [], rowCount: 0 },
    ),
  };
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => state.rows;
  chain.update = () => chain;
  chain.set = () => chain;
  chain.insert = () => chain;
  chain.values = () => chain;
  chain.returning = async () => state.rows;
  chain.then = undefined;
  return { db: chain, pool, getPool: () => pool, getDb: () => chain };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../services/ai-actions/redis-manager.js', () => ({ isRedisAvailable: () => false, getRedisClient: () => null }));
vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('../../services/emailService', () => ({ sendPasswordResetEmail: vi.fn(), sendLoginOtpEmail: vi.fn(async () => undefined) }));
vi.mock('../../services/mfaService', () => ({
  verifyMfaChallengeToken: vi.fn(), createMfaChallengeToken: vi.fn(), verifyToken: vi.fn(), verifySecondFactor: vi.fn(),
  verifyLoginSecondFactor: vi.fn(), isMfaEnabled: vi.fn(), generateSecret: vi.fn(), enableMfa: vi.fn(), disableMfa: vi.fn(),
}));
vi.mock('../../services/emailOtpService', () => ({ createEmailOtp: vi.fn(), verifyEmailOtp: vi.fn() }));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: vi.fn(async () => undefined) }));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () => ({ valid: true, errors: [] }),
  isAccountLocked: vi.fn(async () => ({ locked: false })),
  recordFailedLogin: vi.fn(async () => ({ locked: false, remainingAttempts: 4 })),
  resetFailedLogins: vi.fn(async () => undefined),
  isPasswordExpired: vi.fn(async () => false),
  checkPasswordHistory: vi.fn(),
  createElectronicSignature: vi.fn(),
  verifySignatureIntegrity: vi.fn(),
}));
vi.mock('../../services/industry-context/signup-profile', () => ({ primaryIndustryForIndustryMode: vi.fn(), pathwaysForUseCases: vi.fn() }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({ isDevAuthAllowed: () => false, devAuthDenialReason: () => 'disabled' }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import authRoutes from '../auth';
import { openSession, resetSessionActivityForTests } from '../../services/session-inactivity';
import { config } from '../../config/environment';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const T0 = Date.parse('2026-09-26T09:00:00Z');
let clock = T0;
const seconds = (ms: number) => Math.floor(ms / 1000);
const REFRESH_SECRET = config.jwt.refreshSecret;

/** A refresh token of a session that began at `startedAt` and was last refreshed at `issuedAt`. */
const refreshTokenOf = (startedAt: number, issuedAt = startedAt, extra: Record<string, unknown> = {}) =>
  jwt.sign({ userId: '7', email: 'a@acme.test', type: 'refresh', sid: `sid-${startedAt}-${Math.random()}`, sst: seconds(startedAt), idl: 15 * 60, ...extra, iat: seconds(issuedAt) }, REFRESH_SECRET, { expiresIn: '7d' });

const ACCOUNT = { id: 7, email: 'a@acme.test', defaultOrganizationId: 1, organizationId: 1, role: 'member', status: 'active', passwordChangedAt: null };

beforeEach(() => {
  clock = T0;
  vi.spyOn(Date, 'now').mockImplementation(() => clock);
  state.rows = [ACCOUNT];
  resetSessionActivityForTests();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/auth/refresh — a refresh is not activity', () => {
  it('mints nothing for a session idle past its window (401 SESSION_IDLE)', async () => {
    const r = await request(app()).post('/api/auth/refresh').send({ refreshToken: refreshTokenOf(T0 - 16 * MINUTE) });
    expect(r.status, 'an idle session refreshed itself').toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_IDLE');
    expect(r.body?.accessToken).toBeUndefined();
  });

  it('mints nothing for a session that began more than 12 hours ago (401 SESSION_LIFETIME)', async () => {
    const r = await request(app()).post('/api/auth/refresh').send({ refreshToken: refreshTokenOf(T0 - 13 * HOUR, T0 - 5 * MINUTE) });
    expect(r.status, 'a 13-hour-old session refreshed itself').toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_LIFETIME');
  });

  it('refreshes an active session and carries its id, start and window into both new tokens', async () => {
    const started = T0 - 5 * MINUTE;
    const old = refreshTokenOf(started);
    const r = await request(app()).post('/api/auth/refresh').send({ refreshToken: old });
    expect(r.status).toBe(200);
    const oldClaims = jwt.decode(old) as Record<string, unknown>;
    for (const minted of [r.body.accessToken, r.body.refreshToken] as string[]) {
      const claims = jwt.decode(minted) as Record<string, unknown>;
      expect(claims.sid).toBe(oldClaims.sid);
      expect(claims.sst).toBe(seconds(started));
      expect(claims.idl).toBe(15 * 60);
    }
  });

  it('a refresh token minted before sessions had ids is checked for its lifetime only', async () => {
    const legacy = jwt.sign({ userId: '7', email: 'a@acme.test', type: 'refresh', iat: seconds(T0 - 30 * MINUTE) }, REFRESH_SECRET, { expiresIn: '7d' });
    expect((await request(app()).post('/api/auth/refresh').send({ refreshToken: legacy })).status).toBe(200);
    const old = jwt.sign({ userId: '7', email: 'a@acme.test', type: 'refresh', iat: seconds(T0 - 13 * HOUR) }, REFRESH_SECRET, { expiresIn: '30d' });
    const r = await request(app()).post('/api/auth/refresh').send({ refreshToken: old });
    expect(r.status).toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_LIFETIME');
  });

  it('mints nothing for a session ended by a later sign-in beyond the account\'s limit (401 SESSION_SUPERSEDED)', async () => {
    const limitOne = { security: { maxConcurrentSessions: 1 } };
    const first = await openSession('7', limitOne, T0);
    await openSession('7', limitOne, T0 + MINUTE);
    clock = T0 + 2 * MINUTE;
    const r = await request(app()).post('/api/auth/refresh').send({ refreshToken: refreshTokenOf(T0, T0, { sid: first.sid }) });
    expect(r.status, 'a session the account signed past refreshed itself').toBe(401);
    expect(r.body?.error?.code).toBe('SESSION_SUPERSEDED');
    expect(r.body?.accessToken).toBeUndefined();
  });
});
