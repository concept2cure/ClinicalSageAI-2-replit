/**
 * Sign-up hands out no session until the e-mail address is confirmed
 * (security audit 2026-09-24, IAM-17; plan P1-2).
 *
 * Until 2026-09-26 POST /api/auth/signup answered with a 24-hour administrator
 * token for any address. Now the account is created in `pending_verification`,
 * a signed single-purpose link is mailed, the response carries no token, and
 * sign-in for the account is refused with AUTH_EMAIL_UNVERIFIED until
 * POST /verify-email moves it to `active` — from `pending_verification` only, so
 * a link used twice does nothing the second time. A deployment that cannot
 * send mail refuses sign-up (503) rather than create an account nobody can
 * ever activate.
 *
 * Scaffold as auth-refresh-inactivity.test.ts: the database is a chain double
 * keyed by table, the mail service is observed, dev auth is off (the posture of
 * staging and production).
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'refresh-secret-for-unit-tests-padded-to-32-chars';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.STRIPE_API_KEY;
});

const state = vi.hoisted(() => ({
  rows: {} as Record<string, Record<string, unknown>[]>,
  inserts: [] as { table: string; values: Record<string, unknown> }[],
  updates: [] as { table: string; set: Record<string, unknown>; whereSql: string; whereParams: unknown[] }[],
  nextId: 100,
  mailConfigured: true,
  devAuth: false,
}));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: vi.fn(async (sql: string) =>
      /SELECT status FROM users/.test(sql) ? { rows: [{ status: 'active', password_changed_at_seconds: null }], rowCount: 1 } : { rows: [], rowCount: 0 },
    ),
  };
  const nameOf = (table: unknown): string => {
    const t = table as Record<symbol, unknown>;
    return String(t[Symbol.for('drizzle:Name')] ?? '');
  };
  const holds = (row: Record<string, unknown>, sql: string, params: unknown[]) => {
    const re = /"[^"]+"\."([^"]+)"\s*=\s*\$(\d+)/g;
    let m: RegExpExecArray | null;
    const camel = (s: string) => s.replace(/_([a-z])/g, (_x, c: string) => c.toUpperCase());
    while ((m = re.exec(sql))) {
      if (row[camel(m[1])] !== params[Number(m[2]) - 1]) return false;
    }
    return true;
  };
  const toQuery = (cond: unknown) => {
    // Lazily required: the dialect is only needed when a where() is rendered.
    const { PgDialect } = require('drizzle-orm/pg-core');
    return new PgDialect().sqlToQuery(cond as never) as { sql: string; params: unknown[] };
  };
  const select = () => ({
    from: (table: unknown) => {
      const name = nameOf(table);
      let rows = state.rows[name] ?? [];
      const chain = {
        where: (cond: unknown) => {
          const q = toQuery(cond);
          rows = rows.filter(r => holds(r, q.sql, q.params));
          return chain;
        },
        limit: async (n: number) => rows.slice(0, n),
        then: (res: (v: unknown[]) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(rows).then(res, rej),
      };
      return chain;
    },
  });
  const insert = (table: unknown) => ({
    values: (v: Record<string, unknown>) => {
      const name = nameOf(table);
      const row = { id: state.nextId++, ...v };
      state.inserts.push({ table: name, values: v });
      (state.rows[name] ??= []).push(row);
      return {
        returning: async () => [row],
        onConflictDoNothing: () => Promise.resolve(),
        then: (res: (v: unknown) => unknown) => Promise.resolve(undefined).then(res),
      };
    },
  });
  const update = (table: unknown) => ({
    set: (v: Record<string, unknown>) => ({
      where: (cond: unknown) => {
        const name = nameOf(table);
        const q = toQuery(cond);
        const matched = (state.rows[name] ?? []).filter(r => holds(r, q.sql, q.params));
        for (const r of matched) Object.assign(r, v);
        state.updates.push({ table: name, set: v, whereSql: q.sql, whereParams: q.params });
        return {
          returning: async () => matched,
          then: (res: (v: unknown) => unknown) => Promise.resolve(undefined).then(res),
        };
      },
    }),
  });
  const db = {
    select,
    insert,
    update,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({ select, insert, update }),
  };
  return { db, pool, getPool: () => pool, getDb: () => db };
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
const mail = vi.hoisted(() => ({
  sendVerificationEmail: vi.fn(async () => undefined),
  sendWelcomeEmail: vi.fn(async () => undefined),
}));
vi.mock('../../services/emailService', () => ({
  isEmailConfigured: () => state.mailConfigured,
  sendVerificationEmail: mail.sendVerificationEmail,
  sendWelcomeEmail: mail.sendWelcomeEmail,
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(async () => undefined),
}));
vi.mock('../../services/mfaService', () => ({
  verifyMfaChallengeToken: vi.fn(), createMfaChallengeToken: vi.fn(), verifyToken: vi.fn(), verifySecondFactor: vi.fn(),
  verifyLoginSecondFactor: vi.fn(), isMfaEnabled: vi.fn(), generateSecret: vi.fn(), enableMfa: vi.fn(), disableMfa: vi.fn(),
}));
vi.mock('../../services/emailOtpService', () => ({ createEmailOtp: vi.fn(), verifyEmailOtp: vi.fn() }));
const authEvents = vi.hoisted(() => ({ recordAuthEvent: vi.fn(async () => undefined) }));
vi.mock('../../services/audit/auth-event-audit', () => authEvents);
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
vi.mock('../../services/industry-context/signup-profile', () => ({ primaryIndustryForIndustryMode: () => 'biopharma', pathwaysForUseCases: () => [] }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({ isDevAuthAllowed: () => state.devAuth, devAuthDenialReason: () => 'disabled' }));
vi.mock('../../services/entitlements/launch-scope.js', () => ({ provisionLaunchModules: vi.fn(async () => undefined) }));
vi.mock('../../services/c2c/organization-default-workspace', () => ({
  ensureOrganizationDefaultWorkspace: vi.fn(async () => undefined),
  // Signup enters the new organisation's scope through this binding before its
  // first membership row (D3, 2026-09-26); the mock carries that one method.
  drizzleWorkspaceStore: () => ({ enterOrganizationScope: async () => undefined }),
}));
vi.mock('../../db/tenantStore', () => ({
  runWithTenantScope: (_scope: unknown, fn: () => Promise<unknown>) => fn(),
  runWithPreAuthScope: (fn: () => Promise<unknown>) => fn(),
  getTenantScope: () => null,
}));

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import authRoutes from '../auth';
import { EMAIL_VERIFICATION_TOKEN_TYPE, mintEmailVerificationToken } from '../../services/email-verification';

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

const SIGNUP = {
  email: 'Founder@Example.test',
  password: 'a-long-and-sufficient-passphrase-1',
  companyName: 'Example Bio',
  industryMode: 'biotech',
  firstName: 'Ada',
  lastName: 'Lovelace',
};

beforeEach(() => {
  state.rows = { users: [], organizations: [], organization_users: [], organization_industry_profiles: [] };
  state.inserts = [];
  state.updates = [];
  state.mailConfigured = true;
  state.devAuth = false;
  mail.sendVerificationEmail.mockClear();
  mail.sendWelcomeEmail.mockClear();
  authEvents.recordAuthEvent.mockClear();
});
afterEach(() => vi.restoreAllMocks());

const userInsert = () => state.inserts.find(i => i.table === 'users');

describe('POST /api/auth/signup — no session until the address is confirmed', () => {
  it('creates the account pending verification, mails the link, and answers without a token', async () => {
    const r = await request(app()).post('/api/auth/signup').send(SIGNUP);
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.token, 'a session was handed out for an unconfirmed address').toBeUndefined();
    expect(r.body.verification).toMatchObject({ required: true, email: 'founder@example.test' });
    expect(userInsert()?.values.status).toBe('pending_verification');
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    const [to, , url] = mail.sendVerificationEmail.mock.calls[0] as unknown as [string, string, string];
    expect(to).toBe('founder@example.test');
    expect(url).toMatch(/\/concept2cure\/verify-email#token=/);
    const token = decodeURIComponent(url.split('#token=')[1]);
    const claims = jwt.decode(token) as Record<string, unknown>;
    expect(claims.type).toBe(EMAIL_VERIFICATION_TOKEN_TYPE);
    expect(claims.email).toBe('founder@example.test');
    expect(mail.sendWelcomeEmail, 'the welcome mail waits for the confirmation').not.toHaveBeenCalled();
    expect(authEvents.recordAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'user_signup', outcome: 'success', reason: 'verification_sent' }));
  });

  it('refuses sign-up when the deployment cannot send mail, and creates nothing', async () => {
    state.mailConfigured = false;
    const r = await request(app()).post('/api/auth/signup').send(SIGNUP);
    expect(r.status).toBe(503);
    expect(r.body?.error?.code).toBe('AUTH_SIGNUP_UNAVAILABLE');
    expect(state.inserts).toHaveLength(0);
  });

  it('on a development server with dev auth allowed, the account is active and the token is returned (as before)', async () => {
    state.devAuth = true;
    const r = await request(app()).post('/api/auth/signup').send(SIGNUP);
    expect(r.status).toBe(201);
    expect(typeof r.body.token).toBe('string');
    expect(r.body.verification).toMatchObject({ required: false });
    expect(userInsert()?.values.status).toBe('active');
    expect(mail.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

describe('POST /api/auth/verify-email', () => {
  it('moves the account from pending to active, once, and never from any other status', async () => {
    state.rows.users = [{ id: 7, email: 'founder@example.test', status: 'pending_verification', name: 'Ada' }];
    const token = mintEmailVerificationToken(7, 'founder@example.test');
    const first = await request(app()).post('/api/auth/verify-email').send({ token });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const update = state.updates.find(u => u.table === 'users');
    expect(update?.set).toMatchObject({ status: 'active' });
    expect(update?.whereParams, 'the activation must be conditional on pending_verification').toContain('pending_verification');
    expect(mail.sendWelcomeEmail).toHaveBeenCalledTimes(1);
    expect(authEvents.recordAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'email_verified', outcome: 'success' }));
    // The link used again: the account is already active, nothing is written, the answer is still a confirmation.
    const again = await request(app()).post('/api/auth/verify-email').send({ token });
    expect(again.status).toBe(200);
    expect(state.updates.filter(u => u.table === 'users' && u.set.status === 'active')).toHaveLength(2);
    // A suspended account is not revived by an old link.
    state.rows.users = [{ id: 7, email: 'founder@example.test', status: 'suspended', name: 'Ada' }];
    const suspended = await request(app()).post('/api/auth/verify-email').send({ token });
    expect(suspended.status).toBe(400);
    expect(state.rows.users[0].status).toBe('suspended');
  });

  it('refuses a token of another class, a forged one, and a missing one alike', async () => {
    state.rows.users = [{ id: 7, email: 'founder@example.test', status: 'pending_verification' }];
    const access = jwt.sign({ userId: '7', email: 'founder@example.test', type: 'access' }, process.env.JWT_SECRET as string, { expiresIn: '1h' });
    for (const token of [access, 'not-a-token', undefined]) {
      const r = await request(app()).post('/api/auth/verify-email').send({ token });
      expect(r.status).toBe(400);
      expect(r.body?.error?.code).toBe('AUTH_VERIFY_INVALID');
    }
    expect(state.rows.users[0].status).toBe('pending_verification');
  });
});

describe('POST /api/auth/resend-verification', () => {
  it('answers 202 for every address; mails only an account that is pending', async () => {
    state.rows.users = [{ id: 7, email: 'founder@example.test', status: 'pending_verification', name: 'Ada' }];
    expect((await request(app()).post('/api/auth/resend-verification').send({ email: 'Founder@example.test' })).status).toBe(202);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
    expect((await request(app()).post('/api/auth/resend-verification').send({ email: 'nobody@example.test' })).status).toBe(202);
    state.rows.users[0].status = 'active';
    expect((await request(app()).post('/api/auth/resend-verification').send({ email: 'founder@example.test' })).status).toBe(202);
    expect(mail.sendVerificationEmail).toHaveBeenCalledTimes(1);
  });
});

describe('POST /api/auth/login for an unconfirmed account', () => {
  it('refuses with AUTH_EMAIL_UNVERIFIED after the password is checked, and records the refusal', async () => {
    const passwordHash = await bcrypt.hash('a-long-and-sufficient-passphrase-1', 4);
    state.rows.users = [{ id: 7, email: 'founder@example.test', status: 'pending_verification', passwordHash, defaultOrganizationId: 1, name: 'Ada' }];
    const wrong = await request(app()).post('/api/auth/login').send({ email: 'founder@example.test', password: 'wrong-password-entirely' });
    expect(wrong.status, 'a wrong password must not learn the account state').toBe(401);
    const r = await request(app()).post('/api/auth/login').send({ email: 'founder@example.test', password: 'a-long-and-sufficient-passphrase-1' });
    expect(r.status).toBe(403);
    expect(r.body?.error?.code).toBe('AUTH_EMAIL_UNVERIFIED');
    expect(r.body?.accessToken).toBeUndefined();
    expect(authEvents.recordAuthEvent).toHaveBeenCalledWith(expect.objectContaining({ action: 'user_login', outcome: 'failure', reason: 'email_unverified' }));
  });
});
