import { vi } from 'vitest';

// Env before any module load (same reason as auth-mfa-challenge-factors.test.ts).
vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV = process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET = process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/**
 * A wrong authenticator code at sign-in counts toward the account lockout, in
 * the users row, so every API task sees the same count (U17, launch rows D1/D6;
 * docs/evidence/W2/2026-09-24-multi-task/u17-totp-lockout.md).
 *
 * ── What was wrong ──────────────────────────────────────────────────────────
 * POST /api/auth/mfa/verify, for an account whose second factor is an
 * authenticator, answered a wrong code with an audit row and a 401 and nothing
 * else. It never asked isAccountLocked and never called recordFailedLogin, so
 * no per-account lockout ever followed second-factor guessing. The only brakes
 * were express-rate-limit limiters in each task's memory: production runs two
 * API tasks behind a round-robin load balancer with no shared store, so each
 * task kept its own count, and a new task (a deploy, a scale-out) started at 0.
 * And the password step cleared the lockout count on every right password, so
 * whoever held the password could have cleared any count the second factor
 * built by signing in again.
 *
 * ── How this proves it ──────────────────────────────────────────────────────
 * The REAL route, the REAL auth-security-service and the REAL drizzle handle
 * over in-process Postgres (PGlite) whose users / organizations /
 * organization_users tables are generated from shared/schema.ts. A "task" is a
 * fresh module graph (vi.resetModules): its own router, its own in-memory
 * limiters, the one database. The authenticator check itself
 * (verifyLoginSecondFactor, with its replay guard) is a double that accepts one
 * code: what is under test is what the route does around it.
 */
const holder = vi.hoisted(() => ({ pg: null as any, db: null as any }));
const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (text: string, params?: unknown[]) => holder.pg.query(text, params),
  };
  return {
    get db() {
      return holder.db;
    },
    pool,
    getPool: () => pool,
    getDb: () => holder.db,
  };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

const RIGHT_CODE = '246810';
const mfa = vi.hoisted(() => ({
  verifyMfaChallengeToken: vi.fn((token: string) =>
    token === 'challenge-token'
      ? { userId: '7', email: 'a@acme.test', organizationId: '1', organizationUuid: null, role: 'member' }
      : null,
  ),
  createMfaChallengeToken: vi.fn(() => 'challenge-token'),
  verifyLoginSecondFactor: vi.fn(async (_u: number, code: string) => (code === '246810' ? ('totp' as const) : null)),
}));
const otp = vi.hoisted(() => ({
  createEmailOtp: vi.fn(async (_u: number) => '123456'),
  reissueEmailOtp: vi.fn(async (_u: number): Promise<string | null> => '654321'),
  verifyEmailOtp: vi.fn(async (_u: number, _c: string) => false),
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));

vi.mock('../../services/mfaService', () => mfa);
vi.mock('../../services/emailOtpService', () => otp);
vi.mock('../../services/emailService', () => ({
  isEmailConfigured: () => false,
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(async () => undefined),
  sendVerificationEmail: vi.fn(),
  sendWelcomeEmail: vi.fn(),
}));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: (e: unknown) => authEvents(e) }));
vi.mock('../../services/auditService', () => ({ default: { log: vi.fn(), logAction: vi.fn() } }));
vi.mock('../../services/session-inactivity', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/session-inactivity')>()),
  // Session registration is its own subject (session-inactivity tests); a
  // session here is its claims.
  openSession: vi.fn(async () => ({})),
}));
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
vi.mock('../../services/industry-context/signup-profile', () => ({ primaryIndustryForIndustryMode: vi.fn(), pathwaysForUseCases: vi.fn() }));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({ isDevAuthAllowed: () => false, devAuthDenialReason: () => 'disabled' }));

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core';
import { users, organizations, organizationUsers } from '../../../shared/schema';

const T = 60_000;
/** auth-security-service LOCKOUT_THRESHOLD: the password step's number, and now the second factor's. */
const THRESHOLD = 5;

