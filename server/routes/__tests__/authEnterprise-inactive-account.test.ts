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
 * The enterprise sign-in steps refuse an account that is out of use
 * (security audit 2026-09-24, IAM-18 item 5).
 *
 * POST /verify-password looked the account up, checked the lockout and the
 * password, and minted the MFA-partial token; POST /verify-mfa verified the
 * code and minted the session. Neither read users.status, so a suspended or
 * deprovisioned account completed both steps and received a session, and the
 * audit trail recorded a successful sign-in for it. The main login and its
 * challenge (routes/auth.ts) refuse such an account with AUTH_ACCOUNT_INACTIVE
 * before spending a code; these cases pin the same rule here.
 */
const state = vi.hoisted(() => ({
  status: 'active' as string,
  userRow: null as Record<string, unknown> | null,
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));
const verifyEmailOtp = vi.hoisted(() => vi.fn(async (_userId: number, _code: string) => true));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) {
        return { rows: [{ status: state.status, password_changed_at_seconds: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  // The one drizzle read the password step makes: users by e-mail.
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
vi.mock('../../services/emailOtpService', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/emailOtpService')>()),
  verifyEmailOtp: (u: number, c: string) => verifyEmailOtp(u, c),
  createEmailOtp: vi.fn(async () => '123456'),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import enterpriseRoutes from '../authEnterprise';

const SECRET = process.env.JWT_SECRET as string;
const HASH = bcrypt.hashSync('right-password', 4);
const user = (status: string) => ({
  id: 7,
  email: 'a@acme.test',
  name: 'A. Rivera',
  passwordHash: HASH,
  status,
  defaultOrganizationId: 1,
  mfaEnabled: false,
  mfaSecret: null,
  mfaMethod: 'email',
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

beforeEach(() => {
  state.status = 'active';
  state.userRow = user('active');
  authEvents.mockClear();
  verifyEmailOtp.mockClear();
});

describe('POST /verify-password', () => {
  it('a suspended account is refused (403 AUTH_ACCOUNT_INACTIVE) before its password is compared, and the refusal is audited', async () => {
    state.userRow = user('suspended');
    const r = await request(app()).post('/api/auth/enterprise/verify-password').send({ email: 'a@acme.test', password: 'right-password' });
    expect(r.status, 'a suspended account got past the password step').toBe(403);
    expect(r.body).toMatchObject({ error: 'AUTH_ACCOUNT_INACTIVE' });
    expect(JSON.stringify(r.body)).not.toContain('partialToken');
    expect(authEvents).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', reason: 'account_inactive', userId: 7 }));
  });

  it('control: an active account with the wrong password is 401', async () => {
    const r = await request(app()).post('/api/auth/enterprise/verify-password').send({ email: 'a@acme.test', password: 'wrong' });
    expect(r.status).toBe(401);
  });
});

describe('POST /verify-mfa', () => {
  it('a challenge for an account suspended since it was issued does not become a session; no code is spent', async () => {
    state.status = 'suspended';
    const r = await request(app()).post('/api/auth/enterprise/verify-mfa').send({ partialToken: partialToken(), code: '123456' });
    expect(r.status, 'a suspended account completed the MFA step').toBe(403);
    expect(r.body).toMatchObject({ error: 'AUTH_ACCOUNT_INACTIVE' });
    expect(verifyEmailOtp).not.toHaveBeenCalled();
    expect(authEvents).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', reason: 'account_inactive', userId: 7 }));
  });

  it('control: an active account with a verified code proceeds past the standing check', async () => {
    const r = await request(app()).post('/api/auth/enterprise/verify-mfa').send({ partialToken: partialToken(), code: '123456' });
    expect(r.status).not.toBe(403);
    expect(verifyEmailOtp).toHaveBeenCalled();
  });
});
