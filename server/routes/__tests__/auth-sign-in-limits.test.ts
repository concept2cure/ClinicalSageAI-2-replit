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
 * Sign-in limits are per account; an office behind one address can sign in
 * (D6, 2026-09-29 — the validation package's hand-on "the sign-in limiter
 * counts per client IP, not per account", VSR-001 §18.4).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * `loginLimiter` and `mfaLimiter` (routes/auth.ts) allowed ten requests per
 * client IP in fifteen minutes, successes included, whoever made them. A
 * sign-in is a password step and a second-factor step, so the eleventh
 * colleague behind an office's one outbound address — or behind one
 * CloudFront edge, while the load balancer trusts one hop — was refused
 * 429 RATE_LIMIT at both, for a quarter of an hour. Reproduced here through
 * the real router: ten colleagues in, the eleventh refused.
 *
 * ── What protects an account now ────────────────────────────────────────────
 * Password guessing on one account: the per-account lockout (five failed
 * passwords, auth-security-service), and a per-account limit on failed
 * sign-ins keyed by the address signed in with, which also covers addresses
 * with no account. Second-factor guessing on one account: a per-account limit
 * keyed by the verified challenge's account — wrong authenticator and
 * recovery codes counted nothing per account before. Spraying from one
 * address: the enterprise /api/auth limit, failures only, at a ceiling an
 * office can live with (sign-in-office-address.test.ts). No layer counts a
 * successful sign-in against the address it came from.
 */
const state = vi.hoisted(() => ({
  rows: [] as Record<string, unknown>[],
}));
const mfa = vi.hoisted(() => ({
  verifyMfaChallengeToken: vi.fn((c: string) => (/^c-\d+$/.test(c) ? { userId: c.slice(2), email: `${c}@acme.test`, organizationId: '1', organizationUuid: null, role: 'member' } : null)),
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
  reissueEmailOtp: vi.fn(async (_u: number): Promise<string | null> => '654321'),
  verifyEmailOtp: vi.fn(async (_u: number, _c: string) => true),
}));
const mail = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(async (_to: string, _code: string) => undefined),
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
  // The pre-auth account lookup (public.user_id_for_email / user_id_for_reset_token,
  // services/auth/pre-auth-account.ts) answers with the id of the row this double reads.
  chain.execute = async () => ({ rows: [{ id: (state.rows[0] as { id?: number } | undefined)?.id ?? null }] });
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
vi.mock('../../services/emailService', () => mail);
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
import jwt from 'jsonwebtoken';
import authRoutes from '../auth';


import { SIGN_IN_LIMITS } from '../../config/platform-limits';

const ACCOUNT = { id: 7, email: 'a@acme.test', mfaEnabled: false, mfaMethod: 'email', defaultOrganizationId: 1, role: 'member', status: 'active', name: 'A. Rivera', organizationId: 1, passwordHash: bcrypt.hashSync('right-password', 4) };

/** Each case signs in from an address of its own: the limiters' stores are module-global. */
let office = 10;
function behindOneAddress() {
  const a = express();
  a.set('trust proxy', 1);
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  const address = `198.51.100.${office++}`;
  return {
    login: (email: string, password: string) =>
      request(a).post('/api/auth/login').set('X-Forwarded-For', address).send({ email, password }),
    verify: (challengeId: string, code: string) =>
      request(a).post('/api/auth/mfa/verify').set('X-Forwarded-For', address).send({ challengeId, code, method: 'email' }),
    /** The signed-in person's own authenticator: confirm an enrolment, or remove it, with a code. */
    enrolment: (door: 'enable' | 'disable', userId: number, body: Record<string, unknown>) =>
      request(a)
        .post(`/api/auth/mfa/${door}`)
        .set('X-Forwarded-For', address)
        .set('Authorization', `Bearer ${sessionOf(userId)}`)
        .send(body),
  };
}

/** A live access token for `userId`, as /mfa/verify issues one. */
function sessionOf(userId: number): string {
  return jwt.sign(
    { userId: String(userId), email: `u${userId}@acme.test`, organizationId: '1', role: 'member', type: 'access' },
    process.env.JWT_SECRET as string,
    { algorithm: 'HS256', expiresIn: '5m' },
  );
}

beforeEach(() => {
  state.rows = [ACCOUNT];
  otp.verifyEmailOtp.mockReset();
  otp.verifyEmailOtp.mockImplementation(async (_u: number, c: string) => c === '123456');
  mfa.enableMfa.mockReset();
  mfa.enableMfa.mockImplementation(async (_u: number, c: string) => (c === '123456' ? { success: true, backupCodes: [] } : { success: false }));
  mfa.disableMfa.mockReset();
  mfa.disableMfa.mockImplementation(async (_u: number, c: string) => c === '123456');
});
afterEach(() => vi.restoreAllMocks());

describe('an office behind one address', () => {
  it('eleven colleagues — and forty — sign in, password and second factor, and none is refused', async () => {
    const office = behindOneAddress();
    const refused: string[] = [];
    for (let i = 1; i <= 40; i++) {
      const l = await office.login(`colleague${i}@acme.test`, 'right-password');
      const v = await office.verify(`c-${100 + i}`, '123456');
      if (l.status === 429) refused.push(`colleague ${i}: password step`);
      if (v.status === 429) refused.push(`colleague ${i}: second-factor step`);
      expect(l.status).toBe(200);
      expect(v.status).toBe(200);
    }
    expect(refused, 'a colleague was refused because of the others').toEqual([]);
  });
});

describe('one account is still protected', () => {
  it('failed passwords for one address signed in with are refused past the per-account limit — and nobody else is', async () => {
    const office = behindOneAddress();
    const max = SIGN_IN_LIMITS.loginFailuresPerAccount.max;
    for (let i = 0; i < max; i++) expect((await office.login('target@acme.test', 'wrong-password')).status).toBe(401);
    const refused = await office.login('Target@ACME.test ', 'wrong-password');
    expect(refused.status, 'the per-account limit keys on the normalised address').toBe(429);
    // A colleague at the same address is unaffected.
    expect((await office.login('colleague@acme.test', 'right-password')).status).toBe(200);
  });

  it('wrong second-factor codes for one account are refused past the per-account limit — the next account is not', async () => {
    const office = behindOneAddress();
    const max = SIGN_IN_LIMITS.mfaFailuresPerAccount.max;
    for (let i = 0; i < max; i++) expect((await office.verify('c-900', '000000')).status).toBe(401);
    expect((await office.verify('c-900', '123456')).status, 'guessing continued past the per-account limit').toBe(429);
    expect((await office.verify('c-901', '123456')).status).toBe(200);
  });

  it('a successful sign-in spends none of the account\u2019s allowance', async () => {
    const office = behindOneAddress();
    for (let i = 0; i < SIGN_IN_LIMITS.loginFailuresPerAccount.max + 5; i++) {
      expect((await office.login('frequent@acme.test', 'right-password')).status).toBe(200);
    }
  });
});

/**
 * P-25 (2026-10-08): wrong codes where a signed-in person confirms or removes
 * their authenticator count against the account, as at /mfa/verify. Only the
 * per-address failure bucket applied there, so a session could guess codes at
 * /mfa/disable at the rate an office address is allowed.
 */
describe('confirming or removing an authenticator counts wrong codes per account', () => {
  it('/mfa/enable: wrong codes past the per-account limit are refused, and the next account is not', async () => {
    const office = behindOneAddress();
    const max = SIGN_IN_LIMITS.mfaFailuresPerAccount.max;
    for (let i = 0; i < max; i++) expect((await office.enrolment('enable', 910, { code: '000000' })).status).toBe(401);
    const refused = await office.enrolment('enable', 910, { code: '123456' });
    expect(refused.status, 'guessing continued past the per-account limit').toBe(429);
    expect(refused.body.error?.code).toBe('RATE_LIMIT');
    expect(mfa.enableMfa, 'a refused request reaches no verifier').toHaveBeenCalledTimes(max);
    expect((await office.enrolment('enable', 911, { code: '123456' })).status).toBe(200);
  });

  it('/mfa/disable: wrong codes past the per-account limit are refused, and the next account is not', async () => {
    const office = behindOneAddress();
    const max = SIGN_IN_LIMITS.mfaFailuresPerAccount.max;
    for (let i = 0; i < max; i++) expect((await office.enrolment('disable', 920, { code: '000000' })).status).toBe(401);
    expect((await office.enrolment('disable', 920, { code: '123456' })).status).toBe(429);
    expect((await office.enrolment('disable', 921, { code: '123456' })).status).toBe(200);
  });

  it('one allowance per account: guesses at /mfa/verify and at /mfa/disable are one count', async () => {
    const office = behindOneAddress();
    const max = SIGN_IN_LIMITS.mfaFailuresPerAccount.max;
    const half = Math.floor(max / 2);
    for (let i = 0; i < half; i++) expect((await office.verify('c-930', '000000')).status).toBe(401);
    for (let i = half; i < max; i++) expect((await office.enrolment('disable', 930, { code: '000000' })).status).toBe(401);
    expect((await office.enrolment('disable', 930, { code: '123456' })).status).toBe(429);
    expect((await office.verify('c-930', '123456')).status).toBe(429);
  });

  it("a session's guesses are counted against its own account, whatever challenge the body names", async () => {
    const office = behindOneAddress();
    const max = SIGN_IN_LIMITS.mfaFailuresPerAccount.max;
    // Each guess names a different account's challenge; the count stays on the session's account.
    for (let i = 0; i < max; i++) {
      expect((await office.enrolment('disable', 940, { code: '000000', challengeId: `c-${9400 + i}` })).status).toBe(401);
    }
    expect((await office.enrolment('disable', 940, { code: '123456' })).status).toBe(429);
  });

  it('a right code spends none of the allowance', async () => {
    const office = behindOneAddress();
    for (let i = 0; i < SIGN_IN_LIMITS.mfaFailuresPerAccount.max + 3; i++) {
      expect((await office.enrolment('enable', 950, { code: '123456' })).status).toBe(200);
    }
  });
});