/** CREATE TABLE from the drizzle definition, so the row has every column the route selects. */
function ddlOf(table: PgTable): string {
  const c = getTableConfig(table);
  const cols = c.columns.map((col) => `"${col.name}" ${col.getSQLType()}${col.primary ? ' PRIMARY KEY' : ''}`);
  return `CREATE TABLE "${c.name}" (${cols.join(', ')});`;
}

const PASSWORD = 'right-password-for-a-test';
const PASSWORD_HASH = bcrypt.hashSync(PASSWORD, 4);

async function seed(mfaMethod: 'totp' | 'email') {
  await holder.pg.exec(`DROP TABLE IF EXISTS users; DROP TABLE IF EXISTS organizations; DROP TABLE IF EXISTS organization_users;
    ${ddlOf(users)} ${ddlOf(organizations)} ${ddlOf(organizationUsers)}`);
  await holder.pg.query(
    `INSERT INTO users (id, email, name, password_hash, status, mfa_enabled, mfa_method, default_organization_id, failed_login_attempts)
     VALUES (7, 'a@acme.test', 'A. Rivera', $1, 'active', $2, $3, 1, 0)`,
    [PASSWORD_HASH, mfaMethod === 'totp', mfaMethod],
  );
  await holder.pg.exec(`INSERT INTO organizations (id, uuid, name) VALUES (1, gen_random_uuid(), 'Acme');
    INSERT INTO organization_users (organization_id, user_id, role) VALUES (1, 7, 'member');`);
}

async function lockRow() {
  const r = await holder.pg.query(`SELECT failed_login_attempts AS attempts, locked_until FROM users WHERE id = 7`);
  return r.rows[0] as { attempts: number | null; locked_until: Date | null };
}

