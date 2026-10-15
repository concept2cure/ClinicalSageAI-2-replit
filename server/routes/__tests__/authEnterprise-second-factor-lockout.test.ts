import { vi } from 'vitest';

// Env before any module load (same reason as authSurfaceSecurity.test.ts).
vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/**
 * IAM-30 (security review of 2026-10-01, evening): the enterprise second factor
 * bounds guessing per account, as the /api/auth door does.
 *
 * POST /api/auth/enterprise/verify-mfa took a code against a verified partial
 * token and, when it was wrong, wrote an event row and nothing else: no lockout
 * count, no lock check, and only the per-address limiter. The password step
 * cleared the lockout count on every correct password, before the second
 * factor, so even a count would not have held. Someone holding the password of
 * an account with an authenticator could guess six-digit codes from rotating
 * addresses without limit. The /api/auth door (routes/auth.ts /mfa/verify)
 * asks whether the account is locked, counts a wrong authenticator or recovery
 * code toward the lockout, clears the count only once the second factor is
 * right (or at the password step for an account that has none), and limits
 * wrong codes per account (signInLimits.secondFactor). These cases pin the same
 * rules here.
 */
const state = vi.hoisted(() => ({
  userRow: null as Record<string, unknown> | null,
  locked: false,
  /** recordFailedLogin's answer: whether this failure locked the account. */
  locksNow: false,
  /** What verifyLoginSecondFactor answers: the method, or null for a wrong code. */
  secondFactor: null as 'totp' | 'recovery' | null,
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));
const verifyEmailOtp = vi.hoisted(() => vi.fn(async (_userId: number, _code: string) => false));
const lockout = vi.hoisted(() => ({
  isAccountLocked: vi.fn(async (_id: number) => ({ locked: false })),
  recordFailedLogin: vi.fn(async (_id: number) => ({ locked: false, remainingAttempts: 4 })),
  resetFailedLogins: vi.fn(async (_id: number) => undefined),
}));
const verifyLoginSecondFactor = vi.hoisted(() => vi.fn(async (_u: number, _c: string) => null as string | null));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return { rows: [{ status: 'active', password_changed_at_seconds: null, sessions_ended_at_seconds: null }], rowCount: 1 };
      }
      if (/FROM organization_users/i.test(sql)) return { rows: [{ role: 'member' }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  // One chain per read, answering by the fields it selects: the memberships
  // read (sign-in-organisation.ts membershipsOf) gets a membership; every
  // other read gets the account row.
  const chainFor = (fields?: Record<string, unknown>) => {
    const c: Record<string, unknown> = {};
    c.from = () => c;
    c.where = () => c;
    c.set = () => c;
    c.limit = async () =>
      fields && 'organizationId' in fields && 'role' in fields
        ? [{ organizationId: 1, role: 'member' }]
        : state.userRow
          ? [state.userRow]
          : [];
    return c;
  };
  // The pre-auth account lookup (public.user_id_for_email, pre-auth-account.ts)
  // answers with the account the test signs in as.
  const execute = async () => ({ rows: [{ id: (state.userRow as { id?: number } | null)?.id ?? null }] });
  const db = { select: (fields?: Record<string, unknown>) => chainFor(fields), update: () => chainFor(), execute };
  return { db, pool, getPool: () => pool, getDb: () => db };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);
vi.mock('../../auth', () => ({
  authMiddleware: (_req: any, _res: any, next: any) => next(),
  authenticateToken: (_req: any, _res: any, next: any) => next(),
  requireAuth: (_req: any, _res: any, next: any) => next(),
}));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () => ({ valid: true, errors: [] }),
  isAccountLocked: (id: number) => lockout.isAccountLocked(id),
  recordFailedLogin: (id: number) => lockout.recordFailedLogin(id),
  resetFailedLogins: (id: number) => lockout.resetFailedLogins(id),
  isPasswordExpired: vi.fn(async () => false),
  checkPasswordHistory: vi.fn(),
  createElectronicSignature: vi.fn(),
  verifySignatureIntegrity: vi.fn(),
}));
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: (e: unknown) => authEvents(e) }));
vi.mock('../../services/emailOtpService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/emailOtpService')>()),
  verifyEmailOtp: (u: number, c: string) => verifyEmailOtp(u, c),
  createEmailOtp: vi.fn(async () => '123456'),
}));
vi.mock('../../services/mfaService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/mfaService')>()),
  verifyLoginSecondFactor: (u: number, c: string) => verifyLoginSecondFactor(u, c),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import enterpriseRoutes from '../authEnterprise';
import { secondFactorAccountKey } from '../../middleware/sign-in-limits';

const SECRET = process.env.JWT_SECRET as string;
const HASH = bcrypt.hashSync('right-password', 4);
const account = (id: number, factor: 'totp' | 'email') => ({
  id,
  email: `u${id}@acme.test`,
  name: 'A. Rivera',
  passwordHash: HASH,
  status: 'active',
  defaultOrganizationId: 1,
  mfaEnabled: factor === 'totp',
  mfaSecret: factor === 'totp' ? 'encrypted-secret' : null,
  mfaMethod: factor,
  role: 'member',
});
const partialToken = (userId: number) =>
  jwt.sign({ userId: String(userId), email: `u${userId}@acme.test`, organizationId: '1', role: 'pending_mfa', mfaPending: true }, SECRET, { expiresIn: '5m' });

