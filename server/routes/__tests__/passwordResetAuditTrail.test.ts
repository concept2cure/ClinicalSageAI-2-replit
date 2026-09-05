/**
 * Every password-reset event reaches the audit trail.
 *
 * ── The defect ───────────────────────────────────────────────────────────────
 * `auth.ts` defines `auditAuthEvent`, and its docstring states the requirement
 * exactly: "21 CFR Part 11 §11.10(e) requires an independent, tamper-evident
 * audit trail for every login attempt, logout, and CREDENTIAL-CHANGING EVENT."
 *
 * The password-reset flow never called it. Not on the request, not on a bad or
 * expired token, and not on the password change itself — which recorded a
 * single `logger.info` and nothing else. An application log is not an audit
 * trail: it is not tamper-evident, it is not retained to record-retention
 * rules, and it is not queryable as one. So the one event in this flow that
 * actually changes a credential left no record an inspector could read.
 *
 * The reset email meanwhile told the recipient "This request is logged per FDA
 * 21 CFR Part 11.10(e)" — a specific, cited claim that was simply not true.
 * The claim is the right one to make about a credential-changing event, so it
 * was made true rather than deleted.
 *
 * ── Why the not-found case is audited too ────────────────────────────────────
 * A burst of reset requests against addresses that do not exist is the signal
 * an investigator looks for, and it is precisely the record that does not exist
 * if only successes are logged. Auditing it leaks nothing: enumeration
 * protection is a property of what the endpoint RETURNS, and the response is
 * asserted here to be byte-identical in both cases.
 */
import { vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV =
    process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'reset-audit-test-secret-padded-to-32-chars-or-more';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

/* The reset routes carry an express-rate-limit guard that answers 429 after a
   handful of calls from one IP. It is correct and stays in production; here it
   would mean only the first case in each describe ever reached a handler, so
   the limiter is a pass-through and the RATE LIMIT is not what is under test. */
vi.mock('express-rate-limit', () => ({
  default: () => (_req: any, _res: any, next: any) => next(),
}));

/** Every audit row the router wrote, in order. */
/* Typed loosely on purpose: the call ARGUMENT is what these tests read, and
   a precise return type makes vitest infer `calls` as an empty tuple, so
   every `calls[n]` read becomes a type error rather than a test. */
const logAction = vi.hoisted(() =>
  vi.fn(async (..._args: any[]): Promise<{ persisted: boolean }> => ({ persisted: true })),
);
vi.mock('../../services/auditService', () => ({
  default: { logAction, log: vi.fn() },
  logAction,
}));

/** A drizzle-shaped stub the two handlers can be driven through. */
const dbState = vi.hoisted(() => ({
  selectRows: [] as unknown[],
  updates: [] as unknown[],
}));
vi.mock('../../db', () => {
  const chain = (rows: unknown[]) => ({
    from: () => chain(rows),
    where: () => chain(rows),
    limit: async () => rows,
    then: (r: (v: unknown[]) => unknown) => Promise.resolve(rows).then(r),
  });
  const db = {
    select: () => chain(dbState.selectRows),
    update: () => ({
      set: (v: unknown) => ({
        where: async () => {
          dbState.updates.push(v);
          return undefined;
        },
      }),
    }),
  };
  const pool = { query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }) };
  return { db, pool, getPool: () => pool, getDb: () => db };
});

