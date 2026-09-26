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
 * The login challenge's factors (security audit 2026-09-24, IAM-08 and
 * IAM-18 item 8; plan P1-2, the routes/auth.ts half).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * POST /mfa/verify verified an emailed code, else `verifyToken` (six-digit
 * TOTP only): the recovery-code mode the login screen offers always failed.
 * POST /mfa/resend minted an emailed code for any challenge, an authenticator
 * account's included, so enrolling an authenticator raised nothing: the
 * account could still finish sign-in with a code from its inbox. And an
 * unknown e-mail answered without a bcrypt comparison, so the response time
 * said whether the e-mail was enrolled.
 */
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));
const mfa = vi.hoisted(() => ({
  verifyMfaChallengeToken: vi.fn(() => ({ userId: '7', email: 'a@acme.test', organizationId: '1', organizationUuid: null, role: 'member' })),
  createMfaChallengeToken: vi.fn(() => 'challenge-token'),
  verifyToken: vi.fn(async (_u: number, _c: string) => false),
  verifySecondFactor: vi.fn(async (_u: number, _c: string) => null as 'totp' | null),
  verifyLoginSecondFactor: vi.fn(async (_u: number, _c: string) => null as 'totp' | 'recovery' | null),
  isMfaEnabled: vi.fn(async (_u: number) => true),
  generateSecret: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
}));
const otp = vi.hoisted(() => ({
  createEmailOtp: vi.fn(async (_u: number) => '123456'),
  verifyEmailOtp: vi.fn(async (_u: number, _c: string) => true),
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));

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
vi.mock('../../services/mfaService', () => mfa);
vi.mock('../../services/emailOtpService', () => otp);
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: (e: unknown) => authEvents(e) }));
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
import bcrypt from 'bcryptjs';
import authRoutes from '../auth';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

const AUTHENTICATOR_ACCOUNT = { id: 7, email: 'a@acme.test', mfaEnabled: true, mfaMethod: 'totp', defaultOrganizationId: 1, role: 'member', status: 'active' };
const EMAIL_ACCOUNT = { ...AUTHENTICATOR_ACCOUNT, mfaEnabled: false, mfaMethod: 'email' };

beforeEach(() => {
  state.rows = [AUTHENTICATOR_ACCOUNT];
  for (const f of Object.values(mfa)) (f as { mockClear?: () => void }).mockClear?.();
  otp.createEmailOtp.mockClear();
  otp.verifyEmailOtp.mockClear();
  authEvents.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/auth/mfa/verify', () => {
  it('redeems a recovery code through the login verifier (the login screen\'s "Use a recovery code")', async () => {
    mfa.verifyLoginSecondFactor.mockResolvedValueOnce('recovery');
    const r = await request(app()).post('/api/auth/mfa/verify').send({ challengeId: 'c', code: 'ABCD-EF01', method: 'backup_code' });
    expect(r.body?.error?.code, 'the recovery code was refused as an invalid code').not.toBe('AUTH_004');
    expect(mfa.verifyLoginSecondFactor).toHaveBeenCalledWith(7, 'ABCD-EF01');
  });

  it('never completes an authenticator account\'s sign-in with an emailed code', async () => {
    otp.verifyEmailOtp.mockResolvedValue(true); // a code that would verify, if consulted
    const r = await request(app()).post('/api/auth/mfa/verify').send({ challengeId: 'c', code: '123456', method: 'email' });
    expect(otp.verifyEmailOtp, 'the emailed code was consulted for an authenticator account').not.toHaveBeenCalled();
    expect(r.status).toBe(401);
  });

  it('still verifies an emailed code for an account without an authenticator', async () => {
    state.rows = [EMAIL_ACCOUNT];
    otp.verifyEmailOtp.mockResolvedValue(true);
    const r = await request(app()).post('/api/auth/mfa/verify').send({ challengeId: 'c', code: '123456', method: 'email' });
    expect(otp.verifyEmailOtp).toHaveBeenCalledWith(7, '123456');
    expect(r.body?.error?.code).not.toBe('AUTH_004');
  });
});

describe('POST /api/auth/mfa/resend', () => {
  it('mints no emailed code for an authenticator account (409, names the authenticator and the recovery codes)', async () => {
    const r = await request(app()).post('/api/auth/mfa/resend').send({ challengeId: 'c' });
    expect(r.status, 'an authenticator account was sent an emailed code').toBe(409);
    expect(otp.createEmailOtp).not.toHaveBeenCalled();
    expect(JSON.stringify(r.body)).toMatch(/recovery code/i);
  });

  it('still resends for an account without an authenticator', async () => {
    state.rows = [EMAIL_ACCOUNT];
    const r = await request(app()).post('/api/auth/mfa/resend').send({ challengeId: 'c' });
    expect(r.status).toBe(200);
    expect(otp.createEmailOtp).toHaveBeenCalledWith(7);
  });
});

describe('POST /api/auth/login with an unknown e-mail', () => {
  it('pays the bcrypt comparison a wrong password pays, so the answer time does not say the e-mail is unknown', async () => {
    state.rows = [];
    const compare = vi.spyOn(bcrypt, 'compare');
    const r = await request(app()).post('/api/auth/login').send({ email: 'nobody@acme.test', password: 'whatever-it-is' });
    expect(r.status).toBe(401);
    expect(compare, 'no comparison ran for the unknown e-mail').toHaveBeenCalled();
  });
});