/** Every request from its own address, so the per-address limiter never decides a case. */
let address = 0;
const nextAddress = () => `203.0.113.${(address++ % 250) + 1}`;

function app() {
  const a = express();
  a.set('trust proxy', 1);
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}
const verifyMfa = (userId: number, code = '000000') =>
  request(app()).post('/api/auth/enterprise/verify-mfa').set('X-Forwarded-For', nextAddress()).send({ code, partialToken: partialToken(userId) });
const verifyPassword = () =>
  request(app()).post('/api/auth/enterprise/verify-password').set('X-Forwarded-For', nextAddress()).send({ email: (state.userRow as { email: string }).email, password: 'right-password' });
const reasons = () => authEvents.mock.calls.map(([e]) => (e as { reason?: string }).reason);

beforeEach(() => {
  state.userRow = account(7, 'totp');
  state.locked = false;
  authEvents.mockClear();
  verifyEmailOtp.mockClear();
  verifyLoginSecondFactor.mockReset().mockResolvedValue(null);
  lockout.isAccountLocked.mockReset().mockImplementation(async () => ({ locked: state.locked }));
  lockout.recordFailedLogin.mockReset().mockImplementation(async () => ({ locked: state.locksNow, remainingAttempts: state.locksNow ? 0 : 4 }));
  lockout.resetFailedLogins.mockReset().mockResolvedValue(undefined);
  state.locksNow = false;
});

describe('POST /api/auth/enterprise/verify-mfa: the lockout (IAM-30)', () => {
  it('refuses a locked account before any code is tried (423), and audits it', async () => {
    state.locked = true;
    const res = await verifyMfa(7);
    expect(res.status, JSON.stringify(res.body)).toBe(423);
    expect(res.body.error).toBe('ACCOUNT_LOCKED');
    expect(verifyLoginSecondFactor).not.toHaveBeenCalled();
    expect(verifyEmailOtp).not.toHaveBeenCalled();
    expect(reasons()).toContain('account_locked');
  });

  it('counts a wrong authenticator code toward the lockout', async () => {
    const res = await verifyMfa(7);
    expect(res.status).toBe(401);
    expect(lockout.recordFailedLogin).toHaveBeenCalledWith(7);
    expect(reasons()).toContain('invalid_code');
  });

  it('says so when the wrong code locks the account', async () => {
    state.locksNow = true;
    const res = await verifyMfa(7);
    expect(res.status).toBe(401);
    expect(reasons()).toContain('invalid_code_threshold_exceeded');
  });

  it('clears the count only once the second factor is right', async () => {
    verifyLoginSecondFactor.mockResolvedValue('totp');
    const res = await verifyMfa(7);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(lockout.resetFailedLogins).toHaveBeenCalledWith(7);
  });

  it('control: a wrong emailed code keeps its own cap and is not counted here', async () => {
    state.userRow = account(7, 'email');
    const res = await verifyMfa(7);
    expect(res.status).toBe(401);
    expect(verifyEmailOtp).toHaveBeenCalled();
    expect(lockout.recordFailedLogin).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/enterprise/verify-password: when the count is cleared (IAM-30)', () => {
  it('a right password does not clear the count of an account with an authenticator', async () => {
    const res = await verifyPassword();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(lockout.resetFailedLogins).not.toHaveBeenCalled();
  });

  it('control: a right password clears it for an account whose second factor is the emailed code', async () => {
    state.userRow = account(7, 'email');
    const res = await verifyPassword();
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(lockout.resetFailedLogins).toHaveBeenCalledWith(7);
  });
});

describe('wrong codes are limited per account, whatever the address (IAM-30)', () => {
  it('the account key reads the enterprise partial token, verified', () => {
    expect(secondFactorAccountKey({ partialToken: partialToken(9) })).toBe('user:9');
    // nosemgrep: hardcoded-jwt-secret -- a forged token: the test signs with a wrong secret to prove it is refused
    const forged = jwt.sign({ userId: '9', mfaPending: true }, 'not-the-secret-not-the-secret-not-the-secret');
    expect(secondFactorAccountKey({ partialToken: forged })).toBeNull();
    expect(secondFactorAccountKey({ partialToken: jwt.sign({ userId: '9' }, SECRET) }), 'a token that is not a challenge').toBeNull();
  });

  it('the eleventh wrong code for one account is refused 429, each from a new address', async () => {
    state.userRow = account(9, 'totp');
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await verifyMfa(9)).status);
    expect(statuses.slice(0, 10).every((s) => s === 401), `first ten: ${statuses.slice(0, 10)}`).toBe(true);
    expect(statuses[10]).toBe(429);
  });
});