vi.mock('../../auth', () => ({
  authMiddleware: (_r: any, _s: any, n: any) => n(),
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));
vi.mock('../../middleware/auth.js', () => ({
  authMiddleware: (_r: any, _s: any, n: any) => n(),
  authenticateToken: (_r: any, _s: any, n: any) => n(),
  requireAuth: (_r: any, _s: any, n: any) => n(),
}));
const sendPasswordResetEmail = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock('../../services/emailService', () => ({
  sendPasswordResetEmail,
  sendLoginOtpEmail: vi.fn(),
}));
vi.mock('../../services/mfaService', () => ({
  generateSecret: vi.fn(), enableMfa: vi.fn(), disableMfa: vi.fn(),
  verifyToken: vi.fn(), detectVerificationMethod: vi.fn(),
}));
vi.mock('../../services/emailOtpService', () => ({
  createEmailOtp: vi.fn(), verifyEmailOtp: vi.fn(),
}));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () => ({ valid: true, errors: [] }),
  isAccountLocked: vi.fn(), recordFailedLogin: vi.fn(), resetFailedLogins: vi.fn(),
  isPasswordExpired: vi.fn(), checkPasswordHistory: vi.fn(),
  createElectronicSignature: vi.fn(), verifySignatureIntegrity: vi.fn(),
}));
vi.mock('../../services/industry-context/signup-profile', () => ({
  primaryIndustryForIndustryMode: vi.fn(), pathwaysForUseCases: vi.fn(),
}));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({
  isDevAuthAllowed: () => false, devAuthDenialReason: () => 'disabled',
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import authRoutes from '../auth';

const app = express();
app.use(express.json());
app.use('/api/auth', authRoutes);

/** The `action` of every audit row written during a request. */
const actions = () => logAction.mock.calls.map((c) => (c[0] as { action: string }).action);

beforeEach(() => {
  logAction.mockClear();
  sendPasswordResetEmail.mockClear();
  dbState.selectRows = [];
  dbState.updates = [];
});

describe('requesting a password reset is audited', () => {
  it('records the request for a real account', async () => {
    dbState.selectRows = [{ id: 7, email: 'user@example.test' }];
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'user@example.test' });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).toHaveBeenCalled();
    expect(
      actions(),
      'the reset email claims this request is logged; nothing logged it',
    ).toContain('user_password_reset_requested');

    const row = logAction.mock.calls
      .map((c) => c[0] as Record<string, any>)
      .find((r) => r.action === 'user_password_reset_requested');
    expect(row!.details.outcome).toBe('success');
    expect(row!.resourceId).toBe('7');
  });

  it('records an attempt against an address with no account', async () => {
    dbState.selectRows = [];
    const res = await request(app)
      .post('/api/auth/forgot-password')
      .send({ email: 'nobody@example.test' });

    expect(res.status).toBe(200);
    expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(actions()).toContain('user_password_reset_requested');
    const row = logAction.mock.calls
      .map((c) => c[0] as Record<string, any>)
      .find((r) => r.action === 'user_password_reset_requested');
    expect(row!.details.outcome).toBe('failure');
  });

  it('still says exactly the same thing either way', async () => {
    /* The audit must not have become an enumeration oracle. Enumeration
       protection is a property of the RESPONSE, and both must be identical. */
    dbState.selectRows = [{ id: 7, email: 'user@example.test' }];
    const found = await request(app).post('/api/auth/forgot-password').send({ email: 'user@example.test' });
    dbState.selectRows = [];
    const missing = await request(app).post('/api/auth/forgot-password').send({ email: 'nobody@example.test' });

    expect(found.status).toBe(missing.status);
    expect(found.body).toEqual(missing.body);
  });
});

describe('changing the password is audited — the credential-changing event', () => {
  const future = () => new Date(Date.now() + 60_000);

  it('records the change itself, which used to be only a logger line', async () => {
    dbState.selectRows = [{ id: 7, resetToken: 'x', resetTokenExpiresAt: future() }];
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'raw-token', newPassword: 'Str0ng-Passphrase!42' });

    expect(res.status).toBe(200);
    expect(
      actions(),
      'a password was changed with no audit row — only logger.info',
    ).toContain('user_password_changed');

    const row = logAction.mock.calls
      .map((c) => c[0] as Record<string, any>)
      .find((r) => r.action === 'user_password_changed');
    expect(row!.details.outcome).toBe('success');
    expect(row!.resourceId).toBe('7');
    // The password itself never reaches the audit trail.
    expect(JSON.stringify(row)).not.toContain('Str0ng-Passphrase!42');
  });

  it('records a token that matched no account', async () => {
    dbState.selectRows = [];
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'stolen-or-guessed', newPassword: 'Str0ng-Passphrase!42' });

    expect(res.status).toBe(400);
    expect(actions()).toContain('user_password_reset_failed');
    // And the token the caller presented is not copied into the record.
    expect(JSON.stringify(logAction.mock.calls)).not.toContain('stolen-or-guessed');
  });

  it('records an expired token', async () => {
    dbState.selectRows = [
      { id: 7, resetToken: 'x', resetTokenExpiresAt: new Date(Date.now() - 60_000) },
    ];
    const res = await request(app)
      .post('/api/auth/reset-password')
      .send({ token: 'raw-token', newPassword: 'Str0ng-Passphrase!42' });

    expect(res.status).toBe(400);
    const row = logAction.mock.calls
      .map((c) => c[0] as Record<string, any>)
      .find((r) => r.action === 'user_password_reset_failed');
    expect(row).toBeTruthy();
    expect(String(row!.details.reason)).toMatch(/expired/i);
  });

  it('does not audit a change it refused before looking anything up', async () => {
    /* A malformed request is not a security event about an account — nothing
       was attempted against one. Auditing it would fill the trail with noise
       that hides the attempts that matter. */
    const res = await request(app).post('/api/auth/reset-password').send({ token: 'only-a-token' });
    expect(res.status).toBe(400);
    expect(actions()).toHaveLength(0);
  });
});
