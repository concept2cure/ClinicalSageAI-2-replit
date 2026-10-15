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
 * A login code that can reach nobody is refused, not claimed.
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * POST /api/auth/login and POST /api/auth/mfa/resend minted a code, fired
 * `sendLoginOtpEmail` without awaiting it, and answered `success: true` with
 * the masked address — whether or not the server could send anything. On a
 * production server with no SMTP credentials `sendLoginOtpEmail` logs an error
 * and returns, so the resend route's `success` carried the sentence "A new
 * verification code has been sent to your email." about a message that was
 * never sent and could never arrive.
 *
 * That is the state `scripts/ops/pilot-go-no-go.mjs` measures and calls the
 * decisive blocker: "SMTP_HOST + SMTP_USER + SMTP_PASS MISSING … NO tester can
 * complete a login." The sign-up handler in the same file already refuses on
 * this condition rather than "create an account nobody can activate"; these
 * cases pin the same rule at the login door.
 *
 * `canDeliverLoginCode` is stubbed here rather than driven through NODE_ENV,
 * which modules in this harness read at import. Its own behaviour against the
 * real environment is pinned by
 * server/services/auth/__tests__/login-code-delivery.test.ts.
 */
const delivery = vi.hoisted(() => ({ deliverable: true }));
vi.mock('../../services/auth/login-code-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auth/login-code-delivery')>()),
  canDeliverLoginCode: () => delivery.deliverable,
}));

const state = vi.hoisted(() => ({ rows: [] as Record<string, unknown>[] }));
const mfa = vi.hoisted(() => ({
  verifyMfaChallengeToken: vi.fn(() => ({ userId: '7', email: 'a@acme.test', organizationId: '1', organizationUuid: null, role: 'member' })),
  createMfaChallengeToken: vi.fn(() => 'challenge-token'),
  verifyToken: vi.fn(async () => false),
  verifySecondFactor: vi.fn(async () => null),
  verifyLoginSecondFactor: vi.fn(async () => null),
  isMfaEnabled: vi.fn(async () => true),
  generateSecret: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
}));
const otp = vi.hoisted(() => ({
  createEmailOtp: vi.fn(async (_u: number) => '123456'),
  reissueEmailOtp: vi.fn(async (_u: number): Promise<string | null> => '654321'),
  verifyEmailOtp: vi.fn(async () => true),
}));
const mail = vi.hoisted(() => ({
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(async (_to: string, _code: string) => undefined),
  sendVerificationEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
  isEmailConfigured: () => false,
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: vi.fn(async (sql: string) =>
      /SELECT status FROM users/.test(sql)
        ? { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 }
        : { rows: [], rowCount: 0 },
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
import authRoutes from '../auth';
import { LOGIN_CODE_UNDELIVERABLE_MESSAGE } from '../../services/auth/login-code-delivery';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

const EMAIL_ACCOUNT = {
  id: 7, email: 'a@acme.test', mfaEnabled: false, mfaMethod: 'email',
  defaultOrganizationId: 1, role: 'member', status: 'active',
};
const TOTP_ACCOUNT = { ...EMAIL_ACCOUNT, mfaEnabled: true, mfaMethod: 'totp' };
const withPassword = (row: Record<string, unknown>) => ({
  ...row, name: 'A. Rivera', organizationId: 1, passwordHash: bcrypt.hashSync('right-password', 4),
});

const signIn = () =>
  request(app()).post('/api/auth/login').send({ email: 'a@acme.test', password: 'right-password' });
const resend = () => request(app()).post('/api/auth/mfa/resend').send({ challengeId: 'c' });
const eventsWithReason = (reason: string) =>
  authEvents.mock.calls.map(c => c[0] as { reason?: string; outcome?: string }).filter(e => e.reason === reason);

beforeEach(() => {
  delivery.deliverable = true;
  state.rows = [withPassword(EMAIL_ACCOUNT)];
  otp.createEmailOtp.mockClear();
  otp.reissueEmailOtp.mockClear();
  mail.sendLoginOtpEmail.mockClear();
  authEvents.mockClear();
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/auth/login when the code cannot be delivered', () => {
  it('refuses with 503 instead of answering success with a masked address', async () => {
    delivery.deliverable = false;
    const r = await signIn();
    expect(r.status, 'a code that can reach nobody was answered as a sent code').toBe(503);
    expect(r.body).toMatchObject({ success: false, error: { code: 'AUTH_OTP_UNDELIVERABLE' } });
    expect(r.body.error.message).toBe(LOGIN_CODE_UNDELIVERABLE_MESSAGE);
    expect(r.body.maskedEmail, 'the refusal still said where a code had gone').toBeUndefined();
    expect(r.body.mfaRequired).toBeUndefined();
    expect(r.body.challengeId).toBeUndefined();
  });

  it('mints no code and sends no mail', async () => {
    delivery.deliverable = false;
    await signIn();
    expect(otp.createEmailOtp, 'a code was minted that nothing could deliver').not.toHaveBeenCalled();
    expect(mail.sendLoginOtpEmail).not.toHaveBeenCalled();
  });

  /* The ledger says the challenge was never issued, not that it was issued and
     ignored: an inspector reading `outcome: 'success'` here would conclude the
     account received a code. */
  it('records the challenge as a failure, with the undeliverable reason', async () => {
    delivery.deliverable = false;
    await signIn();
    expect(eventsWithReason('mfa_challenge_email_undeliverable')).toEqual([
      expect.objectContaining({ action: 'user_login_mfa_challenge', outcome: 'failure', userId: 7 }),
    ]);
    expect(eventsWithReason('mfa_challenge_email')).toEqual([]);
  });

  /* An authenticator account needs no emailed code, so nothing about mail may
     stand between it and its challenge. */
  it('still issues an authenticator challenge, which needs no mail', async () => {
    delivery.deliverable = false;
    state.rows = [withPassword(TOTP_ACCOUNT)];
    const r = await signIn();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, mfaRequired: true });
    expect(eventsWithReason('mfa_challenge_totp')).toEqual([
      expect.objectContaining({ outcome: 'success' }),
    ]);
  });

  it('control: issues the emailed challenge when the code can be delivered', async () => {
    const r = await signIn();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, mfaRequired: true, maskedEmail: expect.any(String) });
    expect(otp.createEmailOtp).toHaveBeenCalledWith(7);
    expect(eventsWithReason('mfa_challenge_email')).toEqual([
      expect.objectContaining({ outcome: 'success' }),
    ]);
  });
});

