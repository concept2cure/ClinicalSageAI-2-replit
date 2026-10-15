import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/**
 * Password reset and invitation activation limits (QA 2026-10-08, j9 finding 7).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * One limiter, five requests per hour per client address, guarded both asking
 * for a reset link and redeeming one (`passwordResetLimiter`, routes/auth.ts),
 * and it counted every request. An invitee whose first password the policy
 * refused spent the budget retrying, a colleague behind the same office address
 * spent it for them, and the refusal gave no time to retry. Reproduced in the
 * walk: two requests, a policy refusal and two successes, then 429.
 *
 * ── What protects the flow now ──────────────────────────────────────────────
 * Two buckets per address (server/config/platform-limits.ts
 * PASSWORD_RESET_LIMITS). Asking for a link: every request counts, since each
 * one can send mail. Redeeming a link: only a refused link counts — invalid,
 * expired, already used, or none presented — which is what a guessing or
 * replaying client produces. Setting the password, and a password the policy
 * refused for a link that is valid, cost nothing. A refusal says when to retry.
 */
const state = vi.hoisted(() => ({
  tokenValid: true,
  policyValid: true,
  rows: [] as Record<string, unknown>[],
}));

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
  chain.limit = async () => (state.tokenValid ? state.rows : []);
  chain.update = () => chain;
  chain.set = () => chain;
  chain.insert = () => chain;
  chain.values = () => chain;
  chain.returning = async () => state.rows.map((r) => ({ id: r.id }));
  chain.then = undefined;
  // The pre-auth account lookup (user_id_for_reset_token / user_id_for_email).
  chain.execute = async () => ({ rows: [{ id: state.tokenValid ? 7 : null }] });
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
vi.mock('../../services/emailService', () => ({ sendPasswordResetEmail: vi.fn(), sendLoginOtpEmail: vi.fn() }));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: vi.fn(async () => undefined) }));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () =>
    state.policyValid ? { valid: true, errors: [] } : { valid: false, errors: ['Password must not contain your name.'] },
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

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../auth';
import { PASSWORD_RESET_LIMITS } from '../../config/platform-limits';

const ACCOUNT = {
  id: 7, email: 'invitee@acme.test', name: 'In Vitee', defaultOrganizationId: 1,
  resetToken: 'hash', resetTokenExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
};

/** Each case comes from an address of its own: the limiters' stores are module-global. */
let office = 10;
function fromOneAddress() {
  const a = express();
  a.set('trust proxy', 1);
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  const address = `203.0.113.${office++}`;
  return {
    confirm: () =>
      request(a).post('/api/auth/password/reset-confirm').set('X-Forwarded-For', address).send({ token: 'tok', newPassword: 'A-new-long-passphrase-9' }),
    ask: () => request(a).post('/api/auth/password/reset-request').set('X-Forwarded-For', address).send({ email: 'invitee@acme.test' }),
  };
}

beforeEach(() => {
  state.tokenValid = true;
  state.policyValid = true;
  state.rows = [ACCOUNT];
});

describe('redeeming a link (activation, reset)', () => {
  it('a password the policy refuses can be retried, past the limit, and then set', async () => {
    const office = fromOneAddress();
    state.policyValid = false;
    for (let i = 0; i < PASSWORD_RESET_LIMITS.refusedLinksPerIp.max + 5; i++) {
      const res = await office.confirm();
      expect(res.status, `attempt ${i + 1}`).toBe(400);
      expect(res.body.error.message).toMatch(/must not contain your name/);
    }
    state.policyValid = true;
    expect((await office.confirm()).status).toBe(200);
  });

  it('refused links are counted: past the limit even a good link waits, and is told how long', async () => {
    const office = fromOneAddress();
    state.tokenValid = false;
    for (let i = 0; i < PASSWORD_RESET_LIMITS.refusedLinksPerIp.max; i++) {
      expect((await office.confirm()).body.error.code).toBe('AUTH_006');
    }
    state.tokenValid = true;
    const refused = await office.confirm();
    expect(refused.status).toBe(429);
    expect(refused.body.error.code).toBe('RATE_LIMIT');
    expect(refused.body.error.message).toMatch(/Try again in (\d+) minutes?\./);
  });

  it('asking for links does not use up redeeming them', async () => {
    const office = fromOneAddress();
    for (let i = 0; i < PASSWORD_RESET_LIMITS.requestsPerIp.max; i++) await office.ask();
    expect((await office.ask()).status).toBe(429);
    expect((await office.confirm()).status).toBe(200);
  });
});

describe('asking for a link', () => {
  it('every request counts, and the refusal says when to retry', async () => {
    const office = fromOneAddress();
    for (let i = 0; i < PASSWORD_RESET_LIMITS.requestsPerIp.max; i++) expect((await office.ask()).status).toBe(200);
    const refused = await office.ask();
    expect(refused.status).toBe(429);
    expect(refused.body.error.message).toMatch(/Try again in (\d+) minutes?\./);
  });

  it('the numbers: five requests and five refused links per address per hour', () => {
    expect(PASSWORD_RESET_LIMITS.requestsPerIp).toEqual({ windowMs: 60 * 60 * 1000, max: 5 });
    expect(PASSWORD_RESET_LIMITS.refusedLinksPerIp).toEqual({ windowMs: 60 * 60 * 1000, max: 5 });
  });
});
