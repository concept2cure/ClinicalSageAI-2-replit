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
 * The enterprise sign-in's events reach the account's organisation
 * (SEC-0928-2, 2026-09-28; the enterprise half of VSR-001 F-41).
 *
 * POST /api/tenant-users creates an account with no default organisation: its
 * organisation is its membership. F-41 (f339a4459) moved routes/auth.ts's
 * events onto auditOrganizationOf; POST /api/auth/enterprise/verify-password
 * still took the tenant from users.default_organization_id alone, so every
 * refusal it recorded for such an account (address unconfirmed, account out of
 * use, locked, wrong password) named no organisation and was written to the
 * platform's chain (tenant 0). The organisation's ledger never showed it.
 */
const state = vi.hoisted(() => ({
  userRow: null as Record<string, unknown> | null,
  membershipRows: [] as unknown[],
}));
const authEvents = vi.hoisted(() => vi.fn(async (_e: unknown) => undefined));

const dbDouble = vi.hoisted(() => {
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
  const tableName = (table: unknown) => (table as Record<symbol, unknown> | null)?.[Symbol.for('drizzle:Name')];
  // Two drizzle reads: users by e-mail, and organization_users by account.
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
  createEmailOtp: vi.fn(async () => '123456'),
}));
vi.mock('../../services/emailService', () => ({ sendLoginOtpEmail: vi.fn(async () => undefined) }));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import enterpriseRoutes from '../authEnterprise';
import { isAccountLocked } from '../../services/auth-security-service';

const HASH = bcrypt.hashSync('right-password', 4);
/** An account created through POST /api/tenant-users: a membership, no default organisation. */
const colleague = (status: string, defaultOrganizationId: number | null = null) => ({
  id: 7,
  email: 'colleague@acme.test',
  name: 'A. Rivera',
  passwordHash: HASH,
  status,
  defaultOrganizationId,
  mfaEnabled: false,
  mfaSecret: null,
  mfaMethod: 'email',
  role: 'member',
});

function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth/enterprise', enterpriseRoutes);
  return a;
}
const verifyPassword = (password = 'right-password') =>
  request(app()).post('/api/auth/enterprise/verify-password').send({ email: 'colleague@acme.test', password });
/** The organisation the first event with this reason was recorded against. */
const tenantOf = (reason: string) =>
  authEvents.mock.calls.map((c) => c[0] as { reason?: string; tenantId?: unknown }).find((e) => e.reason === reason)?.tenantId;

beforeEach(() => {
  state.userRow = colleague('active');
  state.membershipRows = [{ organizationId: 3, role: 'member' }];
  authEvents.mockClear();
});

describe('POST /verify-password: an account added through user administration (SEC-0928-2)', () => {
  it('address unconfirmed: the refusal names the organisation it belongs to', async () => {
    state.userRow = colleague('pending_verification');
    const r = await verifyPassword();
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'AUTH_EMAIL_UNVERIFIED' });
    expect(tenantOf('email_unverified')).toBe(3);
  });

  it('account out of use: the refusal names the organisation it belongs to', async () => {
    state.userRow = colleague('suspended');
    const r = await verifyPassword();
    expect(r.status).toBe(403);
    expect(tenantOf('account_inactive')).toBe(3);
  });

  it('locked: the refusal names the organisation it belongs to', async () => {
    vi.mocked(isAccountLocked).mockResolvedValueOnce({ locked: true } as never);
    const r = await verifyPassword();
    expect(r.status).toBe(423);
    expect(tenantOf('account_locked')).toBe(3);
  });

  it('wrong password: the refusal names the organisation it belongs to', async () => {
    const r = await verifyPassword('wrong-password');
    expect(r.status).toBe(401);
    expect(tenantOf('wrong_password')).toBe(3);
  });
});

describe('POST /verify-password: an account with a default organisation', () => {
  it('control: its default organisation, where it holds a membership, is named', async () => {
    state.userRow = colleague('suspended', 1);
    state.membershipRows = [{ organizationId: 3, role: 'member' }, { organizationId: 1, role: 'admin' }];
    expect((await verifyPassword()).status).toBe(403);
    expect(tenantOf('account_inactive')).toBe(1);
  });

  it('the second-factor challenge names the organisation its sign-in lands in', async () => {
    state.userRow = colleague('active', 1);
    state.membershipRows = [{ organizationId: 1, role: 'member' }];
    const r = await verifyPassword();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect(tenantOf('mfa_challenge_email')).toBe(1);
  });

  it('the partial token and the challenge name a MEMBERSHIP, never a default the account does not belong to', async () => {
    // 2026-09-28: this case pinned the partial token to the default (1) although
    // the account belongs only to 3 — a sign-in into an organisation it is not
    // a member of. The token and the challenge now name the membership, and
    // agree (one sign-in, one ledger: verify-mfa records against the token's).
    state.userRow = colleague('active', 1);
    state.membershipRows = [{ organizationId: 3, role: 'member' }];
    const r = await verifyPassword();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const tokenOrg = Number((jwt.decode(r.body.partialToken) as { organizationId: string }).organizationId);
    expect(tokenOrg).toBe(3);
    expect(tenantOf('mfa_challenge_email')).toBe(tokenOrg);
  });

  it('with no membership at all, the default organisation is named', async () => {
    state.userRow = colleague('suspended', 5);
    state.membershipRows = [];
    expect((await verifyPassword()).status).toBe(403);
    expect(tenantOf('account_inactive')).toBe(5);
  });
});

/* 2026-09-28: verify-password chose the session's organisation from
   users.default_organization_id alone, so an account added through user
   administration (a membership, no default) could not sign in here at all —
   NO_ORGANIZATION, and nothing recorded — while the main login admitted it. */
describe('POST /verify-password: which organisation the sign-in lands in', () => {
  it('an account with a membership and no default signs in, into its membership', async () => {
    const r = await verifyPassword();
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    expect((jwt.decode(r.body.partialToken) as { organizationId: string }).organizationId).toBe('3');
    expect(r.body.user.organizationId).toBe('3');
    expect(tenantOf('mfa_challenge_email')).toBe(3);
  });

  it('an account with no membership at all is refused, and the refusal is recorded', async () => {
    state.userRow = colleague('active', 5);
    state.membershipRows = [];
    const r = await verifyPassword();
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ error: 'NO_ORGANIZATION' });
    expect(r.body.partialToken).toBeUndefined();
    expect(tenantOf('no_organization')).toBe(5);
  });
});
