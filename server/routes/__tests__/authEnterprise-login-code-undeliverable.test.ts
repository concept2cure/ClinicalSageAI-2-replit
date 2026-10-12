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
 * The enterprise door makes the same refusal as /api/auth/login.
 *
 * POST /api/auth/enterprise/verify-password minted an emailed code, fired
 * `sendLoginOtpEmail` without awaiting it, and answered
 * `{ success: true, requiresMfa: true, mfaMethod: 'email', maskedEmail }`
 * unconditionally. With no SMTP credentials on a production server the code
 * reaches nobody, so the answer told the person a code was on its way to their
 * address while none had been sent and none could arrive.
 *
 * Two doors answering the same condition differently is the failure mode this
 * repository has had before — a second route beside a guarded one — so the two
 * are pinned by two test files reading the same module.
 *
 * `canDeliverLoginCode` is stubbed rather than driven through NODE_ENV, which
 * modules in this harness read at import; its own behaviour against the real
 * environment is pinned by
 * server/services/auth/__tests__/login-code-delivery.test.ts.
 */
const delivery = vi.hoisted(() => ({ deliverable: true }));
vi.mock('../../services/auth/login-code-delivery', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../services/auth/login-code-delivery')>()),
  canDeliverLoginCode: () => delivery.deliverable,
}));

const state = vi.hoisted(() => ({
  userRow: null as Record<string, unknown> | null,
  membershipRows: [] as unknown[],
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));
const otpDouble = vi.hoisted(() => ({ createEmailOtp: vi.fn(async () => '123456') }));
const mailDouble = vi.hoisted(() => ({ sendLoginOtpEmail: vi.fn(async () => undefined) }));

const dbDouble = vi.hoisted(() => {
  const pool = { query: async () => ({ rows: [], rowCount: 0 }) };
  const tableName = (table: unknown) => (table as Record<symbol, unknown> | null)?.[Symbol.for('drizzle:Name')];
  const chain = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    c.select = () => chain(rows);
    c.from = (table: unknown) =>
      chain(tableName(table) === 'organization_users' ? () => state.membershipRows : rows);
    c.where = () => c;
    c.limit = async () => rows();
    c.update = () => c;
    c.set = () => c;
    return c;
  };
  const db = chain(() => (state.userRow ? [state.userRow] : []));
  db.execute = async () => ({ rows: [{ id: (state.userRow as { id?: number } | null)?.id ?? null }] });
  return { db, pool, getPool: () => pool, getDb: () => db };
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
  createEmailOtp: otpDouble.createEmailOtp,
}));
vi.mock('../../services/emailService', () => mailDouble);

import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import enterpriseRoutes from '../authEnterprise';
import { LOGIN_CODE_UNDELIVERABLE_MESSAGE } from '../../services/auth/login-code-delivery';

const HASH = bcrypt.hashSync('right-password', 4);
const account = (overrides: Record<string, unknown> = {}) => ({
  id: 7,
  email: 'colleague@acme.test',
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
const verifyPassword = () =>
  request(app())
    .post('/api/auth/enterprise/verify-password')
    .send({ email: 'colleague@acme.test', password: 'right-password' });
const eventsWithReason = (reason: string) =>
  authEvents.mock.calls.map(c => c[0] as { reason?: string; outcome?: string }).filter(e => e.reason === reason);

beforeEach(() => {
  delivery.deliverable = true;
  state.userRow = account();
  state.membershipRows = [{ organizationId: 1, role: 'member' }];
  authEvents.mockClear();
  otpDouble.createEmailOtp.mockClear();
  mailDouble.sendLoginOtpEmail.mockClear();
});

describe('POST /verify-password when the emailed code cannot be delivered', () => {
  it('refuses with 503 and names no address a code went to', async () => {
    delivery.deliverable = false;
    const r = await verifyPassword();
    expect(r.status, 'a code that can reach nobody was answered as a sent code').toBe(503);
    expect(r.body).toMatchObject({ error: 'AUTH_OTP_UNDELIVERABLE' });
    expect(r.body.message).toBe(LOGIN_CODE_UNDELIVERABLE_MESSAGE);
    expect(r.body.maskedEmail).toBeUndefined();
    expect(r.body.partialToken).toBeUndefined();
    expect(r.body.requiresMfa).toBeUndefined();
  });

  it('mints no code and sends no mail', async () => {
    delivery.deliverable = false;
    await verifyPassword();
    expect(otpDouble.createEmailOtp).not.toHaveBeenCalled();
    expect(mailDouble.sendLoginOtpEmail).not.toHaveBeenCalled();
  });

  it('records the challenge as a failure against the account\'s organisation', async () => {
    delivery.deliverable = false;
    await verifyPassword();
    expect(eventsWithReason('mfa_challenge_email_undeliverable')).toEqual([
      expect.objectContaining({ action: 'user_login_mfa_challenge', outcome: 'failure', tenantId: 1 }),
    ]);
    expect(eventsWithReason('mfa_challenge_email')).toEqual([]);
  });

  it('still issues an authenticator challenge, which needs no mail', async () => {
    delivery.deliverable = false;
    state.userRow = account({ mfaEnabled: true, mfaMethod: 'totp', mfaSecret: 'seed' });
    const r = await verifyPassword();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, requiresMfa: true, mfaMethod: 'totp' });
  });

  it('control: issues the emailed challenge when the code can be delivered', async () => {
    const r = await verifyPassword();
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ success: true, requiresMfa: true, mfaMethod: 'email' });
    expect(r.body.maskedEmail).toEqual(expect.any(String));
    expect(otpDouble.createEmailOtp).toHaveBeenCalled();
  });
});