describe('POST /api/auth/mfa/resend when the code cannot be delivered', () => {
  it('refuses with 503 instead of saying a new code has been sent', async () => {
    delivery.deliverable = false;
    const r = await resend();
    expect(r.status).toBe(503);
    expect(r.body).toMatchObject({ success: false, error: { code: 'AUTH_OTP_UNDELIVERABLE' } });
    expect(JSON.stringify(r.body), 'the refusal still claimed a code had been sent').not.toMatch(/has been sent/i);
  });

  /* A resend budget is spent per challenge (MAX_RESENDS). Spending one on a
     code nothing can deliver takes the tester's remaining attempts with it. */
  it('spends none of the challenge\'s resend budget', async () => {
    delivery.deliverable = false;
    await resend();
    expect(otp.reissueEmailOtp).not.toHaveBeenCalled();
    expect(mail.sendLoginOtpEmail).not.toHaveBeenCalled();
  });

  it('records the refusal against the account', async () => {
    delivery.deliverable = false;
    await resend();
    expect(eventsWithReason('mfa_challenge_email_undeliverable')).toEqual([
      expect.objectContaining({ action: 'user_login_mfa_challenge', outcome: 'failure', userId: 7 }),
    ]);
  });

  it('control: re-issues through the capped re-issue when the code can be delivered', async () => {
    const r = await resend();
    expect(r.status).toBe(200);
    expect(otp.reissueEmailOtp).toHaveBeenCalledWith(7);
    expect(mail.sendLoginOtpEmail).toHaveBeenCalledWith('a@acme.test', '654321');
  });
});
