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
 * The enterprise MFA step asks the account's own factor (security audit
 * 2026-09-24, IAM-08; plan P1-38 (b), the residual the 2026-09-26 lens named).
 *
 * POST /verify-mfa tried the emailed code first for every account and fell
 * back to the authenticator — the shape of the original IAM-08 defect, fixed
 * on routes/auth.ts's /mfa/verify by P1-2 and left on this door. An account
 * with an authenticator never completes sign-in with an emailed code: the
 * emailed code is the factor of accounts WITHOUT one (mfa-enrolment.ts, the
 * same rule /verify-password applies when it decides whether to mail one).
 * These cases pin the order here: the enrolment is read before any code is
 * tried, and for an authenticator account the emailed-code verifier is never
 * called, whatever row might be waiting in email_otps.
 */
const state = vi.hoisted(() => ({
  userRow: null as Record<string, unknown> | null,
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));
const verifyEmailOtp = vi.hoisted(() => vi.fn(async (_userId: number, _code: string) => true));
const mfa = vi.hoisted(() => ({
  verifyLoginSecondFactor: vi.fn(async (_u: number, _c: string) => null as 'totp' | 'recovery' | null),
  verifyMfaChallengeToken: vi.fn(),
  createMfaChallengeToken: vi.fn(),
  verifyToken: vi.fn(),
  verifySecondFactor: vi.fn(),
  isMfaEnabled: vi.fn(),
  generateSecret: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
}));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    },
  };
  // Every drizzle read answers the user row: the enrolment read, the role, the user, the organisation.
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.from = () => chain;
  chain.where = () => chain;
  chain.limit = async () => (state.userRow ? [state.userRow] : []);
  chain.update = () => chain;
  chain.set = () => chain;
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
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: (e: unknown) => authEvents(e) }));
vi.mock('../../services/mfaService', () => mfa);
vi.mock('../../services/emailOtpService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/emailOtpService')>()),
  verifyEmailOtp: (u: number, c: string) => verifyEmailOtp(u, c),
  createEmailOtp: vi.fn(async () => '123456'),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import enterpriseRoutes from '../authEnterprise';

const SECRET = process.env.JWT_SECRET as string;
const account = (factor: 'totp' | 'email') => ({
  id: 7,
  email: 'a@acme.test',
  name: 'A. Rivera',
  passwordHash: 'unused',
  status: 'active',
  defaultOrganizationId: 1,
  mfaEnabled: factor === 'totp',
  mfaSecret: factor === 'totp' ? 'JBSWY3DPEHPK3PXP' : null,
  mfaMethod: factor,
  role: 'member',
});
const partialToken = () =>
  jwt.sign({ userId: '7', email: 'a@acme.test', organizationId: '1', role: 'pending_mfa', mfaPending: true }, SECRET, { expiresIn: '5m' });

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}
const verify = (code: string) => request(app()).post('/api/auth/enterprise/verify-mfa').send({ partialToken: partialToken(), code });

beforeEach(() => {
  state.userRow = account('totp');
  authEvents.mockClear();
  verifyEmailOtp.mockClear();
  verifyEmailOtp.mockResolvedValue(true);
  mfa.verifyLoginSecondFactor.mockClear();
  mfa.verifyLoginSecondFactor.mockResolvedValue(null);
});

describe('POST /verify-mfa asks the account its own factor', () => {
  it('an authenticator account is never verified by an emailed code: the emailed-code verifier is not called, and a wrong authenticator code is 401', async () => {
    // Whatever row might be waiting in email_otps would verify — the door must not ask.
    const r = await verify('123456');
    expect(verifyEmailOtp, 'the emailed code was tried before the enrolment was read').not.toHaveBeenCalled();
    expect(r.status, 'an authenticator account completed sign-in with an emailed code').toBe(401);
    expect(r.body).toMatchObject({ error: 'INVALID_MFA_CODE' });
    expect(JSON.stringify(r.body)).not.toContain('"token"');
    expect(mfa.verifyLoginSecondFactor).toHaveBeenCalledWith(7, '123456');
    expect(authEvents).toHaveBeenCalledWith(expect.objectContaining({ action: 'user_login_mfa_failed', reason: 'invalid_code', userId: 7 }));
  });

  it('an authenticator account signs in with its authenticator code, recorded as totp', async () => {
    mfa.verifyLoginSecondFactor.mockResolvedValueOnce('totp');
    const r = await verify('654321');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, mfaMethod: 'totp' });
    expect(typeof r.body.token).toBe('string');
    expect(verifyEmailOtp).not.toHaveBeenCalled();
  });

  it('an authenticator account signs in with a recovery code, recorded as backup_code', async () => {
    mfa.verifyLoginSecondFactor.mockResolvedValueOnce('recovery');
    const r = await verify('ABCD-EF01');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, mfaMethod: 'backup_code' });
    expect(verifyEmailOtp).not.toHaveBeenCalled();
  });

  it('control: an account without an authenticator is verified by its emailed code, recorded as email', async () => {
    state.userRow = account('email');
    const r = await verify('123456');
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, mfaMethod: 'email' });
    expect(verifyEmailOtp).toHaveBeenCalledWith(7, '123456');
    expect(mfa.verifyLoginSecondFactor).not.toHaveBeenCalled();
  });

  it('control: an account without an authenticator whose emailed code is wrong is 401, after the authenticator verifier had its turn', async () => {
    state.userRow = account('email');
    verifyEmailOtp.mockResolvedValueOnce(false);
    const r = await verify('000000');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: 'INVALID_MFA_CODE' });
    expect(mfa.verifyLoginSecondFactor).toHaveBeenCalledWith(7, '000000');
  });
});
