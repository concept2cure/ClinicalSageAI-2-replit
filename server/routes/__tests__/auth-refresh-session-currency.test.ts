import { vi } from 'vitest';

// Env before any module load (see authSurfaceSecurity.test.ts).
vi.hoisted(() => {
  process.env.NODE_ENV = 'development';
  process.env.DATABASE_URL_DEV =
    process.env.DATABASE_URL_DEV || 'postgresql://test:test@localhost:5432/test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

const state = vi.hoisted(() => ({
  passwordChangedAt: null as Date | null,
}));
const revokeToken = vi.hoisted(() => vi.fn(async (_token: string, _reason?: string) => undefined));

// The refresh handler reads the user row with `db.select()` (no projection) and
// the memberships with `db.select({ organizationId, role })`; the double keys on
// that. The raw pool answers the revocation lookup (nothing revoked).
const dbDouble = vi.hoisted(() => {
  const chain = (rows: () => unknown[]) => {
    const c: any = {};
    c.from = () => c;
    c.where = () => c;
    c.limit = async () => rows();
    return c;
  };
  const userRows = () => [
    {
      id: 1,
      email: 'u@example.com',
      status: 'active',
      defaultOrganizationId: 2,
      passwordChangedAt: state.passwordChangedAt,
    },
  ];
  const membershipRows = () => [{ organizationId: 2, role: 'admin' }];
  const pool = {
    query: async (sql: string) => {
      if (/FROM revoked_tokens/i.test(sql)) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    },
  };
  return {
    db: { select: (projection?: Record<string, unknown>) => chain(projection ? membershipRows : userRows) },
    pool,
    getPool: () => pool,
    getDb: () => ({}),
  };
});
vi.mock('../../db', () => dbDouble);
vi.mock('../../db.js', () => dbDouble);

vi.mock('../../services/auditService', () => ({ default: { log: vi.fn() } }));
vi.mock('../../services/audit/auth-event-audit', () => ({ recordAuthEvent: vi.fn(async () => undefined) }));
vi.mock('../../services/emailService', () => ({
  sendPasswordResetEmail: vi.fn(),
  sendLoginOtpEmail: vi.fn(),
}));
vi.mock('../../services/mfaService', () => ({
  generateSecret: vi.fn(),
  enableMfa: vi.fn(),
  disableMfa: vi.fn(),
  verifyToken: vi.fn(),
  verifySecondFactor: vi.fn(),
}));
vi.mock('../../services/emailOtpService', () => ({
  createEmailOtp: vi.fn(),
  verifyEmailOtp: vi.fn(),
}));
vi.mock('../../services/auth-security-service', () => ({
  validatePasswordPolicy: () => ({ valid: true, errors: [] }),
  isAccountLocked: vi.fn(),
  recordFailedLogin: vi.fn(),
  resetFailedLogins: vi.fn(),
  isPasswordExpired: vi.fn(),
  checkPasswordHistory: vi.fn(),
  createElectronicSignature: vi.fn(),
  verifySignatureIntegrity: vi.fn(),
}));
vi.mock('../../services/industry-context/signup-profile', () => ({
  primaryIndustryForIndustryMode: vi.fn(),
  pathwaysForUseCases: vi.fn(),
}));
vi.mock('../../db/tenantAdmission', () => ({ assertCanAdmitNewTenant: vi.fn() }));
vi.mock('../../auth/dev-auth-policy', () => ({
  isDevAuthAllowed: () => false,
  devAuthDenialReason: () => 'disabled',
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
vi.mock('../../services/token-revocation', async importOriginal => ({
  ...(await importOriginal<typeof import('../../services/token-revocation')>()),
  revokeToken: (token: string, reason?: string) => revokeToken(token, reason),
}));

import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import authRoutes from '../auth';

/**
 * POST /api/auth/refresh and POST /api/auth/logout — the refresh token's side
 * of session termination (security audit 2026-09-24, IAM-04).
 *
 * A refresh token outlives every access token it mints by days. If a password
 * change ended only the access tokens, the client's next 401 would refresh and
 * carry on; so a refresh token issued before `password_changed_at` mints
 * nothing. Logout revoking `body.refreshToken` was already true and is pinned
 * here because the client now sends it (authService.logout).
 */
function app() {
  const a = express();
  a.use(express.json());
  a.use('/api/auth', authRoutes);
  return a;
}

// development: the refresh secret falls back to the JWT secret (config/environment.ts).
const REFRESH_SECRET = process.env.REFRESH_TOKEN_SECRET ?? process.env.JWT_SECRET_DEV ?? (process.env.JWT_SECRET as string);
const nowSeconds = () => Math.floor(Date.now() / 1000);
const refreshTokenIssuedAt = (iat: number) =>
  jwt.sign({ userId: '1', email: 'u@example.com', type: 'refresh', iat }, REFRESH_SECRET, { algorithm: 'HS256', expiresIn: '7d' });

beforeEach(() => {
  revokeToken.mockClear();
  state.passwordChangedAt = null;
});

describe('POST /api/auth/refresh after a password change', () => {
  it('refuses a refresh token issued before password_changed_at: no new session, nothing rotated', async () => {
    const changed = nowSeconds() - 60;
    state.passwordChangedAt = new Date(changed * 1000);

    const res = await request(app()).post('/api/auth/refresh').send({ refreshToken: refreshTokenIssuedAt(changed - 3600) });

    expect(res.status).toBe(401);
    expect(res.body.accessToken).toBeUndefined();
    expect(res.body.refreshToken).toBeUndefined();
    expect(revokeToken).not.toHaveBeenCalled();
  });

  it('mints from a refresh token issued after the change, and rotates it (existing behaviour)', async () => {
    const changed = nowSeconds() - 3600;
    state.passwordChangedAt = new Date(changed * 1000);
    const presented = refreshTokenIssuedAt(changed + 5);

    const res = await request(app()).post('/api/auth/refresh').send({ refreshToken: presented });

    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(typeof res.body.accessToken).toBe('string');
    expect(typeof res.body.refreshToken).toBe('string');
    expect(revokeToken).toHaveBeenCalledWith(presented, undefined);
  });

  it('mints for an account that never changed its password', async () => {
    const res = await request(app()).post('/api/auth/refresh').send({ refreshToken: refreshTokenIssuedAt(nowSeconds() - 86_000) });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
  });
});

describe('POST /api/auth/logout', () => {
  it('revokes the refresh token the client sends in the body, as well as the bearer', async () => {
    const bearer = jwt.sign({ userId: '1', email: 'u@example.com', organizationId: '2', type: 'access' }, process.env.JWT_SECRET as string, {
      algorithm: 'HS256',
      expiresIn: '5m',
    });
    const refreshToken = refreshTokenIssuedAt(nowSeconds());

    const res = await request(app()).post('/api/auth/logout').set('Authorization', `Bearer ${bearer}`).send({ refreshToken, terminateAllSessions: false });

    expect(res.status).toBe(200);
    const revoked = revokeToken.mock.calls.map(c => c[0]);
    expect(revoked).toContain(bearer);
    expect(revoked).toContain(refreshToken);
  });
});
