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
 * The enterprise password step answers an unknown e-mail, and an account with
 * no stored password, in the time a wrong password takes (security audit
 * 2026-09-24, IAM-18 item 8; plan P1-2 part 2 closed the main door on
 * 2026-09-26, this closes the other one through the same module).
 *
 * POST /verify-password looked the account up by e-mail and compared the
 * password only for a known account with a stored hash. An unknown address was
 * refused in the time of the lookup alone, a few milliseconds against the
 * quarter of a second a cost-12 bcrypt comparison takes, so a caller could sort
 * a list of addresses into enrolled and not by timing the 401s. An account
 * whose password_hash is null (provisioned, never set) answered the same way at
 * both doors.
 *
 * The pad is services/login-timing-pad.ts: one bcrypt comparison against a hash
 * nobody can sign in with, at the stored hashes' cost. These cases spy on
 * bcrypt.compare and count.
 */
const state = vi.hoisted(() => ({
  userRow: null as Record<string, unknown> | null,
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      if (/SELECT status FROM users/i.test(sql)) return { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 };
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
vi.mock('../../services/emailOtpService', () => ({
  createEmailOtp: vi.fn(async () => '123456'),
  verifyEmailOtp: vi.fn(async () => true),
}));
vi.mock('../../services/emailService', () => ({ sendPasswordResetEmail: vi.fn(), sendLoginOtpEmail: vi.fn(async () => undefined) }));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import enterpriseRoutes from '../authEnterprise';

/** A stored hash at the product's cost, so the pad's cost can be compared with it. */
const STORED_HASH_COST = /^\$2[aby]\$12\$/;
const HASH = bcrypt.hashSync('right-password', 4);
const account = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  email: 'a@acme.test',
  name: 'A. Rivera',
  passwordHash: HASH,
  status: 'active',
  defaultOrganizationId: 1,
  mfaEnabled: false,
  mfaSecret: null,
  mfaMethod: 'email',
  role: 'member',
  ...overrides,
});

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}

const verifyPassword = (email: string, password: string) =>
  request(app()).post('/api/auth/enterprise/verify-password').send({ email, password });

let compare: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  state.userRow = account();
  authEvents.mockClear();
  compare = vi.spyOn(bcrypt, 'compare');
});
afterEach(() => vi.restoreAllMocks());

describe('POST /api/auth/enterprise/verify-password', () => {
  it('an unknown e-mail pays exactly one bcrypt comparison, at the stored hashes\' cost, and is still 401 INVALID_CREDENTIALS', async () => {
    state.userRow = null;
    const r = await verifyPassword('nobody@acme.test', 'whatever-it-is');
    expect(r.status).toBe(401);
    expect(r.body).toMatchObject({ error: 'INVALID_CREDENTIALS' });
    expect(compare, 'no comparison ran for the unknown e-mail: the answer time says the address is not enrolled').toHaveBeenCalledTimes(1);
    expect(String(compare.mock.calls[0][1]), 'the pad does not cost what a stored hash costs').toMatch(STORED_HASH_COST);
    expect(authEvents).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failure', reason: 'unknown_email' }));
  });

  it('a known account with no stored password pays the same one comparison, and is 401', async () => {
    state.userRow = account({ passwordHash: null });
    const r = await verifyPassword('a@acme.test', 'whatever-it-is');
    expect(r.status).toBe(401);
    expect(compare, 'no comparison ran for the account without a password').toHaveBeenCalledTimes(1);
    expect(String(compare.mock.calls[0][1])).toMatch(STORED_HASH_COST);
  });

  it('control: a known account with the wrong password is compared against its own hash only, never the pad', async () => {
    const r = await verifyPassword('a@acme.test', 'wrong');
    expect(r.status).toBe(401);
    for (const call of compare.mock.calls) expect(String(call[1])).toBe(HASH);
  });
});