/** One API task: a fresh module graph (router, in-memory limiters), the one database. */
async function task() {
  vi.resetModules();
  const { default: authRoutes } = await import('../auth');
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

const verify = (app: express.Express, code: string, method = 'totp') =>
  request(app).post('/api/auth/mfa/verify').send({ challengeId: 'challenge-token', code, method });

beforeAll(async () => {
  holder.pg = new PGlite();
  holder.db = drizzle(holder.pg);
});
afterAll(async () => {
  await holder.pg.close();
});
beforeEach(() => {
  mfa.verifyLoginSecondFactor.mockClear();
  otp.verifyEmailOtp.mockReset();
  otp.verifyEmailOtp.mockResolvedValue(false);
  authEvents.mockClear();
});

describe('POST /api/auth/mfa/verify — an authenticator account (U17)', () => {
  beforeEach(() => seed('totp'));

  it(`${THRESHOLD} wrong codes lock the account in its users row; the right code is then refused 423 AUTH_002 without being spent`, async () => {
    const app = await task();
    for (let i = 1; i <= THRESHOLD; i++) {
      const r = await verify(app, String(100000 + i));
      expect(r.status, `wrong code ${i} was not refused`).toBe(401);
      expect(r.body.error.code).toBe('AUTH_004');
    }
    const row = await lockRow();
    expect(row.attempts, 'wrong authenticator codes were not counted against the account').toBe(THRESHOLD);
    expect(row.locked_until, `${THRESHOLD} wrong authenticator codes did not lock the account`).not.toBeNull();

    mfa.verifyLoginSecondFactor.mockClear();
    const right = await verify(app, RIGHT_CODE);
    expect(right.status, 'a locked account completed sign-in with its authenticator').toBe(423);
    // The password step's answer for a locked account, word for word.
    expect(right.body).toEqual({
      success: false,
      error: { code: 'AUTH_002', message: 'Account temporarily locked due to too many failed attempts. Try again later.' },
    });
    expect(right.body.accessToken).toBeUndefined();
    expect(mfa.verifyLoginSecondFactor, 'the code was checked (and its step spent) for a locked account').not.toHaveBeenCalled();
    expect(authEvents).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'user_login', userId: 7, outcome: 'failure', reason: 'account_locked' }),
    );
  }, T);

  it('the count is one per account across tasks: wrong codes on two tasks lock it, and a third task refuses the right code', async () => {
    const taskA = await task();
    for (let i = 0; i < 3; i++) expect((await verify(taskA, '000001')).status).toBe(401);
    const taskB = await task();
    for (let i = 0; i < 2; i++) expect((await verify(taskB, '000002')).status).toBe(401);
    expect((await lockRow()).attempts, 'each task kept its own count').toBe(THRESHOLD);

    const taskC = await task(); // e.g. a task started by a deploy: its memory holds nothing
    const r = await verify(taskC, RIGHT_CODE);
    expect(r.status, 'a task that had seen none of the wrong codes signed the account in').toBe(423);
    expect(r.body.accessToken).toBeUndefined();
  }, T);

  it('the last wrong code is audited as the one that locked the account', async () => {
    const app = await task();
    for (let i = 0; i < THRESHOLD; i++) await verify(app, '000003');
    const reasons = authEvents.mock.calls.map(([e]) => (e as { reason?: string }).reason);
    expect(reasons.slice(0, THRESHOLD - 1).every((r) => r === 'invalid_code')).toBe(true);
    expect(reasons[THRESHOLD - 1]).toBe('invalid_code_threshold_exceeded');
  }, T);

  it('a right password does not clear what the second factor counted, so signing in again buys no fresh guesses', async () => {
    const app = await task();
    for (let i = 0; i < THRESHOLD - 1; i++) expect((await verify(app, '000004')).status).toBe(401);
    expect((await lockRow()).attempts).toBe(THRESHOLD - 1);

    const login = await request(app).post('/api/auth/login').send({ email: 'a@acme.test', password: PASSWORD });
    expect(login.status).toBe(200);
    expect(login.body).toMatchObject({ mfaRequired: true, challengeId: 'challenge-token' });
    expect((await lockRow()).attempts, 'the password step cleared the count the authenticator built').toBe(THRESHOLD - 1);

    expect((await verify(app, '000005')).status).toBe(401);
    expect((await lockRow()).locked_until, 'one more wrong code after a fresh password did not lock').not.toBeNull();
    expect((await verify(app, RIGHT_CODE)).status).toBe(423);
  }, T);

  it('a completed sign-in (right code) clears the count the wrong codes built', async () => {
    const app = await task();
    for (let i = 0; i < 2; i++) expect((await verify(app, '000006')).status).toBe(401);
    expect((await lockRow()).attempts).toBe(2);
    const r = await verify(app, RIGHT_CODE);
    expect(r.status).toBe(200);
    expect(typeof r.body.accessToken).toBe('string');
    const row = await lockRow();
    expect(row.attempts).toBe(0);
    expect(row.locked_until).toBeNull();
  }, T);

  it('wrong passwords and wrong codes are one count, one threshold: the password step refuses an account the codes locked', async () => {
    const app = await task();
    for (let i = 0; i < 3; i++) expect((await verify(app, '000007')).status).toBe(401);
    for (let i = 0; i < 2; i++) {
      const r = await request(app).post('/api/auth/login').send({ email: 'a@acme.test', password: 'wrong-password' });
      expect(r.status).toBe(401);
    }
    const r = await request(app).post('/api/auth/login').send({ email: 'a@acme.test', password: PASSWORD });
    expect(r.status).toBe(423);
  }, T);
});

describe('POST /api/auth/mfa/verify — an account whose second factor is an emailed code', () => {
  beforeEach(() => seed('email'));

  it('a locked account completes no sign-in with a challenge issued before the lock, even with a code that would verify', async () => {
    await holder.pg.exec(`UPDATE users SET failed_login_attempts = 5, locked_until = now() + interval '30 minutes' WHERE id = 7`);
    otp.verifyEmailOtp.mockResolvedValue(true); // a code that would verify, if consulted
    const app = await task();
    const r = await verify(app, '123456', 'email');
    expect(r.status, 'a locked account was signed in with an emailed code').toBe(423);
    expect(r.body.error.code).toBe('AUTH_002');
    expect(otp.verifyEmailOtp, 'the emailed code was spent for a locked account').not.toHaveBeenCalled();
  }, T);

  it('control: wrong emailed codes keep their own cap (emailOtpService) and are not added to the account lockout', async () => {
    const app = await task();
    for (let i = 0; i < THRESHOLD; i++) expect((await verify(app, '000008', 'email')).status).toBe(401);
    expect((await lockRow()).attempts).toBe(0);
  }, T);
});
